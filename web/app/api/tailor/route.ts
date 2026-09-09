import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull } from "@/lib/auth";
import { hasAnthropicKey, hasOpenRouterKey } from "@/lib/env";
import { AnalyzeError, errorBody } from "@/lib/errors";
import { tailorResume, type TailorEngine } from "@/lib/providers/tailor";
import { checkRateLimit, scopeFor } from "@/lib/rate-limit";
import { MIN_WORDS, wordCount } from "@/lib/types";

/** Rewriting is a longer generation than scoring. */
export const maxDuration = 120;

const MAX_CHARS = 15_000;

const requestSchema = z.object({
  jobDescription: z.string().max(MAX_CHARS),
  resumeText: z.string().max(MAX_CHARS),
  gaps: z.array(z.string().max(200)).max(20).optional(),
  /** Which engine writes the proposals. Omitted means "whichever this deployment has",
   *  preferring Claude, which is what this endpoint has always used. */
  engine: z.enum(["claude", "gemma"]).optional(),
});

/**
 * Propose changes to a résumé for one posting.
 *
 * Returns proposals, never a saved document. Nothing is applied and nothing is stored: the
 * user accepts or rejects each change, and saving the result is a separate call to
 * `/api/resumes`. The master résumé is not reachable from here at all.
 *
 * Requires a session whichever engine runs, the same reasoning that gates both language-model
 * engines on `/api/score`: Claude spends money per call, and the open-weights engine spends a
 * shared free allowance one anonymous caller could drain for everybody. No per-IP limit fixes
 * either, because addresses are free and neither a card nor a quota is.
 */
export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Elevating a résumé needs an account, since it runs a language model against a shared allowance.",
        401,
      ),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(new AnalyzeError("INVALID_REQUEST", "Request body must be JSON.", 400));
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      new AnalyzeError("INVALID_REQUEST", `${issue.path.join(".") || "body"}: ${issue.message}`, 400),
    );
  }

  const { jobDescription, resumeText, gaps = [] } = parsed.data;

  /**
   * Which engine writes the proposals.
   *
   * An explicit choice is honoured and then checked, so asking for an engine this deployment
   * cannot run says which key is missing rather than failing inside the provider. With no
   * choice, Claude wins when it is available — that is what this endpoint has always done,
   * and it is the better rewriter — and the free engine is the fallback rather than the
   * default, so nothing here starts spending money that was not already being spent.
   */
  const engine: TailorEngine | null = parsed.data.engine
    ? parsed.data.engine
    : hasAnthropicKey()
      ? "claude"
      : hasOpenRouterKey()
        ? "gemma"
        : null;

  if (!engine) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Résumé rewriting is not configured on this deployment (neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set). The analysis above still stands, and the gaps it names are the changes worth making by hand.",
        501,
      ),
    );
  }

  if (engine === "claude" && !hasAnthropicKey()) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Rewriting with Claude is not configured on this deployment (ANTHROPIC_API_KEY is unset).",
        501,
      ),
    );
  }

  if (engine === "gemma" && !hasOpenRouterKey()) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Rewriting with the open-weights engine is not configured on this deployment (OPENROUTER_API_KEY is unset).",
        501,
      ),
    );
  }

  if (wordCount(jobDescription) < MIN_WORDS || wordCount(resumeText) < MIN_WORDS) {
    return fail(
      new AnalyzeError(
        "TOO_SHORT",
        `Both texts need at least ${MIN_WORDS} words before a rewrite is worth running.`,
        400,
      ),
    );
  }

  // The same bucket the chosen engine uses on /api/score, because it is the same allowance
  // being spent: Claude's money, or the shared free quota behind the OpenRouter key. A
  // rewrite is one call of the same kind, and giving it a private bucket would let a user
  // spend the allowance twice.
  const limited = await checkRateLimit(userId, scopeFor(false, engine));
  if (!limited.allowed) {
    return fail(
      new AnalyzeError(
        "RATE_LIMITED",
        engine === "claude"
          ? `You have used this deployment's paid-model allowance. Try again in ${limited.retryAfter} seconds.`
          : `You have used this deployment's open-weights allowance. Try again in ${limited.retryAfter} seconds, or rewrite with Claude.`,
        429,
        limited.retryAfter,
      ),
    );
  }

  const startedAt = Date.now();
  try {
    const result = await tailorResume(jobDescription, resumeText, gaps, engine);

    // Counts only. Never the résumé, never the proposed text (SPEC Part 7).
    console.info("[tailor] ok", {
      engine,
      changes: result.changes.length,
      notAdded: result.notAdded.length,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(result);
  } catch (error) {
    const analyzeError =
      error instanceof AnalyzeError
        ? error
        : new AnalyzeError("PROVIDER_ERROR", "The rewrite failed.", 502);

    console.warn("[tailor] failed", {
      engine,
      code: analyzeError.code,
      latencyMs: Date.now() - startedAt,
    });

    return fail(analyzeError);
  }
}

function fail(error: AnalyzeError): NextResponse {
  const headers: Record<string, string> = {};
  if (error.retryAfter !== undefined) headers["Retry-After"] = String(error.retryAfter);
  return NextResponse.json(errorBody(error), { status: error.status, headers });
}

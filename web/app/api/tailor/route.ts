import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull } from "@/lib/auth";
import { hasAnthropicKey } from "@/lib/env";
import { AnalyzeError, errorBody } from "@/lib/errors";
import { tailorResume } from "@/lib/providers/tailor";
import { checkRateLimit, scopeFor } from "@/lib/rate-limit";
import { MIN_WORDS, wordCount } from "@/lib/types";

/** Rewriting is a longer generation than scoring. */
export const maxDuration = 120;

const MAX_CHARS = 15_000;

const requestSchema = z.object({
  jobDescription: z.string().max(MAX_CHARS),
  resumeText: z.string().max(MAX_CHARS),
  gaps: z.array(z.string().max(200)).max(20).optional(),
});

/**
 * Propose changes to a résumé for one posting.
 *
 * Returns proposals, never a saved document. Nothing is applied and nothing is stored: the
 * user accepts or rejects each change, and saving the result is a separate call to
 * `/api/resumes`. The master résumé is not reachable from here at all.
 *
 * Requires a session because it costs a Claude call, the same reasoning that gates the
 * paid engine on `/api/score`. An unauthenticated endpoint that spends API credits is the
 * surprise invoice SPEC §2.4 warns about, and no per-IP limit fixes it.
 */
export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Elevating a résumé needs an account, since it runs a paid model call.",
        401,
      ),
    );
  }

  if (!hasAnthropicKey()) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Résumé rewriting is not configured on this deployment (ANTHROPIC_API_KEY is unset). The analysis above still stands, and the gaps it names are the changes worth making by hand.",
        501,
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

  if (wordCount(jobDescription) < MIN_WORDS || wordCount(resumeText) < MIN_WORDS) {
    return fail(
      new AnalyzeError(
        "TOO_SHORT",
        `Both texts need at least ${MIN_WORDS} words before a rewrite is worth running.`,
        400,
      ),
    );
  }

  // Same bucket as the paid engine: this is the other thing on this product that spends
  // money per call, and it should drain the same allowance.
  const limited = await checkRateLimit(userId, scopeFor(false, "claude"));
  if (!limited.allowed) {
    return fail(
      new AnalyzeError(
        "RATE_LIMITED",
        `You have used this deployment's paid-model allowance. Try again in ${limited.retryAfter} seconds.`,
        429,
        limited.retryAfter,
      ),
    );
  }

  const startedAt = Date.now();
  try {
    const result = await tailorResume(jobDescription, resumeText, gaps);

    // Counts only. Never the résumé, never the proposed text (SPEC Part 7).
    console.info("[tailor] ok", {
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

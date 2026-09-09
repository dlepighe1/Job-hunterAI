import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull } from "@/lib/auth";
import { getApplication, isPersistenceConfigured, saveAnalysis } from "@/lib/db";
import { MissingEnvError, env, hasAnthropicKey, hasOpenRouterKey } from "@/lib/env";
import { AnalyzeError, errorBody } from "@/lib/errors";
import { scoreWithBaseModel } from "@/lib/providers/baseline";
import { analyzeWithClaude } from "@/lib/providers/claude";
import { analyzeWithFineTuned } from "@/lib/providers/finetuned";
import { analyzeWithGemma } from "@/lib/providers/gemma";
import { analyzeWithKeywords } from "@/lib/providers/keyword";
import { checkRateLimit, clientAddress, scopeFor } from "@/lib/rate-limit";
import { ENGINES, MIN_WORDS, type EngineId, type ScoreResult, wordCount } from "@/lib/types";

/** Long enough to survive a scale-to-zero cold start (SPEC §2.3 rule 4). */
export const maxDuration = 120;

const MAX_CHARS = 15_000;

const requestSchema = z.object({
  jobDescription: z.string().max(MAX_CHARS),
  resumeText: z.string().max(MAX_CHARS),
  engine: z.enum(ENGINES),
  /** Save this run against an application. Requires a session and a configured database;
   *  omit it and the request persists nothing, which is the guest path. */
  applicationId: z.uuid().nullish(),
  /**
   * Whether the resume being scored is the user's original.
   *
   * Defaults to true. Only the Elevate flow sends false, for a resume this product itself
   * rewrote. The distinction is load-bearing rather than bookkeeping: tailored scores are
   * excluded from Role Affinity and Career Intelligence, because tailoring exists to raise
   * a score and feeding it back would have the system grade its own homework
   * (`lib/career.ts`).
   */
  isBaseline: z.boolean().optional(),
});

/**
 * Score one pair with ONE engine.
 *
 * SPEC §2.4: "runs one engine per request, on demand. Never fan out." The previous version
 * of this route ran every configured engine on every request via `Promise.allSettled`. That
 * was right for a research demo whose entire point was watching engines disagree, and it is
 * wrong here: it would fire a paid Claude call on a request the user made to run the free
 * model. A comparison view asks for each engine explicitly.
 *
 * Guest-accessible (SPEC §5.1) and persists nothing. Everything about a resume that could
 * leak, namely the text, the score and the gaps, stays in the response body and is never logged.
 */
export async function POST(request: Request) {
  const userId = await getUserIdOrNull();

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
      new AnalyzeError(
        "INVALID_REQUEST",
        `${issue.path.join(".") || "body"}: ${issue.message}`,
        400,
      ),
    );
  }

  const { jobDescription, resumeText, engine, applicationId, isBaseline = true } = parsed.data;

  /** The role the analysis was against, captured for role affinity. Set once ownership of
   *  the application is confirmed, so it can never name someone else's row. */
  let ownedRole: string | null = null;

  // Ownership is settled BEFORE the engine runs. Scoring against an application the caller
  // does not own would spend a model call, and for Claude real money, on a request that
  // was always going to be refused.
  if (applicationId) {
    if (!userId) {
      return fail(
        new AnalyzeError(
          "NOT_CONFIGURED",
          "Saving a result to an application needs an account. Run the analysis without an applicationId to score without signing in, and nothing is stored that way.",
          401,
        ),
      );
    }

    if (!isPersistenceConfigured()) {
      return fail(
        new AnalyzeError(
          "NOT_CONFIGURED",
          "This deployment has no database configured, so there is nowhere to save a result. Scoring still works if you omit applicationId.",
          503,
        ),
      );
    }

    // Null covers "no such application" and "not yours" alike. 404 rather than 403: a 403
    // would confirm the id names a real row, which is enough to enumerate ids.
    const owned = await getApplication(userId, applicationId);
    if (!owned) {
      return fail(new AnalyzeError("INVALID_REQUEST", "No such application.", 404));
    }
    ownedRole = owned.role;
  }

  if (wordCount(jobDescription) < MIN_WORDS || wordCount(resumeText) < MIN_WORDS) {
    return fail(
      new AnalyzeError(
        "TOO_SHORT",
        `Both the job description and the resume need at least ${MIN_WORDS} words. Below that there isn't enough signal for a score worth showing.`,
        400,
      ),
    );
  }

  // Both language-model engines require a session, for the same reason at two scales. Claude
  // spends money per call, which is the surprise invoice SPEC §2.4 warns about. Gemma spends
  // a small shared daily allowance on a free endpoint, which one anonymous caller can drain
  // for everybody. No per-IP limit fixes either: addresses are free, and neither a card nor a
  // quota is.
  if ((engine === "claude" || engine === "gemma") && !userId) {
    return fail(
      new AnalyzeError(
        "NOT_CONFIGURED",
        "Written feedback needs an account. The engines that need no allowance, fine-tuned, base and keyword coverage, work without signing in.",
        401,
      ),
    );
  }

  const limited = await enforceRateLimit(request, userId, engine);
  if (limited) return limited;

  const startedAt = Date.now();
  let result: ScoreResult;
  try {
    result = await runEngine(engine, jobDescription, resumeText);
  } catch (error) {
    const analyzeError = toAnalyzeError(error);
    // SPEC Part 7: engine, model, latency and outcome. Never the input text.
    console.warn("[score] failed", {
      engine,
      code: analyzeError.code,
      latencyMs: Date.now() - startedAt,
      guest: !userId,
    });
    return fail(analyzeError, engine);
  }

  /**
   * Persist, if asked to, and never at the cost of the response.
   *
   * The score is what the user asked for and it has already been computed, at the price of
   * a model call. A database that refuses the write must not turn that into an error page:
   * the user would lose a correct result and re-running it would cost another call.
   *
   * So a persistence failure is reported IN the successful response rather than instead of
   * it. `saved: false` says plainly that it was not stored. Returning 200 as though it had
   * been would be worse than either alternative, because the user would find out later by
   * looking at an empty pipeline.
   */
  let saved: boolean | undefined;
  if (applicationId && userId) {
    result.analysisId = await saveAnalysis(userId, applicationId, result, {
      // `isBaseline` says whether this scored the user's ORIGINAL resume. It feeds the
      // career profile, so an unflagged run counts as real evidence about them, see
      // `lib/career.ts`. The Elevate flow is the only caller that sends false.
      isBaseline,
      roleTitle: ownedRole,
    });
    saved = result.analysisId !== null;
  }

  console.info("[score] ok", {
    engine,
    modelId: result.modelId,
    latencyMs: result.latencyMs,
    calibrated: result.calibrated,
    degraded: result.degraded,
    guest: !userId,
    saved,
  });

  return NextResponse.json(saved === undefined ? result : { ...result, saved });
}

/** Exactly one engine runs. The switch is exhaustive so adding an engine to `ENGINES`
 *  without wiring it here is a type error rather than a runtime surprise. */
async function runEngine(
  engine: EngineId,
  jobDescription: string,
  resumeText: string,
): Promise<ScoreResult> {
  switch (engine) {
    case "finetuned":
      requireScoringService();
      return analyzeWithFineTuned(jobDescription, resumeText);
    case "base":
      requireScoringService();
      return scoreWithBaseModel(jobDescription, resumeText);
    case "claude":
      if (!hasAnthropicKey()) {
        throw new AnalyzeError(
          "NOT_CONFIGURED",
          "The written-feedback engine is not configured on this deployment (ANTHROPIC_API_KEY is unset).",
          501,
        );
      }
      return analyzeWithClaude(jobDescription, resumeText);
    case "gemma":
      if (!hasOpenRouterKey()) {
        throw new AnalyzeError(
          "NOT_CONFIGURED",
          "The open-weights evaluation engine is not configured on this deployment (OPENROUTER_API_KEY is unset).",
          501,
        );
      }
      return analyzeWithGemma(jobDescription, resumeText);
    case "keyword":
      // No service, no key, no network. This is the engine that always works.
      return analyzeWithKeywords(jobDescription, resumeText);
  }
}

function requireScoringService(): void {
  if (!env.scoringService.isConfigured) {
    throw new AnalyzeError(
      "NOT_CONFIGURED",
      "The scoring service is not configured on this deployment (SCORING_SERVICE_URL is unset). Keyword coverage still works, since it needs no model.",
      501,
    );
  }
}

/**
 * Bucket the request.
 *
 * Signed-in users are keyed on the Clerk id, which survives a changing address. Guests are
 * keyed on IP, and a guest with no resolvable address is refused rather than waved through
 * because an unbucketable caller on a free, unauthenticated, compute-spending endpoint is the one
 * case where failing closed is clearly right.
 */
async function enforceRateLimit(
  request: Request,
  userId: string | null,
  engine: EngineId,
): Promise<NextResponse | null> {
  let identifier = userId;

  if (!identifier) {
    const address = clientAddress(request.headers);
    if (!address) {
      return fail(
        new AnalyzeError(
          "RATE_LIMITED",
          "Could not identify this request well enough to rate-limit it. Sign in and try again.",
          429,
          30,
        ),
      );
    }
    identifier = `ip:${address}`;
  }

  const outcome = await checkRateLimit(identifier, scopeFor(!userId, engine));
  if (outcome.allowed) return null;

  return fail(
    new AnalyzeError(
      "RATE_LIMITED",
      engine === "claude"
        ? `You have used this deployment's written-feedback allowance. Try again in ${outcome.retryAfter} seconds, or use one of the free engines now.`
        : `Too many analyses in a short window. Try again in ${outcome.retryAfter} seconds.`,
      429,
      outcome.retryAfter,
    ),
  );
}

function toAnalyzeError(error: unknown): AnalyzeError {
  if (error instanceof AnalyzeError) return error;
  if (error instanceof MissingEnvError) {
    return new AnalyzeError("CONFIG_ERROR", error.message, 500);
  }
  return new AnalyzeError(
    "PROVIDER_ERROR",
    error instanceof Error ? error.message : "Unknown failure.",
    502,
  );
}

function fail(error: AnalyzeError, engine?: EngineId): NextResponse {
  const body = errorBody(error);
  if (engine) body.engine = engine;

  const headers: Record<string, string> = {};
  // Machine-readable alongside the JSON field, so a generic HTTP client backs off correctly
  // without having to know this API's body shape.
  if (error.retryAfter !== undefined) headers["Retry-After"] = String(error.retryAfter);

  return NextResponse.json(body, { status: error.status, headers });
}

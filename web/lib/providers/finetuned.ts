import { analyzeAtsKeywords } from "@/lib/ats";
import { env } from "@/lib/env";
import { AnalyzeError } from "@/lib/errors";
import type { Requirement, ScoreResult } from "@/lib/types";

/**
 * Long, because a scale-to-zero host has to start a container and load ~420 MB of weights
 * before it can answer at all. SPEC §2.3 rule 4 puts that at 30-60 seconds. Timing out at
 * 30 would turn every cold start into an error.
 */
const TIMEOUT_MS = 120_000;

/**
 * The model's measured mean absolute error on 106 held-out pairs from 53 job postings it
 * never saw during training, in the same 0-to-1 units as the score.
 *
 * Deliberately NOT dressed up as a per-pair confidence interval. There is no principled
 * way to compute one for a single prediction, and a plausible-looking invention would be
 * exactly the false rigour this project argues against (SPEC §5.1 item 1).
 *
 * Rounded up from the measured 0.1194 ± 0.0113 rather than quoted to four figures: the
 * precision would imply the band is tighter than the evidence supports, and this is a
 * display aid, not a result. The authoritative numbers live in the research repo's
 * `Results/results_summary.json`.
 */
const HELD_OUT_MAE = 0.12;

interface ServiceScoreResponse {
  score: number; // 0-1, calibrated
  raw_cosine: number;
  calibrator: string | null;
  model_id: string;
  requirements: Requirement[];
  coverage: number;
}

/**
 * The fine-tuned MPNet + Platt calibrator, served by the Python service.
 *
 * This engine generates no language at all: it embeds, scores, and locates gaps. That is
 * why `summary` and `suggestedBullets` come back null: pretending an embedding model can
 * write interview-defensible bullets would be a lie the UI tells on its behalf.
 *
 * The raw text goes to the service untouched. SPEC §2.3 rule 1: the service applies the
 * exact 350-word truncation the model was trained under, and pre-truncating here would
 * silently degrade scores in a way nothing would catch.
 */
export async function analyzeWithFineTuned(
  jobDescription: string,
  resumeText: string,
): Promise<ScoreResult> {
  const baseUrl = env.scoringService.url.replace(/\/$/, "");
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: resumeText, jd: jobDescription }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw reachErrorFor(error, baseUrl);
  }

  // The service 422s below its own minimum word count. Passing that through as a provider
  // error would blame the model for what is a fixable input problem.
  if (response.status === 422) {
    throw new AnalyzeError(
      "TOO_SHORT",
      "The scoring service rejected this pair as too short to score meaningfully.",
      400,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AnalyzeError(
      "PROVIDER_ERROR",
      `The scoring service returned ${response.status}. ${body.slice(0, 200)}`,
      502,
    );
  }

  const data = (await response.json()) as ServiceScoreResponse;

  const requirements = data.requirements ?? [];
  const calibrated = Boolean(data.calibrator);

  return {
    engine: "finetuned",
    modelId: data.model_id,
    score: clamp01(data.score),
    calibrated,
    rawCosine: data.raw_cosine ?? null,
    requirements,
    keywords: analyzeAtsKeywords(jobDescription, resumeText),
    summary: null,
    suggestedBullets: null,
    // Only meaningful for the calibrated model, since the MAE was measured on *that* model.
    // Quoting it beside an uncalibrated score would borrow credibility the number in front
    // of you has not earned.
    errorBand: calibrated
      ? {
          low: Math.max(0, clamp01(data.score) - HELD_OUT_MAE),
          high: Math.min(1, clamp01(data.score) + HELD_OUT_MAE),
          basis: "typical error on 106 held-out pairs from unseen postings",
        }
      : null,
    // No calibrator loaded means the service is not in the state the evaluation describes.
    // `/api/health` reports the authoritative `fine_tuned` flag; this is the signal
    // available on the scoring path itself, and it catches the case that matters.
    degraded: !calibrated,
    latencyMs: Date.now() - startedAt,
    analysisId: null,
  };
}

/**
 * A timeout and a refused connection need different words in front of a user: one says
 * wait, the other says something is wrong. Collapsing them is how a 40-second cold start
 * gets reported as an outage.
 */
export function reachErrorFor(error: unknown, baseUrl: string): AnalyzeError {
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  if (timedOut) {
    return new AnalyzeError(
      "MODEL_SERVICE_WAKING",
      "The scoring service is starting up. It sleeps when idle and takes 30 to 60 seconds to load the model, so this should work on a second attempt.",
      503,
      60,
    );
  }
  return new AnalyzeError(
    "MODEL_SERVICE_UNREACHABLE",
    `Could not reach the scoring service at ${baseUrl}. Is it running?`,
    503,
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

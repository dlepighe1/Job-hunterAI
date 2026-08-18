import { analyzeAtsKeywords } from "@/lib/ats";
import { env } from "@/lib/env";
import { AnalyzeError } from "@/lib/errors";
import { reachErrorFor } from "@/lib/providers/finetuned";
import type { ScoreResult } from "@/lib/types";

const TIMEOUT_MS = 120_000;

/**
 * Un-fine-tuned `all-mpnet-base-v2` on the same pair, via the scoring service.
 *
 * This exists so a user can see what fine-tuning bought *on their own resume*, not only on
 * the benchmark: the same architecture, the same preprocessing, the same input, minus this
 * project's training.
 *
 * It returns `rawCosine` and a null `score`, and that is load-bearing rather than an
 * omission. The Platt calibrator maps the FINE-TUNED model's cosine distribution; applying
 * it to this one would produce a confident, well-formatted number that means nothing. The
 * service's own `/baseline` endpoint refuses to return a `score` field for the same reason
 * (SPEC §2.3), and the UI renders this as a raw similarity and says so.
 */
export async function scoreWithBaseModel(
  jobDescription: string,
  resumeText: string,
): Promise<ScoreResult> {
  const baseUrl = env.scoringService.url.replace(/\/$/, "");
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/baseline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: resumeText, jd: jobDescription }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw reachErrorFor(error, baseUrl);
  }

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
      `The baseline endpoint returned ${response.status}. ${body.slice(0, 200)}`,
      502,
    );
  }

  const data = (await response.json()) as { raw_cosine: number; model_id: string };

  return {
    engine: "base",
    modelId: data.model_id,
    // Null, always. See the note above: this is the invariant, not a missing feature.
    score: null,
    calibrated: false,
    rawCosine: data.raw_cosine,
    requirements: [],
    keywords: analyzeAtsKeywords(jobDescription, resumeText),
    summary: null,
    suggestedBullets: null,
    errorBand: null,
    // The base model is the base model on purpose here. Nothing has gone wrong.
    degraded: false,
    latencyMs: Date.now() - startedAt,
    analysisId: null,
  };
}

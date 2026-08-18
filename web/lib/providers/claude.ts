import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { analyzeAtsKeywords } from "@/lib/ats";
import { env } from "@/lib/env";
import { AnalyzeError } from "@/lib/errors";
import { SYSTEM_PROMPT, analysisSchema, userPrompt } from "@/lib/schema";
import type { ScoreResult } from "@/lib/types";

/**
 * Written feedback and suggested bullet rewrites.
 *
 * The only engine with a per-call cost, so it is opt-in per analysis and never a default
 * (SPEC §2.4). Its score is NOT calibrated and is not comparable to the fine-tuned
 * model's on absolute value, only on ordering (SPEC Appendix B).
 */
export async function analyzeWithClaude(
  jobDescription: string,
  resumeText: string,
): Promise<ScoreResult> {
  // Constructed per call, not at module scope: a missing ANTHROPIC_API_KEY must fail only
  // when someone actually selects Claude, not at import time, which would take the whole
  // route down, including the engines that are configured.
  const client = new Anthropic({ apiKey: env.anthropic.apiKey });
  const modelId = env.anthropic.model;
  const startedAt = Date.now();

  let message;
  try {
    message = await client.messages.parse({
      model: modelId,
      max_tokens: 4096,
      // Adaptive thinking is the only supported on-mode for current models, and it is off
      // unless requested. temperature/top_p are rejected outright; behaviour is steered by
      // the prompt, not by sampling knobs.
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        // Constrains decoding to the schema, which is what makes malformed JSON a
        // non-issue on this path rather than something we retry our way out of.
        format: zodOutputFormat(analysisSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(jobDescription, resumeText) }],
    });
  } catch (error) {
    throw toAnalyzeError(error);
  }

  // A safety refusal arrives as a successful HTTP 200 with empty content. Check
  // stop_reason before reading the result, or this surfaces as a confusing parse error.
  // Surfaced, never retried silently (SPEC §4).
  if (message.stop_reason === "refusal") {
    throw new AnalyzeError(
      "REFUSED",
      "Claude declined to analyze this content. Retrying will not help, so try different text.",
      422,
    );
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new AnalyzeError(
      "INVALID_OUTPUT",
      `Claude returned no parseable result (stop_reason: ${message.stop_reason}).`,
      502,
    );
  }

  return {
    engine: "claude",
    modelId,
    // The prompt asks for 0-100; the rest of this codebase is 0-1. Converted here so the
    // boundary is one line in one file rather than a units question at every call site.
    score: Math.max(0, Math.min(1, parsed.matchScore / 100)),
    calibrated: false,
    rawCosine: null,
    // A language model is not asked to produce per-requirement similarity scores. It could
    // emit numbers that look like the fine-tuned model's, and they would not mean the same
    // thing, so the field stays empty rather than being filled with lookalikes.
    requirements: [],
    keywords: analyzeAtsKeywords(jobDescription, resumeText),
    summary: parsed.summary,
    suggestedBullets: parsed.suggestedBullets,
    errorBand: null,
    degraded: false,
    latencyMs: Date.now() - startedAt,
    analysisId: null,
  };
}

/** Most specific SDK error class first: a single broad catch would throw away the
 *  distinction between "retry in 30s" and "your key is wrong". */
function toAnalyzeError(error: unknown): AnalyzeError {
  if (error instanceof Anthropic.RateLimitError) {
    const header = error.headers?.get?.("retry-after");
    const retryAfter = header ? Number(header) : 30;
    return new AnalyzeError(
      "RATE_LIMITED",
      "Claude is rate limiting this API key. Try again shortly.",
      429,
      Number.isFinite(retryAfter) ? retryAfter : 30,
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    // Blames the configuration, not the user (SPEC §4).
    return new AnalyzeError(
      "CONFIG_ERROR",
      "The Anthropic API key was rejected. This is a server configuration problem, not something you did. Check ANTHROPIC_API_KEY.",
      500,
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AnalyzeError(
      "CONFIG_ERROR",
      `Model "${env.anthropic.model}" was not found. Check ANTHROPIC_MODEL.`,
      500,
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AnalyzeError("PROVIDER_ERROR", "Could not reach the Anthropic API.", 502);
  }
  if (error instanceof Anthropic.APIError) {
    return new AnalyzeError("PROVIDER_ERROR", `Anthropic API error: ${error.message}`, 502);
  }
  return new AnalyzeError(
    "PROVIDER_ERROR",
    error instanceof Error ? error.message : "Unknown Claude error.",
    502,
  );
}

import { analyzeAtsKeywords } from "@/lib/ats";
import { env } from "@/lib/env";
import { completeJson } from "@/lib/providers/openrouter";
import { SYSTEM_PROMPT, analysisSchema, userPrompt } from "@/lib/schema";
import type { ScoreResult } from "@/lib/types";

/**
 * Written feedback from an open-weights model, served over OpenRouter.
 *
 * The same job as `claude.ts`, on a weaker guarantee: `openrouter.ts` explains exactly which
 * half of Claude's schema enforcement the free tier offers and which half `analysisSchema`
 * has to enforce here instead.
 *
 * Why it exists: the generative path — the prompt, the parse, the panel, the stored row —
 * could not be exercised at all without spending money per iteration, because Claude was the
 * only engine that produced prose. This one costs nothing, so the path can be worked on and
 * judged before a single paid call.
 *
 * Its score is NOT calibrated and is not comparable to the fine-tuned model's on absolute
 * value, only on ordering (SPEC Appendix B). That is the same footing Claude's score is on,
 * and `ENGINE_META` says so for both.
 */

/**
 * The JSON contract, spelled out because nothing enforces the FIELDS.
 *
 * JSON mode makes the reply parse; it says nothing about what is in it, so this is the only
 * thing asking for the right six keys. Written out rather than generated from the zod schema,
 * because what an open-weights model follows best is an example carrying types and intent,
 * not a JSON Schema dump. `gemma.test.ts` asserts every field of `analysisSchema` is named
 * here, so the two cannot drift apart quietly.
 */
const JSON_INSTRUCTION = `Reply with a single JSON object and nothing else. No markdown, no code fence, no commentary before or after it.

{
  "matchScore": <integer 0-100>,
  "summary": "<2-4 sentences explaining why the score is what it is>",
  "matchedSkills": ["<requirement from the JD the resume demonstrably meets>"],
  "missingSkills": ["<requirement from the JD the resume does not evidence>"],
  "strengths": ["<specific, resume-traceable reason this candidate is compelling>"],
  "suggestedBullets": ["<3-6 rewritten resume bullets, grounded only in experience the resume already shows>"]
}`;

export async function analyzeWithGemma(
  jobDescription: string,
  resumeText: string,
): Promise<ScoreResult> {
  const modelId = env.openRouter.model;
  const startedAt = Date.now();

  const parsed = await completeJson({
    system: SYSTEM_PROMPT,
    user: userPrompt(jobDescription, resumeText),
    shapeInstruction: JSON_INSTRUCTION,
    schema: analysisSchema,
    maxTokens: 2048,
    label: "analysis",
  });

  return {
    engine: "gemma",
    modelId,
    // The prompt asks for 0-100; the rest of this codebase is 0-1. Clamped as well as
    // converted, because nothing constrained the model to the range it was asked for.
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

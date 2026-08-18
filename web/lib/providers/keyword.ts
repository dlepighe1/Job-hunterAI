import { analyzeAtsKeywords } from "@/lib/ats";
import { AnalyzeError } from "@/lib/errors";
import type { ScoreResult } from "@/lib/types";

/**
 * Literal keyword coverage as a first-class engine (SPEC §2.4).
 *
 * No model, no network, no key, just pure string matching over `lib/ats.ts`. It is the one
 * engine that always works, which makes it the honest fallback when the scoring service is
 * cold and the user wants *something* now.
 *
 * It answers a different question from the semantic engines, not a worse version of the
 * same one: applicant tracking systems filter on literal matches, so a resume can be a
 * perfect semantic fit and still be discarded for saying "orchestration tooling" where the
 * posting says "Airflow".
 */
export function analyzeWithKeywords(jobDescription: string, resumeText: string): ScoreResult {
  const startedAt = Date.now();
  const keywords = analyzeAtsKeywords(jobDescription, resumeText);

  if (!keywords) {
    // `analyzeAtsKeywords` returns null when the posting names no skill in the vocabulary.
    // A 0% here would read as "your resume matches nothing", when what actually happened is
    // that this engine had nothing to measure. Those are opposite messages.
    throw new AnalyzeError(
      "INVALID_OUTPUT",
      "This posting does not name any skills the keyword vocabulary recognises, so there is nothing to match against. The fine-tuned engine does not depend on that vocabulary and will still work.",
      422,
    );
  }

  return {
    engine: "keyword",
    modelId: "keyword-coverage/v1",
    // Null on purpose. The keyword percentage is a coverage figure over a fixed
    // vocabulary, not a match score, and putting it in `score` would place it on the same
    // axis as the calibrated model's output where it would be read as comparable.
    score: null,
    calibrated: false,
    rawCosine: null,
    requirements: [],
    keywords,
    summary: null,
    suggestedBullets: null,
    errorBand: null,
    degraded: false,
    latencyMs: Date.now() - startedAt,
    analysisId: null,
  };
}

/** Shared types for the matcher. Kept free of server-only imports so client components
 *  can use them too. */

import type { AtsAnalysis } from "@/lib/ats";
import { BANDS, bandFor } from "@/lib/benchmark";

/**
 * The engines from SPEC §2.4.
 *
 * These strings are also the `engine` CHECK constraint on the `analyses` table, so adding
 * one here without updating `supabase/schema.sql` will fail on insert rather than silently
 * storing junk. `db.constraints.test.ts` compares the two and fails offline instead.
 *
 * `gemma` is an open-weights model served over OpenRouter, and it is a deliberate partial
 * reversal of an earlier decision: a previous version of this list dropped OpenRouter as a
 * research-repo affordance. It comes back for one reason, which is that `claude` is the only
 * engine that can produce written feedback and it costs money per call, so there was no way
 * to exercise the generative path — the prompt, the parsing, the UI, the stored row — without
 * paying for every iteration. It is an evaluation engine, and it is labelled as one.
 *
 * What it is NOT is a substitute for the fine-tuned model. That engine's number comes from a
 * cosine similarity mapped through a Platt calibrator fitted on labelled pairs. A language
 * model asked for a percentage returns a confident number with no fitted relationship to
 * anything, which is why `calibrated` is false here exactly as it is for Claude, and why the
 * `base` engine below reports no score at all rather than an uncalibrated lookalike.
 */
export const ENGINES = ["finetuned", "base", "keyword", "claude", "gemma"] as const;
export type EngineId = (typeof ENGINES)[number];

export interface EngineCapabilities {
  /** Produces a score at all. The keyword and base engines deliberately do not. */
  score: boolean;
  /** Per-requirement coverage from the posting. */
  requirements: boolean;
  /** Written prose and suggested bullets. Language models only. */
  generativeFeedback: boolean;
  /** The score is mapped through the Platt calibrator fitted on labelled data. */
  calibrated: boolean;
}

export interface EngineMeta {
  id: EngineId;
  name: string;
  tagline: string;
  /** Shown next to the picker. The only engine that costs anything is Claude, and a user
   *  about to spend money is entitled to know before they click, not after. */
  cost: "free" | "per-call";
  capabilities: EngineCapabilities;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  finetuned: {
    id: "finetuned",
    name: "Fine-tuned MPNet",
    tagline: "Calibrated ranking score with requirement coverage",
    cost: "free",
    capabilities: { score: true, requirements: true, generativeFeedback: false, calibrated: true },
  },
  base: {
    id: "base",
    name: "Base MPNet",
    tagline: "The same model without this project's training, for comparison",
    cost: "free",
    // No score: the calibrator maps the fine-tuned model's distribution, and applying it
    // here would produce a confident number that means nothing. Raw cosine only.
    capabilities: { score: false, requirements: false, generativeFeedback: false, calibrated: false },
  },
  keyword: {
    id: "keyword",
    name: "Keyword coverage",
    tagline: "Literal ATS-style matching and ranked gaps. No model involved",
    cost: "free",
    capabilities: { score: false, requirements: false, generativeFeedback: false, calibrated: false },
  },
  claude: {
    id: "claude",
    name: "Claude",
    tagline: "Written feedback and suggested bullet rewrites",
    cost: "per-call",
    capabilities: { score: true, requirements: false, generativeFeedback: true, calibrated: false },
  },
  gemma: {
    id: "gemma",
    name: "Gemma (OpenRouter)",
    // Says what it is for. The same capabilities as Claude at none of the cost is a claim
    // that would be doing the reader a disservice: an open-weights model on a free endpoint
    // is slower, queues under load, and is not constrained to the output schema.
    tagline: "Open-weights written feedback, for trying the generative path without a bill",
    cost: "free",
    capabilities: { score: true, requirements: false, generativeFeedback: true, calibrated: false },
  },
};

export type RequirementStatus = "covered" | "partial" | "missing";

/** One requirement parsed out of the posting, with the resume sentence that matched it. */
export interface Requirement {
  requirement: string;
  status: RequirementStatus;
  /** Cosine similarity between the requirement and its best-matching resume sentence. */
  similarity: number;
  /** The resume sentence itself. Empty for a missing requirement, since there was nothing to
   *  point at, and inventing an explanation would be worse than the blank. */
  evidence: string;
}

/**
 * The normalized result of running one engine on one pair. Mirrors the `POST /api/score`
 * 200 body in SPEC §4.
 *
 * `score` is 0 to 1 everywhere in this codebase and is converted to 0-100 only at the
 * point of display. Two units for one quantity is how a 0.72 ends up rendered as "0.72%".
 */
export interface ScoreResult {
  engine: EngineId;
  modelId: string;
  /** 0 to 1. Null for engines that do not produce a score (base, keyword). */
  score: number | null;
  calibrated: boolean;
  /** Uncalibrated similarity, for diagnostics and for the before-and-after comparison. */
  rawCosine: number | null;
  requirements: Requirement[];
  /** Deterministic keyword coverage. Computed for every engine, since it is a different signal
   *  from semantic similarity, not a worse one. Null when the posting names no
   *  recognisable skills. */
  keywords: AtsAnalysis | null;
  /** Language-model engines only. */
  summary: string | null;
  /** Language-model engines only. */
  suggestedBullets: string[] | null;
  /**
   * The model's MEASURED mean absolute error on held-out data, as a band around the score,
   * in the same 0-to-1 units.
   *
   * Explicitly not a per-pair confidence interval. There is no principled way to compute
   * one for a single prediction, and a plausible-looking invention would be worse than
   * omitting it (SPEC §5.1 item 1). Null for every engine that has not been measured this
   * way, which is all of them except the calibrated fine-tuned model.
   */
  errorBand: { low: number; high: number; basis: string } | null;
  /**
   * True when the scoring service reported `fine_tuned: false`, so it fell back to the base
   * model. SPEC §2.3 rule 3: the product surfaces this rather than serving uncalibrated
   * scores as if they were calibrated.
   */
  degraded: boolean;
  latencyMs: number;
  /** Set only when the analysis was persisted against an application. Null for guests. */
  analysisId: string | null;
  /**
   * Whether the run was stored, present ONLY when the request asked for it by sending an
   * `applicationId`. Absent means nothing was asked to be saved, which is not the same as
   * a failed save, and collapsing the two would have the matcher warn every guest that
   * their result was not stored.
   *
   * False means the score is good and the write failed. `/api/score` reports that inside a
   * 200 rather than failing the request, because the score is the thing the user asked for
   * and it already cost a model call.
   */
  saved?: boolean;
}

export interface Verdict {
  label: string;
  /** Plain-language gloss of the band, so the label is never the only explanation. */
  plain: string;
  /** Tailwind classes. Colour is never the only carrier of meaning (SPEC Part 7), and the
   *  label always renders alongside. */
  ring: string;
  text: string;
  chip: string;
}

/**
 * Colour and copy per band. Keyed by the band labels in `benchmark.ts`, which is the
 * single source of truth for where the boundaries sit.
 */
const BAND_STYLES: Record<string, Omit<Verdict, "label" | "plain">> = {
  "Strong match": {
    ring: "stroke-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  "Good match": {
    ring: "stroke-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    chip: "bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/20",
  },
  "Partial match": {
    ring: "stroke-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    chip: "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
  },
  "Weak match": {
    ring: "stroke-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    chip: "bg-orange-50 text-orange-900 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/20",
  },
  "Not a match": {
    ring: "stroke-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    chip: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/20",
  },
};

/**
 * The verdict band for a score.
 *
 * Takes a 0-to-1 score and delegates the boundaries to `BANDS` in `benchmark.ts`, which
 * SPEC Appendix A names as the module the product and the research repository share
 * precisely so the two never disagree about what a 0.62 means.
 *
 * This used to carry its own thresholds (70/50/30/15 on a 0-100 scale) that had drifted
 * from `BANDS` (0.85/0.7/0.5/0.3). A 0.62 was a "Good match" here and a "Partial match"
 * there. There is now one set of numbers.
 */
export function verdictFor(score01: number): Verdict {
  const band = bandFor(score01);
  return { label: band.label, plain: band.plain, ...BAND_STYLES[band.label] };
}

/** The bands, worst to best, for a legend or a text alternative to a gauge. */
export function allVerdicts(): Verdict[] {
  return [...BANDS].map((band) => ({
    label: band.label,
    plain: band.plain,
    ...BAND_STYLES[band.label],
  }));
}

/** Display helper: the 0-to-100 integer shown to a user, from the 0-to-1 score. */
export function toDisplayScore(score01: number): number {
  return Math.max(0, Math.min(100, Math.round(score01 * 100)));
}

/** Both texts need enough signal to score meaningfully, and below this we refuse rather than
 *  return a confident-looking number built on nothing. Matches the scoring service, which
 *  422s on the same threshold. */
export const MIN_WORDS = 50;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

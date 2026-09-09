/**
 * Judging how well an extraction went, before the text is saved and scored.
 *
 * The reason this exists rather than a correction textarea on every upload: extraction
 * usually succeeds, and making everyone proofread a wall of text just in case is a worse
 * product than one that knows when it did badly and only asks then. It also catches the case
 * a human would not: text that reads fine at a glance but has lost every space, which scores
 * disastrously and looks like nothing is wrong.
 *
 * Three verdicts, each with a different consequence at the call site:
 *
 *   good      save it, say nothing
 *   degraded  save it, but open the review panel and say what looks off
 *   failed    refuse, and name the specific reason
 *
 * Pure, and every threshold is a named constant, because these are judgement calls and the
 * next person to tune one deserves to see what it was set against.
 */

import { MIN_WORDS, wordCount } from "@/lib/types";

export type ExtractionVerdict = "good" | "degraded" | "failed";

export interface ExtractionSignals {
  words: number;
  /** Share of non-space characters that are letters or digits. */
  alphaRatio: number;
  /** Mean token length. High means the spaces were lost. */
  meanWordLength: number;
  /** How many of the expected résumé section headings appear. */
  sections: number;
  /** Null when the page count is unknown, as it is for a plain text upload. */
  wordsPerPage: number | null;
}

export interface ExtractionQuality {
  verdict: ExtractionVerdict;
  /** Why, for `degraded` and `failed`. Null when the extraction is good. */
  reason: string | null;
  signals: ExtractionSignals;
}

/**
 * Below this share of alphanumerics the "text" is symbol soup: a broken encoding, or a font
 * with no usable character map, both of which produce confident-looking output that is not
 * words. 0.55 passes ordinary résumé prose, which runs about 0.78 once spaces are excluded,
 * with room for heavy punctuation and dates.
 */
const MIN_ALPHA_RATIO = 0.55;

/**
 * Mean token length above this means the spaces are gone.
 *
 * English prose sits near 4.7. A résumé with headings and technologies reaches about 6.
 * "SeniorBackendEngineerAtlasSystems" pushes the mean past 12 immediately, and that document
 * scores near zero against every posting while looking, in a preview, almost fine.
 */
const MAX_MEAN_WORD_LENGTH = 12;

/**
 * A page carrying fewer words than this extracted partially. A dense résumé page runs
 * 350-600 words; a sparse or heavily designed one still clears 120. Below 60 the parser
 * found a fragment.
 */
const MIN_WORDS_PER_PAGE = 60;

/** Headings essentially every résumé carries at least one of. Absence is a hint, not proof,
 *  which is why it can only produce `degraded` and never `failed`. */
const SECTION_PATTERNS = [
  /\bexperience\b/i,
  /\bemployment\b/i,
  /\beducation\b/i,
  /\bskills\b/i,
  /\bprojects\b/i,
  /\bsummary\b/i,
  /\bcertifications?\b/i,
  /\bpublications?\b/i,
];

export function measureExtraction(text: string, pages: number | null = null): ExtractionSignals {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const dense = trimmed.replace(/\s+/g, "");

  const alphanumerics = (dense.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const words = wordCount(trimmed);

  return {
    words,
    alphaRatio: dense.length === 0 ? 0 : alphanumerics / dense.length,
    meanWordLength: tokens.length === 0 ? 0 : dense.length / tokens.length,
    sections: SECTION_PATTERNS.filter((pattern) => pattern.test(trimmed)).length,
    wordsPerPage: pages && pages > 0 ? words / pages : null,
  };
}

/**
 * Assess an extraction.
 *
 * `pages` is the source's page count where one exists. DOCX and TXT have none, and the
 * per-page check is simply skipped rather than guessed at.
 */
export function assessExtraction(text: string, pages: number | null = null): ExtractionQuality {
  const signals = measureExtraction(text, pages);

  const failed = (reason: string): ExtractionQuality => ({ verdict: "failed", reason, signals });
  const degraded = (reason: string): ExtractionQuality => ({
    verdict: "degraded",
    reason,
    signals,
  });

  if (signals.words === 0) {
    return failed(
      "No text could be read from that file. If it is a scan or an image export, there is nothing to extract, so re-export it from the original document.",
    );
  }

  // The same floor the scoring service enforces, so a résumé that would 422 at scoring time
  // is refused here instead, where the cause is visible.
  if (signals.words < MIN_WORDS) {
    return failed(
      `Only ${signals.words} words came out of that file, and scoring needs at least ${MIN_WORDS}. It is most likely a scan, or a design-heavy export where the text is an image.`,
    );
  }

  if (signals.alphaRatio < MIN_ALPHA_RATIO) {
    return failed(
      "The text came out as mostly symbols, which means the file uses an embedded font with no readable character map. Re-exporting it as a standard PDF usually fixes this.",
    );
  }

  if (signals.meanWordLength > MAX_MEAN_WORD_LENGTH) {
    return degraded(
      "The words in this file ran together when it was read, so the spacing needs a look before it is scored.",
    );
  }

  if (signals.wordsPerPage !== null && signals.wordsPerPage < MIN_WORDS_PER_PAGE) {
    return degraded(
      "Only part of this file could be read. Check that nothing is missing before scoring it.",
    );
  }

  if (signals.sections === 0) {
    return degraded(
      "No familiar résumé sections were found in the text that came out. It is worth checking it read correctly.",
    );
  }

  return { verdict: "good", reason: null, signals };
}

/**
 * Rebuilding readable text from a PDF's positioned glyph runs.
 *
 * The previous extractor called `extractText(doc, { mergePages: true })` and threw away
 * every coordinate the parser had already computed. That works for a single-column document
 * and fails badly for the two-column résumé layout half of template sites produce: the
 * parser emits runs in the order the file happens to store them, so a job title from the
 * left column lands in the middle of a bullet from the right, and the matcher then scores a
 * document that reads like two shredded pages taped together.
 *
 * This module takes the positioned items instead and puts the page back together the way a
 * reader would: find the columns, group runs into lines, read each column top to bottom,
 * then repair the artifacts the format leaves behind.
 *
 * Everything here is pure. The tests build item arrays directly, so the whole reading order
 * problem is exercised without a single PDF fixture.
 */

/** The shape `unpdf`'s `extractTextItems` returns per run. Restated rather than imported so
 *  the tests, and this file's logic, do not depend on the parser package. */
export interface TextItem {
  str: string;
  /** PDF user space: origin bottom-left, so a LARGER y is higher up the page. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  hasEOL?: boolean;
}

export interface ReconstructOptions {
  /** Page width in the same units as the items. Used to size the column gap threshold. */
  pageWidth?: number;
}

/** A gap this wide, running the full height of the text block, is a column separator rather
 *  than wide word spacing. Six percent of the page is about 36pt on US Letter, which no
 *  inter-word space reaches and every two-column layout exceeds. */
const COLUMN_GAP_RATIO = 0.06;

/** Bins for the occupancy scan. Fine enough to find a 36pt gap, coarse enough to stay cheap. */
const BINS = 200;

/** Two runs whose baselines differ by less than this fraction of the line height are on the
 *  same visual line. Generous, because superscripts and inline icons shift the baseline. */
const LINE_TOLERANCE = 0.5;

/** A horizontal gap wider than this fraction of the font size is a real space. Below it the
 *  runs are adjacent glyphs the parser happened to split. */
const SPACE_RATIO = 0.22;

/** Ligatures and typographic characters PDFs embed that break literal keyword matching.
 *  "ﬁnance" and "finance" are the same word to a reader and different to `includes()`. */
const GLYPH_REPAIRS: Array<[RegExp, string]> = [
  [/ﬀ/g, "ff"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ﬃ/g, "ffi"],
  [/ﬄ/g, "ffl"],
  [/ﬅ/g, "st"],
  [/ﬆ/g, "st"],
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/–/g, "-"],
  [/—/g, "-"],
  [/…/g, "..."],
  // Non-breaking, zero-width, and the narrow spaces layout engines inject.
  [/[   ]/g, " "],
  [/[​‌‍﻿]/g, ""],
];

/** Bullet glyphs, normalised to a single marker so downstream parsing sees one vocabulary. */
const BULLET = /^[•‣◦⁃∙·▪●■−*+-]\s+/;

interface Line {
  text: string;
  /** Baseline, for header/footer detection across pages. */
  y: number;
  /** Largest font size on the line, for heading detection. */
  fontSize: number;
}

function repairGlyphs(text: string): string {
  let out = text;
  for (const [pattern, replacement] of GLYPH_REPAIRS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Find the x positions where a column break falls.
 *
 * Projects every run onto the x axis, then looks for a band no run crosses. A résumé with a
 * skills sidebar has exactly one such band; a single-column document has none, and gets one
 * column covering the page.
 *
 * Returns the split positions, ascending. Empty means one column.
 */
export function findColumnSplits(items: TextItem[], pageWidth: number): number[] {
  if (items.length === 0 || pageWidth <= 0) return [];

  const occupied = new Array<boolean>(BINS).fill(false);
  const binOf = (x: number) => Math.max(0, Math.min(BINS - 1, Math.floor((x / pageWidth) * BINS)));

  let minBin = BINS;
  let maxBin = 0;
  for (const item of items) {
    const from = binOf(item.x);
    const to = binOf(item.x + Math.max(item.width, 1));
    for (let bin = from; bin <= to; bin += 1) occupied[bin] = true;
    if (from < minBin) minBin = from;
    if (to > maxBin) maxBin = to;
  }

  const minGapBins = Math.max(2, Math.floor(BINS * COLUMN_GAP_RATIO));
  const splits: number[] = [];

  let runStart = -1;
  for (let bin = minBin; bin <= maxBin; bin += 1) {
    if (!occupied[bin]) {
      if (runStart === -1) runStart = bin;
      continue;
    }
    if (runStart !== -1) {
      if (bin - runStart >= minGapBins) {
        // Split down the middle of the empty band.
        splits.push(((runStart + bin) / 2 / BINS) * pageWidth);
      }
      runStart = -1;
    }
  }

  return splits;
}

/** Group a column's runs into visual lines, ordered top to bottom. */
function assembleLines(items: TextItem[]): Line[] {
  if (items.length === 0) return [];

  // Descending y, because PDF space counts upward and reading order runs downward.
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const groups: TextItem[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current) {
      const reference = current[0];
      const tolerance = Math.max(reference.height, reference.fontSize, 1) * LINE_TOLERANCE;
      if (Math.abs(reference.y - item.y) <= tolerance) {
        current.push(item);
        continue;
      }
    }
    groups.push([item]);
  }

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);

    let text = "";
    let previousEnd: number | null = null;
    let fontSize = 0;

    for (const item of ordered) {
      const piece = item.str;
      if (piece.length === 0) continue;

      if (previousEnd !== null) {
        const gap = item.x - previousEnd;
        const threshold = Math.max(item.fontSize, 1) * SPACE_RATIO;
        // Only insert a space if neither side already has one, or the runs would fuse into
        // "SeniorBackendEngineer", which is the single most common extraction defect.
        const needsSpace = gap > threshold && !/\s$/.test(text) && !/^\s/.test(piece);
        if (needsSpace) text += " ";
      }

      text += piece;
      previousEnd = item.x + item.width;
      if (item.fontSize > fontSize) fontSize = item.fontSize;
    }

    return { text: text.replace(/\s+/g, " ").trim(), y: group[0].y, fontSize };
  }).filter((line) => line.text.length > 0);
}

/**
 * Lines that repeat at the same place on three or more pages are furniture.
 *
 * A name in a running header is the usual case, and left in it appears once per page, which
 * over-weights it in keyword coverage and reads as a stutter to anyone who opens the text.
 * Three pages rather than two, because a two-page résumé whose second page genuinely repeats
 * a section title is not a header.
 */
function dropRepeatedFurniture(pages: Line[][]): Line[][] {
  if (pages.length < 3) return pages;

  const counts = new Map<string, number>();
  for (const page of pages) {
    // Only the first and last two lines of a page can be furniture; a repeated line in the
    // middle of a page is content that happens to recur.
    const candidates = [...page.slice(0, 2), ...page.slice(-2)];
    for (const line of new Set(candidates.map((l) => l.text))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const furniture = new Set(
    [...counts.entries()].filter(([, count]) => count >= 3).map(([text]) => text),
  );
  if (furniture.size === 0) return pages;

  return pages.map((page, index) =>
    page.filter((line, position) => {
      const nearEdge = position < 2 || position >= page.length - 2;
      return !(nearEdge && furniture.has(line.text)) || index === -1;
    }),
  );
}

/** Sentence-ending punctuation, after which a line break is a real break. */
const TERMINATOR = /[.!?:;]["')\]]?$/;

/** A line that starts a new block regardless of what came before it. */
const STARTS_BLOCK = /^([•‣◦⁃∙·▪●■*+-]\s|\d+[.)]\s)/;

/**
 * Rejoin lines the layout broke mid-sentence.
 *
 * A PDF has no paragraphs, only lines, so a wrapped bullet arrives as two lines and reads as
 * two bullets. Joining is conservative on purpose: only when the previous line does not end
 * in punctuation AND the next does not begin a bullet, a number, or a capitalised word that
 * could be a heading. Over-joining welds a section title onto the paragraph beneath it, which
 * is worse than leaving a wrap alone.
 */
function joinWrappedLines(lines: string[]): string[] {
  const out: string[] = [];

  for (const line of lines) {
    const previous = out[out.length - 1];

    if (previous !== undefined) {
      const hyphenated = /[a-z]-$/.test(previous) && /^[a-z]/.test(line);
      if (hyphenated) {
        out[out.length - 1] = previous.slice(0, -1) + line;
        continue;
      }

      const continues =
        !TERMINATOR.test(previous) &&
        !STARTS_BLOCK.test(line) &&
        /^[a-z(]/.test(line) &&
        previous.length > 0;

      if (continues) {
        out[out.length - 1] = `${previous} ${line}`;
        continue;
      }
    }

    out.push(line);
  }

  return out;
}

/**
 * Turn a document's positioned runs into readable text.
 *
 * `pages` is one array of runs per page, exactly as `extractTextItems` returns them.
 */
export function reconstruct(pages: TextItem[][], options: ReconstructOptions = {}): string {
  const pageWidth = options.pageWidth ?? 612;

  const perPage: Line[][] = pages.map((items) => {
    const usable = items.filter((item) => item.str.trim().length > 0);
    if (usable.length === 0) return [];

    const splits = findColumnSplits(usable, pageWidth);
    if (splits.length === 0) return assembleLines(usable);

    // Read each column fully before moving to the next, which is what a person does and
    // what the raw parser order does not.
    const bounds = [0, ...splits, Number.POSITIVE_INFINITY];
    const columns: Line[][] = [];
    for (let index = 0; index < bounds.length - 1; index += 1) {
      const from = bounds[index];
      const to = bounds[index + 1];
      const inColumn = usable.filter((item) => {
        const centre = item.x + item.width / 2;
        return centre >= from && centre < to;
      });
      if (inColumn.length > 0) columns.push(assembleLines(inColumn));
    }

    return columns.flat();
  });

  const cleaned = dropRepeatedFurniture(perPage);

  const lines = cleaned
    .flat()
    .map((line) => repairGlyphs(line.text))
    .map((line) => line.replace(BULLET, "- "))
    .filter((line) => line.trim().length > 0);

  return joinWrappedLines(lines)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

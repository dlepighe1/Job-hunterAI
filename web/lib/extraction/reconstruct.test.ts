import { describe, expect, it } from "vitest";

import { findColumnSplits, reconstruct, type TextItem } from "@/lib/extraction/reconstruct";

const PAGE_WIDTH = 612;

/** Build a run. Defaults approximate 11pt body text, which is what résumés use. */
function item(str: string, x: number, y: number, extra: Partial<TextItem> = {}): TextItem {
  return {
    str,
    x,
    y,
    // Roughly 5.5pt per character at 11pt, close enough for the gap arithmetic.
    width: extra.width ?? str.length * 5.5,
    height: extra.height ?? 11,
    fontSize: extra.fontSize ?? 11,
    ...extra,
  };
}

describe("findColumnSplits", () => {
  it("finds no split in a single-column page", () => {
    const items = [item("Senior Backend Engineer", 72, 700), item("Atlas Systems", 72, 680)];
    expect(findColumnSplits(items, PAGE_WIDTH)).toEqual([]);
  });

  // The layout that motivated this module: a narrow skills rail beside the main column.
  it("finds the gap in a two-column page", () => {
    const items = [
      item("EXPERIENCE", 60, 700),
      item("Staff Software Engineer", 60, 680),
      item("SKILLS", 400, 700),
      item("Python", 400, 680),
    ];
    const splits = findColumnSplits(items, PAGE_WIDTH);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toBeGreaterThan(190);
    expect(splits[0]).toBeLessThan(400);
  });

  // Ordinary word spacing must not read as a column break, or every sentence becomes a
  // column and the reading order is destroyed rather than repaired.
  it("does not mistake wide word spacing for a column", () => {
    const items = [
      item("Led", 72, 700),
      item("the", 100, 700),
      item("platform", 130, 700),
      item("team", 190, 700),
    ];
    expect(findColumnSplits(items, PAGE_WIDTH)).toEqual([]);
  });

  it("survives an empty page", () => {
    expect(findColumnSplits([], PAGE_WIDTH)).toEqual([]);
  });
});

describe("reconstruct", () => {
  it("orders runs top to bottom, not in parser order", () => {
    // Deliberately shuffled: PDF stores runs in whatever order the writer emitted them.
    const page = [item("Second line", 72, 680), item("First line", 72, 700)];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe("First line\nSecond line");
  });

  /**
   * The defect this whole module exists for.
   *
   * Read in raw order these two columns interleave, and the résumé says "EXPERIENCE SKILLS
   * Staff Software Engineer Python". Read by column it says what the document says.
   */
  it("reads each column fully before moving to the next", () => {
    const page = [
      item("EXPERIENCE", 60, 700),
      item("SKILLS", 400, 700),
      item("Staff Software Engineer", 60, 680),
      item("Python", 400, 680),
      item("Atlas Systems", 60, 660),
      item("PostgreSQL", 400, 660),
    ];

    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "EXPERIENCE\nStaff Software Engineer\nAtlas Systems\nSKILLS\nPython\nPostgreSQL",
    );
  });

  it("joins runs on one line, inserting a space only across a real gap", () => {
    const page = [
      item("Senior", 72, 700, { width: 33 }),
      // Starts right where the previous run ended: the parser split one word.
      item("ity", 105, 700, { width: 15 }),
      // A clear gap: a real space.
      item("Engineer", 140, 700, { width: 44 }),
    ];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe("Seniority Engineer");
  });

  it("repairs ligatures and typographic characters", () => {
    const page = [item("Oﬃce eﬃciency and ﬁnance — the “best” team’s", 72, 700)];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "Office efficiency and finance - the \"best\" team's",
    );
  });

  it("normalises every bullet glyph to one marker", () => {
    const page = [
      item("• Built the ingest pipeline", 72, 700),
      item("▪ Reduced p99 latency", 72, 680),
      item("‣ Mentored two engineers", 72, 660),
    ];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "- Built the ingest pipeline\n- Reduced p99 latency\n- Mentored two engineers",
    );
  });

  it("rejoins a hyphenated word split across lines", () => {
    const page = [item("Designed a multi-tenant infra-", 72, 700), item("structure at scale", 72, 680)];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "Designed a multi-tenant infrastructure at scale",
    );
  });

  it("rejoins a bullet wrapped mid-sentence", () => {
    const page = [
      item("- Reduced API latency by 40% through caching and", 72, 700),
      item("query optimisation across the platform.", 72, 680),
    ];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "- Reduced API latency by 40% through caching and query optimisation across the platform.",
    );
  });

  /**
   * The counterweight to the rule above. Over-joining is worse than under-joining, because
   * welding a section heading onto the paragraph below it destroys the structure the matcher
   * reads requirements from.
   */
  it("does not weld a heading onto the line beneath it", () => {
    const page = [item("EXPERIENCE", 72, 700), item("Staff Engineer at Atlas", 72, 680)];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "EXPERIENCE\nStaff Engineer at Atlas",
    );
  });

  it("does not join across a bullet boundary", () => {
    const page = [
      item("- Owned the billing service", 72, 700),
      item("- built the ingest pipeline", 72, 680),
    ];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe(
      "- Owned the billing service\n- built the ingest pipeline",
    );
  });

  it("drops a running header that repeats on three or more pages", () => {
    const page = (n: number) => [
      item("Alex Johnson - Résumé", 72, 760),
      item(`Body line ${n}`, 72, 700),
    ];
    const text = reconstruct([page(1), page(2), page(3)], { pageWidth: PAGE_WIDTH });
    expect(text).toBe("Body line 1\nBody line 2\nBody line 3");
  });

  // Two pages is a normal résumé, and a line appearing on both is far more likely to be
  // content than furniture.
  it("keeps a line that repeats on only two pages", () => {
    const page = (n: number) => [item("EXPERIENCE", 72, 760), item(`Body line ${n}`, 72, 700)];
    const text = reconstruct([page(1), page(2)], { pageWidth: PAGE_WIDTH });
    expect(text).toContain("EXPERIENCE");
  });

  it("returns an empty string for a page with no text", () => {
    expect(reconstruct([[]], { pageWidth: PAGE_WIDTH })).toBe("");
    expect(reconstruct([], { pageWidth: PAGE_WIDTH })).toBe("");
  });

  it("ignores whitespace-only runs rather than emitting blank lines", () => {
    const page = [item("Real content", 72, 700), item("   ", 72, 680), item("More content", 72, 660)];
    expect(reconstruct([page], { pageWidth: PAGE_WIDTH })).toBe("Real content\nMore content");
  });
});

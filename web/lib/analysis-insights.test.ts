import { describe, expect, it } from "vitest";

import { breakdown, importantGaps, recommendations, strengths, weaknesses } from "@/lib/analysis-insights";
import type { ScoreResult } from "@/lib/types";

function result(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    engine: "finetuned",
    modelId: "test",
    score: 0.72,
    calibrated: true,
    rawCosine: 0.8,
    requirements: [],
    keywords: null,
    summary: null,
    suggestedBullets: null,
    errorBand: null,
    degraded: false,
    latencyMs: 100,
    analysisId: null,
    ...overrides,
  };
}

const covered = (requirement: string, similarity = 0.8) => ({
  requirement,
  status: "covered" as const,
  similarity,
  evidence: `Evidence for ${requirement}`,
});
const missing = (requirement: string) => ({
  requirement,
  status: "missing" as const,
  similarity: 0.1,
  evidence: "",
});
const partial = (requirement: string) => ({
  requirement,
  status: "partial" as const,
  similarity: 0.5,
  evidence: `Weak evidence for ${requirement}`,
});

describe("breakdown", () => {
  /**
   * §37: do not generate component scores the engine does not produce.
   *
   * "Skills 88 / Experience 83 / Role alignment 86" is the tempting version and it is
   * fabricated, and no engine here emits those dimensions. Only two sub-measures actually
   * exist, and both are counted rather than modelled.
   */
  it("reports only dimensions the engine actually measured", () => {
    const rows = breakdown(
      result({
        requirements: [covered("Python"), missing("Kubernetes")],
        keywords: { score: 60, matched: ["python"], missing: ["k8s"], gaps: [] },
      }),
    );

    expect(rows.map((row) => row.label)).toEqual(["Requirement coverage", "Keyword coverage"]);
    expect(rows[0].value).toBe(50);
    expect(rows[1].value).toBe(60);
  });

  it("omits requirement coverage entirely for an engine that parses none", () => {
    const rows = breakdown(result({ requirements: [], keywords: { score: 60, matched: [], missing: [], gaps: [] } }));

    expect(rows.map((row) => row.label)).toEqual(["Keyword coverage"]);
  });

  it("returns nothing when the engine measured neither", () => {
    expect(breakdown(result({ requirements: [], keywords: null }))).toEqual([]);
  });

  // A partial counts as half. Counting it as covered overstates the resume; counting it as
  // missing understates it, and the evidence genuinely is there but thin.
  it("counts a partial requirement as half covered", () => {
    const rows = breakdown(result({ requirements: [covered("A"), partial("B")] }));

    expect(rows[0].value).toBe(75);
  });
});

describe("strengths", () => {
  it("names covered requirements with the evidence that covered them", () => {
    const found = strengths(result({ requirements: [covered("Python"), missing("Kubernetes")] }));

    expect(found).toHaveLength(1);
    expect(found[0].label).toBe("Python");
    expect(found[0].evidence).toContain("Python");
  });

  // The strongest matches first, because a list of twenty in arbitrary order is a keyword dump.
  it("orders by strength of evidence and caps the list", () => {
    const found = strengths(
      result({
        requirements: [
          covered("Weakest", 0.7),
          covered("Strongest", 0.95),
          covered("Middle", 0.85),
          covered("A", 0.6),
          covered("B", 0.6),
          covered("C", 0.6),
          covered("D", 0.6),
        ],
      }),
    );

    expect(found[0].label).toBe("Strongest");
    expect(found.length).toBeLessThanOrEqual(6);
  });
});

describe("importantGaps", () => {
  it("reports a missing requirement as high importance with no evidence", () => {
    const gaps = importantGaps(result({ requirements: [missing("Kubernetes")] }));

    expect(gaps[0]).toMatchObject({ label: "Kubernetes", importance: "high", evidence: "missing" });
  });

  it("reports a partial requirement as weak evidence rather than missing", () => {
    const gaps = importantGaps(result({ requirements: [partial("Terraform")] }));

    expect(gaps[0]).toMatchObject({ label: "Terraform", evidence: "weak" });
  });

  /**
   * §39: not every unmatched word is a gap. Only keywords the posting repeats or states in
   * its requirements section reach this list, and the rest are vocabulary, not requirements.
   */
  it("includes only high-priority keyword gaps, never every missing term", () => {
    const gaps = importantGaps(
      result({
        keywords: {
          score: 40,
          matched: [],
          missing: ["kubernetes", "foosball"],
          gaps: [
            { keyword: "kubernetes", occurrences: 4, inRequirements: true, priority: "high" },
            { keyword: "foosball", occurrences: 1, inRequirements: false, priority: "low" },
          ],
        },
      }),
    );

    const labels = gaps.map((gap) => gap.label.toLowerCase());
    expect(labels).toContain("kubernetes");
    expect(labels).not.toContain("foosball");
  });

  it("does not list the same thing twice when it is both a requirement and a keyword", () => {
    const gaps = importantGaps(
      result({
        requirements: [missing("Kubernetes")],
        keywords: {
          score: 40,
          matched: [],
          missing: ["kubernetes"],
          gaps: [{ keyword: "kubernetes", occurrences: 4, inRequirements: true, priority: "high" }],
        },
      }),
    );

    expect(gaps.filter((gap) => gap.label.toLowerCase() === "kubernetes")).toHaveLength(1);
  });
});

describe("weaknesses", () => {
  it("says nothing when there is nothing to say", () => {
    expect(weaknesses(result({ requirements: [covered("A"), covered("B")] }))).toEqual([]);
  });

  it("calls out thin coverage across the posting", () => {
    const found = weaknesses(
      result({ requirements: [missing("A"), missing("B"), missing("C"), covered("D")] }),
    );

    expect(found.some((item) => item.toLowerCase().includes("requirement"))).toBe(true);
  });

  it("calls out requirements the resume mentions without evidencing", () => {
    const found = weaknesses(result({ requirements: [partial("A"), partial("B")] }));

    expect(found.some((item) => item.toLowerCase().includes("evidence"))).toBe(true);
  });
});

describe("recommendations", () => {
  it("returns nothing without gaps to act on", () => {
    expect(recommendations(result({ requirements: [covered("A")] }))).toEqual([]);
  });

  /**
   * §42: "Improve keywords" is not a recommendation. Each one names the specific thing and
   * what to do about it.
   */
  it("names the specific requirement in each recommendation", () => {
    const items = recommendations(result({ requirements: [missing("Kubernetes")] }));

    expect(items[0].title).toContain("Kubernetes");
    expect(items[0].detail.length).toBeGreaterThan(20);
    expect(["high", "medium"]).toContain(items[0].impact);
  });

  /**
   * The keyword-stuffing warning, at the point of the suggestion.
   *
   * FEATURES.md §3.2 item 4: the product must NOT claim the model detects stuffing.
   * As measured, adding unevidenced tool names raised the score on 52 of 52 resumes. The
   * honest warning is that it will raise the number and will not survive a human reader.
   */
  it("warns that adding an unevidenced term raises the score without fooling a reader", () => {
    const items = recommendations(result({ requirements: [missing("Kubernetes")] }));
    const text = items.map((item) => item.detail).join(" ").toLowerCase();

    expect(text).toContain("evidence");
    // Must never claim the model catches stuffing.
    expect(text).not.toContain("detects keyword stuffing");
  });
});

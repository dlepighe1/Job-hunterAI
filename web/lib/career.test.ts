import { describe, expect, it } from "vitest";

import {
  ADJACENCY_CATEGORIES,
  type BaselineAnalysis,
  adjacentRoles,
  careerInsights,
  roleAffinities,
} from "@/lib/career";

function analysis(overrides: Partial<BaselineAnalysis> = {}): BaselineAnalysis {
  return {
    roleTitle: "Software Engineer",
    score: 0.8,
    calibrated: true,
    isBaseline: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    missingRequirements: [],
    coveredRequirements: [],
    ...overrides,
  };
}

describe("roleAffinities", () => {
  it("returns nothing when there is no evidence", () => {
    expect(roleAffinities([])).toEqual([]);
  });

  /**
   * §20, and the reason this module exists at all.
   *
   * Tailoring exists to raise a score. Feeding tailored scores back into the career profile
   * makes the product tell the user they are strongest in whichever direction it most
   * recently helped them rewrite, a loop where the system grades its own homework.
   */
  it("ignores tailored analyses entirely", () => {
    const affinities = roleAffinities([
      analysis({ roleTitle: "Data Scientist", score: 0.61, isBaseline: true }),
      analysis({ roleTitle: "Data Scientist", score: 0.94, isBaseline: false }),
      analysis({ roleTitle: "Data Scientist", score: 0.63, isBaseline: true }),
    ]);

    expect(affinities).toHaveLength(1);
    expect(affinities[0].sampleSize).toBe(2);
    // The 0.94 must not appear anywhere in the result.
    expect(affinities[0].affinity).toBeLessThan(0.7);
  });

  /**
   * The median, not the mean. One unusual posting, a role that happened to be written in
   * the user's exact vocabulary, or a wildly mismatched one, should not redefine a career
   * direction built from eighteen others.
   */
  it("uses the median of a role's baseline scores", () => {
    const affinities = roleAffinities([
      analysis({ roleTitle: "Data Scientist", score: 0.2 }),
      analysis({ roleTitle: "Data Scientist", score: 0.8 }),
      analysis({ roleTitle: "Data Scientist", score: 0.82 }),
    ]);

    expect(affinities[0].affinity).toBe(0.8);
  });

  it("groups role titles that differ only by case or padding", () => {
    const affinities = roleAffinities([
      analysis({ roleTitle: "Data Scientist" }),
      analysis({ roleTitle: "  data scientist " }),
    ]);

    expect(affinities).toHaveLength(1);
    expect(affinities[0].role).toBe("Data Scientist");
    expect(affinities[0].sampleSize).toBe(2);
  });

  /**
   * §21: confidence is reported only where it means something. One analysis is an anecdote,
   * and dressing it up as "High confidence" is exactly the fake precision §78 forbids.
   */
  it("scales confidence with the amount of evidence", () => {
    const one = roleAffinities([analysis({ roleTitle: "A" })])[0];
    const few = roleAffinities(
      Array.from({ length: 4 }, () => analysis({ roleTitle: "B" })),
    )[0];
    const many = roleAffinities(
      Array.from({ length: 12 }, () => analysis({ roleTitle: "C" })),
    )[0];

    expect(one.confidence).toBe("low");
    expect(few.confidence).toBe("medium");
    expect(many.confidence).toBe("high");
  });

  it("ignores analyses with no score, rather than counting them as zero", () => {
    const affinities = roleAffinities([
      analysis({ roleTitle: "Data Scientist", score: 0.8 }),
      analysis({ roleTitle: "Data Scientist", score: null }),
    ]);

    expect(affinities[0].sampleSize).toBe(1);
    expect(affinities[0].affinity).toBe(0.8);
  });

  it("ignores an analysis with no role title, which cannot be attributed", () => {
    expect(roleAffinities([analysis({ roleTitle: null })])).toEqual([]);
  });

  it("orders roles strongest first", () => {
    const affinities = roleAffinities([
      analysis({ roleTitle: "Weaker", score: 0.4 }),
      analysis({ roleTitle: "Stronger", score: 0.9 }),
    ]);

    expect(affinities.map((a) => a.role)).toEqual(["Stronger", "Weaker"]);
  });
});

describe("adjacentRoles", () => {
  it("returns nothing without a primary role", () => {
    expect(adjacentRoles(null)).toEqual([]);
  });

  it("covers all three adjacency categories for a known role", () => {
    const categories = new Set(adjacentRoles("Software Engineer").map((role) => role.category));

    expect(categories).toEqual(new Set(ADJACENCY_CATEGORIES));
  });

  /**
   * §77: every recommendation must be explainable. A role suggested with no stated reason
   * is a guess, and the user has no way to judge whether it is a good one.
   */
  it("gives every adjacency a reason and transferable evidence", () => {
    for (const role of adjacentRoles("Software Engineer")) {
      expect(role.rationale.length).toBeGreaterThan(0);
      expect(role.transferable.length).toBeGreaterThan(0);
      expect(role.gaps.length).toBeGreaterThan(0);
    }
  });

  it("never suggests the primary role back to itself", () => {
    const roles = adjacentRoles("Software Engineer").map((role) => role.role.toLowerCase());

    expect(roles).not.toContain("software engineer");
  });

  // An unmapped role gets nothing rather than a generic list. Suggesting Product Manager to
  // a nurse because the map has no entry would be worse than an empty state.
  it("returns nothing for a role it has no map for", () => {
    expect(adjacentRoles("Marine Biologist")).toEqual([]);
  });
});

describe("careerInsights", () => {
  it("says it is still learning rather than inventing a pattern", () => {
    const insights = careerInsights([], []);

    expect(insights.sufficient).toBe(false);
    expect(insights.items).toEqual([]);
  });

  it("stays insufficient on a single analysis", () => {
    expect(careerInsights([analysis()], []).sufficient).toBe(false);
  });

  it("names the strongest role once there is enough evidence", () => {
    const analyses = [
      ...Array.from({ length: 4 }, () => analysis({ roleTitle: "Data Scientist", score: 0.82 })),
      ...Array.from({ length: 4 }, () => analysis({ roleTitle: "ML Engineer", score: 0.55 })),
    ];

    const insights = careerInsights(analyses, []);

    expect(insights.sufficient).toBe(true);
    expect(insights.items.some((item) => item.body.includes("Data Scientist"))).toBe(true);
  });

  /**
   * §76: what the user WANTS and what their evidence SUPPORTS are different questions, and
   * the useful insight is the gap between them. It must not silently retarget them.
   */
  it("surfaces a gap between the declared interest and the evidence", () => {
    const analyses = [
      ...Array.from({ length: 4 }, () => analysis({ roleTitle: "Data Scientist", score: 0.84 })),
      ...Array.from({ length: 4 }, () => analysis({ roleTitle: "ML Engineer", score: 0.52 })),
    ];

    const insights = careerInsights(analyses, [], "ML Engineer");
    const text = insights.items.map((item) => item.body).join(" ");

    expect(text).toContain("ML Engineer");
    expect(text).toContain("Data Scientist");
  });

  it("names the most frequently missing requirements as a recurring gap", () => {
    const analyses = Array.from({ length: 6 }, () =>
      analysis({ roleTitle: "ML Engineer", missingRequirements: ["Kubernetes", "MLOps"] }),
    );

    const insights = careerInsights(analyses, []);
    const gap = insights.items.find((item) => item.kind === "gap");

    expect(gap?.body).toContain("Kubernetes");
  });

  it("draws only on baseline analyses", () => {
    const analyses = Array.from({ length: 6 }, () =>
      analysis({ roleTitle: "Inflated", score: 0.95, isBaseline: false }),
    );

    expect(careerInsights(analyses, []).sufficient).toBe(false);
  });
});

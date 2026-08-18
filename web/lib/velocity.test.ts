import { describe, expect, it } from "vitest";

import { RANGES, conversionRate, matchDistribution, pipelineStages, velocitySeries } from "@/lib/velocity";
import type { ApplicationView } from "@/lib/use-applications";

function application(overrides: Partial<ApplicationView> = {}): ApplicationView {
  return {
    id: crypto.randomUUID(),
    userId: "user_123",
    company: "Atlas Systems",
    role: "Data engineer",
    location: null,
    postingUrl: null,
    status: "applied",
    matchScore: null,
    matchEngine: null,
    matchCalibrated: false,
    appliedAt: "2026-08-01",
    respondedAt: null,
    priority: false,
    resumeId: null,
    notes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    lastActivityAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-08-14T12:00:00.000Z");

describe("RANGES", () => {
  it("offers the four windows the dashboard advertises, defaulting to 8 weeks", () => {
    expect(RANGES.map((range) => range.id)).toEqual(["30d", "8w", "3m", "6m"]);
    expect(RANGES.find((range) => range.default)?.id).toBe("8w");
  });
});

describe("velocitySeries", () => {
  it("returns a bucket per period even when nothing happened", () => {
    const series = velocitySeries([], "8w", NOW);

    expect(series).toHaveLength(8);
    for (const point of series) {
      expect(point.applications).toBe(0);
      expect(point.responses).toBe(0);
      expect(point.interviews).toBe(0);
    }
  });

  it("counts an application into the bucket it was applied in", () => {
    const series = velocitySeries(
      [application({ appliedAt: "2026-08-13" })],
      "8w",
      NOW,
    );

    expect(series[series.length - 1].applications).toBe(1);
    expect(series.slice(0, -1).every((point) => point.applications === 0)).toBe(true);
  });

  /**
   * An application with no applied date is one the user saved but never sent. Counting it
   * as activity would make the velocity chart report work that never happened.
   */
  it("ignores saved applications that were never actually sent", () => {
    const series = velocitySeries(
      [application({ status: "saved", appliedAt: null })],
      "8w",
      NOW,
    );

    expect(series.reduce((sum, point) => sum + point.applications, 0)).toBe(0);
  });

  it("drops anything older than the window", () => {
    const series = velocitySeries(
      [application({ appliedAt: "2020-01-01" })],
      "8w",
      NOW,
    );

    expect(series.reduce((sum, point) => sum + point.applications, 0)).toBe(0);
  });

  /**
   * A response is the employer replying, which is a different event from the user applying.
   * It is counted from `respondedAt`, and an application that reached screening without a
   * recorded response date contributes nothing rather than being guessed at.
   */
  it("counts responses only where a response date was recorded", () => {
    const series = velocitySeries(
      [
        application({ status: "screening", appliedAt: "2026-08-10", respondedAt: "2026-08-12" }),
        application({ status: "screening", appliedAt: "2026-08-10", respondedAt: null }),
      ],
      "8w",
      NOW,
    );

    expect(series.reduce((sum, point) => sum + point.responses, 0)).toBe(1);
  });

  it("counts an interview into the week the response arrived", () => {
    const series = velocitySeries(
      [application({ status: "interview", appliedAt: "2026-08-10", respondedAt: "2026-08-12" })],
      "8w",
      NOW,
    );

    expect(series.reduce((sum, point) => sum + point.interviews, 0)).toBe(1);
  });

  it("uses daily buckets over 30 days and weekly over 8 weeks", () => {
    expect(velocitySeries([], "30d", NOW)).toHaveLength(30);
    expect(velocitySeries([], "8w", NOW)).toHaveLength(8);
  });
});

describe("pipelineStages", () => {
  it("counts the five funnel stages and leaves closed states out of the funnel", () => {
    const stages = pipelineStages([
      application({ status: "saved" }),
      application({ status: "applied" }),
      application({ status: "applied" }),
      application({ status: "interview" }),
      application({ status: "rejected" }),
    ]);

    expect(stages.map((stage) => stage.status)).toEqual([
      "saved",
      "applied",
      "screening",
      "interview",
      "offer",
    ]);
    expect(stages.find((stage) => stage.status === "applied")?.count).toBe(2);
    expect(stages.some((stage) => stage.status === "rejected")).toBe(false);
  });
});

describe("conversionRate", () => {
  it("reports applied to interview as a whole percentage", () => {
    expect(conversionRate(24, 6)).toBe(25);
  });

  /**
   * §13 says not to fabricate conversion values. Dividing by zero, or reporting a rate off
   * two applications, produces a number that looks like a measurement and is not one.
   */
  it("returns null rather than dividing by zero", () => {
    expect(conversionRate(0, 0)).toBeNull();
  });

  it("returns null when the denominator is too small to mean anything", () => {
    expect(conversionRate(2, 1)).toBeNull();
  });
});

describe("matchDistribution", () => {
  it("returns nothing when no application has been scored", () => {
    expect(matchDistribution([application({ matchScore: null })])).toEqual([]);
  });

  // The bands come from BANDS in benchmark.ts, which the research repo and the live scorer
  // share, so a 0.72 is never "competitive" here and "good" there.
  it("buckets scored applications into the three published bands", () => {
    const bands = matchDistribution([
      application({ matchScore: 0.9 }),
      application({ matchScore: 0.75 }),
      application({ matchScore: 0.4 }),
      application({ matchScore: null }),
    ]);

    expect(bands).toHaveLength(3);
    expect(bands[0]).toMatchObject({ label: "Strong match", count: 1 });
    expect(bands[1]).toMatchObject({ label: "Competitive", count: 1 });
    expect(bands[2]).toMatchObject({ label: "Lower match", count: 1 });
  });

  it("reports each band's share of the scored set, not of every application", () => {
    const bands = matchDistribution([
      application({ matchScore: 0.75 }),
      application({ matchScore: 0.75 }),
      application({ matchScore: null }),
    ]);

    expect(bands[1].share).toBe(100);
  });
});

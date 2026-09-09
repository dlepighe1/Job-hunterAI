import { describe, expect, it } from "vitest";

import { summarize } from "@/lib/summary";
import type { ApplicationView } from "@/lib/use-applications";

function application(overrides: Partial<ApplicationView> = {}): ApplicationView {
  return {
    id: crypto.randomUUID(),
    userId: "user_123",
    company: "Atlas Systems",
    role: "Data engineer",
    location: null,
    industry: null,
    workModel: null,
    postingUrl: null,
    status: "saved",
    matchScore: null,
    matchEngine: null,
    matchCalibrated: false,
    appliedAt: null,
    respondedAt: null,
    priority: false,
    resumeId: null,
    notes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    lastActivityAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("summarize", () => {
  it("counts an empty pipeline as empty rather than as zeroes with meaning", () => {
    const summary = summarize([]);

    expect(summary.total).toBe(0);
    expect(summary.isEmpty).toBe(true);
    expect(summary.scored).toBe(0);
    expect(summary.medianScore).toBeNull();
  });

  it("counts by status", () => {
    const summary = summarize([
      application({ status: "saved" }),
      application({ status: "applied" }),
      application({ status: "applied" }),
      application({ status: "interview" }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.byStatus.applied).toBe(2);
    expect(summary.byStatus.saved).toBe(1);
    expect(summary.byStatus.offer).toBe(0);
  });

  /**
   * "Live" is everything not closed. It is a count of applications still capable of
   * producing an outcome, which is the only number on this screen a user would act on.
   */
  it("treats rejected and withdrawn as closed, not live", () => {
    const summary = summarize([
      application({ status: "applied" }),
      application({ status: "rejected" }),
      application({ status: "withdrawn" }),
      application({ status: "offer" }),
    ]);

    expect(summary.live).toBe(2);
    expect(summary.closed).toBe(2);
  });

  /**
   * The median, not the mean.
   *
   * FEATURES.md §2.3 supports ordering, not arithmetic on these numbers: they are ranking
   * scores from a model that underscores strong matches by roughly 0.17. A mean invites
   * "my average match is 63%", which is a claim about a distribution the model was never
   * evaluated to make. A median is a positional statistic: it names an actual row.
   */
  it("reports the median score, and only over rows that have one", () => {
    const summary = summarize([
      application({ matchScore: 0.4, matchCalibrated: true }),
      application({ matchScore: 0.6, matchCalibrated: true }),
      application({ matchScore: 0.8, matchCalibrated: true }),
      application({ matchScore: null }),
    ]);

    expect(summary.scored).toBe(3);
    expect(summary.medianScore).toBe(0.6);
  });

  it("takes the lower middle value for an even count, never averaging the two", () => {
    const summary = summarize([
      application({ matchScore: 0.4 }),
      application({ matchScore: 0.7 }),
    ]);

    // 0.55 would be a score no application actually has.
    expect(summary.medianScore).toBe(0.4);
  });

  it("has no median when nothing has been scored", () => {
    const summary = summarize([application({ matchScore: null })]);

    expect(summary.medianScore).toBeNull();
    expect(summary.scored).toBe(0);
  });

  /**
   * A median mixing a calibrated score with an uncalibrated one is not a number about
   * anything. §2.2: engine numbers are comparable on ordering, not absolute value, unless
   * both are calibrated, so the summary says when its own figure is mixed.
   */
  it("flags a median drawn from more than one calibration state", () => {
    const mixed = summarize([
      application({ matchScore: 0.4, matchCalibrated: true }),
      application({ matchScore: 0.6, matchCalibrated: false }),
    ]);
    expect(mixed.medianIsMixed).toBe(true);

    const consistent = summarize([
      application({ matchScore: 0.4, matchCalibrated: true }),
      application({ matchScore: 0.6, matchCalibrated: true }),
    ]);
    expect(consistent.medianIsMixed).toBe(false);
  });

  it("names the most recently active applications, newest first", () => {
    const summary = summarize([
      application({ company: "Older", lastActivityAt: "2026-08-01T10:00:00.000Z" }),
      application({ company: "Newest", lastActivityAt: "2026-08-09T10:00:00.000Z" }),
      application({ company: "Middle", lastActivityAt: "2026-08-05T10:00:00.000Z" }),
    ]);

    expect(summary.recent.map((row) => row.company)).toEqual(["Newest", "Middle", "Older"]);
  });

  it("caps the recent list so the dashboard cannot become the table", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      application({ lastActivityAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );

    expect(summarize(many).recent).toHaveLength(5);
  });
});

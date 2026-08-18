import { describe, expect, it } from "vitest";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  formatMatchScore,
  isTerminal,
  nextStatus,
  statusLabel,
} from "@/lib/applications";

describe("the status vocabulary", () => {
  // These strings are the `status` CHECK constraint on the `applications` table. A value
  // here that the database rejects is a runtime insert failure, not a type error, so the
  // list is asserted rather than assumed.
  it("matches the CHECK constraint in schema.sql", () => {
    expect([...APPLICATION_STATUSES]).toEqual([
      "saved",
      "applied",
      "screening",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
    ]);
  });

  it("labels every status", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(statusLabel(status)).toBeTruthy();
    }
  });
});

describe("nextStatus", () => {
  it("advances through the pipeline", () => {
    expect(nextStatus("saved", "applied")).toBe("applied");
    expect(nextStatus("applied", "screening_scheduled")).toBe("screening");
    expect(nextStatus("screening", "interview_scheduled")).toBe("interview");
    expect(nextStatus("interview", "offer_received")).toBe("offer");
  });

  // The rule that makes automatic transitions safe to run on every event: they may only
  // move an application forward. Without it, a late-arriving "applied" event would drag an
  // application that already reached interview back to the start, and the user would watch
  // the tracker undo their own progress.
  it("never moves an application backwards", () => {
    expect(nextStatus("interview", "applied")).toBe("interview");
    expect(nextStatus("offer", "screening_scheduled")).toBe("offer");
    expect(nextStatus("applied", "applied")).toBe("applied");
  });

  it("records an outcome from anywhere in the pipeline", () => {
    expect(nextStatus("saved", "rejected")).toBe("rejected");
    expect(nextStatus("offer", "rejected")).toBe("rejected");
    expect(nextStatus("screening", "withdrawn")).toBe("withdrawn");
  });

  // Reopening a closed application is a deliberate act, so it goes through an explicit
  // status change rather than through an event that happens to arrive afterwards.
  it("treats an outcome as final for automatic transitions", () => {
    expect(nextStatus("rejected", "interview_scheduled")).toBe("rejected");
    expect(nextStatus("withdrawn", "offer_received")).toBe("withdrawn");
    expect(nextStatus("rejected", "withdrawn")).toBe("rejected");
  });

  // Scoring a resume says nothing about where the application stands. Inferring "applied"
  // from an analysis would put a status on the row the user never claimed.
  it("leaves the status alone for events that carry no pipeline meaning", () => {
    expect(nextStatus("saved", "analysis_run")).toBe("saved");
    expect(nextStatus("interview", "analysis_run")).toBe("interview");
    expect(nextStatus("saved", "note_added")).toBe("saved");
  });

  it("is total over every status", () => {
    for (const status of APPLICATION_STATUSES) {
      const result: ApplicationStatus = nextStatus(status, "analysis_run");
      expect(APPLICATION_STATUSES).toContain(result);
    }
  });
});

describe("formatMatchScore", () => {
  // FEATURES.md §2.3: the score is displayed with an explicit statement of whether it is
  // calibrated, and it is never a percentage. "72%" reads as "72% likely to be hired",
  // which is a claim the model's evaluation does not support at all.
  it("renders a calibrated score with its basis", () => {
    expect(formatMatchScore(0.72, true)).toBe("72 out of 100 · calibrated");
  });

  it("says uncalibrated when it is", () => {
    expect(formatMatchScore(0.72, false)).toBe("72 out of 100 · uncalibrated");
  });

  it("never renders a percentage", () => {
    for (const score of [0, 0.5, 0.85]) {
      expect(formatMatchScore(score, true)).not.toContain("%");
    }
  });

  // The honest empty value. A dash is not a zero, and a zero would sort and read as a
  // measured "very bad match" rather than "nothing has been scored yet".
  it("renders an em dash when nothing has been scored", () => {
    expect(formatMatchScore(null, false)).toBe("n/a");
  });

  it("rounds to a whole number on the 0-to-100 scale", () => {
    expect(formatMatchScore(0.6149, true)).toBe("61 out of 100 · calibrated");
  });
});

describe("isTerminal", () => {
  it("is true only for the two closed outcomes", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("withdrawn")).toBe(true);
    expect(isTerminal("offer")).toBe(false);
    expect(isTerminal("saved")).toBe(false);
  });
});

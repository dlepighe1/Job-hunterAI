import { describe, expect, it } from "vitest";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  WORK_MODELS,
  engineLabel,
  formatMatchScore,
  hasUnansweredEmployerResponse,
  isTerminal,
  isWorkModel,
  matchDisplay,
  nextStatus,
  statusLabel,
  workModelLabel,
} from "@/lib/applications";
import { ENGINES, ENGINE_META } from "@/lib/types";

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
  //
  // The redesign compressed "72 out of 100" to "72/100" so the value fits a table cell and
  // a progress ring at the density the approved boards call for. The compression is
  // deliberate and the percent sign is still banned: "/100" keeps the denominator visible,
  // which is the whole point of the rule.
  it("renders a calibrated score with its basis", () => {
    expect(formatMatchScore(0.72, true)).toBe("72/100 · calibrated");
  });

  it("says uncalibrated when it is", () => {
    expect(formatMatchScore(0.72, false)).toBe("72/100 · uncalibrated");
  });

  it("never renders a percentage", () => {
    for (const score of [0, 0.5, 0.85]) {
      expect(formatMatchScore(score, true)).not.toContain("%");
    }
  });

  it("keeps the denominator visible, so the number is never bare", () => {
    for (const score of [0, 0.5, 0.85]) {
      expect(formatMatchScore(score, true)).toContain("/100");
    }
  });

  // Words, not a dash, for the one-line form. This string is what a screen reader
  // announces, and "—" is either read as "em dash" or skipped silently.
  it("says so in words when nothing has been scored", () => {
    expect(formatMatchScore(null, false)).toBe("Not scored yet");
  });

  it("rounds to a whole number on the 0-to-100 scale", () => {
    expect(formatMatchScore(0.6149, true)).toBe("61/100 · calibrated");
  });
});

describe("matchDisplay", () => {
  // The two-line form the redesigned table cell, grid ring and drawer header all render:
  // the value above, the calibration state beneath it. One function so the three surfaces
  // cannot drift on rounding or on what an unscored row looks like.
  it("splits the value from its calibration", () => {
    expect(matchDisplay(0.72, true)).toEqual({
      score: 72,
      label: "72/100",
      calibration: "calibrated",
      full: "72/100 · calibrated",
      scored: true,
    });
  });

  it("carries the uncalibrated state rather than dropping it", () => {
    expect(matchDisplay(0.44, false).calibration).toBe("uncalibrated");
  });

  /**
   * The honest empty value. A dash is not a zero, and a zero would sort and read as a
   * measured "very bad match" rather than "nothing has been scored yet".
   *
   * `score` stays null rather than becoming 0 because the grid's progress ring reads it
   * directly: a 0 would draw an empty ring, which looks like a measured floor rather than
   * an absent measurement.
   */
  it("renders an em dash and no ring for an unscored application", () => {
    expect(matchDisplay(null, false)).toEqual({
      score: null,
      label: "—",
      calibration: null,
      full: "Not scored yet",
      scored: false,
    });
  });

  it("clamps a score that arrives outside the range", () => {
    expect(matchDisplay(1.4, true).score).toBe(100);
    expect(matchDisplay(-0.2, true).score).toBe(0);
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

describe("the work model vocabulary", () => {
  // Same contract as the status list: these strings are the `work_model` CHECK constraint
  // on the `applications` table, so a value here the database rejects is a runtime insert
  // failure rather than a type error.
  it("matches the CHECK constraint in schema.sql", () => {
    expect([...WORK_MODELS]).toEqual(["remote", "hybrid", "onsite"]);
  });

  it("labels every model, and says In-person rather than the stored identifier", () => {
    expect(workModelLabel("remote")).toBe("Remote");
    expect(workModelLabel("hybrid")).toBe("Hybrid");
    expect(workModelLabel("onsite")).toBe("In-person");
  });

  it("recognises only the three", () => {
    expect(isWorkModel("remote")).toBe(true);
    expect(isWorkModel("in-person")).toBe(false);
    expect(isWorkModel(null)).toBe(false);
  });
});

describe("engineLabel", () => {
  /**
   * The guard that keeps the presentation map honest.
   *
   * `ENGINE_LABELS` is a hand-written copy of the engine list rather than an import of
   * `ENGINE_META`, so that a table cell does not drag the ATS analyser and the benchmark
   * bands into its bundle. This is the assertion that pays for the duplication: add a fifth
   * engine to `lib/types.ts` and forget the label here, and this fails.
   */
  it("names every engine the product defines", () => {
    for (const engine of ENGINES) {
      const label = engineLabel(engine);
      expect(label).toBe(ENGINE_META[engine].name);
    }
  });

  it("has no label for an unscored row", () => {
    expect(engineLabel(null)).toBeNull();
  });

  // A rollout can leave rows scored by an engine this build does not know. Showing the raw
  // id is more useful than "Unknown", which throws away the only clue available.
  it("passes an unrecognised identifier through unchanged", () => {
    expect(engineLabel("experimental-v9")).toBe("experimental-v9");
  });
});

describe("hasUnansweredEmployerResponse", () => {
  it("is true when the employer's reply is the newest thing on the row", () => {
    expect(
      hasUnansweredEmployerResponse("2026-05-30T10:00:00.000Z", "2026-05-30T10:00:00.000Z"),
    ).toBe(true);
  });

  /**
   * The rule that stops the highlight becoming wallpaper.
   *
   * Every application that ever got a reply would otherwise stay lit forever, so a mature
   * pipeline would be mostly highlighted and the highlight would stop meaning anything.
   * Touching the row clears it, which makes this an inbox rather than a badge.
   */
  it("is false once the user has done anything since", () => {
    expect(
      hasUnansweredEmployerResponse("2026-05-30T10:00:00.000Z", "2026-06-02T09:00:00.000Z"),
    ).toBe(false);
  });

  it("is false when no response was ever recorded", () => {
    expect(hasUnansweredEmployerResponse(null, "2026-06-02T09:00:00.000Z")).toBe(false);
  });

  // Never guess from a malformed timestamp. Marking a row as needing attention on the
  // strength of an unparseable date sends the user to look at nothing.
  it("is false rather than true when a timestamp cannot be read", () => {
    expect(hasUnansweredEmployerResponse("not a date", "2026-06-02T09:00:00.000Z")).toBe(false);
    expect(hasUnansweredEmployerResponse("2026-05-30T10:00:00.000Z", "nonsense")).toBe(false);
  });
});

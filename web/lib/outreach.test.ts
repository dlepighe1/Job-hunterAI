import { describe, expect, it } from "vitest";

import {
  OUTREACH_STATUSES,
  followUpDue,
  nextOutreachStatus,
  outreachEventFor,
} from "@/lib/outreach";

describe("the outreach status vocabulary", () => {
  it("matches the CHECK constraint in schema.sql", () => {
    expect([...OUTREACH_STATUSES]).toEqual(["draft", "sent", "replied", "no_reply"]);
  });
});

describe("nextOutreachStatus", () => {
  it("advances a draft to sent when the user records sending it", () => {
    expect(nextOutreachStatus("draft", "marked_sent")).toBe("sent");
  });

  it("records a reply", () => {
    expect(nextOutreachStatus("sent", "reply_received")).toBe("replied");
    expect(nextOutreachStatus("no_reply", "reply_received")).toBe("replied");
  });

  /**
   * A reply is a fact the user observed. Nothing automatic un-observes it. A "no reply"
   * arriving after a reply would be a timeout firing late, and letting it win would erase
   * something that actually happened.
   */
  it("never downgrades a reply", () => {
    expect(nextOutreachStatus("replied", "marked_no_reply")).toBe("replied");
    expect(nextOutreachStatus("replied", "marked_sent")).toBe("replied");
  });

  it("cannot mark an unsent draft as unanswered", () => {
    // Nothing was sent, so there is nothing to be unanswered.
    expect(nextOutreachStatus("draft", "marked_no_reply")).toBe("draft");
  });

  it("is total over every status", () => {
    for (const status of OUTREACH_STATUSES) {
      expect(OUTREACH_STATUSES).toContain(nextOutreachStatus(status, "marked_sent"));
    }
  });
});

describe("outreachEventFor", () => {
  /**
   * A reply is real evidence about where an application stands, so it feeds the pipeline.
   * FEATURES.md §4.3 wanted this from email detection; the user telling us is the same
   * signal without the mailbox access.
   *
   * Sending a message is NOT evidence of applying, since people write to a contact before
   * applying all the time, so it maps to nothing.
   */
  it("maps a reply onto a pipeline event and sending onto nothing", () => {
    expect(outreachEventFor("replied")).toBe("screening_scheduled");
    expect(outreachEventFor("sent")).toBeNull();
    expect(outreachEventFor("draft")).toBeNull();
    expect(outreachEventFor("no_reply")).toBeNull();
  });
});

describe("followUpDue", () => {
  const sent = "2026-08-01T10:00:00.000Z";

  it("is not due the day it was sent", () => {
    expect(followUpDue({ status: "sent", sentAt: sent }, new Date("2026-08-01T12:00:00Z"))).toBe(
      false,
    );
  });

  it("is due after a week of silence", () => {
    expect(followUpDue({ status: "sent", sentAt: sent }, new Date("2026-08-09T10:00:00Z"))).toBe(
      true,
    );
  });

  // Following up on a message that was answered is the reminder nobody wants.
  it("is never due once a reply arrived", () => {
    expect(
      followUpDue({ status: "replied", sentAt: sent }, new Date("2026-09-01T10:00:00Z")),
    ).toBe(false);
  });

  it("is never due for an unsent draft, or one with no recorded send date", () => {
    expect(followUpDue({ status: "draft", sentAt: null }, new Date("2026-09-01T10:00:00Z"))).toBe(
      false,
    );
    expect(followUpDue({ status: "sent", sentAt: null }, new Date("2026-09-01T10:00:00Z"))).toBe(
      false,
    );
  });

  // The user already decided it went unanswered; a nag adds nothing.
  it("is not due once the user has marked it unanswered", () => {
    expect(
      followUpDue({ status: "no_reply", sentAt: sent }, new Date("2026-09-01T10:00:00Z")),
    ).toBe(false);
  });
});

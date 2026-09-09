import { describe, expect, it } from "vitest";

import { buildNotifications } from "@/lib/notifications";
import type { ApplicationView } from "@/lib/use-applications";
import type { ResumeView } from "@/lib/use-resumes";

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

function resume(overrides: Partial<ResumeView> = {}): ResumeView {
  return {
    id: crypto.randomUUID(),
    userId: "user_123",
    label: "Backend, master",
    content: "",
    filePath: null,
    isDefault: false,
    isTailored: false,
    parentId: null,
    applicationId: null,
    targetRole: null,
    note: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

const DEFAULT_RESUME = [resume({ isDefault: true })];

describe("buildNotifications", () => {
  it("is empty when there is nothing to act on", () => {
    expect(buildNotifications([application()], DEFAULT_RESUME)).toEqual([]);
  });

  it("raises an unanswered employer response as an action", () => {
    const rows = buildNotifications(
      [
        application({
          company: "Helixion Health",
          role: "Data Scientist",
          respondedAt: "2026-08-10T09:00:00.000Z",
          lastActivityAt: "2026-08-10T09:00:00.000Z",
        }),
      ],
      DEFAULT_RESUME,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Employer responded",
      detail: "Data Scientist at Helixion Health",
      tone: "action",
    });
    expect(rows[0].href).toContain("/applications?open=");
  });

  // Acting on the row moves `updated_at`, which is what stops this becoming permanent.
  it("drops the response once the user has done something since", () => {
    const rows = buildNotifications(
      [
        application({
          respondedAt: "2026-08-10T09:00:00.000Z",
          lastActivityAt: "2026-08-12T09:00:00.000Z",
          status: "screening",
        }),
      ],
      DEFAULT_RESUME,
    );

    expect(rows.map((row) => row.title)).toEqual(["Screening stage"]);
  });

  it("surfaces live stages as progress, not as actions", () => {
    const rows = buildNotifications(
      [
        application({ status: "interview" }),
        application({ status: "offer" }),
        application({ status: "screening" }),
      ],
      DEFAULT_RESUME,
    );

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.tone))).toEqual(new Set(["progress"]));
  });

  /**
   * Saved and applied are where most of a pipeline rests. Notifying on them would put every
   * row in the tracker in the rail, which is the same as notifying on nothing.
   */
  it("says nothing about the resting states of a pipeline", () => {
    const rows = buildNotifications(
      [application({ status: "saved" }), application({ status: "applied" })],
      DEFAULT_RESUME,
    );
    expect(rows).toEqual([]);
  });

  it("never reports both a response and a stage for one application", () => {
    const rows = buildNotifications(
      [
        application({
          status: "interview",
          respondedAt: "2026-08-10T09:00:00.000Z",
          lastActivityAt: "2026-08-10T09:00:00.000Z",
        }),
      ],
      DEFAULT_RESUME,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].tone).toBe("action");
  });

  describe("setup gaps", () => {
    it("asks for a résumé when there are none", () => {
      const rows = buildNotifications([], []);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "No résumé saved", tone: "setup" });
    });

    it("asks for a default once résumés exist", () => {
      const rows = buildNotifications([], [resume(), resume()]);
      expect(rows.map((row) => row.title)).toEqual(["No default résumé"]);
    });

    it("says nothing once a default is set", () => {
      expect(buildNotifications([], DEFAULT_RESUME)).toEqual([]);
    });
  });

  it("puts the newest first and caps the list", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      application({
        status: "interview",
        lastActivityAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
      }),
    );

    const rows = buildNotifications(many, DEFAULT_RESUME);

    expect(rows).toHaveLength(6);
    expect(rows[0].at > rows[5].at).toBe(true);
  });

  /**
   * The guard that matters most on this panel.
   *
   * The approved board shows "Résumé viewed by 3 recruiters" and similar. This product has no
   * Gmail integration, no tracking pixel and no employer-side signal of any kind, so every
   * notification has to come from a column that exists. This asserts the shape of what is
   * produced rather than trusting the rules above to stay honest.
   */
  it("only ever reports things the data model can actually know", () => {
    const rows = buildNotifications(
      [
        application({ status: "interview" }),
        application({
          respondedAt: "2026-08-10T09:00:00.000Z",
          lastActivityAt: "2026-08-10T09:00:00.000Z",
        }),
      ],
      [],
    );

    const allowed = new Set([
      "Employer responded",
      "Screening stage",
      "Interview stage",
      "Offer stage",
      "No résumé saved",
      "No default résumé",
    ]);

    for (const row of rows) {
      expect(allowed.has(row.title), `unexpected notification "${row.title}"`).toBe(true);
      expect(row.title).not.toMatch(/viewed|recruiter|opened|seen/i);
    }
  });
});

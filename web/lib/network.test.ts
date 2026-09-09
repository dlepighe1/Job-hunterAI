import { describe, expect, it } from "vitest";

import { groupByCompany } from "@/lib/network";
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

describe("groupByCompany", () => {
  it("returns nothing for an empty pipeline", () => {
    expect(groupByCompany([], [])).toEqual([]);
  });

  it("gathers the applications sitting at each company", () => {
    const companies = groupByCompany(
      [
        application({ company: "Atlas Systems", role: "Data engineer" }),
        application({ company: "Atlas Systems", role: "Platform engineer" }),
        application({ company: "Meridian Data", role: "Analyst" }),
      ],
      [],
    );

    expect(companies).toHaveLength(2);
    expect(companies[0].name).toBe("Atlas Systems");
    expect(companies[0].applications).toHaveLength(2);
  });

  /**
   * "Atlas Systems" and "atlas systems  " are one company that the user typed twice. Left
   * ungrouped they render as two cards, which makes the roll-up worse than the table it is
   * summarising. The DISPLAYED name is the first spelling the user used, not a normalised
   * one, and correcting their capitalisation is not this feature's job.
   */
  it("groups spellings that differ only by case or padding", () => {
    const companies = groupByCompany(
      [
        application({ company: "Atlas Systems" }),
        application({ company: "  atlas systems " }),
      ],
      [],
    );

    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("Atlas Systems");
    expect(companies[0].applications).toHaveLength(2);
  });

  it("orders companies by most recent activity", () => {
    const companies = groupByCompany(
      [
        application({ company: "Older", lastActivityAt: "2026-08-01T10:00:00.000Z" }),
        application({ company: "Newer", lastActivityAt: "2026-08-09T10:00:00.000Z" }),
      ],
      [],
    );

    expect(companies.map((company) => company.name)).toEqual(["Newer", "Older"]);
  });

  /**
   * The combined status is the furthest any application at that company reached. Someone
   * with an interview at a company and two saved postings there is, at that company, at
   * interview, and showing "saved" because it sorts first would misreport the relationship.
   */
  it("reports the furthest stage reached at each company", () => {
    const companies = groupByCompany(
      [
        application({ company: "Atlas Systems", status: "saved" }),
        application({ company: "Atlas Systems", status: "interview" }),
        application({ company: "Atlas Systems", status: "applied" }),
      ],
      [],
    );

    expect(companies[0].furthestStatus).toBe("interview");
  });

  // A rejection at one posting says nothing about the others still open there.
  it("does not let a closed application define the company's stage", () => {
    const companies = groupByCompany(
      [
        application({ company: "Atlas Systems", status: "rejected" }),
        application({ company: "Atlas Systems", status: "applied" }),
      ],
      [],
    );

    expect(companies[0].furthestStatus).toBe("applied");
  });

  it("reports a company as closed only when every application there is", () => {
    const companies = groupByCompany(
      [
        application({ company: "Atlas Systems", status: "rejected" }),
        application({ company: "Atlas Systems", status: "withdrawn" }),
      ],
      [],
    );

    expect(companies[0].furthestStatus).toBe("rejected");
    expect(companies[0].allClosed).toBe(true);
  });

  it("attaches contacts to their company by name, case-insensitively", () => {
    const companies = groupByCompany(
      [application({ company: "Atlas Systems" })],
      [
        {
          id: "c1",
          userId: "user_123",
          name: "Dana Okafor",
          roleTitle: "Engineering manager",
          company: "atlas systems",
          email: null,
          contactUrl: null,
          applicationId: null,
          notes: null,
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
    );

    expect(companies[0].contacts).toHaveLength(1);
    expect(companies[0].contacts[0].name).toBe("Dana Okafor");
  });

  /**
   * A contact at a company with no applications still gets a card. Otherwise entering
   * someone before applying anywhere makes them vanish, and the user has no way to tell
   * whether it saved.
   */
  it("shows a company that has contacts but no applications", () => {
    const companies = groupByCompany(
      [],
      [
        {
          id: "c1",
          userId: "user_123",
          name: "Dana Okafor",
          roleTitle: null,
          company: "Cobalt Health",
          email: null,
          contactUrl: null,
          applicationId: null,
          notes: null,
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
    );

    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("Cobalt Health");
    expect(companies[0].applications).toHaveLength(0);
    expect(companies[0].furthestStatus).toBeNull();
  });

  it("ignores a contact with no company rather than inventing one", () => {
    const companies = groupByCompany(
      [],
      [
        {
          id: "c1",
          userId: "user_123",
          name: "Dana Okafor",
          roleTitle: null,
          company: null,
          email: null,
          contactUrl: null,
          applicationId: null,
          notes: null,
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
    );

    expect(companies).toEqual([]);
  });
});

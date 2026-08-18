import { describe, expect, it } from "vitest";

import { careerInsights, roleAffinities } from "@/lib/career";
import { devStore } from "@/lib/dev-fixtures";
import { matchDistribution } from "@/lib/velocity";

/**
 * The fixtures are held to the same rules as production data.
 *
 * A demo dataset is precisely where invented numbers get in. This project deleted a
 * dashboard showing "AVG. MATCH QUALITY 91%" over applications nobody had made. If the
 * fixtures broke the rules the screens enforce, the screens would be demonstrated lying,
 * and a screenshot of that is what ends up in a portfolio.
 */

describe("fixture scores obey the model's measured limits", () => {
  // FEATURES.md §2.3: the calibrated model never predicts above 0.85.
  it("has no baseline score above the model's ceiling", () => {
    const baseline = devStore.analyses.filter((analysis) => analysis.isBaseline);

    expect(baseline.length).toBeGreaterThan(0);
    for (const analysis of baseline) {
      if (analysis.score !== null) expect(analysis.score).toBeLessThanOrEqual(0.85);
    }
  });

  it("has no application match score above the ceiling", () => {
    for (const application of devStore.applications) {
      if (application.matchScore !== null) {
        expect(application.matchScore).toBeLessThanOrEqual(0.85);
      }
    }
  });

  /**
   * The tailored analyses are the highest scores in the set, on purpose. If they ever leaked
   * into Role Affinity the primary role's number would jump, which makes the exclusion an
   * observable property of the dataset rather than a claim in a comment.
   */
  it("keeps tailored scores above every baseline, so a leak would be visible", () => {
    const highestBaseline = Math.max(
      ...devStore.analyses.filter((a) => a.isBaseline).map((a) => a.score ?? 0),
    );
    const lowestTailored = Math.min(
      ...devStore.analyses.filter((a) => !a.isBaseline).map((a) => a.score ?? 1),
    );

    expect(lowestTailored).toBeGreaterThan(highestBaseline);
  });

  it("excludes tailored analyses from role affinity", () => {
    const affinities = roleAffinities(devStore.analyses);
    const softwareEngineer = affinities.find((a) => a.role === "Software Engineer");

    expect(softwareEngineer).toBeDefined();
    // Would exceed 0.85 if the 0.91 and 0.88 tailored rows were counted.
    expect(softwareEngineer!.affinity).toBeLessThanOrEqual(0.85);
    expect(softwareEngineer!.sampleSize).toBe(
      devStore.analyses.filter((a) => a.isBaseline && a.roleTitle === "Software Engineer").length,
    );
  });

  // An engine that does not score must not carry a score.
  it("gives the keyword engine no score", () => {
    for (const application of devStore.applications) {
      if (application.matchEngine === "keyword") {
        expect(application.matchScore).toBeNull();
      }
    }
  });

  it("marks the uncalibrated engine's score as uncalibrated", () => {
    const claude = devStore.applications.filter((a) => a.matchEngine === "claude");

    expect(claude.length).toBeGreaterThan(0);
    for (const application of claude) expect(application.matchCalibrated).toBe(false);
  });
});

describe("the fixtures populate every screen", () => {
  // The whole point: if a panel still shows its empty state, the demo proves nothing.
  it("gives Role Landscape enough baseline evidence to render", () => {
    const baseline = devStore.analyses.filter((a) => a.isBaseline);
    expect(baseline.length).toBeGreaterThanOrEqual(3);

    const affinities = roleAffinities(devStore.analyses);
    expect(affinities.length).toBeGreaterThanOrEqual(2);
    // The primary role must be one the adjacency map knows, or the radar is empty.
    expect(["Software Engineer", "Data Scientist"]).toContain(affinities[0].role);
  });

  it("reaches high confidence on the primary role", () => {
    expect(roleAffinities(devStore.analyses)[0].confidence).toBe("high");
  });

  it("gives Career Intelligence enough to say something", () => {
    const insights = careerInsights(
      devStore.analyses,
      devStore.applications.map((a) => ({ status: a.status, role: a.role })),
    );

    expect(insights.sufficient).toBe(true);
    expect(insights.items.length).toBeGreaterThanOrEqual(3);
  });

  it("fills all three match-distribution bands", () => {
    const bands = matchDistribution(
      devStore.applications.map((a) => ({ matchScore: a.matchScore }) as never),
    );

    expect(bands).toHaveLength(3);
    // Including the strong band, which needs a score at exactly the 0.85 ceiling.
    for (const band of bands) expect(band.count).toBeGreaterThan(0);
  });

  it("covers every application status", () => {
    const statuses = new Set(devStore.applications.map((a) => a.status));

    for (const status of ["saved", "applied", "screening", "interview", "offer", "rejected", "withdrawn"]) {
      expect(statuses).toContain(status);
    }
  });

  it("has both master and tailored résumés, with the master as default", () => {
    const masters = devStore.resumes.filter((r) => !r.isTailored);
    const tailored = devStore.resumes.filter((r) => r.isTailored);

    expect(masters.length).toBeGreaterThanOrEqual(2);
    expect(tailored.length).toBeGreaterThanOrEqual(1);

    const defaults = devStore.resumes.filter((r) => r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].isTailored).toBe(false);
  });

  it("links every tailored résumé to a master", () => {
    const ids = new Set(devStore.resumes.map((r) => r.id));
    for (const version of devStore.resumes.filter((r) => r.isTailored)) {
      expect(version.parentId).not.toBeNull();
      expect(ids).toContain(version.parentId);
    }
  });

  it("attaches contacts to starred applications, so Priority Targets shows people", () => {
    const starred = new Set(devStore.applications.filter((a) => a.priority).map((a) => a.id));

    expect(starred.size).toBeGreaterThan(0);
    expect(
      devStore.contacts.some((c) => c.applicationId && starred.has(c.applicationId)),
    ).toBe(true);
  });

  it("gives the velocity chart dated activity to plot", () => {
    const withDates = devStore.applications.filter((a) => a.appliedAt);
    const withResponses = devStore.applications.filter((a) => a.respondedAt);

    expect(withDates.length).toBeGreaterThanOrEqual(5);
    expect(withResponses.length).toBeGreaterThanOrEqual(3);
  });

  it("has an outreach message old enough to trip the follow-up reminder", () => {
    const sent = devStore.outreach.filter((m) => m.status === "sent" && m.sentAt);
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe("fixture ids are real uuids", () => {
  /**
   * Every `[id]` route validates the path segment before it queries, so an id that merely
   * looks like a uuid is a 400 rather than a row. The first version of the generator spelled
   * "dev" into the last group, and `v` is not a hex digit, so every drawer in the app failed
   * to open with a 400 that looked like a routing problem.
   */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it.each([
    ["applications", () => devStore.applications.map((r) => r.id)],
    ["resumes", () => devStore.resumes.map((r) => r.id)],
    ["contacts", () => devStore.contacts.map((r) => r.id)],
    ["outreach", () => devStore.outreach.map((r) => r.id)],
    ["job boards", () => devStore.jobBoards.map((r) => r.id)],
    ["events", () => devStore.events.map((r) => r.id)],
  ])("%s all carry valid uuids", (_label, get) => {
    const ids = get();
    expect(ids.length).toBeGreaterThan(0);
    for (const value of ids) expect(value).toMatch(UUID);
  });

  it("uses no id twice", () => {
    const all = [
      ...devStore.applications.map((r) => r.id),
      ...devStore.resumes.map((r) => r.id),
      ...devStore.contacts.map((r) => r.id),
      ...devStore.outreach.map((r) => r.id),
      ...devStore.jobBoards.map((r) => r.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  // Cross-references have to resolve or the drawer opens onto nothing.
  it("points every foreign key at a row that exists", () => {
    const applications = new Set(devStore.applications.map((r) => r.id));
    const contacts = new Set(devStore.contacts.map((r) => r.id));

    for (const contact of devStore.contacts) {
      if (contact.applicationId) expect(applications).toContain(contact.applicationId);
    }
    for (const message of devStore.outreach) {
      if (message.applicationId) expect(applications).toContain(message.applicationId);
      if (message.contactId) expect(contacts).toContain(message.contactId);
    }
    for (const event of devStore.events) {
      expect(applications).toContain(event.applicationId);
    }
  });
});

describe("the fixtures name nobody real", () => {
  /**
   * A fixture row saying "Rejected, Google" is a claim about Google, and a fixture contact
   * named after a real person puts them in a job-hunting database they never agreed to.
   * Everything here is invented, and the emails use `.invalid`, the RFC 2606 reserved TLD
   * that can never resolve, so a stray mailto cannot reach a real inbox.
   */
  it("uses no real company names", () => {
    const real = ["Google", "Stripe", "Anthropic", "NVIDIA", "Databricks", "Microsoft", "Meta", "Amazon", "OpenAI"];
    const text = JSON.stringify(devStore);

    for (const name of real) expect(text).not.toContain(name);
  });

  it("uses only unreachable email addresses", () => {
    for (const contact of devStore.contacts) {
      if (contact.email) expect(contact.email).toMatch(/\.invalid$/);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Supabase query builder is chainable and terminates in a thenable. `db.test.ts` mocks
 * it with a hand-built bag of spies per table, which works for the two-call queries it
 * covers; the application queries chain four and five deep and branch by table, so this
 * file uses a recording builder instead.
 *
 * Every builder records the methods called on it, in order, with their arguments. That is
 * what lets a test assert the thing that actually matters here, that a query filtering on
 * an id ALSO filtered on the user id. An `.eq("id", ...)` without a matching
 * `.eq("user_id", ...)` is the whole authorization model failing open, and it is invisible
 * in a mock that only records the terminal result.
 */
type Outcome = { data?: unknown; error?: unknown };

interface Recorded {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

const log: Recorded[] = [];
const queued = new Map<string, Outcome[]>();

/** Queue the next result for a table. Repeat to script consecutive queries. */
function queue(table: string, outcome: Outcome): void {
  const existing = queued.get(table) ?? [];
  existing.push(outcome);
  queued.set(table, existing);
}

function shift(table: string): Outcome {
  return queued.get(table)?.shift() ?? { data: null, error: null };
}

const CHAINABLE = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "in",
  "order",
  "limit",
  "single",
  "maybeSingle",
];

function builder(table: string) {
  const record: Recorded = { table, calls: [] };
  log.push(record);

  const outcome = () => {
    const next = shift(table);
    return { data: next.data ?? null, error: next.error ?? null };
  };

  const chain: Record<string, unknown> = {
    // Thenable, so `await client.from(t).select().eq(...)` resolves wherever the chain
    // happens to stop. The real builder behaves the same way.
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(outcome()).then(resolve, reject),
  };

  for (const method of CHAINABLE) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }

  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => builder(table),
    storage: { from: () => ({ list: vi.fn(), remove: vi.fn() }) },
  })),
}));

import {
  __resetClientForTests,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  listEvents,
  saveAnalysis,
  updateApplication,
} from "@/lib/db";
import type { ScoreResult } from "@/lib/types";

/** Every query issued against a table, in order. */
function queriesOn(table: string): Recorded[] {
  return log.filter((entry) => entry.table === table);
}

/** The arguments of every `.eq()` on the nth query against a table. */
function filtersOn(table: string, index = 0): unknown[][] {
  return (queriesOn(table)[index]?.calls ?? [])
    .filter((call) => call.method === "eq")
    .map((call) => call.args);
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "3f0f4a1e-0000-4000-8000-000000000001",
    user_id: "user_123",
    company: "Atlas Systems",
    role_title: "Data engineer",
    location: "Remote",
    posting_url: null,
    status: "saved",
    match_score: 0.61,
    match_engine: "finetuned",
    match_calibrated: true,
    applied_at: null,
    notes: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

function scoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    engine: "finetuned",
    modelId: "dlepighe1/resume-jd-matcher-mpnet",
    score: 0.61,
    calibrated: true,
    rawCosine: 0.74,
    requirements: [],
    keywords: null,
    summary: null,
    suggestedBullets: null,
    errorBand: null,
    degraded: false,
    latencyMs: 812,
    analysisId: null,
    ...overrides,
  };
}

const APP_ID = "3f0f4a1e-0000-4000-8000-000000000001";

beforeEach(() => {
  log.length = 0;
  queued.clear();
  vi.clearAllMocks();
  __resetClientForTests();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The unconfigured case
// ---------------------------------------------------------------------------

/**
 * The constraint the whole portfolio demo rests on: with no SUPABASE_* variables at all,
 * the app still runs and the matcher still scores. Every persistence function has to answer
 * with a safe empty value rather than throwing out of `required()`, and it has to do it
 * without opening a client, since a thrown MissingEnvError inside a route is a 500 on a page
 * that had no business needing a database.
 */
describe("with persistence unconfigured", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  it("returns safe empty values and never touches a client", async () => {
    await expect(listApplications("user_123")).resolves.toEqual([]);
    await expect(getApplication("user_123", APP_ID)).resolves.toBeNull();
    await expect(
      createApplication("user_123", { company: "Atlas Systems", role: "Data engineer" }),
    ).resolves.toBeNull();
    await expect(updateApplication("user_123", APP_ID, { status: "applied" })).resolves.toBeNull();
    await expect(deleteApplication("user_123", APP_ID)).resolves.toBe(false);
    await expect(saveAnalysis("user_123", APP_ID, scoreResult())).resolves.toBeNull();
    await expect(listEvents("user_123", APP_ID)).resolves.toEqual([]);

    expect(log).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listApplications
// ---------------------------------------------------------------------------

describe("listApplications", () => {
  it("returns only the caller's rows, newest activity first", async () => {
    queue("applications", { data: [row(), row({ id: "b", company: "Meridian Data" })] });

    const applications = await listApplications("user_123");

    expect(applications).toHaveLength(2);
    expect(filtersOn("applications")).toEqual([["user_id", "user_123"]]);
    expect(queriesOn("applications")[0].calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }],
    });
  });

  it("maps the row onto the camelCase shape the UI consumes", async () => {
    queue("applications", { data: [row()] });

    const [application] = await listApplications("user_123");

    expect(application).toEqual({
      id: APP_ID,
      userId: "user_123",
      company: "Atlas Systems",
      role: "Data engineer",
      location: "Remote",
      industry: null,
      workModel: null,
      postingUrl: null,
      status: "saved",
      matchScore: 0.61,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: null,
      respondedAt: null,
      priority: false,
      resumeId: null,
      notes: null,
      createdAt: "2026-08-01T10:00:00.000Z",
      lastActivityAt: "2026-08-02T10:00:00.000Z",
    });
  });

  // PostgREST can hand back a `numeric` as a string to preserve precision. A score that
  // arrives as "0.61" and is rendered without coercion produces `"0.61" * 100`, which is
  // 61 by accident and NaN as soon as anything else touches it.
  it("coerces a numeric score arriving as a string", async () => {
    queue("applications", { data: [row({ match_score: "0.6100" })] });

    const [application] = await listApplications("user_123");

    expect(application.matchScore).toBe(0.61);
  });

  it("returns an empty list rather than throwing when the query fails", async () => {
    queue("applications", { error: { code: "PGRST301" } });

    await expect(listApplications("user_123")).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getApplication
// ---------------------------------------------------------------------------

describe("getApplication", () => {
  it("filters on the id AND the user id", async () => {
    queue("applications", { data: row() });

    const application = await getApplication("user_123", APP_ID);

    expect(application?.id).toBe(APP_ID);
    expect(filtersOn("applications")).toEqual([
      ["id", APP_ID],
      ["user_id", "user_123"],
    ]);
  });

  // This is what lets the routes answer 404 rather than 403 for someone else's id. A row
  // that exists but is not yours is indistinguishable from a row that does not exist, which
  // is the point, and 403 confirms the id is real.
  it("returns null for a row belonging to another user", async () => {
    queue("applications", { data: null });

    await expect(getApplication("user_123", APP_ID)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createApplication
// ---------------------------------------------------------------------------

describe("createApplication", () => {
  it("stamps the caller's user id on the row", async () => {
    queue("applications", { data: row() });

    await createApplication("user_123", {
      company: "Atlas Systems",
      role: "Data engineer",
      location: "Remote",
      postingText: "a posting",
    });

    const insert = queriesOn("applications")[0].calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      user_id: "user_123",
      company: "Atlas Systems",
      role_title: "Data engineer",
      location: "Remote",
      posting_text: "a posting",
      status: "saved",
    });
  });

  it("defaults the status to saved", async () => {
    queue("applications", { data: row() });

    await createApplication("user_123", { company: "Atlas Systems", role: "Data engineer" });

    const insert = queriesOn("applications")[0].calls.find((call) => call.method === "insert");
    expect((insert?.args[0] as Record<string, unknown>).status).toBe("saved");
  });

  it("returns null rather than throwing when the insert fails", async () => {
    queue("applications", { error: { code: "23503" } });

    await expect(
      createApplication("user_123", { company: "Atlas Systems", role: "Data engineer" }),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateApplication
// ---------------------------------------------------------------------------

describe("updateApplication", () => {
  it("scopes the update to the caller, so a foreign id changes nothing", async () => {
    queue("applications", { data: row({ status: "applied" }) });

    await updateApplication("user_123", APP_ID, { status: "applied" });

    expect(filtersOn("applications")).toEqual([
      ["id", APP_ID],
      ["user_id", "user_123"],
    ]);
  });

  // The user id is not a field a caller can set. Accepting one in the patch would let a
  // request hand its row to another account, or take one.
  it("ignores a user id smuggled into the patch", async () => {
    queue("applications", { data: row() });

    await updateApplication("user_123", APP_ID, {
      status: "applied",
      userId: "user_attacker",
    } as never);

    const update = queriesOn("applications")[0].calls.find((call) => call.method === "update");
    expect(update?.args[0]).not.toHaveProperty("user_id");
    expect(update?.args[0]).not.toHaveProperty("userId");
  });

  it("touches updated_at so the list re-sorts", async () => {
    queue("applications", { data: row() });

    await updateApplication("user_123", APP_ID, { notes: "Recruiter replied" });

    const update = queriesOn("applications")[0].calls.find((call) => call.method === "update");
    expect(update?.args[0]).toHaveProperty("updated_at");
  });

  it("returns null when no row matched", async () => {
    queue("applications", { data: null });

    await expect(updateApplication("user_123", APP_ID, { status: "applied" })).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteApplication
// ---------------------------------------------------------------------------

describe("deleteApplication", () => {
  it("scopes the delete to the caller", async () => {
    queue("applications", { error: null });

    await expect(deleteApplication("user_123", APP_ID)).resolves.toBe(true);

    expect(filtersOn("applications")).toEqual([
      ["id", APP_ID],
      ["user_id", "user_123"],
    ]);
  });

  it("reports failure rather than throwing", async () => {
    queue("applications", { error: { code: "42501" } });

    await expect(deleteApplication("user_123", APP_ID)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// saveAnalysis
// ---------------------------------------------------------------------------

describe("saveAnalysis", () => {
  beforeEach(() => {
    queue("analyses", { data: { id: "analysis-1" } });
    queue("application_events", { error: null });
    queue("applications", { data: row() });
  });

  it("stores the score with the engine and the calibration flag that produced it", async () => {
    await saveAnalysis("user_123", APP_ID, scoreResult());

    const insert = queriesOn("analyses")[0].calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      user_id: "user_123",
      application_id: APP_ID,
      engine: "finetuned",
      model_id: "dlepighe1/resume-jd-matcher-mpnet",
      score: 0.61,
      calibrated: true,
      latency_ms: 812,
    });
  });

  it("returns the new analysis id", async () => {
    await expect(saveAnalysis("user_123", APP_ID, scoreResult())).resolves.toBe("analysis-1");
  });

  // The analysis is what makes the score history real. An event row without one is a
  // timeline entry pointing at nothing.
  it("appends an analysis_run event", async () => {
    await saveAnalysis("user_123", APP_ID, scoreResult());

    const insert = queriesOn("application_events")[0].calls.find(
      (call) => call.method === "insert",
    );
    expect(insert?.args[0]).toMatchObject({ application_id: APP_ID, kind: "analysis_run" });
  });

  it("refreshes the cached score on the application", async () => {
    await saveAnalysis("user_123", APP_ID, scoreResult());

    const update = queriesOn("applications")[0].calls.find((call) => call.method === "update");
    expect(update?.args[0]).toMatchObject({
      match_score: 0.61,
      match_engine: "finetuned",
      match_calibrated: true,
    });
    expect(filtersOn("applications")).toEqual([
      ["id", APP_ID],
      ["user_id", "user_123"],
    ]);
  });

  // The keyword and base engines deliberately produce no score. Writing a 0 for "no score"
  // would put a number in the score history that no engine ever predicted.
  it("leaves the cached score alone for an engine that does not score", async () => {
    await saveAnalysis(
      "user_123",
      APP_ID,
      scoreResult({ engine: "keyword", score: null, calibrated: false }),
    );

    const update = queriesOn("applications")[0].calls.find((call) => call.method === "update");
    expect(update?.args[0]).not.toHaveProperty("match_score");
  });

  it("returns null when the analysis insert fails", async () => {
    queued.clear();
    queue("analyses", { error: { code: "23503" } });

    await expect(saveAnalysis("user_123", APP_ID, scoreResult())).resolves.toBeNull();
    expect(queriesOn("application_events")).toHaveLength(0);
  });

  // The analysis is the record that matters. A failed event append or a stale cached score
  // is a degraded timeline, not a lost result, and throwing it away would be worse.
  it("still returns the analysis id when the event append fails", async () => {
    queued.clear();
    queue("analyses", { data: { id: "analysis-1" } });
    queue("application_events", { error: { code: "42501" } });
    queue("applications", { data: row() });

    await expect(saveAnalysis("user_123", APP_ID, scoreResult())).resolves.toBe("analysis-1");
  });
});

// ---------------------------------------------------------------------------
// listEvents
// ---------------------------------------------------------------------------

describe("listEvents", () => {
  // `application_events` has no user_id column and is scoped through its parent. So
  // ownership has to be established against `applications` FIRST, or any id at all reads
  // another user's timeline.
  it("verifies ownership of the parent application before reading the timeline", async () => {
    queue("applications", { data: row() });
    queue("application_events", { data: [{ id: "e1", kind: "analysis_run", payload: {}, created_at: "2026-08-02T10:00:00.000Z" }] });

    const events = await listEvents("user_123", APP_ID);

    expect(filtersOn("applications")).toEqual([
      ["id", APP_ID],
      ["user_id", "user_123"],
    ]);
    expect(events).toHaveLength(1);
  });

  it("returns nothing, and never queries events, for an application the caller does not own", async () => {
    queue("applications", { data: null });

    await expect(listEvents("user_123", APP_ID)).resolves.toEqual([]);
    expect(queriesOn("application_events")).toHaveLength(0);
  });
});

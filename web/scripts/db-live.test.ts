/**
 * The write path, against the real database. Opt-in, never part of `npm test`.
 *
 *     npx vitest run --config vitest.live.config.ts
 *
 * Everything else in the database suite stubs at the module boundary, which means the fake
 * `.insert()` accepts any object and no assertion here can fail for the reasons that
 * actually break a deployment: a foreign key with no parent row, a NOT NULL with no value, a
 * CHECK the TypeScript union disagrees with, a numeric column too narrow for the number
 * being written. `db.schema.test.ts` closes the column-name half of this statically. This
 * closes the rest, and it is the only test in the repository that would have caught the
 * `ensureProfile` foreign-key bug that shipped with Applications.
 *
 * **Isolation.** Every row is written under a synthetic user id that no Clerk session can
 * produce (`live-verify-<timestamp>`), so nothing here can read, modify or delete a real
 * user's data — every `lib/db.ts` function takes `userId` as its first argument and scopes
 * on it. Cleanup runs in `afterAll` regardless of failure, and reports what it removed.
 *
 * If this fails, read the `[db] ... failed` line above the assertion: `lib/db.ts` logs the
 * Postgres error code and returns null rather than throwing, so the null is the symptom and
 * the code is the cause.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Application,
  createApplication,
  createContact,
  deleteAccount,
  deleteApplication,
  deleteContact,
  ensureProfile,
  getApplication,
  isPersistenceConfigured,
  listApplications,
  listContacts,
  saveAnalysis,
  updateApplication,
} from "../lib/db";

const RUN_ID = `live-verify-${Date.now()}`;
const EMAIL = `${RUN_ID}@verification.invalid`;

/** Ids to remove in cleanup, newest first. */
const created = { applications: [] as string[], contacts: [] as string[] };

let application: Application | null = null;

beforeAll(async () => {
  // The whole file is meaningless without a real client, and a silent skip would look
  // identical to a pass in CI output. Fail loudly instead.
  expect(
    isPersistenceConfigured(),
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not reaching the test process",
  ).toBe(true);

  // Then check the tables are actually there, before any assertion depends on them.
  //
  // Without this the first run against an unmigrated project produced eight failures that
  // all read "expected false to be true", because `lib/db.ts` logs the Postgres error and
  // returns null rather than throwing. The real cause — an empty `public` schema — appeared
  // only as a PGRST205 code in stderr. One failure naming the cause beats eight naming the
  // symptom.
  //
  // PostgREST's OpenAPI document is the same schema cache the writes below consult, so this
  // asks exactly the question those failures were raising.
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
  });
  const paths: string[] = Object.keys(((await res.json()) as { paths?: object }).paths ?? {});
  expect(
    paths.includes("/profiles"),
    "The schema is not applied to this project - every test below would fail with PGRST205.\n" +
      "Check with:  node scripts/apply-schema.mjs --check\n" +
      "Apply with:  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-schema.mjs",
  ).toBe(true);
});

afterAll(async () => {
  for (const id of created.contacts) await deleteContact(RUN_ID, id);
  for (const id of created.applications) await deleteApplication(RUN_ID, id);

  // Removes the profile row, and with it every child row via the schema's cascades. Storage
  // is empty for this user because no resume was uploaded, so the listing is a no-op.
  const removed = await deleteAccount(RUN_ID);

  const leftover = await listApplications(RUN_ID);
  console.info(
    `[live] cleanup for ${RUN_ID}: account removed=${removed}, applications remaining=${leftover.length}`,
  );
});

describe("the real database accepts what lib/db.ts writes", () => {
  /**
   * The parent row. This is the assertion that would have caught the shipped bug: without
   * it, every insert below fails on a foreign key against `profiles`.
   */
  it("creates the profile every other row depends on", async () => {
    expect(await ensureProfile(RUN_ID, EMAIL)).toBe(true);
  });

  it("is idempotent, because a second sign-in calls it again", async () => {
    expect(await ensureProfile(RUN_ID, EMAIL)).toBe(true);
  });

  it("inserts an application and reads back what it stored", async () => {
    application = await createApplication(RUN_ID, {
      company: "Verification Co",
      role: "Backend Engineer",
      location: "Remote",
      status: "saved",
      notes: "Written by db-live.test.ts. Safe to delete.",
    });

    expect(application, "createApplication returned null - see the [db] log above").not.toBeNull();
    created.applications.push(application!.id);

    // `role` in TypeScript is `role_title` in Postgres. A live round-trip is the only thing
    // that proves the mapping survives both directions.
    expect(application!.company).toBe("Verification Co");
    expect(application!.role).toBe("Backend Engineer");
    expect(application!.status).toBe("saved");

    const fetched = await getApplication(RUN_ID, application!.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.role).toBe("Backend Engineer");
  });

  it("patches a row and persists the change", async () => {
    const patched = await updateApplication(RUN_ID, application!.id, { status: "applied" });
    expect(patched, "updateApplication returned null").not.toBeNull();
    expect(patched!.status).toBe("applied");

    const refetched = await getApplication(RUN_ID, application!.id);
    expect(refetched!.status).toBe("applied");
  });

  /**
   * Scoping, against real rows rather than a stub that returns whatever it was handed.
   * A missing `.eq("user_id", ...)` would be invisible to every mocked test in the suite.
   */
  it("scopes reads to the owner", async () => {
    const mine = await listApplications(RUN_ID);
    expect(mine.some((row) => row.id === application!.id)).toBe(true);
    expect(mine.every((row) => row.userId === RUN_ID)).toBe(true);

    const stranger = await listApplications(`${RUN_ID}-someone-else`);
    expect(stranger).toEqual([]);

    expect(await getApplication(`${RUN_ID}-someone-else`, application!.id)).toBeNull();
  });

  /**
   * `analyses.score` is `numeric(5,4)`, which holds -9.9999 to 9.9999. The product's scores
   * are 0-1, so this passes — but the column is one display convention away from being
   * handed a 72 and overflowing, and nothing except a real insert would say so.
   */
  it("stores an analysis against the application", async () => {
    const id = await saveAnalysis(
      RUN_ID,
      application!.id,
      {
        engine: "keyword",
        modelId: "keyword-v1",
        score: 0.7231,
        calibrated: false,
        requirements: [],
        keywords: [],
        summary: "Written by the live verification.",
        suggestedBullets: [],
        errorBand: null,
        rawCosine: null,
        degraded: false,
        latencyMs: 12,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { isBaseline: true, roleTitle: "Backend Engineer" },
    );

    expect(id, "saveAnalysis returned null - check the numeric and JSON columns").not.toBeNull();
  });

  it("inserts and lists a contact", async () => {
    const contact = await createContact(RUN_ID, {
      name: "Verification Contact",
      company: "Verification Co",
      applicationId: application!.id,
    });

    expect(contact, "createContact returned null").not.toBeNull();
    created.contacts.push(contact!.id);

    const contacts = await listContacts(RUN_ID);
    expect(contacts.some((row) => row.id === contact!.id)).toBe(true);
  });

  it("deletes what it created", async () => {
    const contactId = created.contacts.pop()!;
    expect(await deleteContact(RUN_ID, contactId)).toBe(true);

    const applicationId = created.applications.pop()!;
    expect(await deleteApplication(RUN_ID, applicationId)).toBe(true);
    expect(await getApplication(RUN_ID, applicationId)).toBeNull();
  });
});

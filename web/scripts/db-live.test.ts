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
  RESUME_BUCKET,
  type Resume,
  createApplication,
  createContact,
  createResume,
  deleteAccount,
  deleteApplication,
  deleteContact,
  deleteResume,
  ensureProfile,
  getApplication,
  getResume,
  getResumeFileBytes,
  getResumeFileUrl,
  isPersistenceConfigured,
  joinWaitlist,
  listApplications,
  listContacts,
  listResumes,
  saveAnalysis,
  setDefaultResume,
  updateApplication,
  updateResume,
  uploadResumeFile,
} from "../lib/db";
import { probeProject } from "./supabase-probe.mjs";

const RUN_ID = `live-verify-${Date.now()}`;
const EMAIL = `${RUN_ID}@verification.invalid`;

/** Ids to remove in cleanup, newest first. */
const created = { applications: [] as string[], contacts: [] as string[], resumes: [] as string[] };

let application: Application | null = null;
let resume: Resume | null = null;

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
  //
  // The probe is shared with `apply-schema.mjs` so the two cannot disagree about what a
  // reachable project is, and so the ways of not reaching one stay told apart. A bare
  // `fetch` here reported a project it could not resolve as `TypeError: fetch failed` — a
  // stack trace in place of the preflight's whole reason for existing.
  const probe = await probeProject(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  expect(probe.ok, probe.ok ? "" : probe.message).toBe(true);

  expect(
    probe.ok && probe.tables.has("profiles"),
    "The schema is not applied to this project - every test below would fail with PGRST205.\n" +
      "Check with:  node scripts/apply-schema.mjs --check\n" +
      "Apply with:  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-schema.mjs",
  ).toBe(true);
});

afterAll(async () => {
  for (const id of created.contacts) await deleteContact(RUN_ID, id);
  for (const id of created.resumes) await deleteResume(RUN_ID, id);
  for (const id of created.applications) await deleteApplication(RUN_ID, id);

  // Removes the profile row, and with it every child row via the schema's cascades. It also
  // clears this user's Storage prefix, which the cascades cannot reach — the résumé block
  // below puts a real object there, so that listing is no longer a no-op.
  const removed = await deleteAccount(RUN_ID);

  // The waitlist has no user_id — it is written by visitors who have no account — so no
  // cascade reaches it and the row is removed by address instead.
  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(EMAIL)}`,
    {
      method: "DELETE",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  );

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

/**
 * The résumé document path, which is the only place a file leaves this product.
 *
 * Nothing offline can test it. The bucket is created by a guarded block in `schema.sql` that
 * degrades to a notice when the role cannot write the `storage` schema, so "the schema
 * applied cleanly" and "uploads work" are separate facts, and the gap between them is
 * invisible: an upload with no bucket stores nothing, `file_path` stays null, and the
 * preview shows its empty state as though the user had pasted text. Every mocked test in the
 * suite passes through that failure without noticing.
 */
describe("the résumé bucket accepts, signs and releases a document", () => {
  const BYTES = new TextEncoder().encode("Live verification résumé. Safe to delete.\n");

  it("creates the row the object is keyed by", async () => {
    resume = await createResume(RUN_ID, {
      label: "Live verification résumé",
      content: "Written by db-live.test.ts. Safe to delete.",
    });

    expect(resume, "createResume returned null - see the [db] log above").not.toBeNull();
    created.resumes.push(resume!.id);
  });

  /**
   * The assertion that would have caught a missing bucket. `uploadResumeFile` returns null
   * on failure rather than throwing, because a résumé that scores but cannot be previewed is
   * worth keeping — which is correct behaviour and also exactly what makes the absence quiet.
   */
  it("stores the file, and returns the key to persist on the row", async () => {
    const path = await uploadResumeFile(RUN_ID, resume!.id, BYTES, "text/plain", "txt");

    expect(
      path,
      `uploadResumeFile returned null. The "${RESUME_BUCKET}" bucket is missing or not writable:\n` +
        "  node scripts/apply-schema.mjs --check",
    ).toBe(`${RUN_ID}/${resume!.id}.txt`);

    const patched = await updateResume(RUN_ID, resume!.id, { filePath: path });
    expect(patched?.filePath).toBe(path);
  });

  it("reads the same bytes back", async () => {
    const file = await getResumeFileBytes(RUN_ID, resume!.id);

    expect(file, "getResumeFileBytes returned null - the object is not where the row says").not.toBeNull();
    expect(file!.extension).toBe("txt");
    expect(new TextDecoder().decode(file!.bytes)).toBe(new TextDecoder().decode(BYTES));
  });

  it("mints a signed URL that actually serves the object", async () => {
    const url = await getResumeFileUrl(RUN_ID, resume!.id);
    expect(url, "getResumeFileUrl returned null").not.toBeNull();

    const response = await fetch(url!);
    expect(response.status, "the signed URL did not serve the object").toBe(200);
    expect(await response.text()).toContain("Live verification");
  });

  /**
   * The privacy assertion. A résumé carries a home address and a phone number, and the object
   * key contains the owner's user id, so a public bucket puts every one of them a guessable
   * URL away from anyone. `schema.sql` sets `public = false`; a bucket created by hand in the
   * dashboard is public unless someone remembered not to be, and nothing else checks.
   */
  it("does not serve the object without the signature", async () => {
    const path = `${RUN_ID}/${resume!.id}.txt`;
    const response = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/public/${RESUME_BUCKET}/${path}`,
    );

    expect(response.ok, "the resumes bucket is PUBLIC - set it to private").toBe(false);
  });

  it("scopes the document to its owner", async () => {
    const stranger = `${RUN_ID}-someone-else`;

    expect(await getResume(stranger, resume!.id)).toBeNull();
    expect(await getResumeFileBytes(stranger, resume!.id)).toBeNull();
    expect(await getResumeFileUrl(stranger, resume!.id)).toBeNull();
  });

  /** Foreign keys cannot reach Storage, so this is the only thing that removes the object. */
  it("removes the object with the row", async () => {
    const id = created.resumes.pop()!;
    expect(await deleteResume(RUN_ID, id)).toBe(true);
    expect(await getResume(RUN_ID, id)).toBeNull();
  });
});

/**
 * The two invariants that moved out of application code and into the schema.
 *
 * A unique index is the one kind of rule no mocked test can check: the stub accepts the
 * second write exactly as happily as the first. It is also the kind that can be wrong in the
 * other direction — a constraint that forbids something the product legitimately does — and
 * only a real insert distinguishes "correctly rejected" from "broke the feature".
 */
describe("the schema holds the invariants the code used to hold alone", () => {
  it("records a second identical waitlist signup as a success, and not as a row", async () => {
    expect(await joinWaitlist({ email: EMAIL, feature: "network" })).toBe(true);
    expect(await joinWaitlist({ email: EMAIL, feature: "network" })).toBe(true);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(EMAIL)}&select=feature`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      },
    );

    expect(await response.json()).toEqual([{ feature: "network" }]);
  });

  /** A different feature is a different signup, and the index must not collapse the two. */
  it("keeps the same address waiting for two different features", async () => {
    expect(await joinWaitlist({ email: EMAIL, feature: "outreach" })).toBe(true);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(EMAIL)}&select=feature`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      },
    );

    expect(((await response.json()) as { feature: string }[]).map((row) => row.feature).sort()).toEqual([
      "network",
      "outreach",
    ]);
  });

  /**
   * `setDefaultResume` clears every flag and then sets one. The partial unique index makes
   * two defaults impossible rather than merely unlikely — and this proves the write order
   * that maintains it still passes, which is the half that would have broken.
   */
  it("lets the default move between résumés, and lands on exactly one", async () => {
    const first = await createResume(RUN_ID, { label: "First", content: "One." });
    const second = await createResume(RUN_ID, { label: "Second", content: "Two." });

    expect(first, "createResume returned null").not.toBeNull();
    expect(second, "createResume returned null").not.toBeNull();
    created.resumes.push(first!.id, second!.id);

    // The first résumé a user saves is their default; a later one does not steal it.
    expect(first!.isDefault).toBe(true);
    expect(second!.isDefault).toBe(false);

    expect(await setDefaultResume(RUN_ID, second!.id)).toBe(true);

    const defaults = (await listResumes(RUN_ID)).filter((row) => row.isDefault);
    expect(defaults.map((row) => row.id)).toEqual([second!.id]);
  });
});

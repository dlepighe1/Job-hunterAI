/**
 * Apply `supabase/schema.sql` to the configured Supabase project, or check whether it is
 * already there.
 *
 * Usage:
 *   node scripts/apply-schema.mjs --check    # read-only: which tables exist?
 *   node scripts/apply-schema.mjs            # apply the schema, then check
 *
 * This exists because the schema had no repeatable way to be applied. Its header said to
 * paste it into the Supabase SQL editor, and the repo carries no `supabase/migrations/`,
 * so "is the schema on the project?" was a question nobody could answer without opening a
 * browser. It went unanswered long enough that the project was serving an empty `public`
 * schema while nine tables sat in version control, and every live write failed with
 * PGRST205 ("could not find the table in the schema cache").
 *
 * `schema.sql` stays the single source of truth. It is not copied into a migration here,
 * because `lib/db.schema.test.ts` reads that file to check every column `lib/db.ts` names,
 * and a second copy is a second thing to drift. The file is idempotent throughout
 * (`create table if not exists`, `add column if not exists`, `create index if not exists`,
 * `drop policy if exists`), which is what makes re-running it safe.
 *
 * --check needs only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which `.env.local`
 * already carries. Applying additionally needs SUPABASE_ACCESS_TOKEN, a personal access
 * token from https://supabase.com/dashboard/account/tokens. That is deliberately a
 * different, higher credential than the service-role key: the service key can read and
 * write rows, but nothing in the REST surface can create a table, so no amount of what the
 * app itself holds is enough to change the schema.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeTransportFailure, probeProject, projectRef } from "./supabase-probe.mjs";

const WEB = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(WEB);
const SCHEMA_PATH = join(ROOT, "supabase", "schema.sql");

/**
 * Read `.env.local` into the process environment without overwriting anything already set.
 *
 * A real shell export should win over the file, so that a one-off
 * `SUPABASE_ACCESS_TOKEN=... node scripts/apply-schema.mjs` works without the token ever
 * being written to disk.
 */
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(join(WEB, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

/** The table names `schema.sql` creates, so the check cannot drift from the file. */
function tablesInSchema(sql) {
  return [...sql.matchAll(/create table if not exists\s+(\w+)/gi)].map((m) => m[1]);
}

/**
 * Which of those tables the project actually exposes, or a printed reason and a non-zero
 * exit.
 *
 * `probeProject` asks PostgREST's own schema cache, which is the cache the failing writes
 * consult, so this answers the exact question a PGRST205 raises rather than one adjacent to
 * it. It also classifies the ways the question cannot be answered, which is what this script
 * previously did not: a deleted project produced an unhandled `TypeError: fetch failed` and
 * a Node stack trace, from a script whose only job is to report state.
 */
async function tablesOnProject(url, serviceKey) {
  const probe = await probeProject(url, serviceKey);
  if (!probe.ok) {
    console.error(`\n${probe.message}`);
    process.exit(1);
  }
  return probe.tables;
}

/**
 * The same question, asked until the answer settles.
 *
 * PostgREST caches the schema and reloads on a notification that arrives shortly after the
 * DDL commits, so "the tables are not there" and "the tables are not there YET" look
 * identical for a second or two right after an apply. Only the apply path needs this;
 * `--check` on its own is asking about a project nobody just changed.
 */
async function tablesOnProjectEventually(url, serviceKey, expected, attempts = 6) {
  let present = new Set();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    present = await tablesOnProject(url, serviceKey);
    if (expected.every((table) => present.has(table))) return present;
    if (attempt < attempts) {
      if (attempt === 1) console.log("waiting for the schema cache to reload...");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return present;
}

/**
 * Whether the `resumes` Storage bucket exists.
 *
 * Reported separately from the tables because it is created by a guarded block in
 * `schema.sql`: the `storage` schema is owned by another role, so bucket creation can be
 * skipped with a notice while every table still lands. Without this check that skip is
 * invisible until an upload silently stores no file.
 */
async function bucketExists(url, serviceKey) {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/bucket/resumes`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.name === "resumes" ? { public: body.public === true } : false;
  } catch {
    return false;
  }
}

function reportBucket(bucket) {
  if (!bucket) {
    console.log('  MISSING  storage bucket "resumes"');
    console.log(
      "\n  Résumé uploads store text but no document until this exists.\n" +
        '  Create it in Storage: name "resumes", NOT public, 10 MB limit.',
    );
    return false;
  }
  if (bucket.public) {
    console.log('  WARNING  storage bucket "resumes" is PUBLIC');
    console.log(
      "\n  A résumé carries a home address and a phone number. Set the bucket to private.",
    );
    return false;
  }
  console.log('  present  storage bucket "resumes" (private)');
  return true;
}

function report(expected, present) {
  const missing = expected.filter((t) => !present.has(t));
  for (const t of expected) console.log(`  ${present.has(t) ? "present" : "MISSING"}  ${t}`);
  console.log(
    `\n${expected.length - missing.length}/${expected.length} tables present on the project.`,
  );

  // Nine missing tables and one missing table are different situations. All nine means the
  // project answered normally and its public schema is empty, which is the state that once
  // went unnoticed long enough for every write in the app to fail against it.
  if (missing.length === expected.length) {
    console.log("The project is reachable and its public schema is empty: nothing was ever applied.");
  }
  return missing;
}

async function main() {
  loadEnvLocal();

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (web/.env.local).");
    process.exit(1);
  }

  const sql = readFileSync(SCHEMA_PATH, "utf8");
  const expected = tablesInSchema(sql);
  const checkOnly = process.argv.includes("--check");

  // The project ref is the first label of the Supabase hostname. Printed so that a schema
  // applied to the wrong project is visible here rather than discovered later.
  const ref = projectRef(url);
  console.log(`project ${ref}, schema ${expected.length} tables\n`);

  if (checkOnly) {
    const missing = report(expected, await tablesOnProject(url, serviceKey));
    console.log("");
    const bucketOk = reportBucket(await bucketExists(url, serviceKey));

    if (missing.length) {
      console.log("\nApply them with:  node scripts/apply-schema.mjs");
      process.exit(1);
    }
    if (!bucketOk) process.exit(1);
    return;
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "SUPABASE_ACCESS_TOKEN is not set, and creating tables needs it.\n" +
        "Generate one at https://supabase.com/dashboard/account/tokens, then:\n" +
        "  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-schema.mjs\n\n" +
        "To see what is on the project without applying anything:\n" +
        "  node scripts/apply-schema.mjs --check",
    );
    process.exit(1);
  }

  console.log(`applying ${SCHEMA_PATH}`);
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
  } catch (error) {
    // The Management API is a different host from the project, so it can fail on its own.
    console.error(`\n${describeTransportFailure(error, "https://api.supabase.com").message}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`\nfailed: ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  console.log("applied.\n");

  // Verify against PostgREST rather than trusting the 200. A statement can succeed while
  // the schema cache has not yet picked the tables up, and it is that cache the app reads.
  //
  // Which is exactly why this waits. PostgREST reloads on a NOTIFY it receives moments after
  // the DDL commits, and the first run of this against a real project reported 0/9 and exited
  // 1 — over tables that were already there, and a bucket the same transaction had just
  // created. A verification that fails on its own timing teaches the reader to distrust it.
  const present = await tablesOnProjectEventually(url, serviceKey, expected);
  const missing = report(expected, present);
  console.log("");
  const bucketOk = reportBucket(await bucketExists(url, serviceKey));

  if (missing.length) {
    console.error(
      "\nStatements succeeded, and PostgREST still cannot see every table after waiting for a\n" +
        "reload. That is no longer a timing question: check the Management API response above.",
    );
    process.exit(1);
  }

  // Not fatal. The tables are what the app cannot run without, and the bucket is thirty
  // seconds of dashboard work, so a run that created all nine tables should not report
  // itself as a failure over one guarded block that the role was not allowed to execute.
  if (!bucketOk) {
    console.log("\nEverything else applied. Sort the bucket above and uploads will store files.");
  }
}

await main();

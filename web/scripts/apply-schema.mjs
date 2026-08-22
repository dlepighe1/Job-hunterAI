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
 * Which of those tables the project actually exposes.
 *
 * PostgREST's OpenAPI document at `/rest/v1/` lists one path per table it can see. That is
 * the same schema cache the failing writes consult, so it answers the exact question the
 * PGRST205 errors were raising, rather than a question adjacent to it.
 */
async function tablesOnProject(url, serviceKey) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) {
    throw new Error(`PostgREST introspection failed: ${res.status} ${await res.text()}`);
  }
  const doc = await res.json();
  return new Set(
    Object.keys(doc.paths ?? {})
      .filter((p) => p.startsWith("/") && p !== "/" && !p.startsWith("/rpc/"))
      .map((p) => p.slice(1)),
  );
}

function report(expected, present) {
  const missing = expected.filter((t) => !present.has(t));
  for (const t of expected) console.log(`  ${present.has(t) ? "present" : "MISSING"}  ${t}`);
  console.log(
    `\n${expected.length - missing.length}/${expected.length} tables present on the project.`,
  );
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
  const ref = new URL(url).hostname.split(".")[0];
  console.log(`project ${ref}, schema ${expected.length} tables\n`);

  if (checkOnly) {
    const missing = report(expected, await tablesOnProject(url, serviceKey));
    if (missing.length) {
      console.log("\nApply them with:  node scripts/apply-schema.mjs");
      process.exit(1);
    }
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
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    console.error(`\nfailed: ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  console.log("applied.\n");

  // Verify against PostgREST rather than trusting the 200. A statement can succeed while
  // the schema cache has not yet picked the tables up, and it is that cache the app reads.
  const missing = report(expected, await tablesOnProject(url, serviceKey));
  if (missing.length) {
    console.error("\nStatements succeeded but PostgREST still cannot see every table.");
    process.exit(1);
  }
}

await main();

/**
 * Every CHECK constraint in `supabase/schema.sql` must match the vocabulary `lib/` writes.
 *
 * `db.schema.test.ts` proves a column exists. It says nothing about which *values* that
 * column accepts, and a CHECK violation is the same class of failure: invisible to every
 * mocked test, because the fake `.insert()` accepts any string, and fatal on the first real
 * write. This closes that half, and it runs offline in milliseconds like its sibling.
 *
 * The vocabularies were already asserted in `applications.test.ts` and `outreach.test.ts`,
 * but against hardcoded literal lists. That catches a change to the TypeScript constant and
 * misses a change to the schema entirely — the drift those tests exist to prevent is the one
 * direction they cannot see. Here the SQL is parsed, so either side moving is a failure.
 *
 * It also covers the two constraints that had no test at all: `analyses.engine` and
 * `waitlist.feature`.
 *
 * Order is deliberately not asserted. A CHECK is a set membership test; Postgres does not
 * care that `ENGINES` lists "keyword" third and the SQL lists it fourth, and neither should
 * this. Only the sets must agree.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPLICATION_STATUSES } from "@/lib/applications";
import { OUTREACH_CHANNELS, OUTREACH_STATUSES } from "@/lib/outreach";
import { ENGINES } from "@/lib/types";
import { WAITLIST_FEATURES } from "@/lib/waitlist";

const ROOT = join(__dirname, "..", "..");
const SQL = readFileSync(join(ROOT, "supabase", "schema.sql"), "utf8");
const DB_TS = readFileSync(join(__dirname, "db.ts"), "utf8");

/**
 * Every `check (col in ('a','b'))` in the schema, keyed `table.column`.
 *
 * Tables are tracked by scanning forward from each `create table`, so a constraint is
 * attributed to the table it sits inside rather than to whichever name appeared last in the
 * file. The CHECKs here are all written inline in a column definition, and one of them
 * (`applications.status`) wraps onto the line after its default, so the pattern cannot
 * assume the check and the column name share a line.
 */
function schemaChecks(): Map<string, Set<string>> {
  const checks = new Map<string, Set<string>>();
  let table = "";

  // One pass over the file, matching whichever construct comes next: a table header, or a
  // check. A single regex with alternation keeps the two in document order, which is what
  // makes the table attribution correct.
  const pattern =
    /create table if not exists\s+(\w+)|check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)/gi;

  for (const m of SQL.matchAll(pattern)) {
    if (m[1]) {
      table = m[1];
      continue;
    }
    const column = m[2];
    const values = [...m[3].matchAll(/'([^']*)'/g)].map((v) => v[1]);
    checks.set(`${table}.${column}`, new Set(values));
  }
  return checks;
}

/*
 * Every vocabulary below is now imported rather than parsed out of source text.
 *
 * Both `outreach.channel` and `waitlist.feature` were once inline unions repeated across
 * several files, with no constant to import and nothing but the source text to read. Each
 * now has exactly one definition, so the assertions compare values instead of regexes.
 */

describe("lib/ matches the CHECK constraints in supabase/schema.sql", () => {
  const checks = schemaChecks();

  /**
   * The guard against a vacuous pass. If the schema is reformatted so the pattern stops
   * matching, every assertion below would compare an empty set to an empty set and the
   * suite would go green while checking nothing.
   */
  it("finds every constraint in the schema", () => {
    expect([...checks.keys()].sort()).toEqual([
      "analyses.engine",
      "applications.status",
      "outreach.channel",
      "outreach.status",
      "waitlist.feature",
    ]);
    for (const [key, values] of checks) {
      expect(values.size, `${key} parsed no values`).toBeGreaterThan(0);
    }
  });

  it("applications.status matches APPLICATION_STATUSES", () => {
    expect(new Set(APPLICATION_STATUSES)).toEqual(checks.get("applications.status"));
  });

  it("analyses.engine matches ENGINES", () => {
    expect(new Set(ENGINES)).toEqual(checks.get("analyses.engine"));
  });

  it("outreach.status matches OUTREACH_STATUSES", () => {
    expect(new Set(OUTREACH_STATUSES)).toEqual(checks.get("outreach.status"));
  });

  it("outreach.channel matches OUTREACH_CHANNELS", () => {
    expect(new Set(OUTREACH_CHANNELS)).toEqual(checks.get("outreach.channel"));
  });

  it("waitlist.feature matches WAITLIST_FEATURES", () => {
    expect(new Set(WAITLIST_FEATURES)).toEqual(checks.get("waitlist.feature"));
  });
});

/**
 * Every NOT NULL column without a default must be supplied by the insert that writes it.
 *
 * The third member of this family, after column names (`db.schema.test.ts`) and CHECK
 * vocabularies (above). A missing required column is the same shape of bug as both: the
 * mocked `.insert()` accepts an object with the key absent, and Postgres rejects it. This is
 * also the exact shape of the `ensureProfile` bug that shipped — a row written before the
 * row it depends on — caught statically this time instead of in production.
 *
 * Columns WITH a default are excluded on purpose: `status`, `created_at`, `is_baseline` and
 * their kind are NOT NULL precisely so the database can fill them, and requiring the caller
 * to name them would invert what the default is for.
 */

/** Column types the schema uses, so a wrapped CHECK line is not mistaken for a column. */
const COLUMN_TYPE = /^\s{2,}(\w+)\s+(?:text|uuid|integer|boolean|jsonb|timestamptz|date|numeric)\b/;

/** Per table, the columns an insert must name: NOT NULL, no default, not generated. */
function requiredColumns(): Map<string, Set<string>> {
  const required = new Map<string, Set<string>>();
  let table = "";

  for (const line of SQL.split("\n")) {
    const header = line.match(/create table if not exists\s+(\w+)/i);
    if (header) {
      table = header[1];
      required.set(table, new Set());
      continue;
    }
    if (!table) continue;
    if (line.startsWith(");")) {
      table = "";
      continue;
    }

    const m = line.match(COLUMN_TYPE);
    if (!m) continue;
    if (!/not null/i.test(line)) continue;
    if (/default/i.test(line)) continue;
    if (/primary key/i.test(line) && /default/i.test(line)) continue;
    required.get(table)!.add(m[1]);
  }
  return required;
}

/**
 * The top-level keys of each `.insert({...})` / `.upsert({...})` in `db.ts`, by table.
 *
 * Depth-aware, because `result_json` and `payload` are nested object literals and their
 * inner keys are not columns. Quoted spans are skipped so a brace inside a string cannot
 * unbalance the scan.
 */
function insertedKeys(): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();

  for (const m of DB_TS.matchAll(/\.from\("(\w+)"\)/g)) {
    const table = m[1];
    const rest = DB_TS.slice(m.index! + m[0].length);

    // Only look as far as the next `.from(`, so a select-only chain cannot borrow the
    // insert belonging to the next statement.
    const nextFrom = rest.search(/\.from\("/);
    const chain = nextFrom === -1 ? rest : rest.slice(0, nextFrom);

    const write = chain.match(/\.(?:insert|upsert)\(\s*\{/);
    if (!write) continue;

    const start = write.index! + write[0].length - 1;
    const found = new Set<string>();
    let depth = 0;
    let quote = "";
    // Whether the scan is past a `:` and therefore reading a value. Without this, the
    // identifier in `id: userId,` looks exactly like the shorthand key in `{ id, email }`.
    let inValue = false;

    for (let i = start; i < chain.length; i++) {
      const c = chain[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1 && c === ":") inValue = true;
      else if (depth === 1 && c === ",") inValue = false;
      else if (depth === 1 && !inValue) {
        // `key:` or the shorthand `key,` / `key}`, which `ensureProfile` uses.
        const key = chain.slice(i).match(/^(\w+)\s*[:,}]/);
        if (key && !/\w/.test(chain[i - 1] ?? "")) found.add(key[1]);
      }
    }

    keys.set(table, new Set([...(keys.get(table) ?? []), ...found]));
  }
  return keys;
}

describe("lib/db.ts supplies every required column", () => {
  const required = requiredColumns();
  const inserted = insertedKeys();

  it("reads both sides", () => {
    // Spot values that prove the parsers found real content rather than nothing.
    expect(required.get("applications")).toContain("role_title");
    expect(required.get("analyses")).toContain("model_id");
    // Defaulted NOT NULLs must NOT be demanded of the caller.
    expect(required.get("applications")).not.toContain("status");
    expect(required.get("applications")).not.toContain("created_at");

    expect(inserted.get("applications")).toContain("company");
    // Nested keys inside result_json are not columns and must not leak into the top level.
    expect(inserted.get("analyses")).toContain("result_json");
    expect(inserted.get("analyses")).not.toContain("suggestedBullets");
  });

  /**
   * `joinWaitlist` inserts a typed value rather than an object literal, so there are no keys
   * to read and it is legitimately absent. Named here so its absence stays deliberate: if
   * another write is ever refactored the same way, this list is what makes it visible.
   */
  it("covers every literal insert", () => {
    expect([...inserted.keys()].sort()).toEqual([
      "analyses",
      "application_events",
      "applications",
      "contacts",
      "job_boards",
      "outreach",
      "profiles",
      "resumes",
    ]);
    expect(inserted.has("waitlist")).toBe(false);
  });

  for (const table of [
    "analyses",
    "application_events",
    "applications",
    "contacts",
    "job_boards",
    "outreach",
    "profiles",
    "resumes",
  ]) {
    it(`${table} inserts name every required column`, () => {
      const missing = [...(requiredColumns().get(table) ?? [])].filter(
        (c) => !insertedKeys().get(table)?.has(c),
      );
      expect(missing, `${table} insert omits NOT NULL columns`).toEqual([]);
    });
  }
});

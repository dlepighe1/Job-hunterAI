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
import { OUTREACH_STATUSES } from "@/lib/outreach";
import { ENGINES } from "@/lib/types";

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

/**
 * A string-literal union from `db.ts`, as a set.
 *
 * `outreach.channel` and `waitlist.feature` have no runtime constant to import — they exist
 * only as types, which vanish at compile time and cannot be asserted against directly. The
 * source text is the only place the vocabulary survives, so it is read the same way
 * `db.schema.test.ts` reads the query text.
 */
function unionInDbTs(field: string): Set<string> {
  // String.raw, because in a plain template literal `\b` is a backspace character
  // rather than a word boundary, and the pattern then silently matches nothing.
  const m = DB_TS.match(
    new RegExp(String.raw`\b${field}\??:\s*((?:"[^"]*"\s*\|\s*)+"[^"]*")`),
  );
  if (!m) throw new Error(`no string-literal union named "${field}" found in lib/db.ts`);
  return new Set([...m[1].matchAll(/"([^"]*)"/g)].map((v) => v[1]));
}

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

  it("outreach.channel matches the union in db.ts", () => {
    expect(unionInDbTs("channel")).toEqual(checks.get("outreach.channel"));
  });

  it("waitlist.feature matches the union in db.ts", () => {
    expect(unionInDbTs("feature")).toEqual(checks.get("waitlist.feature"));
  });
});

/**
 * Every column `lib/db.ts` names must exist in `supabase/schema.sql`.
 *
 * This closes the gap the rest of the database suite cannot reach. `db.test.ts` and its
 * siblings stub at the module boundary — the fake `.insert()` accepts any object, and the
 * fake `.select()` returns whatever the test handed it, so a column that was renamed in the
 * schema, or misspelled here, passes every one of them and then fails against the real
 * project at runtime. That is not hypothetical: `role` on an application is `role_title` in
 * Postgres, and nothing in a mocked test would notice if those two drifted apart.
 *
 * A live-database test would catch more, and should still happen. This catches the specific
 * failure that is both most likely and cheapest to prevent, and it runs offline in
 * milliseconds, which is what SPEC Part 7 requires of the suite.
 *
 * What it deliberately does not check: types, nullability, defaults, or whether a value is
 * sensible for its column. Only that the name exists on that table.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SQL = readFileSync(join(ROOT, "supabase", "schema.sql"), "utf8");
const TS = readFileSync(join(__dirname, "db.ts"), "utf8");

/** Words that open a table constraint rather than name a column. */
const NOT_A_COLUMN = new Set([
  "primary",
  "foreign",
  "unique",
  "check",
  "constraint",
  "references",
  "create",
  "on",
  "using",
  "with",
  "alter",
  "index",
]);

/**
 * Table name -> its column names.
 *
 * Both halves matter. Columns added after a table shipped live in
 * `alter table ... add column if not exists` statements, because this file is designed to be
 * re-run against an existing project where `create table if not exists` is a no-op. Reading
 * only the `create` bodies misses fifteen real columns and reports every one as a defect.
 */
function schemaTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  const create = /create table if not exists (\w+)\s*\(/gi;
  for (let m = create.exec(SQL); m; m = create.exec(SQL)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < SQL.length && depth > 0) {
      if (SQL[i] === "(") depth++;
      else if (SQL[i] === ")") depth--;
      i++;
    }
    const columns = new Set<string>();
    for (const line of SQL.slice(start, i - 1).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("--")) continue;
      const name = /^(\w+)/.exec(trimmed);
      if (name && !NOT_A_COLUMN.has(name[1].toLowerCase())) columns.add(name[1]);
    }
    tables.set(m[1], columns);
  }

  const altered = /alter table (\w+) add column if not exists (\w+)/gi;
  for (let m = altered.exec(SQL); m; m = altered.exec(SQL)) {
    const columns = tables.get(m[1]);
    if (columns) columns.add(m[2]);
    else tables.set(m[1], new Set([m[2]]));
  }

  return tables;
}

/** `const X_COLUMNS = ...` select lists, with their cross-references resolved. */
function columnConstants(): Map<string, string> {
  const consts = new Map<string, string>();
  const decl = /const (\w*COLUMNS)\s*=\s*(?:`([^`]*)`|"([^"]*)")/g;
  for (let m = decl.exec(TS); m; m = decl.exec(TS)) {
    consts.set(m[1], m[2] ?? m[3]);
  }
  // They interpolate each other: RESUME_COLUMNS embeds ${RESUME_LIST_COLUMNS}.
  for (let pass = 0; pass < 5; pass++) {
    for (const [name, value] of consts) consts.set(name, interpolate(value, consts));
  }
  return consts;
}

function interpolate(text: string, consts: Map<string, string>): string {
  return text.replace(/\$\{(\w+)\}/g, (whole, name) => consts.get(name) ?? whole);
}

interface Reference {
  table: string;
  column: string;
  line: number;
}

/**
 * Every column reference in the file, attributed to the table of the nearest preceding
 * `.from("...")`. Query chains are written fluently and never interleaved, so the slice from
 * one `.from` to the next is exactly one chain.
 */
function references(): Reference[] {
  const consts = columnConstants();
  const found: Reference[] = [];

  const from = /\.from\("(\w+)"\)/g;
  const starts: { index: number; table: string }[] = [];
  for (let m = from.exec(TS); m; m = from.exec(TS)) {
    starts.push({ index: m.index, table: m[1] });
  }

  starts.forEach(({ index, table }, i) => {
    const chain = TS.slice(index, starts[i + 1]?.index ?? TS.length);
    const line = TS.slice(0, index).split("\n").length;
    const add = (column: string) => {
      if (column) found.push({ table, column, line });
    };

    // .select("a, b") | .select(CONST) | .select(`a, ${CONST}`)
    const select = /\.select\(\s*([A-Z_]+|`[^`]*`|"[^"]*")/g;
    for (let m = select.exec(chain); m; m = select.exec(chain)) {
      let list = consts.get(m[1]) ?? m[1];
      list = interpolate(list.replace(/^[`"]|[`"]$/g, ""), consts);
      if (list === "*" || list === "count") continue;
      for (const part of list.split(",")) {
        const name = part.trim();
        // Embedded resources — `analyses(id, score)` — are a different table's columns.
        if (!name || name.includes("(")) continue;
        add(name.split(":")[0].trim());
      }
    }

    // Filters and ordering.
    const filter = /\.(?:eq|neq|gt|gte|lt|lte|is|in|order|like|ilike)\(\s*"(\w+)"/g;
    for (let m = filter.exec(chain); m; m = filter.exec(chain)) add(m[1]);

    // Top-level keys of .insert / .update / .upsert payloads.
    const write = /\.(?:insert|update|upsert)\(\s*\{/g;
    for (let m = write.exec(chain); m; m = write.exec(chain)) {
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i;
      while (i < chain.length) {
        if (chain[i] === "{") depth++;
        else if (chain[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
        i++;
      }
      let nesting = 0;
      for (const raw of chain.slice(start + 1, i).split("\n")) {
        const key = /^(\w+):/.exec(raw.trim());
        if (key && nesting === 0) add(key[1]);
        for (const ch of raw) {
          if (ch === "{" || ch === "[") nesting++;
          else if (ch === "}" || ch === "]") nesting--;
        }
      }
    }
  });

  return found;
}

describe("lib/db.ts matches supabase/schema.sql", () => {
  const tables = schemaTables();
  const refs = references();

  it("reads the schema", () => {
    expect(tables.size).toBeGreaterThanOrEqual(9);
    expect(tables.get("applications")?.has("role_title")).toBe(true);
    // An ALTER-added column, which is the half a naive parser drops.
    expect(tables.get("applications")?.has("match_score")).toBe(true);
  });

  /**
   * The guard against a vacuous pass. If a refactor changes how queries are written, this
   * parser could quietly match nothing and the suite would go green while checking zero
   * columns — the same way `components/` missing from the Vitest include once let a whole
   * test file "pass" by never running.
   */
  it("actually finds references to check", () => {
    expect(refs.length).toBeGreaterThan(200);

    // Counted from the `.from(...)` calls rather than from the references, because one
    // table legitimately yields no column keys: `joinWaitlist` inserts a typed value
    // instead of an object literal, so there is nothing to read. Counting references here
    // would assert 8 and quietly encode that limitation as the expected number.
    const queried = new Set([...TS.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]));
    expect(queried.size).toBeGreaterThanOrEqual(9);
    for (const table of queried) expect(tables.has(table)).toBe(true);
  });

  /**
   * The one insert the parser above cannot read.
   *
   * `joinWaitlist` passes a `WaitlistSignup` straight through, so its **TypeScript field
   * names are the column names** — the compiler is happy with any interface at all, and the
   * mismatch would only appear as a failed insert on the landing page. Checked by hand here
   * because it is the single case, and because the landing page is the one write path a
   * signed-out visitor can reach.
   */
  it("keeps WaitlistSignup's fields aligned with the waitlist table", () => {
    const shape = /export interface WaitlistSignup \{([^}]*)\}/.exec(TS);
    expect(shape, "WaitlistSignup not found").not.toBeNull();

    const fields = [...shape![1].matchAll(/^\s*(\w+)[?]?:/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(0);

    const columns = tables.get("waitlist")!;
    for (const field of fields) expect(columns.has(field)).toBe(true);

    // The union and the CHECK constraint have to agree too, but that is no longer checked
    // by reading source text here: `feature` was an inline union in three files and is now
    // `WAITLIST_FEATURES`, so `db.constraints.test.ts` asserts the constant against the
    // constraint directly. This test keeps the half that is still about field names.
  });

  it("references only columns that exist", () => {
    const unknown = refs
      .filter((r) => !tables.get(r.table)?.has(r.column))
      .map((r) => `db.ts:${r.line} ${r.table}.${r.column}`);
    expect(unknown).toEqual([]);
  });

  it("queries no table the schema does not define", () => {
    const missing = [...new Set(refs.map((r) => r.table))].filter((t) => !tables.has(t));
    expect(missing).toEqual([]);
  });
});

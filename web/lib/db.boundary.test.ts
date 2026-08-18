/**
 * SPEC Part 3 asks for "a lint rule or test that fails if any route queries Supabase
 * directly". This is that test.
 *
 * The authorization model in this app is not enforced by Postgres. RLS is on with no
 * permissive policies, so it denies everything and the service-role key bypasses it.
 * What actually scopes a query to a user is `lib/db.ts` taking `userId` as its first
 * argument. That guarantee holds exactly as long as `lib/db.ts` is the only file holding
 * a Supabase client. A route that reaches for `createClient` itself has silently opted out
 * of every check in this codebase, and it would look completely ordinary in review.
 *
 * So: fail the suite, at the import, rather than hoping someone notices.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SEARCHED = ["app", "components", "lib"];
const SOURCE = /\.(ts|tsx)$/;

/** The one file allowed to import the Supabase SDK. */
const ALLOWED = join("lib", "db.ts");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (SOURCE.test(entry)) found.push(full);
  }
  return found;
}

describe("Supabase access boundary", () => {
  it("is imported only by lib/db.ts", () => {
    const offenders = SEARCHED.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => {
        const rel = relative(ROOT, file);
        // Test files legitimately mock the module; they never hold a real client.
        if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;
        if (rel === ALLOWED || rel === ALLOWED.split(sep).join("/")) return false;
        return /from\s+["']@supabase\/supabase-js["']/.test(readFileSync(file, "utf8"));
      })
      .map((file) => relative(ROOT, file));

    expect(
      offenders,
      `These files import @supabase/supabase-js directly, bypassing the userId scoping in lib/db.ts:\n  ${offenders.join("\n  ")}\n\nGo through lib/db.ts instead. If you need a new query, add a function there that takes userId first.`,
    ).toEqual([]);
  });

  it("finds the files it is supposed to be scanning", () => {
    // Guards the guard: a broken path would make the assertion above pass vacuously
    // forever, and nobody would find out until a leak.
    const scanned = SEARCHED.flatMap((dir) => sourceFiles(join(ROOT, dir)));
    expect(scanned.length).toBeGreaterThan(10);
    expect(scanned.some((file) => file.endsWith(join("lib", "db.ts")))).toBe(true);
  });
});

/**
 * Which routes require a session — checked against the navigation, not against a memory.
 *
 * `proxy.ts` lists protected paths explicitly rather than protecting `(app)` wholesale,
 * which is the right call: a page should be private because someone decided it was, not
 * because a regex happened to catch it. The cost of that decision is that adding a page and
 * forgetting to list it produces no error anywhere — the page simply serves someone else's
 * shell to anyone who types the URL. That is the failure this file exists to prevent.
 *
 * The list is parsed out of the source. Importing the module would pull in Clerk's
 * middleware, which wants a request context this test has no reason to build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_ITEMS, TOOL_ITEMS } from "@/lib/nav";

const SOURCE = readFileSync(join(__dirname, "proxy.ts"), "utf8");

/**
 * The one destination deliberately left open.
 *
 * SPEC §5.1: the matcher is usable without an account — paste a résumé and a posting, get a
 * score, save nothing. `POST /api/score` is public for the same reason, and `lib/rate-limit.ts`
 * buckets guests by IP because of it.
 */
const PUBLIC = new Set(["/matcher"]);

/** The paths inside `createRouteMatcher([...])`, minus their `(.*)` suffixes. */
function protectedPaths(): Set<string> {
  const call = SOURCE.slice(
    SOURCE.indexOf("createRouteMatcher(["),
    SOURCE.indexOf("]);", SOURCE.indexOf("createRouteMatcher([")),
  );
  return new Set([...call.matchAll(/"([^"]+)"/g)].map((match) => match[1].replace("(.*)", "")));
}

describe("route protection", () => {
  const paths = protectedPaths();

  /** Guards against a reformat that makes the parser match nothing, which would turn every
   *  assertion below into an empty-set comparison that passes while checking nothing. */
  it("finds the matcher list", () => {
    expect(paths.size).toBeGreaterThan(0);
  });

  it("protects every navigable destination except the guest matcher", () => {
    for (const item of [...NAV_ITEMS, ...TOOL_ITEMS]) {
      const path = item.href.split("#")[0];
      if (PUBLIC.has(path)) continue;
      expect(paths.has(path), `${path} is in the nav but not protected in proxy.ts`).toBe(true);
    }
  });

  /** The other direction. Protecting the matcher would silently delete the guest flow the
   *  landing page advertises, and no test of the matcher itself would notice. */
  it("leaves the matcher public, because SPEC §5.1 says it is", () => {
    expect(paths.has("/matcher")).toBe(false);
  });

  it("protects the dashboard, which is the whole point of having an account", () => {
    expect(paths.has("/dashboard")).toBe(true);
  });

  /**
   * The bypass is the one thing that can switch all of this off, so its gate is asserted
   * here as well as in `dev-mode.test.ts`. `isDevMode()` is false in any production build,
   * and a production build carrying the flag throws at import rather than serving a single
   * unauthenticated request.
   */
  it("short-circuits only through the dev-mode gate", () => {
    expect(SOURCE).toContain("isDevMode()");
    expect(SOURCE).toContain('from "@/lib/dev-mode"');
  });
});

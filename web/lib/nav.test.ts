import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_ITEMS, TOOL_ITEMS, comingSoonHrefs } from "@/lib/nav";

const WEB = join(__dirname, "..");

describe("nav config", () => {
  /**
   * Was Matcher, on the reasoning that it was the only surface that fully worked. That is
   * no longer true, since Applications, Resumes and the Dashboard all carry real data, and the
   * Dashboard is the authenticated home page.
   */
  it("leads with the dashboard, the authenticated home", () => {
    expect(NAV_ITEMS[0]).toMatchObject({ href: "/dashboard", comingSoon: false });
  });

  it("orders the workspace from home outwards", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/dashboard",
      "/matcher",
      "/applications",
      "/resumes",
      "/network",
      "/outreach",
    ]);
  });

  // Settings is somewhere you go to change something and leave, not somewhere you work.
  // Listing it beside Matcher gave it the same weight as the product itself.
  it("keeps utilities out of the workspace group", () => {
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain("/settings");
    expect(TOOL_ITEMS.map((item) => item.href)).toContain("/settings");
  });

  it("gives every tool item an href, a label and an icon", () => {
    for (const item of TOOL_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  /**
   * Network and Outreach carried this flag long after they stopped being locked screens,
   * so the sidebar offered a "soon" badge whose tooltip said "Not built yet" beside two
   * features with a page, a route pair and a table each.
   */
  it("marks nothing as coming soon, because every screen in the nav is built", () => {
    expect(comingSoonHrefs()).toEqual([]);
  });

  /**
   * The check that keeps the line above honest.
   *
   * A badge is a claim about what exists, and the only way it drifts is by nobody looking.
   * An unmarked item must have a page behind it; a marked one is a promise, so it must not.
   */
  it("backs every unmarked destination with a page, and no marked one", () => {
    for (const item of [...NAV_ITEMS, ...TOOL_ITEMS]) {
      const segment = item.href.split("#")[0];
      const page = join(WEB, "app", "(app)", segment, "page.tsx");
      expect(existsSync(page), `${item.href} -> ${page}`).toBe(!item.comingSoon);
    }
  });

  it("gives every item an href, a label and an icon", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate destinations", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

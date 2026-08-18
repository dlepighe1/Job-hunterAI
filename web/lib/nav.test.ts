import { describe, expect, it } from "vitest";

import { NAV_ITEMS, TOOL_ITEMS, comingSoonHrefs } from "@/lib/nav";

describe("nav config", () => {
  /**
   * Was Matcher, on the reasoning that it was the only surface that fully worked. That is
   * no longer true, since Applications, Resumes and the Dashboard all carry real data, and the
   * Dashboard is the authenticated home page.
   */
  it("leads with the dashboard, the authenticated home", () => {
    expect(NAV_ITEMS[0]).toMatchObject({ href: "/dashboard", comingSoon: false });
  });

  it("puts the four working surfaces above the two that are not built", () => {
    expect(NAV_ITEMS.slice(0, 4).map((item) => item.href)).toEqual([
      "/dashboard",
      "/matcher",
      "/applications",
      "/resumes",
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

  it("marks Network and Outreach as coming soon", () => {
    // SPEC §1.1: "Phases 2 and 3 ship as locked screens in Phase 1. They are advertised,
    // not built."
    expect(comingSoonHrefs()).toEqual(["/network", "/outreach"]);
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

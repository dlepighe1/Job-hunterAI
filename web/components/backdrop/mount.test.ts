/**
 * Spec §3 puts the three backdrop layers on `.marketing-shell` **and** `.obsidian-app`.
 * Only the marketing shell ever got them, so every authenticated screen rendered on a flat
 * ground — the background the redesign is named after was absent from the product itself.
 *
 * This is a source-level test for the same reason `db.boundary.test.ts` is one: the thing
 * being protected is a structural property of the tree, and it fails silently. A missing
 * backdrop does not throw, does not warn, and does not break a screenshot badly enough for
 * anyone to notice in review — it just quietly looks slightly cheaper.
 *
 * What this cannot check is that the layers actually paint, which depends on the stacking
 * context. `.obsidian-app` must keep `isolation: isolate`, so that is asserted too: without
 * it the negative z-indices escape the shell and land behind the page background, and the
 * backdrop would be mounted, correct, and invisible.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

const SHELLS = [
  { name: "marketing shell", file: ["app", "(marketing)", "page.tsx"] },
  { name: "app shell", file: ["app", "(app)", "layout.tsx"] },
];

describe("ObsidianBackdrop is mounted on both shells", () => {
  it.each(SHELLS)("$name mounts it", ({ file }) => {
    const source = read(...file);
    expect(source).toContain("ObsidianBackdrop");
    expect(source).toMatch(/<ObsidianBackdrop\s*\/>/);
  });

  /**
   * The backdrop ships no JavaScript, which is only true while it renders on the server.
   * A `"use client"` directive in the file that *renders* it would pull the whole contour
   * field into the bundle — the layers would still look right, so nothing would flag it.
   *
   * The app shell needs client hooks, so the two are kept apart: the layout stays a server
   * component and hands the backdrop to the client shell as a prop.
   */
  it.each(SHELLS)("$name renders it from a server component", ({ file }) => {
    const source = read(...file);
    const firstCode = source.split("\n").find((l) => l.trim() && !l.trim().startsWith("//"));
    expect(firstCode).not.toMatch(/["']use client["']/);
  });
});

describe("the shells can actually paint it", () => {
  const CSS = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

  // Negative z-indices only stay behind the content and in front of the shell background
  // while the shell contains them. Drop the isolation and the backdrop vanishes under
  // `background: var(--obsidian)` with no other symptom.
  it("keeps both shells as isolated stacking contexts", () => {
    const rule = CSS.slice(CSS.indexOf(".marketing-shell,"));
    const block = rule.slice(rule.indexOf("{"), rule.indexOf("}"));
    expect(rule.slice(0, rule.indexOf("{"))).toContain(".obsidian-app");
    expect(block).toContain("isolation: isolate");
    expect(block).toContain("position: relative");
  });
});

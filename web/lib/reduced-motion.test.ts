import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The reduced-motion contract, asserted against the stylesheet itself.
 *
 * Spec §8 requires that background motion collapses entirely under
 * `prefers-reduced-motion: reduce`. That row went unverified through Task 14 because the
 * browser harness of the day could not emulate the media query, and it stayed unverified
 * because nothing in the suite covered it either, and a rule that exists only by inspection
 * is one careless edit away from being gone, with nothing to say so.
 *
 * Reading the CSS source is the technique `palette.test.ts` already uses, and it holds for
 * the same reason: these are authored declarations, not computed styles, so the file is the
 * authority. What it cannot prove is that a browser honours them. That is what the browser
 * pass is for; the two are complements, not substitutes.
 */
const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
  // Comments are stripped before any brace counting. A `{` inside prose would otherwise
  // throw the depth off and quietly shift every block boundary after it.
  .replace(/\/\*[\s\S]*?\*\//g, "");

const OPENER = "@media (prefers-reduced-motion: reduce) {";

/**
 * Every reduced-motion block's contents, brace-matched.
 *
 * Matched by depth rather than by a lazy regex: these blocks contain nested rules, so
 * `.*?}` would stop at the first inner closing brace and assert against a fragment. A test
 * that reads less than it claims to is worse than no test at all.
 */
function reducedMotionBlocks(): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (let at = CSS.indexOf(OPENER, from); at !== -1; at = CSS.indexOf(OPENER, from)) {
    let depth = 1;
    let i = at + OPENER.length;
    const start = i;
    while (i < CSS.length && depth > 0) {
      if (CSS[i] === "{") depth++;
      else if (CSS[i] === "}") depth--;
      i++;
    }
    if (depth !== 0) throw new Error("unbalanced reduced-motion block in globals.css");
    blocks.push(CSS.slice(start, i - 1));
    from = i;
  }
  return blocks;
}

const BLOCKS = reducedMotionBlocks();
const ALL = BLOCKS.join("\n");

/**
 * The declarations applying to `selector` inside any reduced-motion block.
 *
 * Selectors are compared as whole list members, not as substrings. `.reveal` must not be
 * satisfied by a rule for `.reveal__title`, or this suite would pass on a stylesheet that
 * had stopped forcing the thing it names.
 */
function rulesFor(selector: string): string {
  const found: string[] = [];
  for (const rule of ALL.split("}")) {
    const brace = rule.indexOf("{");
    if (brace === -1) continue;
    const members = rule
      .slice(0, brace)
      .split(",")
      .map((s) => s.trim());
    if (members.includes(selector)) found.push(rule.slice(brace + 1));
  }
  if (found.length === 0) throw new Error(`no reduced-motion rule found for ${selector}`);
  return found.join("\n");
}

describe("prefers-reduced-motion", () => {
  it("is honoured at all", () => {
    expect(BLOCKS.length).toBeGreaterThan(0);
  });

  // The universal reset is the floor everything else stands on. Without it every keyframe
  // and transition added later would need its own opt-out, and would not get one.
  it("collapses every animation and transition globally", () => {
    const universal = BLOCKS.find((b) => b.includes("*::before"));
    expect(universal, "no universal reduced-motion reset").toBeDefined();
    expect(universal).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(universal).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(universal).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
    expect(universal).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  // The backdrop is what the redesign is named after and the largest moving surface on the
  // page. "Collapses entirely", in spec §8, means these two specifically.
  it("stops the backdrop currents travelling", () => {
    expect(rulesFor(".obsidian-backdrop__currents path")).toMatch(
      /animation:\s*none\s*!important/,
    );
  });

  it("removes the cursor spotlight rather than merely freezing it", () => {
    // `display: none`, not `animation: none`, since the spotlight is pointer-driven, so there is
    // no animation on it to stop. Freezing it would leave a stationary glow trailing
    // nothing, which is the wrong end state to force.
    expect(rulesFor(".obsidian-backdrop__spot")).toMatch(/display:\s*none/);
  });

  // The failure mode here is worse than motion: a reveal that never fires under a 0.001ms
  // animation would leave the page's content permanently at opacity 0.
  it("forces revealed content to its end state instead of hiding the page", () => {
    const reveal = rulesFor(".reveal");
    expect(reveal).toMatch(/opacity:\s*1\s*!important/);
    expect(reveal).toMatch(/transform:\s*none\s*!important/);
  });
});

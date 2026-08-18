import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "components/hero");

const OVERLAYS = ["ApplicationsOverlay.tsx", "PlatesOverlay.tsx", "NetworkOverlay.tsx"];

/**
 * Drop comments before asserting.
 *
 * These rules are about what reaches a visitor's eye, not about what the source is allowed
 * to discuss. Without this the ban is self-defeating in the most annoying way possible: the
 * docblock explaining *why* `+68% Match Improvement` was removed contains the string
 * `+68% Match Improvement`, and fails the test enforcing its removal. The explanation is
 * worth more than the convenience of a two-line matcher.
 *
 * Naive enough to also strip a `//` inside a string literal. There are none in these files,
 * and the failure mode is a false pass on a URL rather than a false alarm. If that ever
 * matters here, parse instead.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SOURCES = OVERLAYS.map((f) => stripComments(readFileSync(join(DIR, f), "utf8"))).join("\n");
const SHOWCASE = readFileSync(join(DIR, "HeroShowcase.tsx"), "utf8");

/**
 * The invariant FEATURES.md §11 asks for, and the one that fails silently otherwise.
 *
 * A designer correcting a hero illustration is exactly the person least likely to know the
 * model never predicts above 0.85. The reference art this replaced showed a score of 92,
 * a `+68% Match Improvement` and `100% ATS Compatibility`, three figures the product
 * cannot produce, sitting in the first viewport. Grepping the source is a blunt instrument,
 * but it is the only one that catches a number typed back in eighteen months from now.
 */
describe("hero copy constraints", () => {
  // FEATURES.md 2.3: the model never predicts above 0.85, so no score above 85.
  //
  // Two shapes, because a score reaches the page either way: as a literal between tags,
  // and as the `value` prop of a `ScoreRing`. The rings started as literal text and became
  // props during the rebuild, and the `length > 0` guard below is what caught that the
  // original pattern had silently stopped matching anything at all. A constraint test that
  // can pass by finding nothing is worse than no test, so it asserts it found something.
  it("shows no score above 85", () => {
    const scores = [
      ...[...SOURCES.matchAll(/>\s*(\d{2,3})\s*</g)].map((m) => Number(m[1])),
      ...[...SOURCES.matchAll(/\bvalue=\{(\d{2,3})\}/g)].map((m) => Number(m[1])),
    ];
    expect(scores.length).toBeGreaterThan(0);
    for (const score of scores) expect(score).toBeLessThanOrEqual(85);
  });

  it("never presents the score as a percentage", () => {
    expect(SOURCES).not.toMatch(/\d+%\s*(match|fit|compatib)/i);
  });

  // Whenever a score appears it has to say what it is out of and that it is calibrated.
  // A bare number in a hero reads as a percentage to everyone who has ever seen one.
  it("states the scale and the calibration wherever it shows a score", () => {
    expect(SOURCES).toContain("out of 100");
    expect(SOURCES.toLowerCase()).toContain("calibrated");
  });

  it("carries none of the reference art's invented figures", () => {
    expect(SOURCES).not.toContain("+68%");
    expect(SOURCES).not.toContain("100% ATS");
    expect(SOURCES).not.toMatch(/\bElevated Score\b/);
    // "Revamp & Elevate" claimed the product rewrites the resume. It does not. The user's
    // own edits moved the score, which is what "re-scored after tailoring" says instead.
    expect(SOURCES).not.toMatch(/\bRevamp\b/i);
  });

  /**
   * Narrowed, deliberately, and recorded rather than deleted.
   *
   * This used to cover all three overlays. The contact graph now carries Stripe, Google,
   * Notion and Microsoft marks at the owner's explicit direction, matching the reference
   * art, so the rule is scoped to where the original harm actually lives rather than
   * dropped.
   *
   * The harm it still guards: a *pipeline* of named employers is a claim the user applied
   * to those companies and that this product tracked it. The applications tracker is
   * unbuilt, so every one of those rows would be fabricated evidence of a feature that
   * does not exist. That stays banned.
   *
   * What is no longer covered, and the risk that carries: the network graph shows four
   * real trademarks on a page for an unbuilt feature, which implies an association and an
   * integration this product does not have. `NetworkOverlay`'s `COMPANIES` array is the
   * single place to revert it.
   */
  it("puts no real employer in the applications pipeline", () => {
    const pipeline = stripComments(readFileSync(join(DIR, "ApplicationsOverlay.tsx"), "utf8"));
    const plates = stripComments(readFileSync(join(DIR, "PlatesOverlay.tsx"), "utf8"));
    for (const name of ["Stripe", "Google", "Notion", "Microsoft", "Northstar"]) {
      expect(pipeline).not.toContain(name);
      expect(plates).not.toContain(name);
    }
  });

  /**
   * The exemption above is narrow on purpose: four marks, and nothing else.
   *
   * Asserted on the `logo` slugs rather than on display names. Two of the four, Notion and
   * Microsoft, appear only as a badge on an avatar and are never written out as text, so
   * an earlier version of this test that looked for capitalised names failed the moment the
   * component started identifying them by slug. The slug is what picks the artwork, so the
   * slug is what decides which trademark renders.
   */
  it("limits the contact graph to the four marks that were asked for", () => {
    const network = stripComments(readFileSync(join(DIR, "NetworkOverlay.tsx"), "utf8"));
    for (const slug of ["stripe", "google", "notion", "microsoft"]) {
      expect(network).toContain(`"${slug}"`);
    }
    for (const other of ["meta", "amazon", "apple", "openai", "anthropic", "northstar"]) {
      expect(network.toLowerCase()).not.toContain(`"${other}"`);
    }
  });

  // Every mark the graph names must have artwork committed for it. A slug with no file
  // renders as a blank plate, which is worse than a generic shape.
  it("ships a logo file for every mark the contact graph references", () => {
    const network = readFileSync(join(DIR, "NetworkOverlay.tsx"), "utf8");
    const slugs = new Set([...network.matchAll(/logo:\s*"([a-z]+)"/g)].map((m) => m[1]));
    expect(slugs.size).toBeGreaterThan(0);
    for (const slug of slugs) {
      expect(
        existsSync(join(process.cwd(), "public", "img", "logos", `${slug}.svg`)),
        `missing public/img/logos/${slug}.svg`,
      ).toBe(true);
    }
  });

  // Spec §4.4: coverage counts are real output, an ATS compatibility percentage is not.
  it("expresses coverage as a count, not a percentage", () => {
    expect(SOURCES).toMatch(/\d\s*\/\s*7/);
  });

  /**
   * The plan asked for `NOT A REAL ANALYSIS` three times across the overlay files. The
   * captions ended up in `HeroShowcase`'s asset manifest instead: one place, rendered once
   * per panel, rather than three components each having to remember. The assertion is on
   * the same invariant: no asset goes unlabelled, and the network one says something
   * stronger than "illustration" because the feature does not exist at all.
   */
  it("labels every asset as something the product has not really produced", () => {
    const captions = [...SHOWCASE.matchAll(/caption:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(captions).toHaveLength(3);
    for (const caption of captions) {
      expect(caption).toMatch(/NOT A REAL ANALYSIS|NOT A BUILT FEATURE/);
    }
  });

  it("flags the unbuilt feature on the asset itself, not only in the caption", () => {
    const network = readFileSync(join(DIR, "NetworkOverlay.tsx"), "utf8");
    expect(network).toContain("ON THE ROADMAP");
  });

  // Decoration, all of it. None of these layers should reach a screen reader or the tab
  // order, because the caption under the frame is what carries the meaning.
  it("hides every overlay from assistive technology", () => {
    for (const file of OVERLAYS) {
      expect(readFileSync(join(DIR, file), "utf8")).toContain('aria-hidden="true"');
    }
  });
});

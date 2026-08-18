import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObsidianBackdrop } from "./ObsidianBackdrop";

// Rendered once. The backdrop is static geometry with no props and no state, so there is
// nothing a per-test render would exercise that this one does not.
//
// `renderToStaticMarkup` rather than a DOM: this repo's suite runs in `environment: "node"`
// with no jsdom and no @testing-library. Asserting on the markup string needs neither.
const HTML = renderToStaticMarkup(<ObsidianBackdrop />);

/**
 * Pull the `d` attributes out of one `<g class="...">`.
 *
 * Scoped by group rather than counting `<path>` across the whole document. Contours and
 * currents are separate populations with separate limits, and a document-wide count
 * conflates them, and it also silently absorbed the two paths the old isometric grid layer
 * contributed, which is how a 30-contour field passed a test reading 32.
 */
function pathsIn(group: string): string[] {
  const g = new RegExp(`<g class="${group}">(.*?)</g>`, "s").exec(HTML);
  if (!g) throw new Error(`group ${group} not found`);
  return [...g[1].matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
}

const CONTOURS = pathsIn("obsidian-backdrop__contours");
const CURRENTS = pathsIn("obsidian-backdrop__currents");

describe("ObsidianBackdrop", () => {
  it("is entirely hidden from assistive technology", () => {
    const svgs = HTML.match(/<svg\b[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
    }
  });

  // `pointer-events: none` lives in CSS and cannot be observed from markup. What markup
  // can prove is the two things that rule depends on: the hook it is keyed to exists, and
  // the subtree contains nothing that would want a pointer or a tab stop in the first
  // place.
  it("is inert decoration under the class the pointer-events rule targets", () => {
    expect(HTML.startsWith('<div class="obsidian-backdrop"')).toBe(true);
    expect(HTML).not.toMatch(/<(a|button|input|select|textarea)\b/);
    expect(HTML).not.toMatch(/\b(tabindex|href|onclick)=/i);
  });

  // stroke-dashoffset animates on the main thread. Animating every contour is how this
  // becomes jank, so the count is capped and the cap is enforced.
  it("animates at most 10 contour paths", () => {
    const pulsed = HTML.match(/data-pulse="true"/g) ?? [];
    expect(pulsed.length).toBeGreaterThan(0);
    expect(pulsed.length).toBeLessThanOrEqual(10);
  });

  it("draws a contour field dense enough to read as terrain", () => {
    expect(CONTOURS.length).toBeGreaterThanOrEqual(24);
    expect(CONTOURS.length).toBeLessThanOrEqual(40);
  });

  // Every contour a current rides must also exist as an undashed path underneath. Without
  // that, `stroke-dasharray` erases 98% of the line and the ring vanishes from the map.
  //
  // Compares parsed `d` values rather than whole serialised tags: React's exact output for
  // a void element is its business, not this test's.
  it("lays each current over an intact contour", () => {
    expect(CURRENTS).toHaveLength(10);
    for (const d of CURRENTS) expect(CONTOURS).toContain(d);
  });

  // Pins the committed literal to what `scripts/generate-contours.mjs` emits. Without this
  // the array is just 30 opaque strings, and a half-finished re-paste would be invisible.
  //
  // Honest limitation: this catches a truncated or mis-sized paste, not a paste of
  // different geometry at the same size. Pinning the geometry itself would mean committing
  // a hash of it, which buys little for a decorative layer that is regenerated on purpose.
  it("matches the shape of the generator's output", () => {
    expect(CONTOURS).toHaveLength(30);
    const indices = CURRENTS.map((d) => CONTOURS.indexOf(d));
    expect(indices).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
  });

  // The contours are the backdrop's only line work, and an isometric grid layer was cut as a
  // competing texture. This pins that: a grid creeping back in would show up here as extra
  // SVG geometry outside the two contour groups.
  it("draws no line work beyond the contour field", () => {
    expect(HTML.match(/<svg\b/g) ?? []).toHaveLength(1);
    expect(HTML).not.toMatch(/<(pattern|circle|line|rect)\b/);
    const allPaths = HTML.match(/<path\b/g) ?? [];
    expect(allPaths).toHaveLength(CONTOURS.length + CURRENTS.length);
  });
});

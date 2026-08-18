import { Spotlight } from "./Spotlight";
import { TopographicField } from "./TopographicField";

/**
 * The page backdrop: everything behind the content, and nothing that can be interacted
 * with or read out.
 *
 * Layer order, back to front (z-indices live in `globals.css`):
 *
 *   1. the wrapper itself, carrying the ambient radial colour field   (z-index -4)
 *   2. `.obsidian-backdrop__topo`:  contour map                      (z-index -3)
 *   3. `.obsidian-backdrop__spot`:  cursor spotlight                 (z-index -2)
 *   4. `.obsidian-backdrop__grain`: noise, on top of every gradient  (z-index -1)
 *
 * An isometric grid layer used to sit between 1 and 2. It was cut: the brief asked for
 * regional, subtle topography, and a lattice behind the contours was a second competing
 * texture rather than support for the first.
 *
 * The grain has to stay last and has to stay. Near-black gradients quantise into visible
 * concentric rings on an 8-bit display, and #08080c is dark enough to make that worse
 * rather than better; the noise dithers those steps away. DESIGN.md calls it load-bearing.
 * It moved here from `.marketing-shell::after` so that one component owns the whole stack
 * instead of it being split between a pseudo-element and a component.
 *
 * `aria-hidden` on the wrapper hides the entire subtree, and the `<svg>` repeats it anyway
 * This is decoration, and none of it should reach assistive technology or the tab order.
 * `pointer-events: none` in CSS keeps it out of hit-testing.
 *
 * This is a Server Component: the contour field renders once to static markup and ships no
 * JavaScript. `Spotlight` is the single client leaf, and it is an empty div, so see its own
 * docblock for why the directive lives there rather than on this file.
 */
export function ObsidianBackdrop() {
  return (
    <div className="obsidian-backdrop" aria-hidden="true">
      <TopographicField />
      <Spotlight />
      <div className="obsidian-backdrop__grain" />
    </div>
  );
}

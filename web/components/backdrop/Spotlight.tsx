"use client";

import { useSpotlight } from "./useSpotlight";

/**
 * The one part of the backdrop that reacts to you.
 *
 * Split into its own file so the directive above stays on this leaf. `ObsidianBackdrop` is
 * a Server Component rendering thirty contour paths; marking *it* client would ship all of
 * that geometry to the browser as JavaScript to gain a single moving gradient. This
 * component is an empty div.
 *
 * Everything visible about it is CSS, so see `.obsidian-backdrop__spot` in `globals.css`,
 * which also holds it at opacity 0 until the hook reports a real pointer position.
 */
export function Spotlight() {
  const ref = useSpotlight<HTMLDivElement>();
  return <div ref={ref} className="obsidian-backdrop__spot" />;
}

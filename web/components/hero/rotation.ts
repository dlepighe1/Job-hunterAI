/**
 * The next asset in the rail, wrapping at the end.
 *
 * The `total <= 1` guard is not decoration: `(current + 1) % 0` is NaN, and a NaN index
 * would blank the frame silently rather than throwing anywhere useful.
 */
export function nextIndex(current: number, total: number): number {
  return total <= 1 ? 0 : (current + 1) % total;
}

/** How long an asset holds before the rail advances. */
export const DWELL_MS = 6000;

/** Cross-fade duration. Must stay well under `DWELL_MS`, see rotation.test.ts. */
export const TRANSITION_MS = 700;

/**
 * Whether the rail should arm a timer to advance itself.
 *
 * Extracted from the component so the reduced-motion rule is testable. The suite runs in
 * `environment: "node"` with no jsdom, so the effect that reads `matchMedia` cannot be
 * exercised directly, but the decision it feeds can be, and that decision is the part
 * with a correctness claim attached to it. The wiring above it is one `setReduced` call.
 *
 * `reduced` outranks everything: the setting asks for no unbidden motion, and an
 * auto-advancing carousel is the canonical example of unbidden motion. A reader can still
 * drive the rail with the dots, which is why this governs the timer alone.
 */
export function shouldAutoAdvance(
  { paused, reduced, total }: { paused: boolean; reduced: boolean; total: number },
): boolean {
  if (reduced) return false;
  if (paused) return false;
  return total > 1;
}

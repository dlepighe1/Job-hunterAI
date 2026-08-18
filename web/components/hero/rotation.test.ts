import { describe, expect, it } from "vitest";
import { DWELL_MS, TRANSITION_MS, nextIndex, shouldAutoAdvance } from "./rotation";

describe("nextIndex", () => {
  it("advances through the assets", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
  });

  it("wraps at the end", () => {
    expect(nextIndex(2, 3)).toBe(0);
  });

  // The rail is built to hold whatever the asset list holds. With one asset the timer still
  // ticks, and a naive `(current + 1) % total` would be right here by luck, but an empty
  // list is what actually breaks: `% 0` is NaN, which would index nothing and blank the
  // frame rather than failing loudly.
  it("stays put when there is only one asset", () => {
    expect(nextIndex(0, 1)).toBe(0);
  });

  it("stays at zero rather than returning NaN for an empty rail", () => {
    expect(nextIndex(0, 0)).toBe(0);
  });
});

describe("rotation timings", () => {
  // The dwell has to outlast the transition by enough that an asset is legible at rest
  // rather than perpetually arriving or leaving.
  it("dwells several times longer than it transitions", () => {
    expect(DWELL_MS).toBeGreaterThan(TRANSITION_MS * 4);
  });
});

/**
 * The reduced-motion rule, which nothing covered until now.
 *
 * Task 14 of the redesign plan left this row unverified because the browser harness of the
 * day could not emulate the media query. That is exactly the kind of gap that rots: the
 * rule is one boolean away from being dropped by an unrelated edit, and no test would say
 * so. The browser pass is still worth doing, since it proves the `matchMedia` wiring, but the
 * decision itself belongs in the suite.
 */
describe("shouldAutoAdvance", () => {
  it("advances a multi-asset rail nobody is touching", () => {
    expect(shouldAutoAdvance({ paused: false, reduced: false, total: 3 })).toBe(true);
  });

  it("does not advance under reduced motion", () => {
    expect(shouldAutoAdvance({ paused: false, reduced: true, total: 3 })).toBe(false);
  });

  it("does not advance while hovered or focused", () => {
    expect(shouldAutoAdvance({ paused: true, reduced: false, total: 3 })).toBe(false);
  });

  // Reduced motion is not a preference the rail gets to weigh against anything else. If
  // this ever became `paused || reduced` in the wrong order, or an OR of two opt-outs,
  // the case below is the one that would catch it.
  it("keeps reduced motion decisive even when nothing else objects", () => {
    for (const paused of [true, false]) {
      expect(shouldAutoAdvance({ paused, reduced: true, total: 3 })).toBe(false);
    }
  });

  it("never arms a timer for a rail that cannot move", () => {
    expect(shouldAutoAdvance({ paused: false, reduced: false, total: 1 })).toBe(false);
    expect(shouldAutoAdvance({ paused: false, reduced: false, total: 0 })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { spotlightTransform } from "./useSpotlight";

// Only the coordinate maths is tested. The hook around it is a `pointermove` listener and a
// requestAnimationFrame loop, neither of which exists in `environment: "node"`, so testing it
// would mean adding jsdom to a suite that is deliberately dependency-light and offline. So
// the part with a decision in it was pulled out as a pure function, and that is what is
// pinned here.
describe("spotlightTransform", () => {
  it("centres the gradient on the pointer", () => {
    expect(spotlightTransform(400, 300)).toBe("translate3d(400px, 300px, 0)");
  });

  // translate3d, never top/left, because the spotlight must stay on the compositor and never
  // trigger layout. A `top`/`left` write here would relayout a fixed, full-viewport element
  // on every frame of pointer movement.
  it("only ever emits a 3d transform", () => {
    expect(spotlightTransform(0, 0)).toMatch(/^translate3d\(/);
  });

  // Sub-pixel pointer coordinates are real: they arrive from trackpads, high-DPI displays
  // and browser zoom. Rounding them here would make the spotlight step rather than glide,
  // so the value is passed through and this pins that it is not quantised.
  it("passes fractional coordinates through unrounded", () => {
    expect(spotlightTransform(12.5, 8.25)).toBe("translate3d(12.5px, 8.25px, 0)");
  });
});

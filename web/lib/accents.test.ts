import { describe, expect, it } from "vitest";
import { ACCENTS, DEFAULT_ACCENT, resolveAccent } from "./accents";

describe("accent presets", () => {
  it("defaults to cyan", () => {
    expect(resolveAccent(null).color).toBe("#56ccf2");
    expect(DEFAULT_ACCENT).toBe("cyan");
  });

  it("falls back to the default for an unknown id", () => {
    expect(resolveAccent("chartreuse")).toEqual(resolveAccent(DEFAULT_ACCENT));
  });

  // The bug this replaces: hover was hard-coded to #d8e2ff for every accent, so
  // choosing Gold produced a periwinkle hover state.
  it("gives every accent its own hover, never a shared one", () => {
    const hovers = ACCENTS.map((a) => a.hover);
    expect(new Set(hovers).size).toBe(ACCENTS.length);
    for (const accent of ACCENTS) {
      expect(accent.hover).not.toBe(accent.color);
    }
  });

  it("carries no retired periwinkle values", () => {
    const values = ACCENTS.flatMap((a) => [a.color, a.hover]);
    expect(values).not.toContain("#adc6ff");
    expect(values).not.toContain("#d8e2ff");
  });
});

import { describe, expect, it } from "vitest";

import { BANDS, bandFor } from "@/lib/benchmark";
import { ENGINES, ENGINE_META, allVerdicts, toDisplayScore, verdictFor, wordCount } from "@/lib/types";

describe("verdict bands", () => {
  it("agrees with benchmark.ts at every boundary", () => {
    // The invariant SPEC Appendix A exists to protect: the product and the research
    // repository read a score through the same bands. Asserting this at each boundary
    // rather than at a midpoint, because drift shows up at the edges first.
    for (const band of BANDS) {
      expect(verdictFor(band.min).label).toBe(band.label);
      expect(bandFor(band.min).label).toBe(band.label);
    }
  });

  it("puts 0.62 in the same band as the research code", () => {
    // The specific score the old, drifted thresholds disagreed about: 62 on a 0-100 scale
    // was a "Good match" under the local bands and a "Partial match" under BANDS.
    expect(verdictFor(0.62).label).toBe("Partial match");
  });

  it("carries a plain-language gloss, so colour is never the only signal", () => {
    for (const verdict of allVerdicts()) {
      expect(verdict.plain.length).toBeGreaterThan(0);
      expect(verdict.label.length).toBeGreaterThan(0);
    }
  });

  it("has a style for every band", () => {
    for (const band of BANDS) {
      const verdict = verdictFor(band.min);
      expect(verdict.chip).toBeTruthy();
      expect(verdict.ring).toBeTruthy();
      expect(verdict.text).toBeTruthy();
    }
  });

  it("handles the extremes without falling through", () => {
    expect(verdictFor(0).label).toBe("Not a match");
    expect(verdictFor(1).label).toBe("Strong match");
  });
});

describe("engine metadata", () => {
  it("covers every engine", () => {
    for (const engine of ENGINES) {
      expect(ENGINE_META[engine]?.id).toBe(engine);
    }
  });

  it("marks Claude as the only engine with a per-call cost", () => {
    const paid = ENGINES.filter((engine) => ENGINE_META[engine].cost === "per-call");
    expect(paid).toEqual(["claude"]);
  });

  it("marks only the fine-tuned model as calibrated", () => {
    // SPEC Appendix B: the base model and the language models are not calibrated, and
    // their numbers are not comparable to the fine-tuned model's on absolute value.
    const calibrated = ENGINES.filter((engine) => ENGINE_META[engine].capabilities.calibrated);
    expect(calibrated).toEqual(["finetuned"]);
  });

  it("does not claim the base or keyword engines produce a score", () => {
    expect(ENGINE_META.base.capabilities.score).toBe(false);
    expect(ENGINE_META.keyword.capabilities.score).toBe(false);
  });

  /**
   * An earlier version of this list dropped OpenRouter outright, and this test asserted its
   * absence. It is back as `gemma`, deliberately and narrowly: Claude was the only engine
   * that produced written feedback and it bills per call, so the generative path could not be
   * worked on without paying for each iteration.
   *
   * What has NOT changed is the rule that made dropping it reasonable. An open-weights model
   * is a second opinion, never a second measurement — so it is uncalibrated like Claude, and
   * the fine-tuned model remains the only engine allowed to claim otherwise.
   */
  it("adds the open-weights engine without adding a second calibrated one", () => {
    expect(ENGINES).toContain("gemma");
    expect(ENGINE_META.gemma.capabilities.calibrated).toBe(false);
    expect(ENGINE_META.gemma.capabilities.generativeFeedback).toBe(true);
  });

  /** It exists to cost nothing. An engine that quietly starts billing is the surprise
   *  invoice SPEC §2.4 is written against. */
  it("keeps the open-weights engine free", () => {
    expect(ENGINE_META.gemma.cost).toBe("free");
  });
});

describe("toDisplayScore", () => {
  it("converts 0-1 to 0-100", () => {
    expect(toDisplayScore(0.72)).toBe(72);
  });

  it("clamps out-of-range input rather than rendering 104%", () => {
    expect(toDisplayScore(1.04)).toBe(100);
    expect(toDisplayScore(-0.1)).toBe(0);
  });
});

describe("wordCount", () => {
  it("ignores runs of whitespace", () => {
    expect(wordCount("  one   two\n\nthree \t four ")).toBe(4);
  });

  it("is zero for empty and whitespace-only text", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n\t ")).toBe(0);
  });
});

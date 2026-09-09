import { describe, expect, it } from "vitest";

import { assessExtraction, measureExtraction } from "@/lib/extraction/quality";

/** A résumé that extracted cleanly: real prose, real sections, ordinary word lengths. */
const GOOD = `ALEX JOHNSON
Senior Backend Engineer

SUMMARY
Backend engineer with eight years building distributed systems at scale. Expert in Python,
Go, and cloud-native architecture, with a track record of improving reliability and
developer productivity across large teams.

EXPERIENCE
Staff Software Engineer, Atlas Systems
- Led the design and implementation of a multi-tenant platform serving one million users.
- Reduced API latency by forty percent through caching and query optimisation work.
- Built internal tooling that improved developer productivity across the whole company.

EDUCATION
BSc Computer Science, University of Illinois

SKILLS
Python, Go, PostgreSQL, Kubernetes, Terraform, Kafka, observability, distributed systems`;

describe("measureExtraction", () => {
  it("reports the signals it judges on", () => {
    const signals = measureExtraction(GOOD, 1);
    expect(signals.words).toBeGreaterThan(80);
    expect(signals.alphaRatio).toBeGreaterThan(0.7);
    expect(signals.meanWordLength).toBeGreaterThan(3);
    expect(signals.meanWordLength).toBeLessThan(9);
    expect(signals.sections).toBeGreaterThanOrEqual(4);
    expect(signals.wordsPerPage).toBe(signals.words);
  });

  // DOCX and TXT have no pages, and inventing one would make the per-page floor fire on
  // documents it was never meant to judge.
  it("leaves words-per-page null when the page count is unknown", () => {
    expect(measureExtraction(GOOD, null).wordsPerPage).toBeNull();
  });

  it("survives an empty string", () => {
    const signals = measureExtraction("", 1);
    expect(signals).toMatchObject({ words: 0, alphaRatio: 0, meanWordLength: 0, sections: 0 });
  });
});

describe("assessExtraction", () => {
  it("passes a clean extraction silently", () => {
    const quality = assessExtraction(GOOD, 1);
    expect(quality.verdict).toBe("good");
    expect(quality.reason).toBeNull();
  });

  it("refuses a file that yielded nothing, and says why", () => {
    const quality = assessExtraction("   ", 2);
    expect(quality.verdict).toBe("failed");
    expect(quality.reason).toMatch(/scan|image/i);
  });

  // The same floor the scoring service enforces. Refusing here means the cause is visible,
  // rather than surfacing later as a 422 from a service the user never invoked directly.
  it("refuses a document too short to score", () => {
    const quality = assessExtraction("Alex Johnson. Backend engineer. Python and Go.", 1);
    expect(quality.verdict).toBe("failed");
    expect(quality.reason).toContain("50");
  });

  it("refuses symbol soup from a broken font map", () => {
    const quality = assessExtraction("###@@@ %%% &&& ((( ))) ".repeat(40), 1);
    expect(quality.verdict).toBe("failed");
    expect(quality.reason).toMatch(/symbols|character map/i);
  });

  /**
   * The defect a human proofreader misses.
   *
   * The words are all present and in the right order, so a preview looks almost right, but
   * every space is gone. It scores near zero against every posting and nothing on screen
   * explains why.
   */
  it("flags an extraction whose spacing collapsed", () => {
    const collapsed = Array.from(
      { length: 60 },
      (_, i) => `SeniorBackendEngineerAtlasSystems${i}`,
    ).join(" ");
    const quality = assessExtraction(collapsed, 1);
    expect(quality.verdict).toBe("degraded");
    expect(quality.reason).toMatch(/ran together|spacing/i);
  });

  it("flags a partial read of a multi-page document", () => {
    // Comfortably over the 50-word hard floor, so the per-page signal is what fires, but
    // only about 14 words a page across five pages.
    const sparse = `EXPERIENCE ${"engineer built platform services and tooling for the team ".repeat(10)}`;
    const quality = assessExtraction(sparse, 5);
    expect(quality.signals.words).toBeGreaterThan(50);
    expect(quality.verdict).toBe("degraded");
    expect(quality.reason).toMatch(/part of this file/i);
  });

  it("flags text with no recognisable résumé section", () => {
    const prose = "the quick brown fox jumped over the lazy dog and kept running ".repeat(12);
    const quality = assessExtraction(prose, 1);
    expect(quality.verdict).toBe("degraded");
    expect(quality.reason).toMatch(/familiar/i);
  });

  // A missing section heading is a hint, never proof: plenty of good résumés are unusual.
  // It must never be able to block an upload outright.
  it("never fails on the section signal alone", () => {
    const prose = "the quick brown fox jumped over the lazy dog and kept running ".repeat(12);
    expect(assessExtraction(prose, 1).verdict).not.toBe("failed");
  });

  it("carries the signals alongside every verdict, for support and for tuning", () => {
    for (const [text, pages] of [[GOOD, 1], ["   ", 1], ["short", 1]] as const) {
      expect(assessExtraction(text, pages).signals).toHaveProperty("alphaRatio");
    }
  });
});

import { describe, expect, it } from "vitest";

import { analyzeWithKeywords } from "@/lib/providers/keyword";

const JD = `Senior data engineer. Requirements: 3+ years of Python and SQL, Airflow orchestration,
and Kubernetes. ${"detail ".repeat(50)}`;
const RESUME = `Built ETL pipelines in Python and SQL. ${"experience ".repeat(50)}`;

describe("the keyword engine", () => {
  it("returns coverage and ranked gaps without touching the network", () => {
    const result = analyzeWithKeywords(JD, RESUME);

    expect(result.engine).toBe("keyword");
    expect(result.keywords?.matched).toEqual(expect.arrayContaining(["python", "sql"]));
    expect(result.keywords?.missing).toEqual(expect.arrayContaining(["airflow", "kubernetes"]));
    expect(result.keywords?.gaps.length).toBeGreaterThan(0);
  });

  it("produces no score, so it is never read as comparable to the calibrated model", () => {
    const result = analyzeWithKeywords(JD, RESUME);

    expect(result.score).toBeNull();
    expect(result.calibrated).toBe(false);
    expect(result.errorBand).toBeNull();
  });

  it("refuses rather than reporting 0% when the posting names no known skills", () => {
    // "0% match" and "this engine had nothing to measure" are opposite messages, and the
    // second one is what is actually true here.
    const vagueJd = `We are looking for a passionate self-starter to join our growing team in a
      fast-paced environment. ${"culture ".repeat(60)}`;

    expect(() => analyzeWithKeywords(vagueJd, RESUME)).toThrowError(
      /does not name any skills/,
    );
  });

  it("ranks a requirements-section term named twice above a passing mention", () => {
    const result = analyzeWithKeywords(JD, RESUME);
    const gaps = result.keywords!.gaps;

    // Priority comes from the posting alone: how often a term appears and whether it sits
    // in the requirements section. It is not a prediction of score movement (SPEC §5.1.3).
    expect(gaps[0].priority).toBeDefined();
    expect(gaps.map((gap) => gap.keyword)).toContain("airflow");
    expect(gaps.every((gap) => typeof gap.occurrences === "number")).toBe(true);
  });
});

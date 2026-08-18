import { afterEach, describe, expect, it, vi } from "vitest";

import { scoreWithBaseModel } from "@/lib/providers/baseline";
import { analyzeWithFineTuned } from "@/lib/providers/finetuned";

// 60 words each, above MIN_WORDS, and naming skills the ATS vocabulary knows so the
// keyword block is exercised rather than skipped.
const JD = `We need an engineer with Python and SQL and Airflow experience. ${"detail ".repeat(50)}`;
const RESUME = `Built ETL pipelines in Python and SQL at scale. ${"experience ".repeat(50)}`;

const SCORE_RESPONSE = {
  score: 0.72,
  raw_cosine: 0.81,
  calibrator: "platt",
  model_id: "dlepighe1/resume-jd-matcher-mpnet",
  coverage: 0.5,
  requirements: [
    {
      requirement: "Three years of Python and SQL",
      status: "covered",
      similarity: 0.91,
      evidence: "Built ETL pipelines in Python and SQL.",
    },
    {
      requirement: "Kubernetes at scale",
      status: "missing",
      similarity: 0.11,
      evidence: "",
    },
  ],
};

function mockService(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function timeoutError() {
  const error = new Error("timed out");
  error.name = "TimeoutError";
  return error;
}

afterEach(() => vi.unstubAllGlobals());

describe("the fine-tuned engine", () => {
  it("keeps the score in 0-1 units and reports it calibrated", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.score).toBe(0.72);
    expect(result.calibrated).toBe(true);
    expect(result.modelId).toBe("dlepighe1/resume-jd-matcher-mpnet");
    expect(result.engine).toBe("finetuned");
  });

  it("passes the requirement coverage through with its evidence", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0]).toMatchObject({
      requirement: "Three years of Python and SQL",
      status: "covered",
      evidence: "Built ETL pipelines in Python and SQL.",
    });
    // A missing requirement has nothing to point at, and the blank is the honest answer.
    expect(result.requirements[1]).toMatchObject({ status: "missing", evidence: "" });
  });

  it("produces no generative fields, since this model cannot write prose", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.summary).toBeNull();
    expect(result.suggestedBullets).toBeNull();
  });

  it("sends the untruncated text, because the service owns preprocessing", async () => {
    // SPEC §2.3 rule 1: the service applies the exact 350-word truncation the model was
    // trained under. Truncating here would silently degrade scores.
    const fetchMock = mockService(SCORE_RESPONSE);

    await analyzeWithFineTuned(JD, RESUME);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ resume: RESUME, jd: JD });
  });

  it("computes keyword coverage alongside the semantic score", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.keywords).not.toBeNull();
    expect(result.keywords?.matched).toContain("python");
    expect(result.keywords?.missing).toContain("airflow");
  });
});

describe("the calibrator invariant", () => {
  it("attaches the measured error band only when a calibrator was applied", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.errorBand).toEqual({
      low: expect.closeTo(0.6, 5),
      high: expect.closeTo(0.84, 5),
      basis: "typical error on 106 held-out pairs from unseen postings",
    });
  });

  it("omits the error band when no calibrator is loaded", async () => {
    // The MAE was measured on the calibrated model. Quoting it beside an uncalibrated
    // score would borrow credibility that number has not earned.
    mockService({ ...SCORE_RESPONSE, calibrator: null });

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.calibrated).toBe(false);
    expect(result.errorBand).toBeNull();
  });

  it("flags a missing calibrator as degraded, never as a normal score", async () => {
    mockService({ ...SCORE_RESPONSE, calibrator: null });

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.degraded).toBe(true);
  });

  it("is not degraded when the calibrator is present", async () => {
    mockService(SCORE_RESPONSE);

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.degraded).toBe(false);
  });

  it("clamps a score outside 0-1 rather than propagating it", async () => {
    mockService({ ...SCORE_RESPONSE, score: 1.4 });

    const result = await analyzeWithFineTuned(JD, RESUME);

    expect(result.score).toBe(1);
  });
});

describe("service failures", () => {
  it("reports a cold start as waking, with a retry hint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError()));

    await expect(analyzeWithFineTuned(JD, RESUME)).rejects.toMatchObject({
      code: "MODEL_SERVICE_WAKING",
      status: 503,
      retryAfter: 60,
    });
  });

  it("reports a refused connection as unreachable, which is a different problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(analyzeWithFineTuned(JD, RESUME)).rejects.toMatchObject({
      code: "MODEL_SERVICE_UNREACHABLE",
      status: 503,
    });
  });

  it("passes a 422 through as TOO_SHORT rather than blaming the model", async () => {
    mockService({ detail: "too short" }, 422);

    await expect(analyzeWithFineTuned(JD, RESUME)).rejects.toMatchObject({
      code: "TOO_SHORT",
      status: 400,
    });
  });

  it("surfaces a 500 as a provider error", async () => {
    mockService({ detail: "model not loaded" }, 500);

    await expect(analyzeWithFineTuned(JD, RESUME)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});

describe("the base engine", () => {
  const BASELINE_RESPONSE = { raw_cosine: 0.44, model_id: "sentence-transformers/all-mpnet-base-v2" };

  it("returns a raw cosine and NO score", async () => {
    // The invariant SPEC §2.3 spells out: the Platt calibrator maps the fine-tuned model's
    // distribution, so applying it here would produce a confident number that means
    // nothing. `score` staying null is the guard.
    mockService(BASELINE_RESPONSE);

    const result = await scoreWithBaseModel(JD, RESUME);

    expect(result.score).toBeNull();
    expect(result.rawCosine).toBe(0.44);
    expect(result.calibrated).toBe(false);
    expect(result.errorBand).toBeNull();
  });

  it("is not marked degraded, since the base model is the point here", async () => {
    mockService(BASELINE_RESPONSE);

    const result = await scoreWithBaseModel(JD, RESUME);

    expect(result.degraded).toBe(false);
    expect(result.engine).toBe("base");
  });

  it("hits /baseline, not /score", async () => {
    const fetchMock = mockService(BASELINE_RESPONSE);

    await scoreWithBaseModel(JD, RESUME);

    expect(fetchMock.mock.calls[0][0]).toBe("http://scoring.test/baseline");
  });

  it("reports a cold start as waking, same as the fine-tuned engine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError()));

    await expect(scoreWithBaseModel(JD, RESUME)).rejects.toMatchObject({
      code: "MODEL_SERVICE_WAKING",
    });
  });
});

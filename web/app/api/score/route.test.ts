import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyzeError } from "@/lib/errors";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

const analyzeWithFineTuned = vi.fn();
const scoreWithBaseModel = vi.fn();
const analyzeWithClaude = vi.fn();
const analyzeWithKeywords = vi.fn();
const analyzeWithGemma = vi.fn();

vi.mock("@/lib/providers/finetuned", () => ({
  analyzeWithFineTuned: (...args: unknown[]) => analyzeWithFineTuned(...args),
}));
vi.mock("@/lib/providers/baseline", () => ({
  scoreWithBaseModel: (...args: unknown[]) => scoreWithBaseModel(...args),
}));
vi.mock("@/lib/providers/claude", () => ({
  analyzeWithClaude: (...args: unknown[]) => analyzeWithClaude(...args),
}));
vi.mock("@/lib/providers/keyword", () => ({
  analyzeWithKeywords: (...args: unknown[]) => analyzeWithKeywords(...args),
}));
vi.mock("@/lib/providers/gemma", () => ({
  analyzeWithGemma: (...args: unknown[]) => analyzeWithGemma(...args),
}));

const isPersistenceConfigured = vi.fn();
const getApplication = vi.fn();
const saveAnalysis = vi.fn();

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: () => isPersistenceConfigured(),
  getApplication: (...args: unknown[]) => getApplication(...args),
  saveAnalysis: (...args: unknown[]) => saveAnalysis(...args),
}));

import { POST } from "@/app/api/score/route";
import { resetRateLimit } from "@/lib/rate-limit";

const JD = "requirement ".repeat(60);
const RESUME = "experience ".repeat(60);

function result(overrides: Record<string, unknown> = {}) {
  return {
    engine: "finetuned",
    modelId: "dlepighe1/resume-jd-matcher-mpnet",
    score: 0.72,
    calibrated: true,
    rawCosine: 0.81,
    requirements: [],
    keywords: null,
    summary: null,
    suggestedBullets: null,
    errorBand: null,
    degraded: false,
    latencyMs: 812,
    analysisId: null,
    ...overrides,
  };
}

function score(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/score", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const VALID = { jobDescription: JD, resumeText: RESUME, engine: "finetuned" };
const APP_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimit();
  getUserIdOrNull.mockResolvedValue("user_123");
  isPersistenceConfigured.mockReturnValue(true);
  getApplication.mockResolvedValue(null);
  saveAnalysis.mockResolvedValue(null);
  analyzeWithFineTuned.mockResolvedValue(result());
  scoreWithBaseModel.mockResolvedValue(result({ engine: "base", score: null, calibrated: false }));
  analyzeWithClaude.mockResolvedValue(result({ engine: "claude", calibrated: false }));
  analyzeWithKeywords.mockReturnValue(result({ engine: "keyword", score: null, calibrated: false }));
  analyzeWithGemma.mockResolvedValue(result({ engine: "gemma", calibrated: false }));
  // Absent from vitest.config.ts on purpose, so an engine that needs a key has to say so.
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("one engine per request", () => {
  it("runs only the engine that was asked for, and never fans out", async () => {
    // SPEC §2.4: "runs one engine per request, on demand. Never fan out." The failure this
    // guards against costs money: a fan-out fires a paid Claude call on a request the user
    // made to run the free model.
    await score(VALID);

    expect(analyzeWithFineTuned).toHaveBeenCalledTimes(1);
    expect(scoreWithBaseModel).not.toHaveBeenCalled();
    expect(analyzeWithClaude).not.toHaveBeenCalled();
    expect(analyzeWithKeywords).not.toHaveBeenCalled();
  });

  it("never calls Claude unless Claude was explicitly selected", async () => {
    for (const engine of ["finetuned", "base", "keyword"]) {
      resetRateLimit();
      await score({ ...VALID, engine });
    }

    expect(analyzeWithClaude).not.toHaveBeenCalled();
  });

  it("routes each engine to its own provider", async () => {
    await score({ ...VALID, engine: "base" });
    expect(scoreWithBaseModel).toHaveBeenCalledTimes(1);

    await score({ ...VALID, engine: "keyword" });
    expect(analyzeWithKeywords).toHaveBeenCalledTimes(1);

    await score({ ...VALID, engine: "claude" });
    expect(analyzeWithClaude).toHaveBeenCalledTimes(1);

    await score({ ...VALID, engine: "gemma" });
    expect(analyzeWithGemma).toHaveBeenCalledTimes(1);
  });

  it("returns the engine result unchanged", async () => {
    const response = await score(VALID);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      engine: "finetuned",
      score: 0.72,
      calibrated: true,
      modelId: "dlepighe1/resume-jd-matcher-mpnet",
    });
  });
});

describe("calibration invariants", () => {
  it("never reports the base model as calibrated", async () => {
    // SPEC Part 7: "the calibrator is never applied to base-model output".
    const response = await score({ ...VALID, engine: "base" });

    const body = await response.json();
    expect(body.calibrated).toBe(false);
    expect(body.score).toBeNull();
  });

  it("passes a degraded flag through rather than rendering it as a normal score", async () => {
    // SPEC Part 7: "a degraded scoring service is reported, never rendered as a normal
    // score". The route must not drop this field on the way out.
    analyzeWithFineTuned.mockResolvedValue(result({ calibrated: false, degraded: true }));

    const body = await (await score(VALID)).json();

    expect(body.degraded).toBe(true);
    expect(body.calibrated).toBe(false);
  });
});

describe("input validation", () => {
  it("rejects a body that is not JSON", async () => {
    const response = await score("not json {");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_REQUEST" });
  });

  it("rejects an unknown engine", async () => {
    const response = await score({ ...VALID, engine: "openrouter" });

    expect(response.status).toBe(400);
    expect(analyzeWithFineTuned).not.toHaveBeenCalled();
  });

  it("refuses a pair that is too short, rather than scoring noise", async () => {
    const response = await score({ ...VALID, resumeText: "too short" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "TOO_SHORT" });
    expect(analyzeWithFineTuned).not.toHaveBeenCalled();
  });

  it("rejects an applicationId that is not a uuid", async () => {
    const response = await score({ ...VALID, applicationId: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect(analyzeWithFineTuned).not.toHaveBeenCalled();
  });
});

describe("saving against an application", () => {
  it("persists the analysis and returns its id", async () => {
    getApplication.mockResolvedValue({ id: APP_ID, userId: "user_123" });
    saveAnalysis.mockResolvedValue("analysis-1");

    const response = await score({ ...VALID, applicationId: APP_ID });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysisId).toBe("analysis-1");
    expect(saveAnalysis).toHaveBeenCalledWith(
      "user_123",
      APP_ID,
      expect.objectContaining({ engine: "finetuned", score: 0.72 }),
      expect.anything(),
    );
  });

  // 404, not 403. A 403 would confirm the id names a real application belonging to somebody,
  // which is enough to enumerate ids by status code.
  it("404s for an applicationId the caller does not own, and never scores it", async () => {
    getApplication.mockResolvedValue(null);

    const response = await score({ ...VALID, applicationId: APP_ID });

    expect(response.status).toBe(404);
    expect(analyzeWithFineTuned).not.toHaveBeenCalled();
    expect(saveAnalysis).not.toHaveBeenCalled();
  });

  it("401s when a guest sends an applicationId", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await score({ ...VALID, applicationId: APP_ID });

    expect(response.status).toBe(401);
    expect(saveAnalysis).not.toHaveBeenCalled();
  });

  it("503s when an applicationId is sent to a deployment with no database", async () => {
    isPersistenceConfigured.mockReturnValue(false);

    const response = await score({ ...VALID, applicationId: APP_ID });

    expect(response.status).toBe(503);
    expect(getApplication).not.toHaveBeenCalled();
  });

  /**
   * The score is the thing the user asked for. A database that refuses the write must not
   * turn a successful analysis into an error page, because the user would lose a result that was
   * computed correctly, and re-running it costs another model call.
   *
   * So the response is 200 with the result, `analysisId: null`, and a `saved: false` flag
   * saying plainly that it was not stored. Silently returning 200 as if it had been saved
   * would be worse than either.
   */
  it("returns the result when persisting fails, flagged as not saved", async () => {
    getApplication.mockResolvedValue({ id: APP_ID, userId: "user_123" });
    saveAnalysis.mockResolvedValue(null);

    const response = await score({ ...VALID, applicationId: APP_ID });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(0.72);
    expect(body.analysisId).toBeNull();
    expect(body.saved).toBe(false);
  });

  /**
   * The rule the whole career profile rests on. Tailoring exists to raise a score, so a
   * tailored run must be recorded as such, since otherwise Role Affinity reports the user as
   * strongest in whichever direction the product most recently helped them rewrite.
   */
  it("records a run as baseline by default", async () => {
    getApplication.mockResolvedValue({ id: APP_ID, userId: "user_123", role: "Data engineer" });
    saveAnalysis.mockResolvedValue("analysis-1");

    await score({ ...VALID, applicationId: APP_ID });

    expect(saveAnalysis).toHaveBeenCalledWith(
      "user_123",
      APP_ID,
      expect.anything(),
      expect.objectContaining({ isBaseline: true }),
    );
  });

  it("records a tailored run as not baseline, so it cannot inflate role affinity", async () => {
    getApplication.mockResolvedValue({ id: APP_ID, userId: "user_123", role: "Data engineer" });
    saveAnalysis.mockResolvedValue("analysis-1");

    await score({ ...VALID, applicationId: APP_ID, isBaseline: false });

    expect(saveAnalysis).toHaveBeenCalledWith(
      "user_123",
      APP_ID,
      expect.anything(),
      expect.objectContaining({ isBaseline: false }),
    );
  });

  // Denormalised at write time so affinity needs no join, and so the evidence about the
  // user outlives the application row it came from.
  it("stamps the role the analysis was against", async () => {
    getApplication.mockResolvedValue({ id: APP_ID, userId: "user_123", role: "Data engineer" });
    saveAnalysis.mockResolvedValue("analysis-1");

    await score({ ...VALID, applicationId: APP_ID });

    expect(saveAnalysis).toHaveBeenCalledWith(
      "user_123",
      APP_ID,
      expect.anything(),
      expect.objectContaining({ roleTitle: "Data engineer" }),
    );
  });

  it("does not touch the database when no applicationId was sent", async () => {
    await score(VALID);

    expect(getApplication).not.toHaveBeenCalled();
    expect(saveAnalysis).not.toHaveBeenCalled();
  });
});

describe("guest access", () => {
  it("lets a guest run the free engines", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await score(VALID);

    expect(response.status).toBe(200);
  });

  it("persists nothing for a guest", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const body = await (await score(VALID)).json();

    expect(body.analysisId).toBeNull();
  });

  it("refuses the paid engine to a guest", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await score({ ...VALID, engine: "claude" });

    expect(response.status).toBe(401);
    expect(analyzeWithClaude).not.toHaveBeenCalled();
  });

  /** Free to this deployment, not free to the shared daily allowance behind the key — which
   *  one anonymous caller could drain for everybody. */
  it("refuses the open-weights engine to a guest too", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await score({ ...VALID, engine: "gemma" });

    expect(response.status).toBe(401);
    expect(analyzeWithGemma).not.toHaveBeenCalled();
  });

  it("says which key is missing rather than failing at the provider", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const response = await score({ ...VALID, engine: "gemma" });

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ error: "NOT_CONFIGURED" });
    expect(analyzeWithGemma).not.toHaveBeenCalled();
  });

  it("drains the open-weights bucket without touching the free one", async () => {
    for (let i = 0; i < 16; i++) await score({ ...VALID, engine: "gemma" });
    expect((await score({ ...VALID, engine: "gemma" })).status).toBe(429);

    expect((await score(VALID)).status).toBe(200);
  });

  it("refuses a guest it cannot bucket, rather than waving them through", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/score", {
        method: "POST",
        body: JSON.stringify(VALID),
      }),
    );

    expect(response.status).toBe(429);
    expect(analyzeWithFineTuned).not.toHaveBeenCalled();
  });
});

describe("rate limiting", () => {
  it("refuses once the guest bucket is drained, and says when to retry", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    let response!: Response;
    for (let i = 0; i < 20; i++) response = await score(VALID);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toMatchObject({ error: "RATE_LIMITED" });
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(response.headers.get("Retry-After")).toBe(String(body.retryAfter));
  });

  it("buckets two different guests separately", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    for (let i = 0; i < 20; i++) await score(VALID, { "x-forwarded-for": "203.0.113.7" });

    const other = await score(VALID, { "x-forwarded-for": "198.51.100.4" });
    expect(other.status).toBe(200);
  });

  it("does not spend the free allowance on the Claude bucket", async () => {
    for (let i = 0; i < 45; i++) await score(VALID);
    expect((await score(VALID)).status).toBe(429);

    expect((await score({ ...VALID, engine: "claude" })).status).toBe(200);
  });
});

describe("engine failures", () => {
  it("surfaces a cold start as MODEL_SERVICE_WAKING with a retry hint", async () => {
    analyzeWithFineTuned.mockRejectedValue(
      new AnalyzeError("MODEL_SERVICE_WAKING", "waking", 503, 60),
    );

    const response = await score(VALID);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "MODEL_SERVICE_WAKING",
      retryAfter: 60,
      engine: "finetuned",
    });
  });

  it("keeps a Claude refusal distinct, so the UI does not offer a pointless retry", async () => {
    analyzeWithClaude.mockRejectedValue(new AnalyzeError("REFUSED", "declined", 422));

    const response = await score({ ...VALID, engine: "claude" });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "REFUSED" });
  });

  it("one engine failing leaves the others usable", async () => {
    // The one-engine-per-request form of SPEC Part 7's "one engine failing never blanks
    // the others": a dead scoring service must not take keyword coverage down with it.
    analyzeWithFineTuned.mockRejectedValue(
      new AnalyzeError("MODEL_SERVICE_UNREACHABLE", "down", 503),
    );

    expect((await score(VALID)).status).toBe(503);
    expect((await score({ ...VALID, engine: "keyword" })).status).toBe(200);
  });

  it("does not collapse an unexpected throw into a 200", async () => {
    analyzeWithFineTuned.mockRejectedValue(new Error("kaboom"));

    const response = await score(VALID);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "PROVIDER_ERROR" });
  });
});

describe("logging", () => {
  it("logs the engine, model and latency but never the input text", async () => {
    // SPEC Part 7: "Log engine, model id, latency, and outcome per analysis. Never log
    // input text." A resume in a log line is a resume in a log aggregator, forever.
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await score(VALID);

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("finetuned");
    expect(logged).toContain("latencyMs");
    expect(logged).not.toContain("requirement");
    expect(logged).not.toContain("experience");
  });

  it("does not log input text on the failure path either", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    analyzeWithFineTuned.mockRejectedValue(new AnalyzeError("PROVIDER_ERROR", "boom", 502));

    await score(VALID);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("requirement");
    expect(logged).not.toContain("experience");
  });
});

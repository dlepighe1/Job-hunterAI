/**
 * The rewrite endpoint, which had no test and now runs two engines.
 *
 * The behaviour worth pinning is the choice itself. Every branch here is one where picking
 * wrongly costs the user something real: money they did not agree to spend, an allowance
 * drained twice, or a confusing failure from inside a provider whose key was never set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyzeError } from "@/lib/errors";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

const tailorResume = vi.fn();
vi.mock("@/lib/providers/tailor", () => ({
  tailorResume: (...args: unknown[]) => tailorResume(...args),
}));

import { POST } from "@/app/api/tailor/route";
import { resetRateLimit } from "@/lib/rate-limit";

const JD = "requirement ".repeat(60);
const RESUME = "experience ".repeat(60);
const VALID = { jobDescription: JD, resumeText: RESUME, gaps: ["Kubernetes"] };

function tailor(body: unknown) {
  return POST(
    new Request("http://localhost/api/tailor", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimit();
  getUserIdOrNull.mockResolvedValue("user_123");
  tailorResume.mockResolvedValue({ changes: [], notAdded: [] });
  vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("choosing the engine", () => {
  /** What this endpoint has always done. Claude is the better rewriter, and defaulting to it
   *  changes nothing for a deployment that only has Claude. */
  it("defaults to Claude when no engine is named", async () => {
    await tailor(VALID);

    expect(tailorResume).toHaveBeenCalledWith(JD, RESUME, ["Kubernetes"], "claude");
  });

  it("honours an explicit choice", async () => {
    await tailor({ ...VALID, engine: "gemma" });

    expect(tailorResume).toHaveBeenCalledWith(JD, RESUME, ["Kubernetes"], "gemma");
  });

  /** The fallback exists so a deployment with only an OpenRouter key can still rewrite. It is
   *  a fallback and not a default: nothing here starts spending money that was not already
   *  being spent. */
  it("falls back to the open-weights engine when Claude is unconfigured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await tailor(VALID);

    expect(tailorResume).toHaveBeenCalledWith(JD, RESUME, ["Kubernetes"], "gemma");
  });

  it("never falls the other way, onto the engine that bills", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await tailor(VALID);

    expect(tailorResume).toHaveBeenCalledWith(JD, RESUME, ["Kubernetes"], "claude");
  });

  it("501s naming both keys when neither engine is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const response = await tailor(VALID);

    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toBe("NOT_CONFIGURED");
    expect(body.message).toContain("ANTHROPIC_API_KEY");
    expect(body.message).toContain("OPENROUTER_API_KEY");
    expect(tailorResume).not.toHaveBeenCalled();
  });

  /** Asking for an engine this deployment cannot run should say which key is missing, rather
   *  than failing inside a provider that is about to read an empty string. */
  it.each([
    ["claude", "ANTHROPIC_API_KEY"],
    ["gemma", "OPENROUTER_API_KEY"],
  ])("501s when %s is asked for without its key", async (engine, variable) => {
    vi.stubEnv(variable, "");

    const response = await tailor({ ...VALID, engine });

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ message: expect.stringContaining(variable) });
    expect(tailorResume).not.toHaveBeenCalled();
  });

  it("rejects an engine that cannot write prose", async () => {
    const response = await tailor({ ...VALID, engine: "keyword" });

    expect(response.status).toBe(400);
    expect(tailorResume).not.toHaveBeenCalled();
  });
});

describe("who may spend the allowance", () => {
  it("401s a guest, whichever engine they name", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await tailor(VALID)).status).toBe(401);
    expect((await tailor({ ...VALID, engine: "gemma" })).status).toBe(401);
    expect(tailorResume).not.toHaveBeenCalled();
  });

  /**
   * A rewrite is one call of the same kind the matcher makes, against the same allowance, so
   * it drains the same bucket. A private bucket for tailoring would let one user spend the
   * deployment's Claude budget twice over.
   */
  it("shares the Claude bucket with the scoring engine", async () => {
    for (let i = 0; i < 8; i++) await tailor(VALID);

    const response = await tailor(VALID);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "RATE_LIMITED" });
  });

  it("drains the open-weights bucket separately from Claude's", async () => {
    for (let i = 0; i < 16; i++) await tailor({ ...VALID, engine: "gemma" });
    expect((await tailor({ ...VALID, engine: "gemma" })).status).toBe(429);

    // Claude's allowance is untouched by a user exhausting the free one.
    expect((await tailor({ ...VALID, engine: "claude" })).status).toBe(200);
  });
});

describe("failures", () => {
  it("passes a provider error through with its code", async () => {
    tailorResume.mockRejectedValue(new AnalyzeError("INVALID_OUTPUT", "unreadable", 502));

    const response = await tailor(VALID);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_OUTPUT" });
  });

  it("refuses text too short to be worth a call", async () => {
    const response = await tailor({ jobDescription: "too short", resumeText: RESUME });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "TOO_SHORT" });
    expect(tailorResume).not.toHaveBeenCalled();
  });
});

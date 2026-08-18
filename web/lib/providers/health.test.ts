import { afterEach, describe, expect, it, vi } from "vitest";

import { checkScoringService } from "@/lib/providers/health";

const HEALTHY = {
  status: "ok",
  model_id: "dlepighe1/resume-jd-matcher-mpnet",
  calibrator: "platt",
  fine_tuned: true,
};

function mockHealth(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("a healthy service", () => {
  it("reports the model id and calibrator", async () => {
    mockHealth(HEALTHY);

    const health = await checkScoringService();

    expect(health).toEqual({
      reachable: true,
      modelId: "dlepighe1/resume-jd-matcher-mpnet",
      calibrator: "platt",
      fineTuned: true,
    });
  });

  it("asks the configured service, not a hardcoded host", async () => {
    const fetchMock = mockHealth(HEALTHY);

    await checkScoringService();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://scoring.test/health",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});

describe("degraded states", () => {
  it("reports fine_tuned:false, the failure that otherwise looks like success", async () => {
    mockHealth({ ...HEALTHY, fine_tuned: false, calibrator: null });

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: true, fineTuned: false, calibrator: null });
  });

  it("treats a missing fine_tuned flag as degraded rather than healthy", async () => {
    // An older service that predates the flag cannot confirm it loaded the fine-tuned
    // weights. Defaulting that to `true` is how a silent fallback stays silent.
    const withoutFlag: Record<string, unknown> = { ...HEALTHY };
    delete withoutFlag.fine_tuned;
    mockHealth(withoutFlag);

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: true, fineTuned: false });
  });
});

describe("unreachable states", () => {
  it("distinguishes a cold start from a broken service", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: false, reason: "waking" });
  });

  it("reports a refused connection as unreachable, not as waking", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: false, reason: "unreachable" });
  });

  it("reports a non-200 as unreachable", async () => {
    mockHealth({ detail: "model not loaded" }, 500);

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: false, reason: "unreachable" });
  });

  it("survives a body that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 200 })),
    );

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: false, reason: "unreachable" });
  });

  it("says so when the service is not configured, without attempting a request", async () => {
    vi.stubEnv("SCORING_SERVICE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const health = await checkScoringService();

    expect(health).toMatchObject({ reachable: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

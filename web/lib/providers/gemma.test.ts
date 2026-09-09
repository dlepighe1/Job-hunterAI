/**
 * The open-weights engine, whose whole risk surface is the absence of a guarantee.
 *
 * The Claude provider is called with `zodOutputFormat`, so its output cannot violate the
 * schema and there is nothing to test about parsing. This one is handed free-form text by a
 * model that was merely *asked* to produce JSON, which makes the parse — and the exact point
 * at which it gives up rather than guessing — the part worth pinning down.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeWithGemma } from "@/lib/providers/gemma";
import { analysisSchema } from "@/lib/schema";

const PAYLOAD = {
  matchScore: 72,
  summary: "Strong Python and pipeline evidence, no Kubernetes anywhere in the resume.",
  matchedSkills: ["Python", "Airflow"],
  missingSkills: ["Kubernetes"],
  strengths: ["Built and owned a daily ETL pipeline end to end."],
  suggestedBullets: ["Owned a daily Airflow pipeline moving 40M rows into Snowflake."],
};

const JD = "requirement ".repeat(60);
const RESUME = "experience ".repeat(60);

/** One OpenRouter chat-completions response carrying `content` as the assistant text. */
function reply(content: string, init: ResponseInit = {}) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
    { status: 200, ...init },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analyzeWithGemma", () => {
  it("returns a normalized result from a clean response", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    const result = await analyzeWithGemma(JD, RESUME);

    expect(result.engine).toBe("gemma");
    expect(result.modelId).toBe("google/gemma-4-31b-it:free");
    // The prompt asks for 0-100 and this codebase is 0-1 everywhere but display.
    expect(result.score).toBeCloseTo(0.72);
    expect(result.summary).toBe(PAYLOAD.summary);
    expect(result.suggestedBullets).toEqual(PAYLOAD.suggestedBullets);
  });

  /**
   * SPEC Appendix B. The number is a language model's opinion, and presenting it as
   * calibrated would put it on the same footing as a score fitted to labelled data.
   */
  it("never claims the score is calibrated", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    const result = await analyzeWithGemma(JD, RESUME);

    expect(result.calibrated).toBe(false);
    expect(result.rawCosine).toBeNull();
    expect(result.errorBand).toBeNull();
  });

  /** A language model is not asked for per-requirement similarity. Numbers that looked like
   *  the fine-tuned model's would not mean the same thing. */
  it("invents no requirement coverage", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    expect((await analyzeWithGemma(JD, RESUME)).requirements).toEqual([]);
  });

  it("uses OPENROUTER_MODEL when it is set", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free");
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    const result = await analyzeWithGemma(JD, RESUME);

    expect(result.modelId).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    );
  });

  /**
   * Half of Claude's guarantee, and the half the free tier offers. JSON mode makes the reply
   * parse; `require_parameters` stops OpenRouter routing to a provider that would ignore the
   * request and quietly turn the guarantee back into a hope.
   */
  it("asks for JSON mode, and only from providers that honour it", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    await analyzeWithGemma(JD, RESUME);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("sends the key as a bearer token and nothing else about the caller", async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(PAYLOAD)));

    await analyzeWithGemma(JD, RESUME);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer openrouter-test-key");
  });

  describe("parsing what an unconstrained model actually returns", () => {
    it("strips a markdown fence", async () => {
      fetchMock.mockResolvedValue(reply("```json\n" + JSON.stringify(PAYLOAD) + "\n```"));

      expect((await analyzeWithGemma(JD, RESUME)).score).toBeCloseTo(0.72);
    });

    it("survives a sentence of preamble", async () => {
      fetchMock.mockResolvedValue(
        reply(`Sure! Here is the analysis:\n\n${JSON.stringify(PAYLOAD)}\n\nHope that helps.`),
      );

      expect((await analyzeWithGemma(JD, RESUME)).score).toBeCloseTo(0.72);
    });

    it("clamps a score outside the range it asked for", async () => {
      fetchMock.mockResolvedValue(reply(JSON.stringify({ ...PAYLOAD, matchScore: 140 })));

      expect((await analyzeWithGemma(JD, RESUME)).score).toBe(1);
    });

    /** Valid JSON that is not the agreed shape is a failure, not something to coerce.
     *  Filling in a missing field would be the product inventing content. */
    it("rejects JSON that does not match the schema", async () => {
      fetchMock.mockImplementation(async () => reply(JSON.stringify({ matchScore: 72 })));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "INVALID_OUTPUT",
      });
    });
  });

  describe("the repair attempt", () => {
    it("asks once more when the first answer does not parse", async () => {
      fetchMock
        .mockResolvedValueOnce(reply("I think this candidate is a good fit, roughly 72%."))
        .mockResolvedValueOnce(reply(JSON.stringify(PAYLOAD)));

      const result = await analyzeWithGemma(JD, RESUME);

      expect(result.score).toBeCloseTo(0.72);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The broken output goes back with the correction request, or the model is being asked
      // to fix something it cannot see.
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content).toContain(
        "roughly 72%",
      );
    });

    /** Exactly one. Each attempt costs the user another wait on a queued free endpoint, and
     *  a model that cannot produce the shape twice will not produce it on the third ask. */
    it("gives up after one repair rather than looping", async () => {
      fetchMock.mockImplementation(async () => reply("still not JSON"));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "INVALID_OUTPUT",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("failures the user can act on", () => {
    it("blames the configuration for a rejected key, not the user", async () => {
      fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "CONFIG_ERROR",
        status: 500,
      });
    });

    it("reports a quota as retryable, with the wait", async () => {
      fetchMock.mockResolvedValue(
        new Response("slow down", { status: 429, headers: { "retry-after": "45" } }),
      );

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "RATE_LIMITED",
        retryAfter: 45,
      });
    });

    /**
     * The 429 a fresh key hits on its very first call. Every free caller shares one pool at
     * the provider, and when it is saturated nothing about this deployment is wrong — so a
     * message about the key being used up sends the user to fix something that is not broken.
     */
    it("does not blame the key when the provider pool is the thing that is busy", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 429, metadata: { limit_source: "upstream_provider_shared_pool" } },
          }),
          { status: 429 },
        ),
      );

      const error = await analyzeWithGemma(JD, RESUME).catch((thrown) => thrown);

      expect(error.code).toBe("RATE_LIMITED");
      expect(error.message).toContain("busy upstream");
      expect(error.message).toContain("Your key is fine");
    });

    it("names the model when it does not exist, since free ids come and go", async () => {
      fetchMock.mockResolvedValue(new Response("no such model", { status: 404 }));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "CONFIG_ERROR",
      });
    });

    /** A ":free" id asking for credit means the id stopped being free, which is a
     *  configuration fact rather than a transient one. */
    it("distinguishes a request for credit from a rate limit", async () => {
      fetchMock.mockResolvedValue(new Response("payment required", { status: 402 }));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "NOT_CONFIGURED",
      });
    });

    /**
     * A free endpoint queues behind paid traffic, so slow is load rather than an outage.
     * `MODEL_SERVICE_WAKING` is the code `isRetryable` treats as worth offering a retry for.
     */
    it("treats a timeout as waking, not as a dead service", async () => {
      const timeout = new Error("timed out");
      timeout.name = "TimeoutError";
      fetchMock.mockRejectedValue(timeout);

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "MODEL_SERVICE_WAKING",
        retryAfter: 30,
      });
    });

    it("surfaces an empty choice with its finish_reason", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: {}, finish_reason: "length" }] })),
      );

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "INVALID_OUTPUT",
        message: expect.stringContaining("length"),
      });
    });

    it("does not retry a failed call as though it were a bad parse", async () => {
      fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

      await expect(analyzeWithGemma(JD, RESUME)).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The drift guard that pays for writing the JSON contract out by hand.
   *
   * The prompt describes the shape in prose because that is what a 27B open-weights model
   * follows best, but `analysisSchema` is what validates the reply. A field added to the
   * schema and not to the prompt would make every response fail validation, twice, and
   * surface as "the model is bad at JSON".
   */
  it("names every schema field in the prompt it sends", () => {
    const source = readFileSync(join(__dirname, "gemma.ts"), "utf8");
    const instruction = source.slice(
      source.indexOf("const JSON_INSTRUCTION"),
      source.indexOf("export async function analyzeWithGemma"),
    );

    expect(instruction.length).toBeGreaterThan(0);
    for (const field of Object.keys(analysisSchema.shape)) {
      expect(instruction, `${field} is validated but never asked for`).toContain(field);
    }
  });
});

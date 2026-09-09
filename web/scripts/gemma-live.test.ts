/**
 * One real call to the open-weights engine, so its output can be READ rather than assumed.
 *
 *     npx vitest run --config vitest.live.config.ts
 *
 * Opt-in twice over: it is outside the offline suite, like every spec under `scripts/`, and
 * it skips itself entirely unless OPENROUTER_API_KEY is set. Running the live database suite
 * without that key therefore costs nothing and changes nothing.
 *
 * `gemma.test.ts` already pins the contract — the parse, the repair, the error mapping — with
 * a mocked `fetch`, and a mock proves nothing about whether a 27B open-weights model actually
 * follows a six-field JSON instruction, or whether its summary is worth showing a person.
 * That question cannot be answered by an assertion, so this makes the call, checks the shape
 * it must satisfy, and PRINTS the result for a human to judge.
 *
 * **The pair it scores is synthetic.** `RESUME_TEXT` in `lib/dev-fixtures.ts` belongs to a
 * person who does not exist. Free OpenRouter endpoints generally require opting in to prompt
 * logging, and a résumé carries a home address and a phone number, so the document sent here
 * is deliberately one that nobody has to consent to sharing.
 */

import { describe, expect, it } from "vitest";

import { RESUME_TEXT, SAMPLE_POSTING } from "../lib/dev-fixtures";
import { env } from "../lib/env";
import { analyzeWithGemma } from "../lib/providers/gemma";

const configured = Boolean(process.env.OPENROUTER_API_KEY?.trim());

/**
 * Does the configured model still exist?
 *
 * Needs no key — OpenRouter's catalogue is public — so this runs even when the call below
 * skips. It is here because free ids are genuinely unstable: this engine shipped pointing at
 * `google/gemma-3-27b-it:free`, which OpenRouter does not serve. The 3-series is paid now and
 * the free Gemma endpoints are the 4-series. Without this, the next such disappearance is a
 * 404 in the middle of somebody's analysis instead of a red line here.
 */
describe("the configured OpenRouter model", () => {
  it("is one OpenRouter actually serves", async () => {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    expect(response.ok, "could not reach OpenRouter's model catalogue").toBe(true);

    const { data } = (await response.json()) as { data: { id: string }[] };
    const ids = data.map((model) => model.id);

    expect(ids, `${env.openRouter.model} is not in OpenRouter's catalogue`).toContain(
      env.openRouter.model,
    );
  });

  /** The engine exists to cost nothing. A paid id here would bill on every analysis, and the
   *  UI would still be calling it free. */
  it("costs nothing per token", async () => {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    const { data } = (await response.json()) as {
      data: { id: string; pricing?: { prompt?: string; completion?: string } }[];
    };
    const model = data.find((row) => row.id === env.openRouter.model);

    expect(Number(model?.pricing?.prompt ?? 1), "prompt tokens are billed").toBe(0);
    expect(Number(model?.pricing?.completion ?? 1), "completion tokens are billed").toBe(0);
  });
});

describe.skipIf(!configured)("the open-weights engine, against the real endpoint", () => {
  it("scores a synthetic pair and returns something worth reading", async () => {
    const result = await analyzeWithGemma(SAMPLE_POSTING, RESUME_TEXT);

    // The contract the rest of the app depends on. Everything else here is for the reader.
    expect(result.engine).toBe("gemma");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.calibrated, "an LLM score is never calibrated").toBe(false);
    expect(result.summary?.length ?? 0, "no summary means no reason to use this engine").toBeGreaterThan(0);
    expect(result.requirements, "requirement coverage is not this engine's to claim").toEqual([]);

    console.info(
      [
        "",
        `  model      ${result.modelId}`,
        `  latency    ${(result.latencyMs / 1000).toFixed(1)}s`,
        `  score      ${(result.score ?? 0) * 100} / 100  (uncalibrated)`,
        "",
        "  summary",
        `    ${result.summary?.replace(/\n/g, "\n    ")}`,
        "",
        "  suggested bullets",
        ...(result.suggestedBullets ?? []).map((bullet) => `    - ${bullet}`),
        "",
        "  Judge this against what Claude returns for the same pair before deciding the",
        "  generative path is finished. The shape passing is not the same as the words being",
        "  worth showing someone.",
        "",
      ].join("\n"),
    );
  });
});

describe.skipIf(configured)("the open-weights engine", () => {
  it("is skipped, because OPENROUTER_API_KEY is not set", () => {
    // A silent skip looks exactly like a pass in CI output, so it says which key is missing.
    expect(configured).toBe(false);
  });
});

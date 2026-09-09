import type { ZodType } from "zod";

import { env } from "@/lib/env";
import { AnalyzeError } from "@/lib/errors";

/**
 * Talking to OpenRouter, and getting a schema-shaped object back from a model that is not
 * obliged to produce one.
 *
 * Split out of `gemma.ts` when the résumé rewriter needed the same thing. Two flows now send
 * a prompt and expect structured JSON — scoring, and tailoring — and the interesting part is
 * identical for both: JSON mode, one repair attempt, and the exact point at which it stops
 * guessing. That rule is worth having in one place. The prompts and the schemas are not, and
 * stay with the flows that own them.
 *
 * The contract is deliberately weaker than the Anthropic path's. Claude is called with
 * `zodOutputFormat`, which constrains decoding so the schema cannot be violated. Here:
 *
 *   - `response_format: json_object` guarantees the reply PARSES. Free Gemma endpoints
 *     support this, so the fence-and-preamble failures are gone.
 *   - `structured_outputs` — strict JSON Schema, the real equivalent — is supported by every
 *     PAID Gemma endpoint and by no free one, so the FIELDS are not guaranteed and the zod
 *     validation below is what actually enforces them.
 *
 * If this ever points at a paid model, requesting `json_schema` here would make the repair
 * path dead code. That is the whole difference.
 *
 * No SDK: OpenRouter speaks the OpenAI chat-completions shape over plain HTTP, and one
 * `fetch` is smaller than a dependency to pin, audit and update.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Free endpoints queue behind paid traffic, so a slow answer is normal rather than a fault.
 * Set below the routes' `maxDuration` of 120s: a timeout this side produces a message that
 * names the model, where the platform's produces a blank 504.
 */
const TIMEOUT_MS = 90_000;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface JsonRequest<T> {
  /** The task prompt. The shape instruction is appended to it, not folded into it. */
  system: string;
  user: string;
  /** How the JSON must look, in prose with an example. Sent again, alone, on the repair. */
  shapeInstruction: string;
  schema: ZodType<T>;
  maxTokens: number;
  /** Names the flow in the failure message, so "it came back unreadable" says which "it". */
  label: string;
}

/**
 * One structured answer, or an `AnalyzeError` the routes already know how to render.
 *
 * The repair is attempted exactly once. A model handed its own broken output and told what is
 * wrong, that still cannot produce the shape, will not produce it on the third ask either,
 * and every attempt costs the user another wait on a queued free endpoint.
 */
export async function completeJson<T>(request: JsonRequest<T>): Promise<T> {
  const model = env.openRouter.model;

  const first = await chat(
    model,
    [
      { role: "system", content: `${request.system}\n\n${request.shapeInstruction}` },
      { role: "user", content: request.user },
    ],
    request.maxTokens,
  );

  let parsed = validate(first, request.schema);

  if (parsed === null) {
    const repaired = await chat(
      model,
      [
        { role: "system", content: request.shapeInstruction },
        {
          role: "user",
          content: `This was supposed to be the JSON object described above, and it does not parse or does not match the shape. Return the corrected JSON object only.\n\n${first}`,
        },
      ],
      request.maxTokens,
    );
    parsed = validate(repaired, request.schema);
  }

  if (parsed === null) {
    throw new AnalyzeError(
      "INVALID_OUTPUT",
      `${model} did not return the expected JSON shape for the ${request.label}, and did not correct it when asked. Open-weights models on free endpoints are not held to a schema the way the Claude engine is.`,
      502,
    );
  }

  return parsed;
}

/** One call, returning the assistant's raw text. */
async function chat(model: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openRouter.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        // Low but not zero. Both flows want the model to commit — to a number, or to a
        // specific rewrite — rather than hedge toward the safest middle.
        temperature: 0.2,
        max_tokens: maxTokens,
        // Guarantees the reply parses. See the header for what it does not guarantee.
        response_format: { type: "json_object" },
        // Route only to providers that honour the parameters above. Without it, a provider
        // that ignores response_format can serve the request and JSON mode quietly becomes a
        // suggestion, which is the worst version of this.
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AnalyzeError(
        "MODEL_SERVICE_WAKING",
        `${model} did not answer within ${TIMEOUT_MS / 1000}s. Free OpenRouter endpoints queue behind paid traffic, so this is usually load rather than an outage.`,
        504,
        30,
      );
    }
    throw new AnalyzeError("PROVIDER_ERROR", "Could not reach OpenRouter.", 502);
  }

  if (!response.ok) throw statusError(response, model, await safeText(response));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AnalyzeError("PROVIDER_ERROR", "OpenRouter returned a non-JSON response.", 502);
  }

  const content = (body as OpenRouterResponse)?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    // An empty choice is how a content filter or a truncated stream arrives here. Surfaced,
    // never retried silently (SPEC §4).
    const reason = (body as OpenRouterResponse)?.choices?.[0]?.finish_reason ?? "none given";
    throw new AnalyzeError(
      "INVALID_OUTPUT",
      `${model} returned no content (finish_reason: ${reason}).`,
      502,
    );
  }
  return content;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  error?: { message?: string };
}

/** HTTP status to a code the UI can act on. The distinction that matters is a key problem,
 *  which is the deployment's fault, against a quota, which the user can wait out. */
function statusError(response: Response, model: string, text: string): AnalyzeError {
  if (response.status === 401 || response.status === 403) {
    // Blames the configuration, not the user (SPEC §4).
    return new AnalyzeError(
      "CONFIG_ERROR",
      "The OpenRouter API key was rejected. This is a server configuration problem, not something you did. Check OPENROUTER_API_KEY.",
      500,
    );
  }
  if (response.status === 402) {
    return new AnalyzeError(
      "NOT_CONFIGURED",
      `${model} is asking this account for credit. A ":free" model id should never do that — check OPENROUTER_MODEL still names a free endpoint.`,
      402,
    );
  }
  if (response.status === 404) {
    return new AnalyzeError(
      "CONFIG_ERROR",
      `Model "${model}" was not found on OpenRouter. Check OPENROUTER_MODEL. Free model ids change as providers come and go.`,
      500,
    );
  }
  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const retryAfter = header ? Number(header) : 60;

    /**
     * Two different 429s wear the same status, and telling a user the wrong one wastes their
     * time. `limit_source` distinguishes them:
     *
     *   upstream_provider_shared_pool  every free caller shares one pool at the provider and
     *                                  it is busy. Nothing about this deployment is wrong and
     *                                  nothing is exhausted — it clears on its own.
     *   anything else                  this key's own allowance, which waiting does not
     *                                  refill until the window rolls over.
     *
     * The first is the common one on free endpoints and it is what a fresh key hits on its
     * very first call, which is exactly when a message blaming the key does the most damage.
     */
    const upstream = upstreamPool(text);
    return new AnalyzeError(
      "RATE_LIMITED",
      upstream
        ? `${model} is busy upstream: every free caller shares one pool at the provider and it is saturated right now. Your key is fine and nothing is used up. Retry in a minute, or use Claude or the engines that need no allowance.`
        : `${model} is rate limiting this key. Free endpoints have a small daily allowance; the engines that need no allowance still work.`,
      429,
      Number.isFinite(retryAfter) ? retryAfter : 60,
    );
  }
  return new AnalyzeError(
    "PROVIDER_ERROR",
    `OpenRouter error ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}.`,
    502,
  );
}

/**
 * Whether a 429 body says the provider's shared free pool is busy, rather than this key
 * being spent. Read defensively: an error body is the least stable thing an API returns, and
 * failing to classify it must degrade to the generic message, never throw over the real one.
 */
function upstreamPool(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as {
      error?: { metadata?: { limit_source?: unknown } };
    };
    return parsed?.error?.metadata?.limit_source === "upstream_provider_shared_pool";
  } catch {
    return false;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * The model's text to a validated value, or null.
 *
 * Two tolerances, and no more. A fenced block is stripped, because "```json" before the
 * object is the most common way an instructed model disobeys "nothing else". The outermost
 * braces are then taken, which covers a sentence of preamble. Anything past that is a model
 * that did not follow the instruction, and guessing harder at what it meant is how a parser
 * starts inventing content — the one thing this product must not do.
 */
export function validate<T>(raw: string, schema: ZodType<T>): T | null {
  const withoutFence = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }

  const result = schema.safeParse(candidate);
  return result.success ? result.data : null;
}

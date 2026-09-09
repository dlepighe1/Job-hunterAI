/**
 * The rewrite provider, exercised through the engine that has no schema guarantee.
 *
 * The grounding filter is the reason this file exists. A résumé is a factual claim a person
 * makes to an employer, so a proposed change that quotes text the résumé does not contain is
 * not a formatting problem — it is the shape a fabricated edit takes. That filter used to sit
 * inside the Claude path; it now sits in `tailorResume` and covers both engines, which
 * matters because the open-weights one is the likelier of the two to invent a sentence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tailorResume } from "@/lib/providers/tailor";

const RESUME = [
  "Built and owned a daily ETL pipeline moving 40M rows into Snowflake.",
  "Mentored two junior engineers through their first on-call rotation.",
].join("\n");

const JD = "We need someone who has run production data pipelines. ".repeat(6);

function change(overrides: Record<string, unknown> = {}) {
  return {
    section: "Experience",
    kind: "rewrite",
    original: "Built and owned a daily ETL pipeline moving 40M rows into Snowflake.",
    proposed: "Owned a daily Airflow ETL pipeline moving 40M rows into Snowflake.",
    reason: "The posting names Airflow twice.",
    ...overrides,
  };
}

/** One OpenRouter chat-completions response carrying `content` as the assistant text. */
function reply(payload: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: "stop" }],
    }),
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("tailorResume with the open-weights engine", () => {
  it("returns changes that quote the résumé", async () => {
    fetchMock.mockResolvedValue(reply({ changes: [change()], notAdded: ["Kubernetes"] }));

    const result = await tailorResume(JD, RESUME, ["Airflow"], "gemma");

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].proposed).toContain("Airflow");
    expect(result.notAdded).toEqual(["Kubernetes"]);
  });

  /**
   * The assertion that matters most in this file. A change the candidate cannot locate in
   * their own résumé is one they cannot verify, and letting it through would put a sentence
   * they never wrote in front of an employer.
   */
  it("drops a change whose original is not in the résumé", async () => {
    fetchMock.mockResolvedValue(
      reply({
        changes: [
          change(),
          change({
            original: "Led a team of twelve engineers across three time zones.",
            proposed: "Led twelve engineers across three time zones, delivering on schedule.",
          }),
        ],
        notAdded: [],
      }),
    );

    const result = await tailorResume(JD, RESUME, [], "gemma");

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].original).toContain("ETL pipeline");
  });

  it("keeps nothing at all when nothing is grounded", async () => {
    fetchMock.mockResolvedValue(
      reply({
        changes: [change({ original: "Holds an active security clearance." })],
        notAdded: [],
      }),
    );

    const result = await tailorResume(JD, RESUME, [], "gemma");

    expect(result.changes).toEqual([]);
    // The gap list is the model's honest output and survives: it is what the candidate is
    // asked to supply themselves.
    expect(result.notAdded).toEqual([]);
  });

  it("asks the free engine for JSON, since nothing constrains its output", async () => {
    fetchMock.mockResolvedValue(reply({ changes: [], notAdded: [] }));

    await tailorResume(JD, RESUME, [], "gemma");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
    // A rewrite is several times longer than an analysis: twelve changes, each quoting an
    // original and a replacement.
    expect(body.max_tokens).toBe(8192);
  });

  /**
   * The safety rules must reach whichever engine runs. They live in the shared system prompt
   * rather than in the per-engine shape instruction, so this checks the prompt that actually
   * goes over the wire, not the constant it was built from.
   */
  it("sends the never-invent rules to the open-weights engine too", async () => {
    fetchMock.mockResolvedValue(reply({ changes: [], notAdded: [] }));

    await tailorResume(JD, RESUME, [], "gemma");

    const system = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(system).toContain("WHAT YOU MUST NEVER DO");
    expect(system).toContain("notAdded");
  });
});

/**
 * The drift guard. The shape is described in prose because that is what an open-weights model
 * follows; `tailorSchema` is what validates the reply. A field in one and not the other makes
 * every response fail validation twice and surface as "the model is bad at JSON".
 */
describe("the JSON contract", () => {
  it("names every field the schema requires", () => {
    const source = readFileSync(join(__dirname, "tailor.ts"), "utf8");
    const instruction = source.slice(
      source.indexOf("const TAILOR_JSON_INSTRUCTION"),
      source.indexOf("export type TailorEngine"),
    );

    expect(instruction.length).toBeGreaterThan(0);
    for (const field of ["changes", "notAdded", "section", "kind", "original", "proposed", "reason"]) {
      expect(instruction, `${field} is validated but never asked for`).toContain(field);
    }
  });
});

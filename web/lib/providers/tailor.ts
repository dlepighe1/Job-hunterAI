import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { env } from "@/lib/env";
import { AnalyzeError } from "@/lib/errors";

/**
 * Rewrite a résumé for one posting, without inventing anything.
 *
 * **The safety rule is the entire design of this file.** A résumé is a factual claim a
 * person makes about themselves to an employer. A tool that quietly adds a job, a
 * certification, a metric or a technology has not helped them. It has written them a lie
 * they will have to defend in an interview, and in a background check.
 *
 * So the model is constrained three ways, deliberately overlapping:
 *
 *   1. The system prompt states the prohibition in terms of what it may do (rewrite,
 *      reorder, emphasise, condense) rather than only what it may not. Negative-only
 *      constraints get ignored under pressure to be helpful.
 *   2. The output is a list of discrete CHANGES, each naming the original text and its
 *      replacement, rather than a wholesale new document. A rewrite that cannot point at
 *      what it replaced cannot be reviewed, and an unreviewable rewrite is the failure mode.
 *   3. Every change lands in the UI as a proposal the user accepts or rejects one at a
 *      time. Nothing is applied on the user's behalf.
 *
 * The master résumé is never modified here. This returns proposed changes; persisting a
 * tailored version is a separate, explicit act.
 */

const changeSchema = z.object({
  /** Which part of the résumé this touches, in the user's own section vocabulary. */
  section: z.string().max(120),
  kind: z.enum(["rewrite", "reorder", "condense", "emphasise"]),
  /** The exact original text, so the UI can show what is being replaced and the user can
   *  verify the model is not silently editing something else. */
  original: z.string().max(2000),
  proposed: z.string().max(2000),
  /** Why, in terms of the posting. */
  reason: z.string().max(400),
});

const tailorSchema = z.object({
  changes: z.array(changeSchema).max(12),
  /** Anything the model wanted to claim but had no evidence for. Surfaced to the user as a
   *  prompt to supply it themselves, which is the honest version of the gap it found. */
  notAdded: z.array(z.string().max(200)).max(8),
});

export type TailorChange = z.infer<typeof changeSchema>;
export type TailorResult = z.infer<typeof tailorSchema>;

const SYSTEM_PROMPT = `You rewrite résumé text so that experience the candidate ALREADY HAS is easier for a specific employer to find.

WHAT YOU MAY DO
- Rewrite a sentence or bullet to lead with the outcome, or to use the posting's terminology for a thing the résumé already describes in different words.
- Reorder bullets or skills so the most relevant appear first.
- Condense filler so the relevant content is not buried.
- Make an existing, stated accomplishment more specific USING ONLY facts already present in the résumé.

WHAT YOU MUST NEVER DO
- Never add an employer, job title, date, school, degree, certification, or clearance.
- Never add a technology, tool, language or framework that does not already appear in the résumé.
- Never add a number, percentage, team size, revenue figure, or duration that is not already in the résumé.
- Never convert a vague statement into a specific one by choosing the specifics yourself.
- Never claim seniority, scope or ownership the résumé does not state.

If the posting requires something the résumé does not evidence, DO NOT write it in. Put it in "notAdded" instead. That list is shown to the candidate so they can supply the real detail if they have it, since an omission they can fill is useful, an invention they must defend is not.

Each change must quote the ORIGINAL text exactly as it appears in the résumé, so the candidate can see precisely what you propose to replace. Propose at most 12 changes: the highest-value ones, not every sentence.`;

function userPrompt(jobDescription: string, resumeText: string, gaps: string[]): string {
  return [
    "JOB POSTING:",
    jobDescription,
    "",
    "CANDIDATE'S RÉSUMÉ:",
    resumeText,
    "",
    gaps.length > 0
      ? `The analysis flagged these as gaps: ${gaps.join(", ")}. Where the résumé already contains relevant evidence expressed differently, surface it. Where it genuinely does not, list the gap in notAdded rather than writing it in.`
      : "Surface the most relevant existing experience for this posting.",
  ].join("\n");
}

export async function tailorResume(
  jobDescription: string,
  resumeText: string,
  gaps: string[],
): Promise<TailorResult> {
  const client = new Anthropic({ apiKey: env.anthropic.apiKey });

  let message;
  try {
    message = await client.messages.parse({
      model: env.anthropic.model,
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(tailorSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(jobDescription, resumeText, gaps) }],
    });
  } catch (error) {
    throw toAnalyzeError(error);
  }

  if (message.stop_reason === "refusal") {
    throw new AnalyzeError(
      "REFUSED",
      "Claude declined to rewrite this content. Retrying will not help, so try different text.",
      422,
    );
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new AnalyzeError("INVALID_OUTPUT", "The rewrite came back unreadable.", 502);
  }

  /**
   * The last line of defence: drop any change whose `original` is not actually in the
   * résumé.
   *
   * A change that cannot be located is one the user cannot verify, and it is also the
   * shape a hallucinated edit takes, the model inventing a sentence to "improve". The
   * prompt forbids it and the schema cannot express the constraint, so it is checked here.
   */
  const grounded = parsed.changes.filter((change) => resumeText.includes(change.original.trim()));

  if (grounded.length < parsed.changes.length) {
    console.warn("[tailor] dropped ungrounded changes", {
      proposed: parsed.changes.length,
      kept: grounded.length,
    });
  }

  return { changes: grounded, notAdded: parsed.notAdded };
}

function toAnalyzeError(error: unknown): AnalyzeError {
  if (error instanceof AnalyzeError) return error;
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      return new AnalyzeError("RATE_LIMITED", "Anthropic rate limit reached. Try again shortly.", 429, 30);
    }
    if (error.status === 401) {
      return new AnalyzeError("CONFIG_ERROR", "The Anthropic API key was rejected.", 500);
    }
  }
  return new AnalyzeError(
    "PROVIDER_ERROR",
    error instanceof Error ? error.message : "The rewrite failed.",
    502,
  );
}

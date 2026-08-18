/**
 * Shared pieces for the resume routes. Kept out of `route.ts`, which may only export HTTP
 * methods and a small set of segment config values.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { MIN_WORDS, wordCount } from "@/lib/types";

/** Matches the cap `/api/score` enforces. A resume that cannot be scored is not worth
 *  storing, and the two limits disagreeing would let one in that the other rejects. */
export const MAX_RESUME_CHARS = 15_000;

export const resumeSchema = z
  .object({
    label: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().min(1).max(120),
    ),
    content: z.string().max(MAX_RESUME_CHARS),
    filePath: z.string().max(400).nullish(),
    targetRole: z.string().max(160).nullish(),
    note: z.string().max(1000).nullish(),
  })
  .strict();

export const resumePatchSchema = z
  .object({
    label: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.string().min(1).max(120),
      )
      .optional(),
    content: z.string().max(MAX_RESUME_CHARS).optional(),
    targetRole: z.string().max(160).nullish(),
    note: z.string().max(1000).nullish(),
    isDefault: z.literal(true).optional(),
  })
  .strict();

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

export const UNAUTHENTICATED = () =>
  jsonError("UNAUTHENTICATED", "Sign in to save resumes.", 401);

export const UNCONFIGURED = () =>
  jsonError(
    "NOT_CONFIGURED",
    "Saved resumes need a database, and this deployment has no Supabase configured. The matcher still works, so paste the text and it stores nothing.",
    503,
  );

export const NOT_FOUND = () => jsonError("NOT_FOUND", "No such resume.", 404);

/**
 * Reject text too short to score.
 *
 * The same floor `/api/score` applies, for the same reason: below roughly 50 words there is
 * not enough signal, and storing it just moves the failure to the moment the user tries to
 * use it. Returns the response to send, or null when the text is fine.
 */
export function tooShort(content: string): NextResponse | null {
  if (wordCount(content) >= MIN_WORDS) return null;
  return jsonError(
    "TOO_SHORT",
    `A resume needs at least ${MIN_WORDS} words to be worth scoring. This one has ${wordCount(content)}.`,
    400,
  );
}

export async function readJson(
  request: Request,
): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: jsonError("INVALID_REQUEST", "Request body must be JSON.", 400) };
  }
}

export function invalid(error: z.ZodError): NextResponse {
  const issue = error.issues[0];
  return jsonError("INVALID_REQUEST", `${issue.path.join(".") || "body"}: ${issue.message}`, 400);
}

const UUID = z.uuid();

export function isUuid(value: string): boolean {
  return UUID.safeParse(value).success;
}

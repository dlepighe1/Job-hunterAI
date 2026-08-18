import { NextResponse } from "next/server";
import { z } from "zod";

import { OUTREACH_STATUSES } from "@/lib/outreach";

/**
 * Shared pieces for the outreach routes.
 *
 * Note what is absent from every schema here: a recipient list, a schedule, and a "send"
 * action. FEATURES.md §7 excludes bulk and automated sending regardless of how its blocked
 * questions are answered, and the most durable way to exclude something is to give it
 * nowhere to be expressed.
 */
export const outreachSchema = z
  .object({
    contactId: z.union([z.uuid(), z.literal("")]).nullish(),
    applicationId: z.union([z.uuid(), z.literal("")]).nullish(),
    channel: z.enum(["email", "linkedin", "referral", "other"]).optional(),
    subject: z
      .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().max(300))
      .nullish(),
    body: z.string().min(1).max(10_000),
  })
  .strict();

export const outreachPatchSchema = z
  .object({
    subject: z
      .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().max(300))
      .nullish(),
    body: z.string().min(1).max(10_000).optional(),
    status: z.enum(OUTREACH_STATUSES).optional(),
    // Both are user-reported facts about something that happened elsewhere, so both are
    // accepted from the client. This app did not send the message and cannot know either.
    sentAt: z.union([z.iso.datetime(), z.literal("")]).nullish(),
    repliedAt: z.union([z.iso.datetime(), z.literal("")]).nullish(),
  })
  .strict();

export function blankToNull<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = value === "" ? null : value;
  }
  return output as T;
}

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

export const UNAUTHENTICATED = () =>
  jsonError("UNAUTHENTICATED", "Sign in to keep drafts.", 401);

export const UNCONFIGURED = () =>
  jsonError(
    "NOT_CONFIGURED",
    "Outreach drafts need a database, and this deployment has no Supabase configured.",
    503,
  );

export const NOT_FOUND = () => jsonError("NOT_FOUND", "No such message.", 404);

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

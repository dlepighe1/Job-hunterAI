/**
 * Shared pieces for the contact routes.
 *
 * The schemas here are `.strict()` and narrow on purpose. A contact row is about a third
 * party who never had an account on this service, and the way that table grows into a
 * dossier is one convenient extra field at a time. If a field is not in this schema, it
 * cannot be stored, and adding one should require reading `lib/network.ts` first.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

const trimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(max),
  );

const optional = (max: number) => trimmed(max).nullish();

export const contactSchema = z
  .object({
    name: trimmed(160).pipe(z.string().min(1)),
    roleTitle: optional(160),
    company: optional(200),
    // Empty string is allowed through as "cleared" and normalised to null at the route.
    email: z.union([z.email().max(254), z.literal("")]).nullish(),
    contactUrl: z.union([z.url().max(2000), z.literal("")]).nullish(),
    applicationId: z.union([z.uuid(), z.literal("")]).nullish(),
    notes: optional(2_000),
  })
  .strict();

export const contactPatchSchema = contactSchema.partial();

/** Turn "" into null, so clearing a field in a form actually clears the column instead of
 *  storing an empty string that every later check has to special-case. */
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
  jsonError("UNAUTHENTICATED", "Sign in to keep contacts.", 401);

export const UNCONFIGURED = () =>
  jsonError(
    "NOT_CONFIGURED",
    "Contacts need a database, and this deployment has no Supabase configured.",
    503,
  );

export const NOT_FOUND = () => jsonError("NOT_FOUND", "No such contact.", 404);

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

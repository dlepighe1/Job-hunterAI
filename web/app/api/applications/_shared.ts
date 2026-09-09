/**
 * Pieces both application routes need.
 *
 * Kept out of `route.ts` because a `route.ts` in the App Router may only export HTTP
 * methods and a small set of segment config values, and an exported helper there is a build
 * error, not a style question. The leading underscore keeps the directory from being
 * mistaken for a route segment.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { APPLICATION_STATUSES, WORK_MODELS } from "@/lib/applications";

/** A trimmed, non-empty, bounded string. The bound is not decoration: these columns are
 *  `text`, so without one a single request can store a megabyte in a company name. */
const shortText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1).max(max),
  );

const optionalText = (max: number) =>
  z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().max(max),
    )
    .nullish();

export const statusSchema = z.enum(APPLICATION_STATUSES);

/** Mirrors the `work_model` CHECK constraint. An unknown value is a 400 here rather than a
 *  constraint violation at the database, which surfaces as an opaque 500. */
export const workModelSchema = z.enum(WORK_MODELS);

/**
 * The create body.
 *
 * `.strict()` is deliberate. A body carrying `userId` is either a confused client or an
 * attempt to write into someone else's pipeline, and silently dropping the field would let
 * both go unnoticed. A 400 says which. The user id comes from the session and only from
 * the session.
 */
export const createSchema = z
  .object({
    company: shortText(200),
    role: shortText(200),
    location: optionalText(200),
    industry: optionalText(200),
    workModel: workModelSchema.nullish(),
    postingUrl: z.url().max(2000).nullish(),
    // The largest field a caller can send, and the reason for the cap: it is stored so a
    // score can be recomputed later, and it matches `/api/score`'s own 15k limit.
    postingText: optionalText(15_000),
    status: statusSchema.optional(),
    appliedAt: z.iso.date().nullish(),
    /** User-reported: when the employer first replied. The velocity chart plots it. */
    respondedAt: z.iso.datetime().nullish(),
    priority: z.boolean().optional(),
    resumeId: z.uuid().nullish(),
    notes: optionalText(5_000),
  })
  .strict();

/** The patch body. Every field optional, but at least one required, see `PATCH`. */
export const patchSchema = z
  .object({
    company: shortText(200).optional(),
    role: shortText(200).optional(),
    location: optionalText(200),
    industry: optionalText(200),
    workModel: workModelSchema.nullish(),
    postingUrl: z.url().max(2000).nullish(),
    status: statusSchema.optional(),
    appliedAt: z.iso.date().nullish(),
    /** User-reported: when the employer first replied. The velocity chart plots it. */
    respondedAt: z.iso.datetime().nullish(),
    priority: z.boolean().optional(),
    resumeId: z.uuid().nullish(),
    notes: optionalText(5_000),
  })
  .strict();

export function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

export const UNAUTHENTICATED = () =>
  jsonError("UNAUTHENTICATED", "Sign in to track applications.", 401);

/**
 * 503, not 500. Nothing is broken: the deployment has no database configured, which is a
 * supported way to run this app (the matcher needs none). "Try again later" would be wrong
 * advice for a missing environment variable, so the message names the cause.
 */
export const UNCONFIGURED = () =>
  jsonError(
    "NOT_CONFIGURED",
    "Applications need a database, and this deployment has no Supabase configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are unset). The matcher still works and stores nothing.",
    503,
  );

/**
 * 404, never 403.
 *
 * A 403 confirms the id names a real row belonging to somebody. That is enough to
 * enumerate valid ids by status code alone, so a row you do not own is reported exactly
 * like a row that does not exist.
 */
export const NOT_FOUND = () =>
  jsonError("NOT_FOUND", "No such application.", 404);

/** Parse a JSON body, or return the 400 to send back. */
export async function readJson(
  request: Request,
): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: jsonError("INVALID_REQUEST", "Request body must be JSON.", 400) };
  }
}

/** Turn a zod failure into the same first-issue message shape the other routes use. */
export function invalid(error: z.ZodError): NextResponse {
  const issue = error.issues[0];
  return jsonError(
    "INVALID_REQUEST",
    `${issue.path.join(".") || "body"}: ${issue.message}`,
    400,
  );
}

const UUID = z.uuid();

/** Validate a path id before it reaches a query. An id that cannot be a uuid is a 400, and
 *  answering it here saves a round trip to Postgres to be told the same thing. */
export function isUuid(value: string): boolean {
  return UUID.safeParse(value).success;
}

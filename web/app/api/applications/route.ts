import { NextResponse } from "next/server";

import {
  UNAUTHENTICATED,
  UNCONFIGURED,
  createSchema,
  invalid,
  jsonError,
  readJson,
} from "@/app/api/applications/_shared";
import { getUserIdOrNull, primaryEmail } from "@/lib/auth";
import {
  createApplication,
  ensureProfile,
  isPersistenceConfigured,
  listApplications,
} from "@/lib/db";

/**
 * The application pipeline.
 *
 * Unlike `/api/score`, both methods here require a session. Scoring is guest-accessible
 * because it persists nothing; an application is a stored row belonging to somebody, and
 * there is no such thing as a guest's row.
 *
 * The user id comes from the session on every path and is never read from the body. The
 * create schema is `.strict()`, so a body carrying `userId` is a 400 rather than a field
 * quietly dropped: a rejected attempt is visible, a dropped one is not.
 */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const applications = await listApplications(userId);
  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = createSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  /**
   * The profile row has to exist before anything can point at it.
   *
   * `applications.user_id references profiles(id)`, and Clerk owns identity, so nothing has
   * created a local row for this user yet. This is the app's first authenticated write, and
   * therefore the place SPEC Part 3 puts profile creation: on demand, rather than through a
   * webhook that leaves a window where a signed-in user has no profile and their first save
   * dies on a foreign key violation.
   *
   * `ensureProfile` upserts on the id, so this is idempotent: every create after the first
   * is a no-op write, and a Clerk-side email change propagates without a separate sync path.
   *
   * The email falls back to empty rather than blocking: the row exists to be a foreign key
   * target, and refusing to create it over an address nothing depends on would break the
   * feature to protect a field.
   */
  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not set up your account record, so the application was not saved. Try again in a moment.",
      500,
    );
  }

  const application = await createApplication(userId, parsed.data);
  if (!application) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not save the application. Try again in a moment.",
      500,
    );
  }

  // Never the posting text, never the notes. Company and role are user-supplied strings and
  // they stay out of the log too (SPEC Part 7), and the id is enough to trace this write.
  console.info("[applications] created", { id: application.id });

  return NextResponse.json({ application }, { status: 201 });
}

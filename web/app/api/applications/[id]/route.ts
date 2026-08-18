import { NextResponse } from "next/server";

import {
  NOT_FOUND,
  UNAUTHENTICATED,
  UNCONFIGURED,
  invalid,
  isUuid,
  jsonError,
  patchSchema,
  readJson,
} from "@/app/api/applications/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import {
  deleteApplication,
  getApplication,
  getApplicationDetail,
  getResume,
  isPersistenceConfigured,
  listEvents,
  updateApplication,
} from "@/lib/db";

/** Next 16 resolves dynamic segments asynchronously, so `params` is a promise, not an object.
 *  See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. */
type Context = { params: Promise<{ id: string }> };

/** One application with its event timeline. The timeline is what makes the detail view a
 *  history rather than a snapshot, and analyses are append-only precisely so it can exist. */
export async function GET(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  // The detail read is the one place that pulls `posting_text`, the largest column on the
  // row. Every other caller deliberately does not.
  const application = await getApplicationDetail(userId, id);
  if (!application) return NOT_FOUND();

  const events = await listEvents(userId, id);

  // "Which résumé did I send them?" is the question the detail drawer exists to answer, so
  // the exact stored version travels with the application rather than needing a second
  // round trip from the client.
  const resume = application.resumeId ? await getResume(userId, application.resumeId) : null;

  return NextResponse.json({
    application,
    events,
    resume: resume ? { id: resume.id, label: resume.label, content: resume.content } : null,
  });
}

export async function PATCH(request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = patchSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  // An empty patch would still touch `updated_at`, which re-sorts the list for no reason,
  // a write that changes nothing except the ordering the user was looking at.
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("INVALID_REQUEST", "body: name at least one field to change.", 400);
  }

  const application = await updateApplication(userId, id, parsed.data);
  // Null covers "no such row" and "not yours" alike, and the caller cannot tell which.
  if (!application) return NOT_FOUND();

  console.info("[applications] updated", { id, fields: Object.keys(parsed.data) });

  return NextResponse.json({ application });
}

export async function DELETE(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  // The delete is scoped to the owner, but it cannot report whether it matched anything,
  // so ownership is established first. Without this, deleting someone else's id returns a
  // cheerful 200 having done nothing, and the caller has no way to know.
  const owned = await getApplication(userId, id);
  if (!owned) return NOT_FOUND();

  const deleted = await deleteApplication(userId, id);
  if (!deleted) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not delete the application. Try again in a moment.",
      500,
    );
  }

  console.info("[applications] deleted", { id });

  return NextResponse.json({ ok: true });
}

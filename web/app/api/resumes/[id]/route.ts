import { NextResponse } from "next/server";

import {
  NOT_FOUND,
  UNAUTHENTICATED,
  UNCONFIGURED,
  invalid,
  isUuid,
  jsonError,
  readJson,
  resumePatchSchema,
  tooShort,
} from "@/app/api/resumes/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import {
  deleteResume,
  getResume,
  isPersistenceConfigured,
  setDefaultResume,
  updateResume,
} from "@/lib/db";

/** Next 16 resolves dynamic segments asynchronously, so `params` is a promise. */
type Context = { params: Promise<{ id: string }> };

/** One resume, with its text. The only endpoint that returns resume content, and it is
 *  scoped to the owner on both the id and the user id. */
export async function GET(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const resume = await getResume(userId, id);
  if (!resume) return NOT_FOUND();

  return NextResponse.json({ resume });
}

export async function PATCH(request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = resumePatchSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  const { isDefault, ...patch } = parsed.data;

  if (isDefault === undefined && Object.keys(patch).length === 0) {
    return jsonError("INVALID_REQUEST", "body: name at least one field to change.", 400);
  }

  if (patch.content !== undefined) {
    const short = tooShort(patch.content);
    if (short) return short;
  }

  /**
   * Promoting to default is its own operation, not a column write.
   *
   * `setDefaultResume` clears every other flag first, so exactly one row can hold it.
   * Letting a caller PATCH `is_default: true` directly would produce two defaults and the
   * answer to "which resume is the default" would depend on row order.
   */
  if (isDefault) {
    const promoted = await setDefaultResume(userId, id);
    if (!promoted) return NOT_FOUND();
  }

  if (Object.keys(patch).length > 0) {
    const resume = await updateResume(userId, id, patch);
    if (!resume) return NOT_FOUND();
    console.info("[resumes] updated", { id, fields: Object.keys(patch) });
    return NextResponse.json({ resume });
  }

  const resume = await getResume(userId, id);
  if (!resume) return NOT_FOUND();

  console.info("[resumes] default changed", { id });

  return NextResponse.json({ resume });
}

export async function DELETE(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  // `deleteResume` establishes ownership itself and returns false for a foreign id, but it
  // also returns false when the Storage sweep failed, two very different outcomes that
  // want different status codes. Checking here keeps 404 and 500 apart.
  const owned = await getResume(userId, id);
  if (!owned) return NOT_FOUND();

  const deleted = await deleteResume(userId, id);
  if (!deleted) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not delete the resume, so nothing was removed, and the uploaded file is still there. Try again in a moment.",
      500,
    );
  }

  console.info("[resumes] deleted", { id });

  return NextResponse.json({ ok: true });
}

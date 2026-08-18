import { NextResponse } from "next/server";

import {
  NOT_FOUND,
  UNAUTHENTICATED,
  UNCONFIGURED,
  blankToNull,
  invalid,
  isUuid,
  jsonError,
  outreachPatchSchema,
  readJson,
} from "@/app/api/outreach/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import { nextStatus } from "@/lib/applications";
import {
  deleteOutreach,
  getApplication,
  isPersistenceConfigured,
  updateApplication,
  updateOutreach,
} from "@/lib/db";
import { outreachEventFor } from "@/lib/outreach";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = outreachPatchSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  if (Object.keys(parsed.data).length === 0) {
    return jsonError("INVALID_REQUEST", "body: name at least one field to change.", 400);
  }

  const message = await updateOutreach(userId, id, blankToNull(parsed.data));
  if (!message) return NOT_FOUND();

  await feedPipeline(userId, message);

  console.info("[outreach] updated", { id, fields: Object.keys(parsed.data) });

  return NextResponse.json({ message });
}

/**
 * Let a recorded reply move the application forward.
 *
 * FEATURES.md §4.3 asks for automatic status transitions and defers the email half because
 * it needs mailbox access and its own consent story. A reply the user records by hand is
 * the same evidence with neither requirement, and it is the only outreach state that
 * carries any, since sending says nothing, because people write before applying as often as
 * after.
 *
 * `nextStatus` decides, not this function, which is what keeps the never-backwards rule in
 * one place: a reply on an application already at interview leaves it at interview.
 *
 * Failures here are logged and swallowed. The reply is what the user recorded and it is
 * already saved; turning a pipeline write into a 500 would report their reply as lost when
 * it was not.
 */
async function feedPipeline(
  userId: string,
  message: { applicationId: string | null; status: Parameters<typeof outreachEventFor>[0] },
): Promise<void> {
  if (!message.applicationId) return;

  const event = outreachEventFor(message.status);
  if (!event) return;

  const application = await getApplication(userId, message.applicationId);
  if (!application) return;

  const advanced = nextStatus(application.status, event);
  if (advanced === application.status) return;

  const updated = await updateApplication(userId, message.applicationId, { status: advanced });
  if (!updated) {
    console.error("[outreach] could not advance the application", {
      applicationId: message.applicationId,
    });
    return;
  }

  console.info("[outreach] advanced application", {
    applicationId: message.applicationId,
    from: application.status,
    to: advanced,
  });
}

export async function DELETE(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const deleted = await deleteOutreach(userId, id);
  if (!deleted) {
    return jsonError("PERSISTENCE_ERROR", "Could not delete the draft.", 500);
  }

  console.info("[outreach] deleted", { id });

  return NextResponse.json({ ok: true });
}

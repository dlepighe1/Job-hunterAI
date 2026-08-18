import { NextResponse } from "next/server";

import {
  NOT_FOUND,
  UNAUTHENTICATED,
  UNCONFIGURED,
  blankToNull,
  contactPatchSchema,
  invalid,
  isUuid,
  jsonError,
  readJson,
} from "@/app/api/contacts/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import { deleteContact, isPersistenceConfigured, updateContact } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = contactPatchSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  if (Object.keys(parsed.data).length === 0) {
    return jsonError("INVALID_REQUEST", "body: name at least one field to change.", 400);
  }

  const contact = await updateContact(userId, id, blankToNull(parsed.data));
  if (!contact) return NOT_FOUND();

  console.info("[contacts] updated", { id, fields: Object.keys(parsed.data) });

  return NextResponse.json({ contact });
}

/**
 * Delete a contact.
 *
 * No confirmation step and no ownership pre-read: the delete is already scoped to the
 * caller, and removing a record of a third party should never be harder than creating it.
 * A stray delete costs one row the user typed; the alternative is friction on the one
 * operation this table should make easy.
 */
export async function DELETE(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("INVALID_REQUEST", "id: must be a uuid.", 400);

  const deleted = await deleteContact(userId, id);
  if (!deleted) {
    return jsonError("PERSISTENCE_ERROR", "Could not delete the contact.", 500);
  }

  console.info("[contacts] deleted", { id });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import {
  UNAUTHENTICATED,
  UNCONFIGURED,
  blankToNull,
  contactSchema,
  invalid,
  jsonError,
  readJson,
} from "@/app/api/contacts/_shared";
import { getUserIdOrNull, primaryEmail } from "@/lib/auth";
import { createContact, ensureProfile, isPersistenceConfigured, listContacts } from "@/lib/db";

/**
 * Contacts the user entered themselves (FEATURES.md §6).
 *
 * There is no import endpoint, no lookup endpoint, and no enrichment step, deliberately.
 * See `lib/network.ts` for why that absence is what lets Network exist while §6's blocked
 * questions stay open: every one of them is about data this app would go and fetch.
 */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const contacts = await listContacts(userId);
  return NextResponse.json({ contacts });
}

export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = contactSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not set up your account record, so the contact was not saved.",
      500,
    );
  }

  const contact = await createContact(userId, blankToNull(parsed.data));
  if (!contact) {
    return jsonError("PERSISTENCE_ERROR", "Could not save the contact.", 500);
  }

  // The id and nothing else. This row names a person who never agreed to be in these logs.
  console.info("[contacts] created", { id: contact.id });

  return NextResponse.json({ contact }, { status: 201 });
}

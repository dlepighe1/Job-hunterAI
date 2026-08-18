import { NextResponse } from "next/server";

import {
  UNAUTHENTICATED,
  UNCONFIGURED,
  blankToNull,
  invalid,
  jsonError,
  outreachSchema,
  readJson,
} from "@/app/api/outreach/_shared";
import { getUserIdOrNull, primaryEmail } from "@/lib/auth";
import { createOutreach, ensureProfile, isPersistenceConfigured, listOutreach } from "@/lib/db";

/**
 * Outreach drafts (FEATURES.md §7, minus sending).
 *
 * There is no POST /send here and there never will be under this design, see
 * `lib/outreach.ts`. Everything §7 defers is a question about sending; everything it asks
 * for other than sending works without it.
 */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const messages = await listOutreach(userId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = outreachSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not set up your account record, so the draft was not saved.",
      500,
    );
  }

  const message = await createOutreach(userId, blankToNull(parsed.data));
  if (!message) {
    return jsonError("PERSISTENCE_ERROR", "Could not save the draft.", 500);
  }

  // The id and the channel. Never the subject or the body.
  console.info("[outreach] draft created", { id: message.id, channel: message.channel });

  return NextResponse.json({ message }, { status: 201 });
}

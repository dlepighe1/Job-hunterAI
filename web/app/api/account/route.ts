import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull } from "@/lib/auth";
import { deleteAccount, isPersistenceConfigured } from "@/lib/db";

/**
 * Delete everything belonging to the signed-in user.
 *
 * FEATURES.md §2.4 lists "delete my account" as built, and `deleteAccount` has existed in
 * `lib/db.ts` since the schema landed, but nothing ever called it. Storing applications
 * without this route means holding personal data the user has no way to remove, which is
 * the one gap in §2.4 that is not a missing feature but a broken promise.
 *
 * A resume is personal data the product holds because the user asked it to (SPEC Part 7).
 * Removing it has to be as available as adding it.
 *
 * This deletes the local data. It deliberately does NOT delete the Clerk identity: Clerk
 * owns the account, and signing out of a third party's system on their behalf from a
 * DELETE handler is not this route's call. The UI says so rather than implying otherwise.
 */
const confirmSchema = z.object({
  /** Typed by the user, matched exactly. The endpoint refuses to act on reach alone. */
  confirm: z.literal("DELETE"),
});

export async function DELETE(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to delete your data." },
      { status: 401 },
    );
  }

  if (!isPersistenceConfigured()) {
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message:
          "This deployment has no database configured, so there is nothing stored to delete.",
        status: 503,
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!confirmSchema.safeParse(body).success) {
    return NextResponse.json(
      {
        error: "CONFIRMATION_REQUIRED",
        message: 'Deleting your data is permanent. Send { "confirm": "DELETE" } to proceed.',
      },
      { status: 400 },
    );
  }

  const deleted = await deleteAccount(userId);

  // `deleteAccount` returns false when the Storage sweep failed, and keeps the profile row
  // on purpose so the operation can be retried. Reporting success here would tell someone
  // their resumes were erased while the files are still in the bucket.
  if (!deleted) {
    return NextResponse.json(
      {
        error: "PERSISTENCE_ERROR",
        message:
          "Your data could not be fully deleted, so nothing was removed. Nothing is in a half-deleted state, so try again, and if it keeps failing the files need looking at directly.",
      },
      { status: 500 },
    );
  }

  console.info("[account] deleted", { userId });

  return NextResponse.json({ ok: true });
}

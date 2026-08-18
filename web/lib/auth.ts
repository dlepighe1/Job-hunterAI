import { auth, currentUser } from "@clerk/nextjs/server";

import { DEV_USER_EMAIL, DEV_USER_ID, isDevMode } from "@/lib/dev-mode";

/** Thrown by requireUserId when no user is signed in. API routes map this to 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

/** The Clerk user id of the signed-in user, or null for guests. */
export async function getUserIdOrNull(): Promise<string | null> {
  // Dev mode signs you in as a fixture user without Clerk. Impossible in production, because
  // `isDevMode()` is false there, and a production build with the flag set refuses to boot.
  if (isDevMode()) return DEV_USER_ID;

  const { userId } = await auth();
  return userId ?? null;
}

/**
 * The signed-in user's primary email address, or null.
 *
 * Needed by exactly one thing: creating the local `profiles` row that every foreign key
 * points at. Clerk owns identity, so that row is not the account: it is the target, and it
 * is created on the first authenticated write rather than by a webhook.
 *
 * Prefers the address Clerk flags as primary and falls back to the first one. A user with
 * several verified addresses who has not chosen a primary still gets a profile; refusing to
 * make one over a field nothing depends on would block their first save.
 *
 * Costs a Clerk API call, unlike `auth()` which reads the session token, so it is called on
 * the create path only, never on a read.
 */
export async function primaryEmail(): Promise<string | null> {
  if (isDevMode()) return DEV_USER_EMAIL;

  const user = await currentUser();
  if (!user) return null;

  const addresses = user.emailAddresses ?? [];
  const primary = addresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? addresses[0]?.emailAddress ?? null;
}

/** The Clerk user id, or throws UnauthorizedError. Use in routes that require sign-in. */
export async function requireUserId(): Promise<string> {
  const userId = await getUserIdOrNull();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

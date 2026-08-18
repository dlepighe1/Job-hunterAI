import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { isDevMode } from "@/lib/dev-mode";

/**
 * Everything under `(app)` requires a session EXCEPT the matcher, which SPEC §5.1 makes
 * usable without an account: paste a resume and a posting, get a score, save nothing.
 *
 * `/matcher` is therefore public and so is `POST /api/score`, which it calls. That is an
 * unauthenticated endpoint that costs compute, so `lib/rate-limit.ts` buckets it by IP for
 * guests in addition to the per-user limit.
 *
 * Listed explicitly rather than as a negative match: a new private page added to `(app)`
 * should be protected because someone listed it, not because a regex happened to catch it.
 */
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/applications(.*)",
  "/resumes(.*)",
  "/network(.*)",
  "/outreach(.*)",
  "/settings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Dev mode reaches the authenticated screens without a Clerk session. The gate itself is
  // in `lib/dev-mode.ts`: false in every production build, and a production build with the
  // flag set throws at import rather than serving a single unauthenticated request.
  if (isDevMode()) return;

  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};

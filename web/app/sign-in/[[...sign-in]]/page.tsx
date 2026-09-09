import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

import { CLERK_APPEARANCE } from "@/lib/clerk-appearance";

export const metadata = {
  title: "Sign in",
  description: "Sign in to see your dashboard, applications and saved résumés.",
};

/**
 * The sign-in route.
 *
 * Where users arrive when `proxy.ts` turns them away from a protected page, so it is the
 * first thing a returning user sees and the last thing standing between them and their own
 * data. It is also the destination for direct links and for redirects Clerk itself issues;
 * the marketing page has its own drawer for people who are still browsing.
 *
 * **No `fallbackRedirectUrl` here.** It used to say `/matcher`, which sent every returning
 * user to the guest tool instead of their dashboard, and quietly overrode
 * `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` — which says `/dashboard`, as does the
 * marketing drawer's behaviour, so the same product had two answers depending on which door
 * you came through. The env var is now the only definition. Clerk still honours the
 * `redirect_url` it adds when it bounces someone off a protected page, so being turned away
 * from /applications returns you to /applications rather than to the default.
 *
 * Which methods appear — Google, email and password — is configured in the Clerk dashboard,
 * not here. `<SignIn />` renders whatever the instance enables, which is what keeps this
 * from claiming an option the backend does not actually support.
 */
export default function Page() {
  return (
    <main className="auth-page">
      <div className="auth-page__panel">
        <div className="auth-page__intro">
          <span className="eyebrow">
            <i /> Welcome back
          </span>
          <h1>Sign in</h1>
          <p>
            Your saved analyses, tracked applications and résumé library are behind this. The
            matcher itself stays open without an account.
          </p>
        </div>

        <SignIn appearance={CLERK_APPEARANCE} />

        <p className="auth-page__aside">
          Just looking? <Link href="/matcher">Score a résumé as a guest</Link> — nothing is
          stored.
        </p>
      </div>
    </main>
  );
}

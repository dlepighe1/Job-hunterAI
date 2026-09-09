import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

import { CLERK_APPEARANCE } from "@/lib/clerk-appearance";

export const metadata = {
  title: "Create an account",
  description: "Keep your analyses, track applications, and build a résumé library.",
};

/**
 * The sign-up route. Same reasoning as its sibling: the redirect after success is defined
 * once, in `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`, and not overridden here.
 *
 * A new account lands on an empty dashboard, which is correct — the alternative is seeding
 * it with invented rows, and a demo pipeline that looks like real applications is the exact
 * thing SPEC Appendix B forbids. The empty states say what to do first.
 */
export default function Page() {
  return (
    <main className="auth-page">
      <div className="auth-page__panel">
        <div className="auth-page__intro">
          <span className="eyebrow">
            <i /> Get started
          </span>
          <h1>Create an account</h1>
          <p>
            Keep your results, attach them to applications, and watch the score move as you
            tailor a résumé.
          </p>
        </div>

        <SignUp appearance={CLERK_APPEARANCE} />

        <p className="auth-page__aside">
          Already have one? <Link href="/sign-in">Sign in</Link>.
        </p>
      </div>
    </main>
  );
}

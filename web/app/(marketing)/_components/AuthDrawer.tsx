"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { XCircleIcon } from "@/components/icons";
import { CLERK_APPEARANCE } from "@/lib/clerk-appearance";

export type AuthMode = "sign-in" | "sign-up";

/**
 * Sign in / sign up as a right-hand drawer rather than a route.
 *
 * `routing="hash"` is Clerk's embedded mode: the multi-step flow lives in the URL hash
 * rather than in routes, so it can sit inside an overlay. The dedicated /sign-in and
 * /sign-up routes still exist for direct links and for the redirects Clerk itself issues.
 *
 * Because Clerk owns the hash while the drawer is open, and this page also uses hash
 * anchors for its section nav, the hash is cleared on close, because otherwise a leftover
 * `#/factor-one` stays in the URL and the next anchor click has to fight it.
 *
 * Three things a drawer owes the user, all of which are easy to skip:
 *   - Escape closes it, and the click target behind it is inert.
 *   - Focus moves in on open and returns to the trigger on close, or a keyboard user is
 *     dropped at the top of the document.
 *   - The page behind does not scroll while it is open.
 */
export function AuthDrawer({
  mode,
  onModeChange,
  onClose,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  // Let the exit animation play out before unmounting. Without this the drawer
  // vanishes instantly on close, which reads as a glitch next to a 460ms entrance.
  function requestClose() {
    setClosing(true);
    window.setTimeout(onClose, 300);
  }

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setClosing(true);
        window.setTimeout(onClose, 300);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();

      // Drop whatever step Clerk left in the hash, without adding a history entry.
      if (window.location.hash.startsWith("#/")) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
  }, [onClose]);

  const isSignIn = mode === "sign-in";

  return (
    <>
      <button className="auth-scrim" aria-label="Close" onClick={requestClose} />

      <div
        ref={panelRef}
        className="auth-drawer"
        data-closing={closing}
        role="dialog"
        aria-modal="true"
        aria-label={isSignIn ? "Sign in" : "Create an account"}
        tabIndex={-1}
      >
        <div className="auth-drawer__top">
          <span className="eyebrow">
            <i /> {isSignIn ? "Welcome back" : "Get started"}
          </span>
          <button className="auth-drawer__close" onClick={requestClose} aria-label="Close">
            <XCircleIcon />
          </button>
        </div>

        <div className="auth-drawer__body">
          <div className="auth-drawer__intro">
            <h2>{isSignIn ? "Sign in" : "Create an account"}</h2>
            <p>
              {isSignIn
                ? "Pick up where you left off: saved analyses, tracked applications, and the written-feedback engine."
                : "Keep your results, attach them to applications, and watch the score move as you tailor a resume."}
            </p>
          </div>

          <div className="auth-switch" role="group" aria-label="Authentication mode">
            <button
              type="button"
              aria-pressed={isSignIn}
              onClick={() => onModeChange("sign-in")}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={!isSignIn}
              onClick={() => onModeChange("sign-up")}
            >
              Create account
            </button>
          </div>

          {isSignIn ? (
            <SignIn routing="hash" appearance={CLERK_APPEARANCE} />
          ) : (
            <SignUp routing="hash" appearance={CLERK_APPEARANCE} />
          )}

          <p className="auth-drawer__note">
            You can use the matcher without an account. Signing in only adds saving, and your
            resume text is still never written to a log.
          </p>
        </div>
      </div>
    </>
  );
}

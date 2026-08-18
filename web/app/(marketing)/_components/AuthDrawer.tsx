"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { XCircleIcon } from "@/components/icons";

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

/**
 * Clerk theming.
 *
 * Mapped onto this product's tokens rather than Clerk's dark preset, so the drawer's
 * buttons and inputs are the same objects as the rest of the app instead of a themed
 * widget sitting inside it. The social buttons and the primary action deliberately take
 * different treatments: social is a neutral raised surface, primary is the accent.
 */
const CLERK_APPEARANCE = {
  variables: {
    colorBackground: "transparent",
    colorText: "#f0f0f5",
    colorTextSecondary: "#b9b9c6",
    colorPrimary: "#56ccf2",
    colorInputBackground: "#0b0b10",
    colorInputText: "#f0f0f5",
    colorDanger: "#ff7a8a",
    colorSuccess: "#00f5a0",
    colorWarning: "#f2c14e",
    borderRadius: "12px",
    fontFamily: '"Satoshi", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "0" },
    card: { background: "transparent", boxShadow: "none", padding: "0", border: "0" },
    header: { display: "none" },
    footer: { background: "transparent" },
    // The social button keeps the neumorphic treatment, since it is chrome rather than data, but
    // carries a hairline as well, because on a surface this dark the raised shadow alone
    // does not read as a pressable boundary.
    socialButtonsBlockButton: {
      background: "linear-gradient(145deg, #18181f, #101016)",
      border: "1px solid #2a2f3d",
      boxShadow: "-3px -3px 8px rgba(180,230,255,.045), 4px 4px 12px rgba(0,0,0,.72)",
      color: "#f0f0f5",
      minHeight: "46px",
      "&:hover": {
        borderColor: "#64708a",
        boxShadow: "-6px -6px 16px rgba(180,230,255,.045), 9px 9px 26px rgba(0,0,0,.72)",
      },
    },
    dividerLine: { background: "#2a2f3d" },
    dividerText: {
      color: "#888899",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "10px",
      letterSpacing: "0.14em",
      textTransform: "uppercase" as const,
    },
    formFieldLabel: {
      color: "#f0f0f5",
      fontFamily: '"Clash Display", sans-serif',
      fontWeight: 600,
    },
    // `--edge`, not `--edge-soft`. An input is a component whose boundary has to be
    // identifiable (WCAG 1.4.11); the soft rule measures 1.72:1 and left the field
    // indistinguishable from the drawer behind it.
    formFieldInput: {
      background: "#0b0b10",
      border: "1px solid #64708a",
      color: "#f0f0f5",
      "&::placeholder": { color: "#888899" },
      "&:focus": { borderColor: "#56ccf2", boxShadow: "0 0 0 2px rgba(86,204,242,.3)" },
    },
    formButtonPrimary: {
      background: "linear-gradient(145deg, #64d0f3, #439fbd)",
      color: "#0a0d0e",
      fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 700,
      textTransform: "none" as const,
      boxShadow: "-4px -4px 12px rgba(180,230,255,.045), 6px 6px 20px rgba(0,0,0,.72)",
      "&:hover": { background: "linear-gradient(145deg, #9ae0fa, #439fbd)" },
    },
    footerActionLink: { color: "#56ccf2" },
    identityPreviewEditButton: { color: "#56ccf2" },
  },
};

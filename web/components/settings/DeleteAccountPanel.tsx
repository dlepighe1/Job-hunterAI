"use client";

/**
 * Permanent deletion of everything this app stores about you.
 *
 * FEATURES.md §2.4 has listed this as built since the schema landed, on the strength of
 * `deleteAccount` existing in `lib/db.ts`, which nothing called. Applications made that a
 * real gap rather than a pedantic one: the product now stores data, so it owes a way out.
 *
 * The interaction is deliberately slow. The panel is collapsed until asked for, the phrase
 * has to be typed exactly, and the button stays disabled until it matches. A destructive
 * action that can be reached in one click is a destructive action that will be reached by
 * accident.
 */

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

const PHRASE = "DELETE";

export function DeleteAccountPanel() {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed === PHRASE;

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: PHRASE }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setBusy(false);
        return setError(body.message ?? "Your data could not be deleted.");
      }

      // The rows are gone; the Clerk identity is not this app's to delete. Signing out is
      // the honest end state, and the copy below says so rather than implying the account
      // itself has been erased.
      await signOut({ redirectUrl: "/" });
    } catch {
      setBusy(false);
      setError("Could not reach the server. Nothing was deleted.");
    }
  }

  return (
    <section className="obsidian-panel" style={{ padding: 26 }}>
      <h2 className="font-mono text-xs tracking-wider text-slate-400 uppercase">Your data</h2>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        This app stores the applications you track, the resumes you save, and the analyses
        attached to them. The matcher still keeps no record of what you paste into it when
        you are not saving a result: not the resume, not the posting, not the score.
      </p>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
        Deleting removes every stored row and every uploaded file, because a resume left
        behind in object storage is still your resume. It does not delete your sign-in
        itself. Clerk owns that, and you can remove it from your account menu there.
      </p>

      {!open ? (
        <div className="page-actions">
          <button type="button" className="button button--ghost" onClick={() => setOpen(true)}>
            Delete my data
          </button>
        </div>
      ) : (
        <div className="pf-panel" style={{ marginTop: 18 }}>
          <div className="pf-panel__head">PERMANENT, THIS CANNOT BE UNDONE</div>

          <div style={{ padding: 18 }}>
            <label
              htmlFor="delete-confirm"
              className="font-mono text-[10px] tracking-wider text-slate-400 uppercase"
            >
              Type {PHRASE} to confirm
            </label>
            <input
              id="delete-confirm"
              className="nm-input"
              style={{ marginTop: 8, width: "100%" }}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />

            {error && (
              <p className="notice" data-tone="error" role="alert" style={{ marginTop: 14 }}>
                <strong>Not deleted</strong>
                {error}
              </p>
            )}

            <div className="page-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={remove}
                disabled={!confirmed || busy}
              >
                {busy ? "Deleting…" : "Delete everything"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

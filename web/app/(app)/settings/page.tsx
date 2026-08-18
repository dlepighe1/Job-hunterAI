"use client";

import { useUser } from "@clerk/nextjs";
import { useSyncExternalStore } from "react";

import { DeleteAccountPanel } from "@/components/settings/DeleteAccountPanel";
import { ACCENT_KEY, ACCENTS, applyAccent, DEFAULT_ACCENT } from "@/lib/accents";

/**
 * Settings.
 *
 * This replaces a mockup whose controls did nothing: a profile prefilled with "Alexander
 * Sterling · Chief Strategy Officer" and a stock photograph of a stranger, LinkedIn/Google/
 * GitHub shown as *connected* when no integration exists, a "data region" selector that
 * chose nothing, and five AI toggles (sensitivity, cultural scan, stealth mode, deep
 * extraction) wired to no code path at all.
 *
 * A settings screen makes a promise: that what it shows is the state of the system. Every
 * control here keeps that promise, which is why there are so few of them. Theme and accent
 * are real and persist. Everything else says plainly what it is waiting on.
 */

/**
 * `localStorage` is an external store, so it is read through `useSyncExternalStore` rather
 * than copied into state by an effect. The effect version renders once with the default,
 * then again with the stored value, a visible flicker of the wrong colour, and a cascading
 * render React's own lint rule flags. The server snapshot is the default, which is also what
 * the server has no way of knowing any better than.
 */
const accentListeners = new Set<() => void>();

function subscribeToAccent(onChange: () => void) {
  accentListeners.add(onChange);
  // Another tab changing the accent should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    accentListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();

  const accent = useSyncExternalStore(
    subscribeToAccent,
    () => localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT,
    () => DEFAULT_ACCENT,
  );

  function chooseAccent(id: string) {
    localStorage.setItem(ACCENT_KEY, id);
    applyAccent(id);
    // `storage` events don't fire in the tab that made the change, so notify locally.
    accentListeners.forEach((listener) => listener());
  }

  return (
    <div className="executive-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">SETTINGS</span>
          <h1>Settings</h1>
          <p>Your account, and the two things that are actually adjustable.</p>
        </div>
      </header>

      <section className="obsidian-panel" style={{ padding: 26 }}>
        <h2 className="font-mono text-xs tracking-wider text-slate-400 uppercase">Account</h2>
        <p className="mt-2 text-sm text-slate-400">
          Identity is managed by Clerk. Changing your name, email or password happens there,
          through the account menu, and this app does not keep a second copy to fall out of sync.
        </p>

        {isLoaded && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
                Signed in as
              </dt>
              <dd className="mt-1 text-sm text-slate-200">
                {user?.primaryEmailAddress?.emailAddress ?? "n/a"}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-wider text-slate-500 uppercase">
                Name
              </dt>
              <dd className="mt-1 text-sm text-slate-200">{user?.fullName ?? "Not set"}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="obsidian-panel" style={{ padding: 26 }}>
        <h2 className="font-mono text-xs tracking-wider text-slate-400 uppercase">Accent</h2>
        <p className="mt-2 text-sm text-slate-400">
          Stored in this browser only. It affects nothing but colour.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={accent === option.id}
              onClick={() => chooseAccent(option.id)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 font-mono text-xs transition-colors ${
                accent === option.id
                  ? "border-[var(--color-brand)] text-slate-100"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full"
                style={{ background: option.color }}
              />
              {/* The name is text, not just the swatch: colour alone cannot be the only way
                  to tell the options apart. */}
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <DeleteAccountPanel />
    </div>
  );
}

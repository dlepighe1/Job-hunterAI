"use client";

import { useWaitlist, type WaitlistFeature } from "@/lib/use-waitlist";

/**
 * A locked screen for a feature that has not been built.
 *
 * SPEC §1.1: "Phases 2 and 3 ship as locked screens in Phase 1. They are advertised, not
 * built. That is a deliberate choice: both carry legal and data-sourcing questions (contact
 * scraping, sending reputation, consent) that should not be answered under delivery
 * pressure."
 *
 * So this screen says what the feature will do AND what has to be settled first. The second
 * part is not an apology: it is the reason the screen is locked, and a user looking at an
 * empty contacts page deserves the real answer rather than "coming soon!".
 */
export function ComingSoon({
  title,
  phase,
  feature,
  summary,
  openQuestions,
}: {
  title: string;
  phase: string;
  /** Which waitlist bucket a signup lands in. */
  feature: WaitlistFeature;
  summary: string;
  /** What has to be answered before this can be built. */
  openQuestions: string[];
}) {
  return (
    <div className="stage-narrow">
      <span className="page-kicker">{phase}</span>
      <h1>{title}</h1>
      <p>{summary}</p>

      <div className="obsidian-panel" style={{ marginTop: 30 }}>
        <h2 className="panel-title">Why it isn&apos;t built yet</h2>
        <p className="panel-body" style={{ marginBottom: 16 }}>
          These are open questions, not implementation details. Answering them wrong has
          consequences for other people, so they get answered before any code is written.
        </p>
        <ul className="spec-list">
          {openQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>

      <NotifyMe feature={feature} />
    </div>
  );
}

function NotifyMe({ feature }: { feature: WaitlistFeature }) {
  const { email, setEmail, state, message, submit } = useWaitlist(feature);

  if (state === "done") {
    return (
      <p className="form-status" data-tone="ok" role="status" style={{ marginTop: 24 }}>
        Noted, we&apos;ll email you once this ships. Your address is stored for that and
        nothing else.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="callout" style={{ display: "block" }}>
      <label
        htmlFor={`notify-${feature}`}
        style={{
          display: "block",
          fontFamily: "var(--font-display)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        Get told when it ships
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <input
          id={`notify-${feature}`}
          className="nm-input"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={state === "sending"}
          placeholder="you@example.com"
        />
        <button type="submit" className="button button--primary" disabled={state === "sending"}>
          {state === "sending" ? "Saving…" : "Notify me"}
        </button>
      </div>

      {state === "error" && (
        <p className="form-status" data-tone="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}

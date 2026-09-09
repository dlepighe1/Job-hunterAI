"use client";

import { UsersIcon, SendIcon } from "@/components/icons";
import { useWaitlist } from "@/lib/use-waitlist";
import type { WaitlistFeature } from "@/lib/waitlist";

/**
 * "Notify me" capture for the two deferred features (SPEC §5.3, §5.4: "Ship a locked screen
 * that describes the intent and captures interest").
 *
 * Styled with the shared neumorphic classes rather than the inline hex values this file used
 * to carry, and those hardcoded a single dark palette into the markup, so the light theme could
 * not reach them and no stylesheet could override them without `!important`. The two-column
 * grid was also fixed at `repeat(2, 1fr)` with no breakpoint, which put two 44px inputs side
 * by side on a phone; `.waitlist-grid` collapses at 300px per column.
 */
export function WaitlistCapture() {
  return (
    <section className="platform-section" aria-labelledby="waitlist-heading">
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            <i /> Early access
          </div>
          <h2 id="waitlist-heading">Be first when these ship.</h2>
        </div>
        <p>
          One email when a feature ships. Your address is stored for that and nothing else:
          it is not attached to an account, and there is no newsletter.
        </p>
      </div>

      <div className="waitlist-grid">
        <NotifyCard
          feature="network"
          title="Network"
          description="The people behind an application, and how you reach them. Deferred until the questions about other people's data have answers."
          icon={<UsersIcon />}
        />
        <NotifyCard
          feature="outreach"
          title="Outreach"
          description="Drafting and sending cold contact, with replies tracked. Deferred until consent and sending reputation are handled properly."
          icon={<SendIcon />}
        />
      </div>
    </section>
  );
}

function NotifyCard({
  feature,
  title,
  description,
  icon,
}: {
  feature: WaitlistFeature;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  const { email, setEmail, state, message, submit } = useWaitlist(feature);

  return (
    <article className="waitlist-card">
      <div className="feature-icon">{icon}</div>
      <span>{feature}</span>
      <h3>{title}</h3>
      <p>{description}</p>

      {state === "done" ? (
        <p className="form-status" data-tone="ok" role="status">
          Noted, we&apos;ll email you once it ships.
        </p>
      ) : (
        <form onSubmit={submit} className="waitlist-form">
          <label htmlFor={`waitlist-${feature}`}>Email address</label>
          <input
            id={`waitlist-${feature}`}
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

          {state === "error" && (
            <p className="form-status" data-tone="error" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </article>
  );
}

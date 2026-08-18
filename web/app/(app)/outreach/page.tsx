"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DraftComposer } from "@/components/outreach/DraftComposer";
import {
  followUpDue,
  outreachStatusLabel,
  outreachStatusTone,
  type OutreachStatus,
} from "@/lib/outreach";
import { useApplications } from "@/lib/use-applications";
import { useContacts } from "@/lib/use-contacts";
import { useOutreach } from "@/lib/use-outreach";

/**
 * Outreach (FEATURES.md §7, minus sending).
 *
 * This replaces a locked "coming soon" screen with the half of §7 that is not blocked. §7
 * waits on which email service to use, how sending reputation is protected, and how consent
 * and unsubscribe work under CAN-SPAM and GDPR, every one of them a question about
 * sending. It also excludes bulk or automated sending outright.
 *
 * So nothing is sent from here. You write a draft, copy it into your own mail client, and
 * come back to record what happened. That keeps the rest of §7 intact: drafts grounded in a
 * specific role, replies feeding application status, and follow-up reminders. The banner
 * says so rather than letting a missing Send button read as an unfinished screen.
 */
export default function OutreachPage() {
  const { messages, state, create, update, remove } = useOutreach();
  const { applications } = useApplications();
  const { contacts } = useContacts();

  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const dueCount = messages.filter((message) => followUpDue(message, now)).length;

  async function setStatus(id: string, status: OutreachStatus) {
    setBusyId(id);
    // The timestamp is recorded here because the user is telling us it happened now. The
    // app did not send the message and has no other way to know.
    const stamp = new Date().toISOString();
    setError(
      await update(id, {
        status,
        ...(status === "sent" ? { sentAt: stamp } : {}),
        ...(status === "replied" ? { repliedAt: stamp } : {}),
      }),
    );
    setBusyId(null);
  }

  async function copy(id: string, body: string, subject: string | null) {
    try {
      await navigator.clipboard.writeText(subject ? `Subject: ${subject}\n\n${body}` : body);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Could not copy to the clipboard. Select the text and copy it manually.");
    }
  }

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">OUTREACH</span>
        <h1>Messages you write, and what came back</h1>
        <p>
          Draft a first message against a specific application, copy it into your own mail
          client, and record what happened. A reply you record moves the application forward.
        </p>

        {state.kind === "ready" && (
          <div className="page-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setComposing((current) => !current)}
              aria-expanded={composing}
            >
              {composing ? "Close" : "Write a draft"}
            </button>
            <Link href="/network" className="button button--ghost">
              Contacts
            </Link>
          </div>
        )}
      </header>

      {/*
        The missing Send button is the design, so it is explained before anyone goes looking
        for it.
      */}
      <div className="notice" data-tone="info" style={{ marginBottom: 22 }}>
        <strong>This does not send anything</strong>
        Nothing leaves this app. You copy the draft into your own mail client and send it
        from your own address, which is the only way a first message to a stranger should
        work, and it keeps this out of the business of bulk sending entirely.
      </div>

      {dueCount > 0 && (
        <div className="notice" data-tone="warn" style={{ marginBottom: 22 }}>
          <strong>
            {dueCount} {dueCount === 1 ? "message has" : "messages have"} gone a week without a
            reply
          </strong>
          Worth one follow-up, or worth marking as no reply and moving on. Silence is not
          usually a decision about you.
        </div>
      )}

      {error && (
        <p className="notice" data-tone="error" role="alert" style={{ marginBottom: 22 }}>
          <strong>That did not work</strong>
          {error}
        </p>
      )}

      {state.kind === "loading" && (
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton" />
        </div>
      )}

      {state.kind === "unauthenticated" && (
        <div className="notice" data-tone="info">
          <strong>Sign in to keep drafts</strong>
          <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            Create an account
          </Link>{" "}
          to save what you write.
        </div>
      )}

      {state.kind === "unconfigured" && (
        <div className="notice" data-tone="warn">
          <strong>No database configured</strong>
          {state.message}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="space-y-6">
          {composing && (
            <DraftComposer
              applications={applications}
              contacts={contacts}
              onCreate={create}
              onCancel={() => setComposing(false)}
            />
          )}

          {messages.length === 0 && !composing ? (
            <div className="empty-state">
              <div>
                <p>No drafts yet</p>
                <p>
                  Write one against an application you are tracking. The template fills in the
                  role and company and leaves the sentence only you can write blank, because
                  a message that could have been sent to anyone usually reads like one.
                </p>
              </div>
            </div>
          ) : (
            messages.length > 0 && (
              <ul className="draft-list">
                {messages.map((message) => {
                  const application = applications.find(
                    (candidate) => candidate.id === message.applicationId,
                  );
                  const contact = contacts.find((candidate) => candidate.id === message.contactId);

                  return (
                    <li key={message.id} className="pf-panel draft">
                      <div className="pf-panel__head">
                        <span>
                          {contact ? contact.name : "No contact"}
                          {application ? ` · ${application.role} at ${application.company}` : ""}
                        </span>
                        <span
                          className="company__stage"
                          data-tone={outreachStatusTone(message.status)}
                        >
                          {outreachStatusLabel(message.status)}
                          {followUpDue(message, now) && " · follow up"}
                        </span>
                      </div>

                      {message.subject && (
                        <div className="pf-row">
                          <span>Subject</span>
                          <b>{message.subject}</b>
                        </div>
                      )}

                      <pre className="draft__body">{message.body}</pre>

                      <div className="draft__actions">
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => copy(message.id, message.body, message.subject)}
                        >
                          {copiedId === message.id ? "Copied" : "Copy"}
                        </button>

                        {message.status === "draft" && (
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setStatus(message.id, "sent")}
                            disabled={busyId === message.id}
                          >
                            I sent this
                          </button>
                        )}

                        {(message.status === "sent" || message.status === "no_reply") && (
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setStatus(message.id, "replied")}
                            disabled={busyId === message.id}
                          >
                            They replied
                          </button>
                        )}

                        {message.status === "sent" && (
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setStatus(message.id, "no_reply")}
                            disabled={busyId === message.id}
                          >
                            No reply
                          </button>
                        )}

                        <button
                          type="button"
                          className="row-action"
                          onClick={async () => {
                            setBusyId(message.id);
                            setError(await remove(message.id));
                            setBusyId(null);
                          }}
                          disabled={busyId === message.id}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      )}
    </>
  );
}

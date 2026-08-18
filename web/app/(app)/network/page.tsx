"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { NewContactForm } from "@/components/network/NewContactForm";
import { statusLabel, statusTone } from "@/lib/applications";
import { groupByCompany } from "@/lib/network";
import { useApplications } from "@/lib/use-applications";
import { useContacts } from "@/lib/use-contacts";

/**
 * Network (FEATURES.md §6).
 *
 * This replaces a locked "coming soon" screen, and it is a deliberately smaller feature
 * than the one that screen advertised. §6 defers Network on three questions, namely where company
 * data comes from, what lawful basis covers personal data, and how to build this without a
 * contact scraper, and it excludes scraping, profiling anyone who has not consented, and any
 * employer-side view of candidates, no matter how those questions are answered.
 *
 * All three blocked questions are about data the app would go and FETCH. So this screen
 * fetches nothing: a company appears because you applied there, and a person appears
 * because you typed them in. That is exactly the two items §6 lists as needing none of the
 * blocked answers, and nothing else. The banner at the top says so plainly rather than
 * letting the absence read as an unfinished feature.
 */
export default function NetworkPage() {
  const { applications, state } = useApplications();
  const { contacts, state: contactState, create, remove } = useContacts();

  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companies = useMemo(
    () => groupByCompany(applications, contacts),
    [applications, contacts],
  );

  const ready = state.kind === "ready" && contactState.kind === "ready";
  const loading = state.kind === "loading" || contactState.kind === "loading";

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(await remove(id));
    setBusyId(null);
  }

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">NETWORK</span>
        <h1>Who you know, where you applied</h1>
        <p>
          Your applications gathered by company, with the people you have noted alongside
          them. Everything here comes from you: the companies from applications you created,
          the people from contacts you entered.
        </p>

        {ready && (
          <div className="page-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setAdding((current) => !current)}
              aria-expanded={adding}
            >
              {adding ? "Close" : "Add a contact"}
            </button>
            <Link href="/applications" className="button button--ghost">
              Applications
            </Link>
          </div>
        )}
      </header>

      {/*
        Stated up front, not buried. A user who expects this screen to find people for them
        should learn that it does not within the first sentence they read, rather than
        concluding the feature is broken.
      */}
      <div className="notice" data-tone="info" style={{ marginBottom: 22 }}>
        <strong>This does not look anyone up</strong>
        There is no directory, no enrichment and no import behind this screen. It will never
        find contacts for you, and that is a decision rather than a missing feature,
        building it would mean scraping people who never agreed to be in a job-hunting
        database. You add the people you already know.
      </div>

      {error && (
        <p className="notice" data-tone="error" role="alert" style={{ marginBottom: 22 }}>
          <strong>That did not work</strong>
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton" />
        </div>
      )}

      {state.kind === "unauthenticated" && (
        <div className="notice" data-tone="info">
          <strong>Sign in to use this</strong>
          Both halves of this screen are your own stored data.{" "}
          <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            Create an account
          </Link>{" "}
          to start tracking.
        </div>
      )}

      {state.kind === "unconfigured" && (
        <div className="notice" data-tone="warn">
          <strong>No database configured</strong>
          {state.message}
        </div>
      )}

      {ready && (
        <div className="space-y-6">
          {adding && (
            <NewContactForm
              applications={applications}
              onCreate={create}
              onCancel={() => setAdding(false)}
            />
          )}

          {companies.length === 0 && !adding ? (
            <div className="empty-state">
              <div>
                <p>Nothing to map yet</p>
                <p>
                  Track an application and its company appears here. Add someone you know at
                  a company and they appear alongside it.
                </p>
              </div>
            </div>
          ) : (
            <ul className="company-list">
              {companies.map((company) => (
                <li key={company.name} className="pf-panel company" data-closed={company.allClosed}>
                  <div className="pf-panel__head">
                    <span>{company.name}</span>
                    {company.furthestStatus && (
                      <span className="company__stage" data-tone={statusTone(company.furthestStatus)}>
                        {/* The furthest stage reached, not the sum, see lib/network.ts. */}
                        {statusLabel(company.furthestStatus)}
                        {company.allClosed && " · closed"}
                      </span>
                    )}
                  </div>

                  {company.applications.map((application) => (
                    <div className="pf-row" key={application.id}>
                      <span>{application.role}</span>
                      <b>{statusLabel(application.status)}</b>
                    </div>
                  ))}

                  {company.contacts.map((contact) => (
                    <div className="pf-row company__contact" key={contact.id}>
                      <span>
                        <b>{contact.name}</b>
                        {contact.roleTitle && <small>{contact.roleTitle}</small>}
                        {contact.notes && <small>{contact.notes}</small>}
                      </span>
                      <span className="company__contact-actions">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="row-action">
                            Email
                          </a>
                        )}
                        {contact.contactUrl && (
                          <a
                            href={contact.contactUrl}
                            className="row-action"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Profile
                          </a>
                        )}
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => handleDelete(contact.id)}
                          disabled={busyId === contact.id}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  ))}

                  {company.contacts.length === 0 && (
                    <div className="pf-row company__none">
                      <span>No contacts noted here</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

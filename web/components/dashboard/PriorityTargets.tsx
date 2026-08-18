"use client";

/**
 * Priority Targets: what the user has decided to focus on.
 *
 * Not a recommendation feed. Every row here is on the list because the user starred it, and
 * that distinction is the whole point: the product does not get to decide which of somebody's
 * applications matters to their career.
 *
 * Two sections, because "a role I am chasing" and "a person I should contact" are different
 * kinds of next action and blending them produces a list nobody can act on.
 */

import Link from "next/link";

import { formatMatchScore, statusLabel, statusTone } from "@/lib/applications";
import type { ContactView } from "@/lib/network";
import type { ApplicationView } from "@/lib/use-applications";

/** Curated means short. A dashboard panel listing twenty "priorities" has none. */
const MAX_ROLES = 4;
const MAX_PEOPLE = 3;

export function PriorityTargets({
  applications,
  contacts,
}: {
  applications: ApplicationView[];
  contacts: ContactView[];
}) {
  const focus = applications
    .filter((application) => application.priority)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, MAX_ROLES);

  // People attached to an application the user starred. Without that link there is no
  // basis for calling somebody a priority, and guessing would be inventing a social graph.
  const focusIds = new Set(applications.filter((a) => a.priority).map((a) => a.id));
  const people = contacts
    .filter((contact) => contact.applicationId && focusIds.has(contact.applicationId))
    .slice(0, MAX_PEOPLE);

  const empty = focus.length === 0 && people.length === 0;

  return (
    <section className="obsidian-panel dash-panel">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Priority Targets</h2>
          <p className="dash-panel__sub">Roles and people you&apos;re focusing on</p>
        </div>
        <Link href="/applications" className="dash-panel__link">
          Manage all →
        </Link>
      </header>

      {empty ? (
        <div className="dash-panel__empty-block">
          <p>Nothing starred yet.</p>
          <p>
            Star an application in the table and it appears here. This list is yours to
            curate, and nothing gets added to it automatically.
          </p>
        </div>
      ) : (
        <>
          {focus.length > 0 && (
            <>
              <h3 className="dash-subhead">Focus roles</h3>
              <ul className="target-list">
                {focus.map((application) => (
                  <li key={application.id}>
                    <Link href={`/applications?open=${application.id}`}>
                      <span className="target-list__star" aria-hidden="true">
                        ★
                      </span>
                      <span className="target-list__main">
                        <b>{application.role}</b>
                        <small>{application.company}</small>
                      </span>
                      <span className="target-list__meta">
                        <span className="score-cell" data-scored={application.matchScore !== null}>
                          {formatMatchScore(application.matchScore, application.matchCalibrated)}
                        </span>
                        <span
                          className="status-chip"
                          data-tone={statusTone(application.status)}
                        >
                          {statusLabel(application.status)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {people.length > 0 && (
            <>
              <h3 className="dash-subhead">People to take action on</h3>
              <ul className="target-list">
                {people.map((contact) => (
                  <li key={contact.id}>
                    <div className="target-list__row">
                      <span className="hunt__mark" aria-hidden="true">
                        {contact.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="target-list__main">
                        <b>{contact.name}</b>
                        <small>
                          {[contact.roleTitle, contact.company].filter(Boolean).join(" · ") ||
                            "No role recorded"}
                        </small>
                      </span>
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="row-action">
                          Message
                        </a>
                      ) : (
                        <Link href="/outreach" className="row-action">
                          Draft
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {focus.length > 0 && people.length === 0 && (
            <p className="dash-panel__note">
              No contacts attached to a starred application yet. Add someone on the Network
              screen and link them to the role.
            </p>
          )}
        </>
      )}
    </section>
  );
}

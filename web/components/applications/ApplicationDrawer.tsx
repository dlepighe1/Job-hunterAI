"use client";

/**
 * One application, in the shared right-side drawer.
 *
 * A drawer rather than a route, because the question it answers, "what is this one, and
 * which résumé did I send?", is asked while scanning the table. Navigating away to answer
 * it loses the scroll position, the filters, and the user's place in a list they were
 * working through.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Drawer } from "@/components/ui/Drawer";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  engineLabel,
  matchDisplay,
  statusLabel,
  statusTone,
  workModelLabel,
} from "@/lib/applications";
import { formatAppDate } from "@/lib/format";
import type { ApplicationView } from "@/lib/use-applications";

interface EventRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  analysis_run: "Analysis run",
  status_changed: "Status changed",
  note_added: "Note added",
};

/**
 * The drawer shell. Splitting the body into its own component keyed on the application id
 * is what removes two whole classes of bug: the body's state (notes, expanded sections,
 * fetched detail) is initialised from props on mount rather than resynchronised by effects,
 * so opening a different application cannot leave the previous one's notes in the box.
 */
export function ApplicationDrawer({
  application,
  onClose,
  onPatch,
  busy,
}: {
  application: ApplicationView | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<ApplicationView>) => Promise<string | null>;
  busy: boolean;
}) {
  if (!application) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={application.role}
      subtitle={application.company}
      lead={<CompanyAvatar company={application.company} size="lg" />}
      aside={<DrawerMatch application={application} />}
      width="wide"
      footer={
        <>
          <Link href="/matcher" className="button button--ghost">
            Score against this
          </Link>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onPatch(application.id, { priority: !application.priority })}
            disabled={busy}
          >
            {application.priority ? "Remove from focus" : "Mark as focus"}
          </button>
        </>
      }
    >
      <ApplicationDetail
        key={application.id}
        application={application}
        onPatch={onPatch}
        busy={busy}
      />
    </Drawer>
  );
}

function ApplicationDetail({
  application,
  onPatch,
  busy,
}: {
  application: ApplicationView;
  onPatch: (id: string, patch: Partial<ApplicationView>) => Promise<string | null>;
  busy: boolean;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [posting, setPosting] = useState<string | null>(null);
  const [resumeUsed, setResumeUsed] = useState<{ id: string; label: string; content: string } | null>(
    null,
  );
  // Initialised from props, not synced by an effect, since the component remounts per
  // application, so there is nothing to resynchronise.
  const [notes, setNotes] = useState(application.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPosting, setShowPosting] = useState(false);
  const [showResume, setShowResume] = useState(false);

  const id = application.id;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/applications/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return;
        if (!body) {
          setError("Could not load the full detail for this application.");
          return;
        }
        setEvents(body.events ?? []);
        setPosting(body.application?.postingText ?? null);
        setResumeUsed(body.resume ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the full detail for this application.");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveNotes() {
    setSavingNotes(true);
    const failure = await onPatch(application.id, { notes });
    setSavingNotes(false);
    if (failure) setError(failure);
    else setNotesDirty(false);
  }

  return (
    <>
      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Something did not load</strong>
          {error}
        </p>
      )}

      <section className="drawer-section">
        <h3>Overview</h3>
        {/* Company and role are gone from this list: they are the drawer's own header now,
            and a detail grid that repeats its title is padding. */}
        <dl className="detail-grid">
          <div>
            <dt>Location</dt>
            <dd>{application.location || "Not recorded"}</dd>
          </div>
          {/* Optional context. Both degrade to nothing rather than printing an empty label,
              because a row reading "Industry —" tells the reader less than no row at all. */}
          {application.industry && (
            <div>
              <dt>Industry / Department</dt>
              <dd>{application.industry}</dd>
            </div>
          )}
          {application.workModel && (
            <div>
              <dt>Work model</dt>
              <dd>{workModelLabel(application.workModel)}</dd>
            </div>
          )}
          <div>
            <dt>Status</dt>
            <dd>
              <label className="sr-only" htmlFor="drawer-status">
                Status
              </label>
              <select
                id="drawer-status"
                className="status-select"
                data-tone={statusTone(application.status)}
                value={application.status}
                disabled={busy}
                onChange={(event) =>
                  onPatch(application.id, { status: event.target.value as ApplicationStatus })
                }
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          {application.postingUrl && (
            <div>
              <dt>Job posting</dt>
              <dd>
                <a
                  className="drawer-link"
                  href={application.postingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  View posting ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {application.matchScore !== null && (
        <p className="report__note drawer-note">
          Relevance of the résumé to this posting, measured by{" "}
          {engineLabel(application.matchEngine) ?? "the engine recorded on this row"}. Not a
          prediction of an interview.
        </p>
      )}

      <section className="drawer-section">
        <h3>Application</h3>
        <dl className="detail-grid">
          <div>
            <dt>Applied</dt>
            <dd>{formatAppDate(application.appliedAt) ?? "Not sent yet"}</dd>
          </div>
          <div>
            <dt>Employer responded</dt>
            <dd>{formatAppDate(application.respondedAt) ?? "No response recorded"}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{formatAppDate(application.lastActivityAt) ?? "Not recorded"}</dd>
          </div>
        </dl>
      </section>

      <section className="drawer-section">
        <h3>Job description</h3>
        {posting ? (
          <>
            {/* Collapsed by default: a full posting is a thousand words and would bury
                everything below it. */}
            <button type="button" className="row-action" onClick={() => setShowPosting((v) => !v)}>
              {showPosting ? "Hide posting" : "Show posting"}
            </button>
            {showPosting && <pre className="draft__body">{posting}</pre>}
          </>
        ) : (
          /* An absent posting is worth saying out loud rather than hiding the section: it is
             the one field whose absence costs the user something later, since without it the
             row cannot be rescored. */
          <p className="report__note">
            No job description saved. Add one if you want ResumeAI to use it for matching or
            future reference.
          </p>
        )}
      </section>

      <section className="drawer-section">
        <h3>Résumé used</h3>
        {resumeUsed ? (
          <>
            <div className="pf-panel">
              <div className="pf-row">
                <span>
                  <b>{resumeUsed.label}</b>
                </span>
                <button
                  type="button"
                  className="row-action"
                  onClick={() => setShowResume((v) => !v)}
                >
                  {showResume ? "Hide" : "Preview"}
                </button>
              </div>
            </div>
            {/* The preview happens here, in place. "Which résumé did I send them?" is the
                question this drawer exists to answer, and answering it by navigating to
                another screen loses the context that made it worth asking. */}
            {showResume && <pre className="draft__body">{resumeUsed.content}</pre>}
          </>
        ) : (
          <p className="report__note">
            No résumé recorded against this application. Saving an analysis from the matcher
            attaches the one that produced the score.
          </p>
        )}
      </section>

      <section className="drawer-section">
        <h3>Notes</h3>
        <textarea
          className="nm-textarea"
          style={{ width: "100%" }}
          rows={5}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setNotesDirty(true);
          }}
          placeholder="Recruiter name, interview feedback, salary discussed, your own read on it…"
        />
        {notesDirty && (
          <div className="page-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={saveNotes}
              disabled={savingNotes}
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setNotes(application.notes ?? "");
                setNotesDirty(false);
              }}
            >
              Discard
            </button>
          </div>
        )}
      </section>

      <section className="drawer-section">
        <h3>Timeline</h3>
        {events.length === 0 ? (
          <p className="report__note">
            Nothing logged yet. Saving an analysis or changing the status writes an entry here.
          </p>
        ) : (
          <ol className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <time dateTime={event.createdAt}>{formatAppDate(event.createdAt)}</time>
                <span>{EVENT_LABELS[event.kind] ?? event.kind}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/**
 * The score, engine and calibration state, in the drawer header beside the title.
 *
 * Here rather than in a Match section further down, because it is the thing the header of the
 * approved board leads with, and because a number that describes the whole record belongs
 * with the record's name rather than in a panel two scrolls below it.
 */
function DrawerMatch({ application }: { application: ApplicationView }) {
  const match = matchDisplay(application.matchScore, application.matchCalibrated);
  const engine = engineLabel(application.matchEngine);

  if (!match.scored) {
    return (
      <div className="drawer-match" data-scored="false">
        <b>{match.label}</b>
        <small>Not scored yet</small>
      </div>
    );
  }

  return (
    <div className="drawer-match" data-scored="true">
      <b>{match.label}</b>
      <small>
        {engine} · {match.calibration}
      </small>
    </div>
  );
}

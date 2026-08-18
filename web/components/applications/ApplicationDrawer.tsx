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

import { Drawer } from "@/components/ui/Drawer";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  formatMatchScore,
  statusLabel,
  statusTone,
} from "@/lib/applications";
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
        <dl className="detail-grid">
          <div>
            <dt>Company</dt>
            <dd>{application.company}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{application.role}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{application.location || "Not recorded"}</dd>
          </div>
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
        </dl>
      </section>

      <section className="drawer-section">
        <h3>Match</h3>
        <div className="pf-panel">
          <div className="pf-row">
            <span>Baseline score</span>
            <b className="score-cell" data-scored={application.matchScore !== null}>
              {formatMatchScore(application.matchScore, application.matchCalibrated)}
            </b>
          </div>
          <div className="pf-row">
            <span>Engine</span>
            <b>{application.matchEngine ?? "n/a"}</b>
          </div>
        </div>
        {application.matchScore !== null && (
          <p className="report__note">
            Relevance of the résumé to this posting. Not a prediction of an interview.
          </p>
        )}
      </section>

      <section className="drawer-section">
        <h3>Application</h3>
        <dl className="detail-grid">
          <div>
            <dt>Applied</dt>
            <dd>{application.appliedAt ?? "Not sent yet"}</dd>
          </div>
          <div>
            <dt>Employer responded</dt>
            <dd>{application.respondedAt?.slice(0, 10) ?? "No response recorded"}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{application.lastActivityAt.slice(0, 10)}</dd>
          </div>
        </dl>
      </section>

      {posting && (
        <section className="drawer-section">
          <h3>Job description</h3>
          {/* Collapsed by default: a full posting is a thousand words and would bury
              everything below it. */}
          <button type="button" className="row-action" onClick={() => setShowPosting((v) => !v)}>
            {showPosting ? "Hide posting" : "Show posting"}
          </button>
          {showPosting && <pre className="draft__body">{posting}</pre>}
        </section>
      )}

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
                <time dateTime={event.createdAt}>{event.createdAt.slice(0, 10)}</time>
                <span>{EVENT_LABELS[event.kind] ?? event.kind}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

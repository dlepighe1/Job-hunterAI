"use client";

/**
 * One résumé, previewed in the shared drawer.
 *
 * Wide, because a résumé in a 480px column is not a preview of anything.
 *
 * A master's tailored versions are listed here rather than in the library. They are version
 * history: forty near-identical documents in the main grid is not a library, and the question
 * "which versions came from this one" is only ever asked while looking at the master.
 */

import Link from "next/link";
import { useMemo } from "react";

import { Drawer } from "@/components/ui/Drawer";
import { formatMatchScore } from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";
import type { ResumeView } from "@/lib/use-resumes";

export function ResumeDrawer({
  resume,
  versions,
  applications,
  onClose,
  onUseInMatcher,
  onMakeDefault,
  onDelete,
  busy,
}: {
  resume: (ResumeView & { content: string }) | null;
  versions: ResumeView[];
  applications: ApplicationView[];
  onClose: () => void;
  onUseInMatcher: (resume: ResumeView & { content: string }) => void;
  onMakeDefault: (id: string) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  /** Applications that recorded this résumé as the one sent. */
  const usedIn = useMemo(
    () => applications.filter((application) => application.resumeId === resume?.id),
    [applications, resume?.id],
  );

  /**
   * Median baseline match across the applications that used it.
   *
   * Median rather than mean for the same reason as everywhere else in this product: these
   * are ranking scores, and one unusual posting should not move the figure that describes a
   * document's general performance.
   */
  const medianMatch = useMemo(() => {
    const scores = usedIn
      .map((application) => application.matchScore)
      .filter((score): score is number => score !== null)
      .sort((a, b) => a - b);
    return scores.length > 0 ? scores[Math.floor((scores.length - 1) / 2)] : null;
  }, [usedIn]);

  if (!resume) return null;

  return (
    <Drawer
      open={resume !== null}
      onClose={onClose}
      title={resume.label}
      subtitle={resume.isTailored ? "Tailored version" : "Master résumé"}
      width="wide"
      footer={
        <>
          <button
            type="button"
            className="button button--primary"
            onClick={() => onUseInMatcher(resume)}
          >
            Use in matcher
          </button>
          {!resume.isDefault && !resume.isTailored && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => onMakeDefault(resume.id)}
              disabled={busy}
            >
              Make default
            </button>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onDelete(resume.id)}
            disabled={busy}
          >
            Delete
          </button>
        </>
      }
    >
      <section className="drawer-section">
        <dl className="detail-grid">
          <div>
            <dt>Target role</dt>
            <dd>{resume.targetRole || "Not set"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{resume.filePath ? "Uploaded PDF" : "Pasted text"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{resume.updatedAt.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Used in</dt>
            <dd>
              {usedIn.length} {usedIn.length === 1 ? "application" : "applications"}
            </dd>
          </div>
        </dl>

        {resume.note && <p className="resume-note">{resume.note}</p>}
      </section>

      {medianMatch !== null && (
        <section className="drawer-section">
          <h3>Match history</h3>
          <div className="pf-panel">
            <div className="pf-stat">
              <small>MEDIAN BASELINE MATCH</small>
              <strong>{formatMatchScore(medianMatch, true).split(" ")[0]}</strong>
              <p>
                Out of 100, the middle value across {usedIn.length} scored{" "}
                {usedIn.length === 1 ? "application" : "applications"} that used this résumé.
                A median rather than an average, because one unusual posting should not
                redefine how a document generally performs.
              </p>
            </div>
          </div>
        </section>
      )}

      {usedIn.length > 0 && (
        <section className="drawer-section">
          <h3>Applications</h3>
          <ul className="target-list">
            {usedIn.map((application) => (
              <li key={application.id}>
                <Link href={`/applications?open=${application.id}`}>
                  <span className="target-list__main">
                    <b>{application.role}</b>
                    <small>{application.company}</small>
                  </span>
                  <span className="score-cell" data-scored={application.matchScore !== null}>
                    {formatMatchScore(application.matchScore, application.matchCalibrated)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {versions.length > 0 && (
        <section className="drawer-section">
          <h3>Tailored versions</h3>
          <ul className="target-list">
            {versions.map((version) => (
              <li key={version.id}>
                <div className="target-list__row">
                  <span className="target-list__main">
                    <b>{version.label}</b>
                    <small>Created {version.createdAt.slice(0, 10)}</small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="report__note">
            These came from this résumé and never replaced it. The master above is what the
            matcher reaches for.
          </p>
        </section>
      )}

      <section className="drawer-section">
        <h3>Preview</h3>
        <pre className="draft__body resume-preview">{resume.content}</pre>
      </section>
    </Drawer>
  );
}

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

import { ResumeDocumentViewer } from "@/components/resumes/ResumeDocumentViewer";
import { FileIcon } from "@/components/icons";
import { Drawer } from "@/components/ui/Drawer";
import { engineLabel, matchDisplay, statusLabel, statusTone } from "@/lib/applications";
import { formatAppDate } from "@/lib/format";
import type { ApplicationView } from "@/lib/use-applications";
import type { ResumeDocument, ResumeView } from "@/lib/use-resumes";

export function ResumeDrawer({
  resume,
  versions,
  applications,
  fetchDocument,
  onClose,
  onUseInMatcher,
  onMakeDefault,
  onDelete,
  busy,
}: {
  resume: (ResumeView & { content: string }) | null;
  versions: ResumeView[];
  applications: ApplicationView[];
  fetchDocument: (id: string) => Promise<ResumeDocument | null>;
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
      lead={
        <span className="company-avatar" data-size="lg" aria-hidden="true">
          <FileIcon />
        </span>
      }
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
          {/* "Source: pasted text" is deliberately gone. It described how the row was
              created rather than anything about the résumé, and it read as a defect on every
              record made before uploads stored the file. */}
          <div>
            <dt>Updated</dt>
            <dd>{formatAppDate(resume.updatedAt) ?? "Not recorded"}</dd>
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

      <section className="drawer-section">
        <h3>Match history</h3>

        {usedIn.length === 0 ? (
          /* The brief's wording, and it applies to tailored versions exactly as it does to
             masters: a document nothing has been scored against has no history, and inventing
             a number to fill the panel is the thing this product exists not to do. */
          <p className="report__note">
            N/A — this résumé has not been matched with anything yet.
          </p>
        ) : (
          <>
            <div className="pf-panel">
              <table className="pf-table match-history">
                <caption className="sr-only">
                  Applications this résumé was sent to, with the score each one recorded.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Role</th>
                    <th scope="col" data-numeric="true">Match</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usedIn.map((application) => {
                    const match = matchDisplay(
                      application.matchScore,
                      application.matchCalibrated,
                    );
                    return (
                      <tr key={application.id}>
                        <td>
                          <Link href={`/applications?open=${application.id}`}>
                            {application.company}
                          </Link>
                        </td>
                        <td>{application.role}</td>
                        <td data-numeric="true">
                          <span className="score-cell" data-scored={match.scored}>
                            {match.scored ? match.label : "N/A"}
                          </span>
                        </td>
                        <td>
                          <span
                            className="status-chip"
                            data-tone={statusTone(application.status)}
                          >
                            {statusLabel(application.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {medianMatch !== null && (
              <p className="report__note">
                Median {matchDisplay(medianMatch, true).label} across the scored applications
                that used this résumé, measured by{" "}
                {engineLabel(usedIn.find((a) => a.matchEngine)?.matchEngine ?? null) ??
                  "the engine recorded on each row"}
                . A median rather than an average, because one unusual posting should not
                redefine how a document generally performs.
              </p>
            )}
          </>
        )}
      </section>

      {versions.length > 0 && (
        <section className="drawer-section">
          <h3>Tailored versions</h3>
          <ul className="target-list">
            {versions.map((version) => (
              <li key={version.id}>
                <div className="target-list__row">
                  <span className="target-list__main">
                    <b>{version.label}</b>
                    <small>Created {formatAppDate(version.createdAt) ?? "recently"}</small>
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
        {/* The actual uploaded document, through a signed URL. Not the extracted text in a
            page-shaped box, which would look like a document and be a claim about what is
            stored that is not true. */}
        <ResumeDocumentViewer
          key={resume.id}
          resumeId={resume.id}
          label={resume.label}
          hasFile={resume.filePath !== null}
          fetchDocument={fetchDocument}
        />
      </section>
    </Drawer>
  );
}

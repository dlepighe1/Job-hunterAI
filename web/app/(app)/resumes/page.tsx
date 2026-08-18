"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ResumeDrawer } from "@/components/resumes/ResumeDrawer";
import { ResumeEditor } from "@/components/resumes/ResumeEditor";
import { useApplications } from "@/lib/use-applications";
import { useResumes, type ResumeView } from "@/lib/use-resumes";

/**
 * Saved résumés (FEATURES.md §5).
 *
 * The library shows MASTERS. Tailored versions are version history reached through their
 * master, not entries beside it, because a library of forty near-identical documents is not a
 * library, and the master is the thing the user actually reuses.
 *
 * The list never carries résumé text: `listResumes` does not select `content`, so it is not
 * merely hidden here: it never leaves the database. Opening one is an explicit fetch.
 */
export default function ResumesPage() {
  const router = useRouter();
  const { resumes, state, reload, create, update, remove, fetchContent } = useResumes();
  const { applications } = useApplications();

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ResumeView | null>(null);
  const [previewing, setPreviewing] = useState<(ResumeView & { content: string }) | null>(null);
  const [query, setQuery] = useState("");
  const [showTailored, setShowTailored] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const masters = useMemo(
    () => resumes.filter((resume) => !resume.isTailored),
    [resumes],
  );
  const tailored = useMemo(() => resumes.filter((resume) => resume.isTailored), [resumes]);

  const shown = (showTailored ? tailored : masters).filter((resume) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      resume.label.toLowerCase().includes(needle) ||
      (resume.targetRole ?? "").toLowerCase().includes(needle)
    );
  });

  const usageCount = (id: string) =>
    applications.filter((application) => application.resumeId === id).length;

  async function open(resume: ResumeView) {
    setBusyId(resume.id);
    const content = await fetchContent(resume.id);
    setBusyId(null);
    if (content === null) {
      setError("Could not open that résumé. Try again in a moment.");
      return;
    }
    setPreviewing({ ...resume, content });
  }

  async function openForEdit(resume: ResumeView) {
    setBusyId(resume.id);
    const content = await fetchContent(resume.id);
    setBusyId(null);
    if (content === null) {
      setError("Could not open that résumé.");
      return;
    }
    setComposing(false);
    setPreviewing(null);
    setEditing({ ...resume, content });
  }

  async function save(input: { label: string; content: string }): Promise<string | null> {
    if (editing) {
      const failure = await update(editing.id, input);
      if (!failure) setEditing(null);
      return failure;
    }
    const outcome = await create(input);
    if ("error" in outcome) return outcome.error;
    setComposing(false);
    return null;
  }

  /**
   * Hand the résumé to the matcher.
   *
   * Passes the ID, never the text. A résumé is personal data and SPEC Part 7 keeps it out
   * of URLs; a uuid is not the document, and the matcher still has to be signed in to
   * fetch it.
   */
  function useInMatcher(resume: ResumeView) {
    router.push(`/matcher?resume=${resume.id}`);
  }

  const editorOpen = composing || editing !== null;

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">RESUMES</span>
        <h1>Manage your master résumés and tailored versions</h1>
        <p>
          Keep more than one, label them so you can tell them apart, and pick the default the
          matcher reaches for. Each saved analysis records which résumé produced it, so a
          score and the document behind it never come apart.
        </p>

        {state.kind === "ready" && !editorOpen && (
          <div className="page-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setEditing(null);
                setComposing(true);
              }}
            >
              Upload résumé
            </button>

            <div className="view-toggle" role="group" aria-label="Library">
              <button type="button" aria-pressed={!showTailored} onClick={() => setShowTailored(false)}>
                Masters ({masters.length})
              </button>
              <button type="button" aria-pressed={showTailored} onClick={() => setShowTailored(true)}>
                Tailored ({tailored.length})
              </button>
            </div>
          </div>
        )}
      </header>

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
          <strong>Sign in to save résumés</strong>
          A saved résumé is stored against an account. The matcher works signed out, so paste
          the text and it keeps no copy.{" "}
          <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            Create an account
          </Link>{" "}
          to stop pasting it every time.
        </div>
      )}

      {state.kind === "unconfigured" && (
        <div className="notice" data-tone="warn">
          <strong>No database configured</strong>
          {state.message}
        </div>
      )}

      {state.kind === "failed" && (
        <div className="notice" data-tone="error" role="alert">
          <strong>Could not load your résumés</strong>
          {state.message}
          <div className="page-actions">
            <button type="button" className="button button--ghost" onClick={reload}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="space-y-6">
          {editorOpen && (
            <ResumeEditor
              key={editing?.id ?? "new"}
              editing={editing}
              onSave={save}
              onCancel={() => {
                setComposing(false);
                setEditing(null);
              }}
            />
          )}

          {!editorOpen && resumes.length > 0 && (
            <div className="applications__controls">
              <div className="field">
                <label htmlFor="resume-search">Search</label>
                <input
                  id="resume-search"
                  type="search"
                  className="nm-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Label or target role…"
                />
              </div>
            </div>
          )}

          {shown.length === 0 && !editorOpen ? (
            <div className="empty-state">
              <div>
                <p>
                  {showTailored ? "No tailored versions yet" : "Add your first master résumé."}
                </p>
                <p>
                  {showTailored
                    ? "Elevating a résumé in the matcher creates a version here. Your master is never overwritten."
                    : "Paste one or upload a PDF. Nothing is stored until you save it, and you can correct the extracted text first, because PDF extraction is reliably imperfect."}
                </p>
              </div>
            </div>
          ) : (
            shown.length > 0 && (
              <ul className="resume-grid">
                {shown.map((resume) => {
                  const uses = usageCount(resume.id);
                  return (
                    <li key={resume.id} className="pf-panel resume-tile">
                      <button
                        type="button"
                        className="resume-tile__open"
                        onClick={() => open(resume)}
                        disabled={busyId === resume.id}
                      >
                        <span className="resume-tile__doc" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <path d="M6 2h8l4 4v16H6z" />
                            <path d="M14 2v5h5M9 12h6M9 16h6" />
                          </svg>
                        </span>

                        <span className="resume-tile__body">
                          <b>{resume.label}</b>
                          {resume.isDefault && (
                            <span className="resume-card__default">DEFAULT</span>
                          )}
                          <small>{resume.targetRole || "No target role set"}</small>
                          <small>
                            Updated {resume.updatedAt.slice(0, 10)} ·{" "}
                            {uses === 0 ? "not used yet" : `used in ${uses}`}
                          </small>
                          {resume.note && <em>{resume.note}</em>}
                        </span>
                      </button>

                      <div className="resume-tile__actions">
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => open(resume)}
                          disabled={busyId === resume.id}
                        >
                          {busyId === resume.id ? "Opening…" : "Preview"}
                        </button>
                        <button
                          type="button"
                          className="row-action"
                          onClick={() => openForEdit(resume)}
                          disabled={busyId === resume.id}
                        >
                          Edit
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

      <ResumeDrawer
        resume={previewing}
        versions={tailored.filter((version) => version.parentId === previewing?.id)}
        applications={applications}
        onClose={() => setPreviewing(null)}
        onUseInMatcher={useInMatcher}
        onMakeDefault={async (id) => {
          setBusyId(id);
          setError(await update(id, { isDefault: true }));
          setBusyId(null);
        }}
        onDelete={async (id) => {
          setBusyId(id);
          setError(await remove(id));
          setBusyId(null);
          setPreviewing(null);
        }}
        busy={busyId !== null}
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AddResumeForm } from "@/components/resumes/AddResumeForm";
import { ResumeCard } from "@/components/resumes/ResumeCard";
import { ResumeDrawer } from "@/components/resumes/ResumeDrawer";
import { ResumeEditor } from "@/components/resumes/ResumeEditor";
import { useApplications } from "@/lib/use-applications";
import { useResumes, type ResumeView } from "@/lib/use-resumes";

/**
 * Saved résumés (FEATURES.md §5).
 *
 * **The library now lists masters AND tailored versions**, filtered by a Mode dropdown, where
 * it previously showed masters only and reached tailored versions through their parent. That
 * reverses a documented decision, deliberately and at the brief's instruction: a tailored
 * résumé is a real document that was really sent, and a library that hides it cannot answer
 * "what did I actually send them" without first knowing which master it came from.
 *
 * What has NOT changed is the lineage: `parent_id` still records what a tailored version came
 * from, elevating still never overwrites a master, and the preview drawer still shows a
 * master's versions. Listing them side by side is a presentation change, not a data one.
 *
 * The list never carries résumé text: `listResumes` does not select `content`, so it is not
 * merely hidden here, it never leaves the database. Opening one is an explicit fetch.
 */
type Mode = "all" | "master" | "tailored";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "all", label: "All" },
  { value: "master", label: "Master" },
  { value: "tailored", label: "Tailored" },
];

export default function ResumesPage() {
  const router = useRouter();
  const { resumes, state, reload, create, createFromFile, update, remove, fetchContent, fetchDocument } =
    useResumes();
  const { applications } = useApplications();

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ResumeView | null>(null);
  const [previewing, setPreviewing] = useState<(ResumeView & { content: string }) | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tailored = useMemo(() => resumes.filter((resume) => resume.isTailored), [resumes]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resumes.filter((resume) => {
      if (mode === "master" && resume.isTailored) return false;
      if (mode === "tailored" && !resume.isTailored) return false;
      if (!needle) return true;
      return (
        resume.label.toLowerCase().includes(needle) ||
        (resume.targetRole ?? "").toLowerCase().includes(needle)
      );
    });
  }, [resumes, mode, query]);

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

  /** The editor path, reached by renaming or by correcting a flagged extraction. */
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
   * Passes the ID, never the text. A résumé is personal data and SPEC Part 7 keeps it out of
   * URLs; a uuid is not the document, and the matcher still has to be signed in to fetch it.
   */
  function useInMatcher(resume: ResumeView) {
    router.push(`/matcher?resume=${resume.id}`);
  }

  const editorOpen = composing || editing !== null;

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">RESUMES</span>
        <h1>Manage your master and tailored résumés</h1>
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
                setComposing((value) => !value);
              }}
              aria-expanded={composing}
            >
              {composing ? "Close" : "Upload résumé"}
            </button>

            {/* Filtering moved right, and the Masters | Tailored tabs are gone. */}
            <div className="field field--inline resumes__mode">
              <label htmlFor="resume-mode">Mode</label>
              <select
                id="resume-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as Mode)}
              >
                {MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </header>

      {notice && (
        <p className="notice" data-tone="warn" role="status" style={{ marginBottom: 22 }}>
          <strong>Worth a look</strong>
          {notice}
        </p>
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
          {/* One state at a time: the add form, the editor, or the library. */}
          {editing !== null ? (
            <ResumeEditor
              key={editing.id}
              editing={editing}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : composing ? (
            <AddResumeForm
              onCancel={() => setComposing(false)}
              onCreate={async (input) => {
                const outcome = await createFromFile(input);
                if ("error" in outcome) return outcome;

                setComposing(false);
                setNotice(
                  outcome.quality.verdict === "degraded" ? outcome.quality.reason : null,
                );
                return { quality: outcome.quality };
              }}
            />
          ) : (
            <>
              {resumes.length > 0 && (
                <div className="applications__controls">
                  <div className="field">
                    <label htmlFor="resume-search">Search</label>
                    <input
                      id="resume-search"
                      type="search"
                      className="nm-input"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Résumé name or target role…"
                    />
                  </div>
                  <p className="applications__count" aria-live="polite">
                    {shown.length} of {resumes.length}
                  </p>
                </div>
              )}

              {shown.length === 0 ? (
                <div className="empty-state">
                  <div>
                    <p>
                      {resumes.length === 0
                        ? "No résumés yet. Upload one to start matching jobs."
                        : "No résumé matches that search and filter."}
                    </p>
                    <p>
                      {resumes.length === 0
                        ? "Upload a PDF, DOCX or TXT. The text is read out of it for matching, and the document itself is kept so you can look at what you actually sent."
                        : "Clear the search, or switch Mode back to All."}
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="resume-grid">
                  {shown.map((resume) => (
                    <ResumeCard
                      key={resume.id}
                      resume={resume}
                      usedIn={usageCount(resume.id)}
                      busy={busyId === resume.id}
                      onPreview={() => open(resume)}
                      onRename={() => openForEdit(resume)}
                      onDelete={async () => {
                        setBusyId(resume.id);
                        setError(await remove(resume.id));
                        setBusyId(null);
                      }}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <ResumeDrawer
        resume={previewing}
        versions={tailored.filter((version) => version.parentId === previewing?.id)}
        applications={applications}
        fetchDocument={fetchDocument}
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

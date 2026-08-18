"use client";

/**
 * Add or edit a resume.
 *
 * Three ways in, namely paste, upload a PDF, or open an existing one, and all three land in the
 * same textarea before anything is stored. FEATURES.md §5: "extraction is imperfect and the
 * user should be able to fix it." Saving straight from the parser would mean the first
 * version of their resume the product holds is one nobody read.
 */

import { useRef, useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { MIN_WORDS, wordCount } from "@/lib/types";
import type { ResumeView } from "@/lib/use-resumes";

export function ResumeEditor({
  editing,
  onSave,
  onCancel,
}: {
  /** The resume being edited, or null when composing a new one. */
  editing: ResumeView | null;
  onSave: (input: {
    label: string;
    content: string;
    targetRole?: string | null;
    note?: string | null;
  }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [targetRole, setTargetRole] = useState(editing?.targetRole ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const words = wordCount(content);
  const short = words > 0 && words < MIN_WORDS;
  const ready = label.trim().length > 0 && words >= MIN_WORDS && !saving;

  async function upload(file: File) {
    setExtracting(true);
    setError(null);
    setNotice(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/resumes/extract", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "That PDF could not be read.");
        return;
      }

      setContent(body.content);
      // Naming the resume after the file is a good guess, not a decision, since the user can
      // change it, and an empty label is worse than a guess they can see.
      if (!label.trim()) setLabel(file.name.replace(/\.pdf$/i, "").slice(0, 120));
      setNotice(
        `Extracted ${body.pages} page${body.pages === 1 ? "" : "s"}. Read it before saving, because PDF extraction reorders columns and drops formatting more often than you would expect.`,
      );
    } catch {
      setError("Could not reach the server. Nothing was uploaded.");
    } finally {
      setExtracting(false);
      // Let the same file be chosen again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setSaving(true);
    setError(null);

    const failure = await onSave({
      label: label.trim(),
      content,
      targetRole: targetRole.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <form className="pf-panel resume-editor" onSubmit={submit}>
      <div className="pf-panel__head">{editing ? "EDIT RESUME" : "ADD A RESUME"}</div>

      <div className="resume-editor__body">
        <div className="field">
          <label htmlFor="resume-label">Label</label>
          <input
            id="resume-label"
            className="nm-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            placeholder="Data engineer, 2026"
            disabled={saving}
          />
          <p className="field__hint">
            For you, not for an employer. Something that tells two versions apart.
          </p>
        </div>

        {/* Both optional. §65: do not demand metadata before a résumé can be saved, since the
            document is the thing, and a required "target role" field is a wall in front of
            it. */}
        <div className="field">
          <label htmlFor="resume-target">Target role</label>
          <input
            id="resume-target"
            className="nm-input"
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            maxLength={160}
            placeholder="Optional: Backend Engineer"
            disabled={saving}
          />
        </div>

        <div className="field">
          <label htmlFor="resume-note">Note</label>
          <input
            id="resume-note"
            className="nm-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            placeholder="Optional: Primary backend résumé"
            disabled={saving}
          />
        </div>

        <div className="field">
          <div className="field__head">
            <label htmlFor="resume-content">Resume text</label>
            <span className="field__count" data-short={short}>
              {words} {words === 1 ? "word" : "words"}
              {short && ` , need ${MIN_WORDS} in total`}
            </span>
          </div>
          <textarea
            id="resume-content"
            className="nm-textarea"
            rows={16}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={saving || extracting}
            placeholder="Paste the resume text, or upload a PDF below…"
          />
        </div>

        <div className="resume-editor__upload">
          <input
            ref={fileInput}
            id="resume-pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={extracting || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="button button--ghost"
            onClick={() => fileInput.current?.click()}
            disabled={extracting || saving}
          >
            {extracting ? (
              <>
                <SpinnerIcon className="h-4 w-4 animate-spin" />
                Reading the PDF…
              </>
            ) : (
              "Upload a PDF"
            )}
          </button>
          <span className="resume-editor__hint">
            Text is extracted in the browser session and shown here first. Nothing is stored
            until you save.
          </span>
        </div>

        {notice && (
          <p className="notice" data-tone="info">
            <strong>Check the text</strong>
            {notice}
          </p>
        )}

        {error && (
          <p className="notice" data-tone="error" role="alert">
            <strong>Not saved</strong>
            {error}
          </p>
        )}

        <div className="resume-editor__actions">
          <button type="submit" className="button button--primary" disabled={!ready}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save resume"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

"use client";

/**
 * Add a résumé.
 *
 * Four fields, per the approved board: Label, Target role, Note, Upload file. The pasted-text
 * editor that used to live here is gone.
 *
 * Removing it was only defensible because the extraction was rebuilt at the same time. The
 * old form showed everyone a textarea of extracted text to proofread, because extraction was
 * unreliable and there was no way to know when it had gone wrong. It now reconstructs reading
 * order properly and grades its own output, so the text is shown for review only when the
 * grade says it is worth looking at, which is the point of `lib/extraction/quality.ts`.
 *
 * `ResumeEditor` still exists and still edits text; it is reached by editing a saved résumé,
 * which is where correcting a bad extraction now happens.
 */

import { useId, useState } from "react";

import { FileDropzone } from "@/components/ui/FileDropzone";
import type { ExtractionNotice } from "@/lib/use-resumes";

export function AddResumeForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: {
    file: File;
    label: string;
    targetRole: string | null;
    note: string | null;
  }) => Promise<{ quality: ExtractionNotice } | { error: string }>;
  onCancel: () => void;
}) {
  const ids = useId();
  const [label, setLabel] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = label.trim().length > 0 && file !== null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || saving || !file) return;

    setSaving(true);
    setError(null);

    const outcome = await onCreate({
      file,
      label: label.trim(),
      targetRole: targetRole.trim() || null,
      note: note.trim() || null,
    });

    setSaving(false);
    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }

    setLabel("");
    setTargetRole("");
    setNote("");
    setFile(null);
  }

  return (
    <form className="pf-panel add-resume" onSubmit={submit}>
      <div className="pf-panel__head">ADD A RÉSUMÉ</div>

      <div className="field">
        <label htmlFor={`${ids}-label`}>Label</label>
        <input
          id={`${ids}-label`}
          className="nm-input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Data engineer, 2026"
        />
      </div>

      <div className="field">
        <label htmlFor={`${ids}-role`}>
          Target role <span className="field__optional">(optional)</span>
        </label>
        <input
          id={`${ids}-role`}
          className="nm-input"
          value={targetRole}
          onChange={(event) => setTargetRole(event.target.value)}
          maxLength={160}
          placeholder="e.g. Backend Engineer"
        />
      </div>

      <div className="field">
        <label htmlFor={`${ids}-note`}>
          Note <span className="field__optional">(optional)</span>
        </label>
        <textarea
          id={`${ids}-note`}
          className="nm-textarea"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          placeholder="Add a short note about this résumé…"
        />
      </div>

      <div className="field">
        <label htmlFor={`${ids}-file`}>Upload file</label>
        <FileDropzone id={`${ids}-file`} file={file} onFile={setFile} busy={saving} />
      </div>

      <p className="field__hint add-resume__privacy">
        Your résumé is private. It is used to generate matches and insights, and nothing else.
      </p>

      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Not saved</strong>
          {error}
        </p>
      )}

      <div className="new-application__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!ready || saving}>
          {saving ? "Saving…" : "Save résumé"}
        </button>
      </div>
    </form>
  );
}

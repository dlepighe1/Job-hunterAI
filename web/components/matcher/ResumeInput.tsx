"use client";

/**
 * The résumé half of the matcher, in three modes.
 *
 * Upload, Choose from Resumes, Paste. **One is rendered at a time.** The approved board shows
 * all three side by side under the heading "Résumé input modes (3 states)", which is a legend
 * for the engineering team rather than a screen: rendering three inputs for one value would
 * make "which of these is the résumé being scored" unanswerable.
 *
 * Switching modes does NOT clear the text. Someone who pastes a résumé, glances at Upload and
 * comes back has not asked to lose their work, and re-pasting it is the cost of guessing that
 * they did. The only thing a mode switch changes is which control is visible.
 *
 * The picker is hidden entirely for a guest rather than disabled: the matcher's promise to a
 * signed-out visitor is that it stores nothing, and a greyed-out "choose a saved résumé"
 * advertises an account feature on the one screen where that promise matters most.
 */

import { useState } from "react";

import { SavedResumePicker } from "@/components/matcher/SavedResumePicker";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { MIN_WORDS } from "@/lib/types";

type Mode = "upload" | "saved" | "paste";

export function ResumeInput({
  value,
  onChange,
  words,
  disabled,
  isGuest,
}: {
  value: string;
  onChange: (text: string) => void;
  words: number;
  disabled: boolean;
  isGuest: boolean;
}) {
  // A guest has no saved résumés, so "Choose from Resumes" would open onto an empty list.
  const [mode, setMode] = useState<Mode>(isGuest ? "paste" : "saved");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const modes: Array<{ id: Mode; label: string }> = [
    { id: "upload", label: "Upload" },
    ...(isGuest ? [] : [{ id: "saved" as Mode, label: "Choose from Resumes" }]),
    { id: "paste", label: "Paste" },
  ];

  /**
   * Extraction only. Nothing is stored.
   *
   * The Résumés screen saves; this reads a file the user picked so it can be scored right
   * now. A guest gets a 401 here, which is correct: extraction spends CPU on attacker-
   * supplied bytes and the endpoint requires a session.
   */
  async function extract(chosen: File | null) {
    setFile(chosen);
    setError(null);
    setNotice(null);
    if (!chosen) return;

    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", chosen, chosen.name);
      const response = await fetch("/api/resumes/extract", { method: "POST", body: form });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.message ?? "That file could not be read.");
        return;
      }

      onChange(body.content ?? "");
      // The gate's verdict, surfaced only when it has something to say.
      if (body.quality?.verdict === "degraded" && body.quality.reason) {
        setNotice(body.quality.reason);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section className="matcher-field">
      <div className="field__head">
        <h2>Résumé</h2>
        <span className="field__count" data-short={words > 0 && words < MIN_WORDS}>
          {words} {words === 1 ? "word" : "words"}
        </span>
      </div>

      <div className="nm-segment__options" role="group" aria-label="Résumé input mode">
        {modes.map((option) => (
          <button
            key={option.id}
            type="button"
            className="nm-option"
            aria-pressed={mode === option.id}
            disabled={disabled}
            onClick={() => setMode(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "upload" && (
        <FileDropzone
          id="matcher-resume-file"
          file={file}
          onFile={extract}
          busy={extracting || disabled}
          error={error}
        />
      )}

      {mode === "saved" && !isGuest && (
        <SavedResumePicker
          onLoad={onChange}
          disabled={disabled}
          fieldIsEmpty={value.length === 0}
        />
      )}

      {mode === "paste" && (
        <textarea
          id="matcher-resume"
          className="nm-textarea"
          rows={14}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="Paste the résumé text here…"
          aria-label="Résumé text"
        />
      )}

      {notice && (
        <p className="notice" data-tone="warn" role="status">
          <strong>Worth a look</strong>
          {notice} Switch to Paste to correct it before analysing.
        </p>
      )}

      {/* Whatever mode produced it, the text is what gets scored, so its state is reported
          in every mode rather than only in the one with a textarea. */}
      {mode !== "paste" && value.length > 0 && (
        <p className="field__hint">
          {words} words loaded. Switch to Paste to read or edit them.
        </p>
      )}
    </section>
  );
}

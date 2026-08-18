"use client";

/**
 * Load a saved resume into the matcher (FEATURES.md §3.1, "select a saved resume").
 *
 * Renders nothing at all for a guest, or for a deployment with no database. The matcher's
 * whole promise to a signed-out visitor is that it stores nothing, and a disabled "choose a
 * saved resume" control would advertise a feature that contradicts that promise on the one
 * screen where it matters most.
 */

import { useEffect, useRef, useState } from "react";

import { useResumes } from "@/lib/use-resumes";

export function SavedResumePicker({
  onLoad,
  disabled,
  fieldIsEmpty,
}: {
  onLoad: (content: string) => void;
  disabled: boolean;
  /** Whether the resume box is still untouched. Gates the one-time auto-load below. */
  fieldIsEmpty: boolean;
}) {
  const { resumes, state, fetchContent } = useResumes();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A latch, not state: nothing renders from it, so making it state would only add a
   *  render and a cascading-update warning to record that something already happened. */
  const autoLoaded = useRef(false);

  const defaultResume = resumes.find((resume) => resume.isDefault);

  /**
   * Load the default once, on arrival, into an empty box.
   *
   * Guarded on `autoLoaded` and on the textarea being untouched, because overwriting text the user
   * has already pasted or edited would destroy work to save a click, which is the wrong
   * trade in both directions.
   */
  useEffect(() => {
    if (autoLoaded.current || state.kind !== "ready" || !defaultResume || !fieldIsEmpty) return;
    autoLoaded.current = true;

    let cancelled = false;
    fetchContent(defaultResume.id).then((content) => {
      // Re-checked on arrival: the fetch is not instant, and the user may well have started
      // typing while it was in flight. Filling the box under them would be worse than not
      // filling it at all.
      if (!cancelled && content && fieldIsEmpty) onLoad(content);
    });

    return () => {
      cancelled = true;
    };
  }, [defaultResume, fetchContent, fieldIsEmpty, onLoad, state.kind]);

  // Nothing to offer, or nothing that should be offered.
  if (state.kind !== "ready" || resumes.length === 0) return null;

  async function choose(id: string) {
    if (!id) return;
    setLoading(id);
    setError(null);

    const content = await fetchContent(id);
    setLoading(null);

    if (content === null) {
      setError("Could not load that resume. Paste the text instead.");
      return;
    }
    onLoad(content);
  }

  return (
    <div className="saved-resume">
      <label htmlFor="saved-resume">Use a saved resume</label>
      <select
        id="saved-resume"
        className="nm-input"
        defaultValue=""
        disabled={disabled || loading !== null}
        onChange={(event) => void choose(event.target.value)}
      >
        <option value="">
          {loading ? "Loading…" : "Choose one, or paste below…"}
        </option>
        {resumes.map((resume) => (
          <option key={resume.id} value={resume.id}>
            {resume.label}
            {resume.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>

      {error && (
        <p className="notice" data-tone="error" role="alert" style={{ marginTop: 10 }}>
          <strong>Not loaded</strong>
          {error}
        </p>
      )}
    </div>
  );
}

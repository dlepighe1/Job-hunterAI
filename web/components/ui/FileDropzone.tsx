"use client";

/**
 * The standard file drop zone. Add Résumé and the Matcher both use this one.
 *
 * Drag and drop is an ENHANCEMENT here, never the only way in. The whole zone is a real
 * `<button>` wrapping a hidden `<input type="file">`, so it is reachable by keyboard and
 * announced as a control; the drag handlers sit on top for people using a mouse. A div with
 * an `onDrop` and nothing else is the version that keyboard users cannot operate at all.
 *
 * The accepted formats and the size cap are read from `lib/extraction/files.ts`, which is the
 * module that actually enforces them. The brief is explicit that only real limits may be
 * displayed, and the way to keep that true is to never write the numbers down twice.
 */

import { useRef, useState } from "react";

import { SpinnerIcon, UploadCloudIcon } from "@/components/icons";
import { ACCEPTED_FILE_COPY, ACCEPTED_MIME, MAX_UPLOAD_BYTES } from "@/lib/extraction/files";

export function FileDropzone({
  file,
  onFile,
  busy = false,
  error,
  id,
}: {
  /** The chosen file, so the zone can show what is staged rather than resetting. */
  file: File | null;
  onFile: (file: File | null) => void;
  busy?: boolean;
  /** A message from the caller, typically a rejection the server sent back. */
  error?: string | null;
  id: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const shown = error ?? localError;

  /** The one check worth making in the browser: refusing a 40 MB file here saves the user
   *  the upload before the server refuses it anyway. Everything else is decided server-side,
   *  from the bytes, because a filename proves nothing. */
  function accept(candidate: File | null) {
    setLocalError(null);
    if (!candidate) {
      onFile(null);
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setLocalError(
        `That file is ${(candidate.size / 1024 / 1024).toFixed(1)} MB, and the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }
    onFile(candidate);
  }

  return (
    <div className="dropzone-field">
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPTED_MIME}
        disabled={busy}
        onChange={(event) => accept(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        className="dropzone"
        data-dragging={dragging}
        data-filled={file !== null}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0] ?? null);
        }}
      >
        <span className="dropzone__icon" aria-hidden="true">
          {busy ? <SpinnerIcon className="animate-spin" /> : <UploadCloudIcon />}
        </span>

        {file ? (
          <>
            <span className="dropzone__title">{file.name}</span>
            <span className="dropzone__hint">
              {(file.size / 1024 / 1024).toFixed(1)} MB · click to choose a different file
            </span>
          </>
        ) : (
          <>
            <span className="dropzone__title">
              {busy ? "Reading your résumé…" : "Drag & drop your résumé here or click to browse"}
            </span>
            <span className="dropzone__hint">{ACCEPTED_FILE_COPY}</span>
          </>
        )}
      </button>

      {shown && (
        <p className="notice" data-tone="error" role="alert">
          <strong>That file was not accepted</strong>
          {shown}
        </p>
      )}
    </div>
  );
}

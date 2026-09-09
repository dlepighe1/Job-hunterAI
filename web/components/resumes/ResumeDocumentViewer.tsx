"use client";

/**
 * The original document, shown as a document.
 *
 * This renders the ACTUAL uploaded file, not a re-rendering of the plain text pulled out of
 * it at upload. Three formats arrive here and no single mechanism displays all three, which
 * is what the first version got wrong: it pointed an `<object>` at a URL for everything, so a
 * PDF sometimes rendered and a DOCX simply downloaded itself.
 *
 *   pdf   an `<iframe>` at a signed URL, so the browser's own viewer does the work. Shipping
 *         pdf.js to draw a canvas would add roughly a megabyte to reproduce page controls,
 *         zoom, selection and search that every browser already has.
 *   docx  HTML converted server-side by mammoth from the document's real structure, and
 *         sanitised there. No browser renders DOCX.
 *   txt   the text, set in the app's own typography on a page-shaped sheet.
 *
 * `<iframe>` rather than `<object>` for the PDF: Chrome will hand an `<object>` off to the
 * download manager under conditions that are hard to predict, and an iframe is what its own
 * viewer expects.
 */

import { useEffect, useState } from "react";

import { ArrowUpRightIcon, FileIcon, SpinnerIcon } from "@/components/icons";
import type { ResumeDocument } from "@/lib/use-resumes";

type State =
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "ready"; doc: ResumeDocument };

export function ResumeDocumentViewer({
  resumeId,
  label,
  hasFile,
  fetchDocument,
}: {
  resumeId: string;
  label: string;
  /** From `resume.filePath`. Saves a round trip that was always going to 404. */
  hasFile: boolean;
  fetchDocument: (id: string) => Promise<ResumeDocument | null>;
}) {
  /**
   * Initialised from props rather than synchronised by an effect.
   *
   * The parent keys this component on the résumé id, so switching résumés remounts it and
   * there is nothing to resynchronise. That is what lets the effect below do no synchronous
   * `setState` at all.
   */
  const [state, setState] = useState<State>(hasFile ? { kind: "loading" } : { kind: "absent" });

  useEffect(() => {
    // Already `absent` from the initial state; there is nothing to fetch and nothing to set.
    if (!hasFile) return;

    let cancelled = false;

    fetchDocument(resumeId)
      .then((doc) => {
        if (cancelled) return;
        setState(doc ? { kind: "ready", doc } : { kind: "absent" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "absent" });
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId, hasFile, fetchDocument]);

  if (state.kind === "loading") {
    return (
      <div className="doc-viewer doc-viewer--message" aria-busy="true">
        <SpinnerIcon className="animate-spin" />
        <p>Opening the document…</p>
      </div>
    );
  }

  if (state.kind === "absent") {
    return (
      <div className="doc-viewer doc-viewer--message">
        <span className="doc-viewer__icon" aria-hidden="true">
          <FileIcon />
        </span>
        <p>No original file stored for this résumé.</p>
        <p className="doc-viewer__note">
          The text was saved and is what the matcher scores, but the document it came from was
          not kept. Résumés added by uploading a file keep the file too, and show it here.
        </p>
      </div>
    );
  }

  const { doc } = state;

  if (doc.kind === "pdf") {
    return (
      <div className="doc-viewer">
        <iframe className="doc-viewer__frame" src={doc.url} title={`${label} (PDF)`} />
        <div className="doc-viewer__bar">
          <a
            className="row-action"
            href={doc.url}
            target="_blank"
            rel="noreferrer noopener"
            // The URL is short-lived, so this is a live handle rather than a permalink.
            title="Opens the stored document in a new tab"
          >
            Open in a new tab
            <ArrowUpRightIcon />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="doc-viewer">
      <div className="doc-sheet">
        {doc.kind === "docx" ? (
          /* Sanitised on the server by `sanitizeDocumentHtml`, which strips scripts, inline
             handlers, embedded images and every href that is not http/https/mailto. Mammoth
             escapes text content and builds markup from document structure rather than
             passing any through, so this is a converted document and not user HTML. */
          <div
            className="doc-sheet__body"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
        ) : (
          <pre className="doc-sheet__text">{doc.text}</pre>
        )}
      </div>

      <div className="doc-viewer__bar">
        <span className="doc-viewer__kind">
          {doc.kind === "docx" ? "Converted from Word" : "Plain text"}
        </span>
      </div>
    </div>
  );
}

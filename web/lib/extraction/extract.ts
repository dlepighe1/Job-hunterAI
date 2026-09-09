/**
 * Turning an uploaded file into scoreable text.
 *
 * The one place the three formats meet. Each parses differently and then everything joins the
 * same path: reconstruct, assess, report. Keeping the assessment here rather than at the call
 * site means the extract endpoint and the save endpoint cannot disagree about what a bad
 * extraction is.
 *
 * Server-only: it loads the PDF and Word parsers, and importing it from a client component
 * would pull both into the browser bundle. Marked by convention rather than by the
 * `server-only` package, which is what `lib/db.ts` does for the same reason and which keeps
 * the module importable from a test.
 *
 * The reconstruction and the quality gate live in their own modules precisely so they stay
 * pure and testable; this file is the thin, untestable-without-fixtures shell around them.
 */

import { extractTextItems, getDocumentProxy } from "unpdf";

import { assessExtraction, type ExtractionQuality } from "@/lib/extraction/quality";
import { MAX_RESUME_CHARS, detectFileKind, type FileKind } from "@/lib/extraction/files";
import { reconstruct, type TextItem } from "@/lib/extraction/reconstruct";

export interface ExtractionResult {
  kind: FileKind;
  content: string;
  /** Null for formats that have no pages. */
  pages: number | null;
  quality: ExtractionQuality;
  truncated: boolean;
}

export type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; code: "UNSUPPORTED" | "UNREADABLE"; message: string };

/** US Letter, and the fallback when a page reports no dimensions. Only used to scale the
 *  column-gap threshold, so being wrong by a few percent changes nothing. */
const DEFAULT_PAGE_WIDTH = 612;

async function extractPdf(bytes: Uint8Array): Promise<{ content: string; pages: number }> {
  /**
   * pdf.js takes OWNERSHIP of the buffer it is given and detaches it.
   *
   * Passing the caller's array straight in leaves it pointing at a detached ArrayBuffer, so
   * every later read throws `Cannot perform ArrayBuffer.prototype.slice on a detached
   * ArrayBuffer`. That is not theoretical: the upload route extracts first and stores second,
   * so a PDF was parsed correctly and then written to Storage from a dead buffer, and the
   * document preview 500'd on every PDF while TXT worked fine.
   *
   * A copy costs one allocation of at most the upload cap and makes this function what it
   * claims to be: a read, not a consume.
   */
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, items } = await extractTextItems(document);

  // The page box, for the column detector. Read from the first page and applied to all,
  // because a document that changes page size midway is not a résumé.
  let pageWidth = DEFAULT_PAGE_WIDTH;
  try {
    const first = await document.getPage(1);
    const [, , right] = first.view as number[];
    if (Number.isFinite(right) && right > 0) pageWidth = right;
  } catch {
    // Keep the default. A missing page box is not worth failing an upload over.
  }

  return {
    content: reconstruct(items as TextItem[][], { pageWidth }),
    pages: Number(totalPages ?? 0),
  };
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  // Imported lazily so a PDF upload never pays for the Word parser.
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes as Uint8Array<ArrayBuffer>),
  });

  // DOCX carries real paragraphs, so there is no reading order to rebuild and no wrapping to
  // undo. It goes straight to normalisation.
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTxt(bytes: Uint8Array): string {
  // `fatal: false` so a stray byte becomes a replacement character rather than throwing away
  // an otherwise readable document. The quality gate catches it if there are many.
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract, reconstruct and assess.
 *
 * Returns a failure for a file that cannot be read at all. A file that reads badly is a
 * SUCCESS carrying a `degraded` or `failed` quality verdict, because the caller decides what
 * to do about it: the extract endpoint shows the text with a warning, and the save endpoint
 * refuses a `failed` one.
 */
export async function extractResume(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractionOutcome> {
  const kind = detectFileKind(bytes, filename);
  if (!kind) {
    return { ok: false, code: "UNSUPPORTED", message: "" };
  }

  let content: string;
  let pages: number | null = null;

  try {
    if (kind === "pdf") {
      const parsed = await extractPdf(bytes);
      content = parsed.content;
      pages = parsed.pages;
    } else if (kind === "docx") {
      content = await extractDocx(bytes);
    } else {
      content = extractTxt(bytes);
    }
  } catch (error) {
    // A parse failure is a bad file, not a broken server. Reporting 500 would send someone
    // to file an outage over a document their word processor wrote badly.
    console.warn("[extraction] parse failed", {
      kind,
      bytes: bytes.length,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      code: "UNREADABLE",
      message:
        kind === "pdf"
          ? "That PDF could not be read. It may be corrupt or password-protected, so try re-exporting it."
          : "That file could not be read. It may be corrupt, so try re-saving it and uploading again.",
    };
  }

  const truncated = content.length > MAX_RESUME_CHARS;
  const capped = truncated ? content.slice(0, MAX_RESUME_CHARS) : content;

  // Size and page count only. Never the text, and never the filename, because people name
  // résumés after the company they are applying to.
  console.info("[extraction] read", {
    kind,
    pages,
    bytes: bytes.length,
    chars: capped.length,
  });

  return {
    ok: true,
    result: { kind, content: capped, pages, quality: assessExtraction(capped, pages), truncated },
  };
}

/**
 * A DOCX rendered as HTML, for the document preview.
 *
 * No browser renders DOCX. An `<object>` pointed at one triggers a download, which is what
 * "preview" turned into for every Word résumé. Mammoth converts the document's real
 * structure, headings, lists, emphasis and tables, so this is a conversion of the actual
 * file rather than the extracted plain text dressed up to look like one.
 *
 * The output is sanitised here rather than trusted. Mammoth builds HTML from the document's
 * structure and escapes text content, so it does not pass arbitrary markup through, but a
 * real hyperlink in a Word file can carry any scheme its author typed, and an embedded image
 * arrives as a base64 payload that can be megabytes.
 */
export async function docxToHtml(bytes: Uint8Array): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(bytes as Uint8Array<ArrayBuffer>),
    });
    return sanitizeDocumentHtml(String(value ?? ""));
  } catch (error) {
    console.warn("[extraction] docx preview failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/** Schemes a converted document is allowed to link to. Anything else, `javascript:` above
 *  all, has its href removed while the link text is kept. */
const SAFE_HREF = /^(https?:|mailto:)/i;

export function sanitizeDocumentHtml(html: string): string {
  return (
    html
      // Belt and braces. Mammoth does not emit these, and if a future version or a style map
      // ever did, they would execute in the drawer.
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
      // Inline event handlers, in either quoting style or unquoted.
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
      // Embedded images: dropped rather than rendered. A DOCX can carry many megabytes of
      // base64 and this payload travels in a JSON response.
      .replace(/<img\b[^>]*>/gi, "")
      // Any href that is not http, https or mailto loses the attribute and keeps its text.
      .replace(/\shref\s*=\s*"([^"]*)"/gi, (whole, url: string) =>
        SAFE_HREF.test(url.trim()) ? whole : "",
      )
      .replace(/\shref\s*=\s*'([^']*)'/gi, (whole, url: string) =>
        SAFE_HREF.test(url.trim()) ? whole : "",
      )
  );
}

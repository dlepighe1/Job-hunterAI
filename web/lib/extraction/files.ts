/**
 * What kind of file was uploaded, decided from its bytes.
 *
 * The filename and the content type are both supplied by the client and neither describes the
 * contents: a `.pdf` extension on a Word document is a parse failure reported as the wrong
 * error, and `application/pdf` on arbitrary bytes is how a parser gets fed something it was
 * never meant to see. The magic numbers are the only part of an upload the sender does not
 * choose freely.
 *
 * Pure, so the detection rules are testable without touching a parser.
 */

export type FileKind = "pdf" | "docx" | "txt";

/** `%PDF-` */
export const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** `PK\x03\x04`, the local file header every ZIP starts with. DOCX is a ZIP container. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * The upload ceiling.
 *
 * FEATURES.md §3.1 named 5 MB. Raised to 10 to match the limit the approved Add Résumé board
 * states, and because DOCX files carrying embedded images legitimately exceed 5 MB where the
 * equivalent PDF would not. The cap is still enforced before any bytes reach a parser.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** What the drop zone tells the user, kept beside the limit it describes so the two cannot
 *  drift. Only formats this module actually accepts appear here. */
export const ACCEPTED_FILE_COPY = "PDF, DOCX, or TXT · Max 10MB";

/**
 * The cap on stored résumé text.
 *
 * Matches what `/api/score` enforces: text that cannot be scored is not worth storing, and
 * two limits disagreeing would let a résumé in that the scorer then rejects. Declared here,
 * beside the upload limits, because extraction is what produces the text this bounds.
 */
export const MAX_RESUME_CHARS = 15_000;

/** For the file input's `accept`, which is a convenience filter, never a check. */
export const ACCEPTED_MIME =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

/**
 * Whether a byte run looks like decodable text rather than binary.
 *
 * TXT has no magic number, so it is identified by exclusion plus a sanity check: a NUL byte
 * means binary, and a high share of control characters means this is not a document someone
 * typed. Checks a prefix, because scanning 10 MB to answer a yes-or-no question is waste.
 */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  if (sample.length === 0) return false;

  let control = 0;
  for (const byte of sample) {
    // A NUL byte never appears in text and always appears in binary formats.
    if (byte === 0x00) return false;
    // Everything below 0x20 except tab, newline and carriage return.
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) control += 1;
  }

  return control / sample.length < 0.05;
}

/**
 * The file's kind, or null when it is none of the three.
 *
 * `filename` only disambiguates ZIP containers: DOCX, XLSX, PPTX and a plain archive all
 * start with the same four bytes, and only the extension separates them. It is never trusted
 * to promote a file to a kind its bytes contradict.
 */
export function detectFileKind(bytes: Uint8Array, filename = ""): FileKind | null {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";

  if (startsWith(bytes, ZIP_MAGIC)) {
    return /\.docx$/i.test(filename) ? "docx" : null;
  }

  if (looksLikeText(bytes)) return "txt";

  return null;
}

/** The message for a file this module will not accept. Names what was sent where it can. */
export function unsupportedFileMessage(filename: string): string {
  if (/\.docx?$/i.test(filename) && !/\.docx$/i.test(filename)) {
    return "That looks like a legacy .doc file, which cannot be read. Save it as .docx or PDF and upload it again.";
  }
  if (/\.pages$/i.test(filename)) {
    return "Pages documents cannot be read. Export it as PDF or DOCX and upload it again.";
  }
  if (/\.(png|jpe?g|gif|webp|heic)$/i.test(filename)) {
    return "That is an image, and there is no text in it to extract. Upload the document it came from instead.";
  }
  return `That file is not a PDF, DOCX, or TXT. ${ACCEPTED_FILE_COPY} is what this accepts.`;
}

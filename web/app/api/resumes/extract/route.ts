import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

import { MAX_UPLOAD_BYTES, PDF_MAGIC } from "@/app/api/resumes/extract/_limits";
import { MAX_RESUME_CHARS, jsonError } from "@/app/api/resumes/_shared";
import { getUserIdOrNull } from "@/lib/auth";

/** Parsing a large PDF is not instant, and this runs on the same host as everything else. */
export const maxDuration = 60;

/**
 * Turn an uploaded PDF into plain text.
 *
 * Extraction only: this stores nothing. The text comes back to the browser, the user gets
 * to read and correct it (FEATURES.md §5: "extraction is imperfect and the user should be
 * able to fix it"), and saving is a separate, deliberate POST to `/api/resumes`. Storing it
 * here would mean the first thing the user sees of their resume is a row they did not
 * confirm.
 *
 * Requires a session: this spends CPU on attacker-supplied bytes, and an unauthenticated
 * endpoint that does that is a free denial-of-service primitive.
 */
export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return jsonError("UNAUTHENTICATED", "Sign in to upload a PDF.", 401);
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return jsonError("INVALID_REQUEST", "Send the PDF as multipart/form-data.", 400);
  }

  if (!file) {
    return jsonError("INVALID_REQUEST", "No file was attached.", 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(
      "TOO_LARGE",
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB, and a resume that large is usually a scan, and scans have no text to extract anyway.`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // The filename and the content type are both client-supplied. The magic number is not.
  const isPdf = PDF_MAGIC.every((byte, index) => bytes[index] === byte);
  if (!isPdf) {
    return jsonError(
      "INVALID_REQUEST",
      "That file is not a PDF. Only PDF uploads are supported, so for anything else, paste the text.",
      400,
    );
  }

  let text: string;
  let pages: number;
  try {
    const document = await getDocumentProxy(bytes);
    const extracted = await extractText(document, { mergePages: true });
    text = String(extracted.text ?? "");
    pages = Number(extracted.totalPages ?? 0);
  } catch (error) {
    // A parse failure is a bad file, not a broken server. Saying 500 would send the user to
    // report an outage over a PDF their word processor wrote badly.
    console.warn("[resumes] extraction failed", {
      bytes: file.size,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return jsonError(
      "INVALID_REQUEST",
      "That PDF could not be read. It may be corrupt or password-protected, so try re-exporting it, or paste the text instead.",
      400,
    );
  }

  /**
   * A scanned resume is a picture of text: the parser returns nothing and there is no
   * fixing that here without OCR, which this product does not do. Saying so beats storing
   * an empty resume that fails at the matcher later, where the cause is invisible.
   */
  if (text.trim().length === 0) {
    return jsonError(
      "NO_TEXT",
      "That PDF has no extractable text. It is most likely a scan or an image export, so paste the text instead, or re-export it from the original document.",
      422,
    );
  }

  // Normalise the layout artifacts extraction always leaves behind: hard-wrapped lines, and
  // runs of blank lines where the PDF had column gaps.
  const content = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESUME_CHARS);

  // Size and page count only. Never the text, and never the filename, because people name resumes
  // after the company they are applying to.
  console.info("[resumes] extracted", { pages, bytes: file.size, chars: content.length });

  return NextResponse.json({ content, pages, truncated: text.length > MAX_RESUME_CHARS });
}

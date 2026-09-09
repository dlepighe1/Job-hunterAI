import { NextResponse } from "next/server";

import { jsonError } from "@/app/api/resumes/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import { extractResume } from "@/lib/extraction/extract";
import { MAX_UPLOAD_BYTES, unsupportedFileMessage } from "@/lib/extraction/files";

/** Parsing a large PDF is not instant, and this runs on the same host as everything else. */
export const maxDuration = 60;

/**
 * Turn an uploaded file into plain text.
 *
 * Extraction only: this stores nothing. The text comes back to the browser, the user gets to
 * read and correct it, and saving is a separate, deliberate POST to `/api/resumes`. Storing
 * it here would mean the first thing someone sees of their résumé is a row they never
 * confirmed.
 *
 * The quality verdict travels with the text so the client can decide how loudly to say
 * something. `failed` is reported as a 422 with the specific reason rather than a 200 with
 * bad text, because a résumé that scores near zero for an invisible reason is worse than one
 * that was plainly refused.
 *
 * Requires a session: this spends CPU on attacker-supplied bytes, and an unauthenticated
 * endpoint that does that is a free denial-of-service primitive.
 */
export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return jsonError("UNAUTHENTICATED", "Sign in to upload a résumé.", 401);
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return jsonError("INVALID_REQUEST", "Send the file as multipart/form-data.", 400);
  }

  if (!file) {
    return jsonError("INVALID_REQUEST", "No file was attached.", 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(
      "TOO_LARGE",
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const outcome = await extractResume(bytes, file.name);

  if (!outcome.ok) {
    return jsonError(
      "INVALID_REQUEST",
      outcome.code === "UNSUPPORTED" ? unsupportedFileMessage(file.name) : outcome.message,
      400,
    );
  }

  const { content, pages, quality, truncated } = outcome.result;

  // A file that parsed but produced nothing scoreable. 422 rather than 400: the request was
  // well formed and the content is what could not be processed.
  if (quality.verdict === "failed") {
    return jsonError("NO_TEXT", quality.reason ?? "That file had no readable text.", 422);
  }

  return NextResponse.json({
    content,
    pages,
    truncated,
    quality: { verdict: quality.verdict, reason: quality.reason },
  });
}

import { NextResponse } from "next/server";

import { NOT_FOUND, UNAUTHENTICATED, UNCONFIGURED, jsonError } from "@/app/api/resumes/_shared";
import { getUserIdOrNull } from "@/lib/auth";
import {
  getDevResumeFile,
  getResume,
  getResumeFileBytes,
  getResumeFileUrl,
  isPersistenceConfigured,
} from "@/lib/db";
import { docxToHtml } from "@/lib/extraction/extract";

/** Converting a Word document is not instant. */
export const maxDuration = 30;

/**
 * The original document, in whatever form the browser can actually display.
 *
 * Three formats reach this route and no single mechanism shows all three, which is what the
 * first version of this got wrong: it returned a URL for everything, and a URL is only useful
 * for the one format browsers render natively.
 *
 *   pdf   a URL. The browser's own viewer takes it from there, with its page controls,
 *         zoom, text selection and search already built. The bytes never pass through this
 *         server twice, which matters at 10 MB.
 *   docx  converted HTML. No browser renders DOCX; pointing an `<object>` at one starts a
 *         download, which is exactly what "preview" had turned into. Mammoth converts the
 *         document's real structure, and the result is sanitised before it is sent.
 *   txt   the text. Rendered in the app's own typography rather than as a bare text/plain
 *         page, which is what a URL would have produced.
 *
 * Ownership is established by reading the row first, every time. Nothing here accepts a path
 * from the caller: the object key contains the owner's user id and is therefore guessable
 * rather than secret.
 *
 * Never cached. A PDF response carries a ten-minute credential and the others carry the
 * document itself, so a shared cache holding either hands someone's résumé to the next
 * person through the same proxy.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const { id } = await params;
  const noStore = { "cache-control": "no-store, private" };

  /**
   * Dev mode serves PDF bytes itself, since there is no bucket to sign against.
   *
   * Ownership is checked the same way the signed path checks it. `getDevResumeFile` returns
   * null outside dev mode, so this branch cannot open a door in any other configuration.
   */
  if (new URL(request.url).searchParams.get("raw") === "1") {
    const owned = await getResume(userId, id);
    const file = owned ? getDevResumeFile(id) : null;
    if (!owned || !file) return NOT_FOUND();

    return new Response(file.bytes as BodyInit, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="resume.${file.extension}"`,
        // Without this Chrome can still decide a response is a download.
        "x-content-type-options": "nosniff",
        ...noStore,
      },
    });
  }

  const resume = await getResume(userId, id);

  // One response for "no such résumé", "not yours" and "no file stored". The first two must
  // be indistinguishable or the status code enumerates other people's ids; the third is
  // folded in because the client's next move is the same either way: show the empty state.
  if (!resume?.filePath) return NOT_FOUND();

  const extension = resume.filePath.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf") {
    const url = await getResumeFileUrl(userId, id);
    if (!url) return NOT_FOUND();
    return NextResponse.json({ kind: "pdf", url }, { headers: noStore });
  }

  const file = await getResumeFileBytes(userId, id);
  if (!file) return NOT_FOUND();

  if (extension === "docx") {
    const html = await docxToHtml(file.bytes);
    // A DOCX that will not convert falls back to the text already extracted at upload,
    // which is a worse preview than the real structure and a much better one than nothing.
    if (html === null) {
      return NextResponse.json({ kind: "txt", text: resume.content }, { headers: noStore });
    }
    return NextResponse.json({ kind: "docx", html }, { headers: noStore });
  }

  return NextResponse.json(
    { kind: "txt", text: new TextDecoder("utf-8", { fatal: false }).decode(file.bytes) },
    { headers: noStore },
  );
}

/** The route exists only to serve the document. Anything else is a client bug worth reporting. */
export async function POST() {
  return jsonError("METHOD_NOT_ALLOWED", "Use GET to fetch the document.", 405);
}

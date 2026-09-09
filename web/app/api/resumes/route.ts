import { NextResponse } from "next/server";

import {
  UNAUTHENTICATED,
  UNCONFIGURED,
  invalid,
  jsonError,
  readJson,
  resumeSchema,
  tooShort,
} from "@/app/api/resumes/_shared";
import { getUserIdOrNull, primaryEmail } from "@/lib/auth";
import {
  createResume,
  ensureProfile,
  isPersistenceConfigured,
  listResumes,
  updateResume,
  uploadResumeFile,
} from "@/lib/db";
import { extractResume } from "@/lib/extraction/extract";
import { MAX_UPLOAD_BYTES, unsupportedFileMessage } from "@/lib/extraction/files";

/** Parsing a large document is not instant, and this runs on the same host as everything else. */
export const maxDuration = 60;

/** What each accepted format is stored as, so the signed URL serves something a browser can
 *  actually render rather than prompting a download of an octet-stream. */
const STORED_AS: Record<string, { contentType: string; extension: string }> = {
  pdf: { contentType: "application/pdf", extension: "pdf" },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  txt: { contentType: "text/plain; charset=utf-8", extension: "txt" },
};

/**
 * Saved resumes (FEATURES.md §5).
 *
 * A resume is the most personal thing this product holds, so two rules apply to every path
 * here: it is never logged, and it is never returned to anyone but its owner. The list
 * response deliberately omits the text, and `listResumes` does not even select it.
 */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  const resumes = await listResumes(userId);
  return NextResponse.json({ resumes });
}

export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) return UNAUTHENTICATED();
  if (!isPersistenceConfigured()) return UNCONFIGURED();

  // Two shapes, one endpoint. A multipart body carries a file to extract and store; a JSON
  // body carries text the user typed or corrected. Splitting them across two routes would
  // duplicate the profile bootstrap, the length floor and the default-résumé handling, which
  // is exactly the kind of duplication that drifts.
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    return postFile(request, userId);
  }

  const read = await readJson(request);
  if ("response" in read) return read.response;

  const parsed = resumeSchema.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);

  const short = tooShort(parsed.data.content);
  if (short) return short;

  // `resumes.user_id references profiles(id)`, and Clerk owns identity, so the local row
  // has to exist first. Idempotent: `ensureProfile` upserts on the id.
  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not set up your account record, so the resume was not saved. Try again in a moment.",
      500,
    );
  }

  const resume = await createResume(userId, parsed.data);
  if (!resume) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not save the resume. Try again in a moment.",
      500,
    );
  }

  // The id and a word count. Never the label, because the user chose it and it can name an
  // employer, and certainly never the text.
  console.info("[resumes] created", { id: resume.id, isDefault: resume.isDefault });

  return NextResponse.json({ resume }, { status: 201 });
}

/**
 * Create a résumé from an uploaded file.
 *
 * One request does the whole job: extract, assess, store the row, store the file. The
 * alternative, extracting in one call and saving in another, meant either sending a 10 MB
 * file twice or parking it in the bucket under a pending key and hoping the second call
 * arrived. Orphaned uploads nothing points at are a retention problem in a bucket holding
 * home addresses, so the flow that cannot create them is the right one.
 *
 * A `failed` extraction stores NOTHING and returns 422 naming the reason. A `degraded` one
 * saves and reports the reason, so the client can open the text for review rather than
 * making every upload prove itself.
 */
async function postFile(request: Request, userId: string) {
  let file: File | null = null;
  let label = "";
  let targetRole: string | null = null;
  let note: string | null = null;

  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
    label = String(form.get("label") ?? "").trim();
    targetRole = String(form.get("targetRole") ?? "").trim() || null;
    note = String(form.get("note") ?? "").trim() || null;
  } catch {
    return jsonError("INVALID_REQUEST", "Send the file as multipart/form-data.", 400);
  }

  if (!file) return jsonError("INVALID_REQUEST", "No file was attached.", 400);
  if (!label) return jsonError("INVALID_REQUEST", "label: a résumé needs a name.", 400);
  if (label.length > 120) return jsonError("INVALID_REQUEST", "label: too long.", 400);

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

  const { kind, content, quality } = outcome.result;

  if (quality.verdict === "failed") {
    return jsonError("NO_TEXT", quality.reason ?? "That file had no readable text.", 422);
  }

  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError(
      "PERSISTENCE_ERROR",
      "Could not set up your account record, so the résumé was not saved. Try again in a moment.",
      500,
    );
  }

  const resume = await createResume(userId, { label, content, targetRole, note });
  if (!resume) {
    return jsonError("PERSISTENCE_ERROR", "Could not save the résumé. Try again in a moment.", 500);
  }

  /**
   * The file is stored AFTER the row, and a failure here is not a failed save.
   *
   * The row carries the text, which is what the matcher scores and what the product is for.
   * The file only drives the document preview. Rolling the résumé back because the preview
   * would be unavailable trades something that works for something cosmetic.
   */
  const stored = STORED_AS[kind];
  const filePath = await uploadResumeFile(
    userId,
    resume.id,
    bytes,
    stored.contentType,
    stored.extension,
  );

  if (filePath) await updateResume(userId, resume.id, { filePath });

  console.info("[resumes] created from file", { id: resume.id, kind, stored: Boolean(filePath) });

  return NextResponse.json(
    {
      resume: { ...resume, filePath },
      quality: { verdict: quality.verdict, reason: quality.reason },
    },
    { status: 201 },
  );
}

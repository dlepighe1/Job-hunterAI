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
import { createResume, ensureProfile, isPersistenceConfigured, listResumes } from "@/lib/db";

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

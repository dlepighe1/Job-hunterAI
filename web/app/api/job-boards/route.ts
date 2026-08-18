import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull, primaryEmail } from "@/lib/auth";
import {
  createJobBoard,
  ensureProfile,
  isPersistenceConfigured,
  listJobBoardsSeeded,
} from "@/lib/db";

/**
 * Saved job boards: the whole of Hunt.
 *
 * There is no listing search here and no job API. Hunt opens the boards the user already
 * uses; searching inside it filters these saved rows by name. Anything else would be
 * pretending to search live postings, which this version does not do.
 */
const boardSchema = z
  .object({
    name: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().min(1).max(80),
    ),
    url: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.url().max(2000),
    ),
  })
  .strict();

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return jsonError("UNAUTHENTICATED", "Sign in to keep job boards.", 401);
  }
  if (!isPersistenceConfigured()) {
    // Not an error worth blocking the drawer over: Hunt still has something to show, it
    // just cannot remember changes. The client falls back to the read-only defaults.
    return jsonError(
      "NOT_CONFIGURED",
      "Saved job boards need a database. The default boards still open.",
      503,
    );
  }

  const boards = await listJobBoardsSeeded(userId);
  return NextResponse.json({ boards });
}

export async function POST(request: Request) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return jsonError("UNAUTHENTICATED", "Sign in to save job boards.", 401);
  }
  if (!isPersistenceConfigured()) {
    return jsonError("NOT_CONFIGURED", "Saving a job board needs a database.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_REQUEST", "Request body must be JSON.", 400);
  }

  const parsed = boardSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "body";
    return jsonError(
      "INVALID_REQUEST",
      field === "url"
        ? "That link is not a valid URL. Include https:// at the start."
        : `${field}: ${issue.message}`,
      400,
    );
  }

  // Only http(s). A `javascript:` URL saved here would render as a link the user clicks in
  // their own session, which is a stored XSS vector wearing a job-board label.
  const protocol = new URL(parsed.data.url).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    return jsonError("INVALID_REQUEST", "Job board links must start with http:// or https://.", 400);
  }

  const profiled = await ensureProfile(userId, (await primaryEmail()) ?? "");
  if (!profiled) {
    return jsonError("PERSISTENCE_ERROR", "Could not set up your account record.", 500);
  }

  const board = await createJobBoard(userId, parsed.data);
  if (!board) {
    return jsonError("PERSISTENCE_ERROR", "Could not save that job board.", 500);
  }

  console.info("[job-boards] created", { id: board.id });

  return NextResponse.json({ board }, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdOrNull } from "@/lib/auth";
import { deleteJobBoard, isPersistenceConfigured } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to manage job boards." },
      { status: 401 },
    );
  }
  if (!isPersistenceConfigured()) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Job boards need a database." },
      { status: 503 },
    );
  }

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "id: must be a uuid." },
      { status: 400 },
    );
  }

  const deleted = await deleteJobBoard(userId, id);
  if (!deleted) {
    return NextResponse.json(
      { error: "PERSISTENCE_ERROR", message: "Could not remove that job board." },
      { status: 500 },
    );
  }

  console.info("[job-boards] deleted", { id });

  return NextResponse.json({ ok: true });
}

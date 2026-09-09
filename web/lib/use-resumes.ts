"use client";

/**
 * Client-side access to `/api/resumes`.
 *
 * Shared by the Resumes screen and the matcher's "use a saved resume" picker, for the same
 * reason `use-applications.ts` exists: two screens reading the same list through two
 * different code paths is how they end up disagreeing about what a 503 means.
 */

import { useCallback, useEffect, useState } from "react";

import type { LoadState } from "@/lib/use-applications";

/** A resume as the list returns it. `content` is empty here, since the list endpoint does not
 *  select it, so the full text arrives only from `GET /api/resumes/[id]`. */
export interface ResumeView {
  id: string;
  userId: string;
  label: string;
  content: string;
  filePath: string | null;
  isDefault: boolean;
  /** True for a version the Elevate flow produced. Kept out of the main library, see
   *  `lib/db.ts`, where the same distinction shapes the schema. */
  isTailored: boolean;
  /** The master it was tailored from. Null on a master. */
  parentId: string | null;
  applicationId: string | null;
  targetRole: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The stored document, in the form the viewer can actually display.
 *
 * A discriminated union rather than a URL, because the three formats need three different
 * mechanisms: a browser renders PDF from a link, renders nothing at all from a DOCX, and
 * renders TXT as an unstyled page. The server decides which and sends what is needed.
 */
export type ResumeDocument =
  | { kind: "pdf"; url: string }
  | { kind: "docx"; html: string }
  | { kind: "txt"; text: string };

/** What the extraction gate decided, carried back so the UI can ask for a look at the text
 *  only when there is a reason to. Mirrors `ExtractionQuality` without importing the
 *  server-only module that produces it. */
export interface ExtractionNotice {
  verdict: "good" | "degraded" | "failed";
  reason: string | null;
}

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

async function classify(
  response: Response,
): Promise<{ state: LoadState; resumes?: ResumeView[] }> {
  if (response.status === 401) return { state: { kind: "unauthenticated" } };
  if (response.status === 503) {
    return {
      state: {
        kind: "unconfigured",
        message: await readError(response, "Saved resumes need a database."),
      },
    };
  }
  if (!response.ok) {
    return {
      state: { kind: "failed", message: await readError(response, "Could not load your resumes.") },
    };
  }

  const body = await response.json();
  return { state: { kind: "ready" }, resumes: body.resumes ?? [] };
}

export function useResumes() {
  const [resumes, setResumes] = useState<ResumeView[]>([]);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/resumes")
      .then(classify)
      .then((next) => {
        if (cancelled) return;
        if (next.resumes) setResumes(next.resumes);
        setState(next.state);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed", message: UNREACHABLE });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  const create = useCallback(
    async (input: {
      label: string;
      content: string;
      targetRole?: string | null;
      note?: string | null;
    }): Promise<{ resume: ResumeView } | { error: string }> => {
      try {
        const response = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          return { error: await readError(response, "Could not save the resume.") };
        }
        const body = await response.json();
        const resume = body.resume as ResumeView;
        setResumes((current) => [resume, ...current]);
        return { resume };
      } catch {
        return { error: UNREACHABLE };
      }
    },
    [],
  );

  /**
   * Create a résumé from an uploaded file.
   *
   * Multipart, and one request: the server extracts, assesses, stores the row and stores the
   * file. Sending the file to an extract endpoint and then posting the text back would put a
   * 10 MB body on the wire twice, or leave an orphaned object in the bucket whenever someone
   * changed their mind between the two calls.
   *
   * A `degraded` verdict comes back alongside the saved résumé rather than as an error,
   * because the text is usable and the user is being told to check it, not stopped.
   */
  const createFromFile = useCallback(
    async (input: {
      file: File;
      label: string;
      targetRole?: string | null;
      note?: string | null;
    }): Promise<
      { resume: ResumeView; quality: ExtractionNotice } | { error: string }
    > => {
      const form = new FormData();
      form.append("file", input.file, input.file.name);
      form.append("label", input.label);
      if (input.targetRole) form.append("targetRole", input.targetRole);
      if (input.note) form.append("note", input.note);

      try {
        // No Content-Type header: the browser sets it, and must, because only it knows the
        // multipart boundary it generated.
        const response = await fetch("/api/resumes", { method: "POST", body: form });
        if (!response.ok) {
          return { error: await readError(response, "Could not save that résumé.") };
        }
        const body = await response.json();
        const resume = body.resume as ResumeView;
        setResumes((current) => [resume, ...current]);
        return {
          resume,
          quality: (body.quality as ExtractionNotice) ?? { verdict: "good", reason: null },
        };
      } catch {
        return { error: UNREACHABLE };
      }
    },
    [],
  );

  /**
   * The original document, ready to display, or null when none is stored.
   *
   * Not cached in state: a PDF's URL expires, and a stale one in a re-render produces a
   * preview that silently fails. The drawer fetches when it opens.
   */
  const fetchDocument = useCallback(async (id: string): Promise<ResumeDocument | null> => {
    try {
      const response = await fetch(`/api/resumes/${id}/file`);
      if (!response.ok) return null;
      const body = await response.json();

      if (body?.kind === "pdf" && typeof body.url === "string") return { kind: "pdf", url: body.url };
      if (body?.kind === "docx" && typeof body.html === "string") return { kind: "docx", html: body.html };
      if (body?.kind === "txt" && typeof body.text === "string") return { kind: "txt", text: body.text };
      return null;
    } catch {
      return null;
    }
  }, []);

  /** The full text of one resume. The list never carries it, so this is a real fetch. */
  const fetchContent = useCallback(async (id: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/resumes/${id}`);
      if (!response.ok) return null;
      const body = await response.json();
      return body.resume?.content ?? null;
    } catch {
      return null;
    }
  }, []);

  const update = useCallback(
    async (
      id: string,
      patch: {
        label?: string;
        content?: string;
        targetRole?: string | null;
        note?: string | null;
        isDefault?: true;
      },
    ): Promise<string | null> => {
      try {
        const response = await fetch(`/api/resumes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!response.ok) return await readError(response, "Could not save that change.");

        const body = await response.json();
        const updated = body.resume as ResumeView;

        setResumes((current) =>
          current.map((resume) => {
            if (resume.id === id) return { ...resume, ...updated };
            // Exactly one default. The server has already cleared the others; mirroring it
            // here keeps the UI from briefly showing two.
            if (patch.isDefault) return { ...resume, isDefault: false };
            return resume;
          }),
        );
        return null;
      } catch {
        return UNREACHABLE;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<string | null> => {
    let removed: ResumeView | undefined;
    let index = -1;
    setResumes((current) => {
      index = current.findIndex((resume) => resume.id === id);
      if (index === -1) return current;
      removed = current[index];
      return current.filter((resume) => resume.id !== id);
    });

    const restore = () => {
      if (!removed) return;
      const row = removed;
      const at = index < 0 ? 0 : index;
      setResumes((current) => {
        const next = [...current];
        next.splice(at, 0, row);
        return next;
      });
    };

    try {
      const response = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (!response.ok) {
        restore();
        return await readError(response, "Could not delete that resume.");
      }
      return null;
    } catch {
      restore();
      return UNREACHABLE;
    }
  }, []);

  return {
    resumes,
    state,
    reload,
    create,
    createFromFile,
    update,
    remove,
    fetchContent,
    fetchDocument,
  };
}

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

  return { resumes, state, reload, create, update, remove, fetchContent };
}

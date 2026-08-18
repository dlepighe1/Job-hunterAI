"use client";

/**
 * Client-side access to `/api/applications`.
 *
 * Both the Applications table and the matcher's "save this result" control need the same
 * list, the same create call, and the same failure vocabulary. Writing it twice is how the
 * two screens end up disagreeing about what a 503 means.
 *
 * Nothing here holds a Supabase client: it talks to the API like any other caller, which
 * is what `db.boundary.test.ts` requires of every file outside `lib/db.ts`.
 */

import { useCallback, useEffect, useState } from "react";

import type { ApplicationStatus } from "@/lib/applications";

/** The wire shape of an application. Mirrors `Application` in `lib/db.ts`, restated here
 *  so a client component never imports the server-only data module to get a type. */
export interface ApplicationView {
  id: string;
  userId: string;
  company: string;
  role: string;
  location: string | null;
  postingUrl: string | null;
  status: ApplicationStatus;
  matchScore: number | null;
  matchEngine: string | null;
  matchCalibrated: boolean;
  appliedAt: string | null;
  /** When the employer first responded. An event, unlike lastActivityAt which any edit
   *  touches. The velocity chart plots this one. */
  respondedAt: string | null;
  /** The user's own focus flag. Curated by them, never inferred by the product. */
  priority: boolean;
  /** The résumé actually sent. Null until an analysis attaches one. */
  resumeId: string | null;
  notes: string | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface NewApplication {
  company: string;
  role: string;
  location?: string | null;
  postingUrl?: string | null;
  postingText?: string | null;
  status?: ApplicationStatus;
  appliedAt?: string | null;
  respondedAt?: string | null;
  priority?: boolean;
  resumeId?: string | null;
  notes?: string | null;
}

/**
 * Why the list is empty, when it is.
 *
 * "No applications yet" and "this deployment has no database" produce the same empty array
 * and want completely different screens: one invites you to add the first row, the other
 * has to explain that adding one is impossible here. Collapsing them into `error: string`
 * loses exactly the distinction the UI needs.
 */
export type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unauthenticated" }
  | { kind: "unconfigured"; message: string }
  | { kind: "failed"; message: string };

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

/**
 * Turn a list response into the state it implies.
 *
 * Outside the hook, and returning the next state rather than setting it, for two reasons:
 * it keeps the status-code vocabulary in one readable place, and it means the effect can
 * apply the result inside a `.then` callback, where a `setState` is a subscription
 * settling, not a cascading render.
 */
async function classify(
  response: Response,
): Promise<{ state: LoadState; applications?: ApplicationView[] }> {
  if (response.status === 401) return { state: { kind: "unauthenticated" } };

  if (response.status === 503) {
    return {
      state: {
        kind: "unconfigured",
        message: await readError(response, "Applications need a database."),
      },
    };
  }

  if (!response.ok) {
    return {
      state: {
        kind: "failed",
        message: await readError(response, "Could not load your applications."),
      },
    };
  }

  const body = await response.json();
  return { state: { kind: "ready" }, applications: body.applications ?? [] };
}

export function useApplications() {
  const [applications, setApplications] = useState<ApplicationView[]>([]);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /** Bumped to re-run the fetch effect. A token rather than a callback the effect depends
   *  on, so a retry is one state change instead of an identity change rippling outward. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // An unmount mid-flight would otherwise set state on a gone component, and a slow first
    // response could land after a retry and overwrite the newer one.
    let cancelled = false;

    fetch("/api/applications")
      .then(classify)
      .then((next) => {
        if (cancelled) return;
        if (next.applications) setApplications(next.applications);
        setState(next.state);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed", message: UNREACHABLE });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Re-fetch from a user action, the retry button. Unlike the mount path this shows the
   *  loading state, because the user just asked for something and deserves to see it start. */
  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  /** Create one. Returns the new row, or an error message, and never throws at the call site,
   *  because every caller has a place to render the message and none has a place to catch. */
  const create = useCallback(
    async (input: NewApplication): Promise<{ application: ApplicationView } | { error: string }> => {
      try {
        const response = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          return { error: await readError(response, "Could not save the application.") };
        }

        const body = await response.json();
        const application = body.application as ApplicationView;
        // Newest activity first, which is where the server would put it too.
        setApplications((current) => [application, ...current]);
        return { application };
      } catch {
        return { error: UNREACHABLE };
      }
    },
    [],
  );

  /**
   * Patch one, optimistically.
   *
   * The row updates before the request is sent, because a status change that waits for a
   * round trip feels broken on a table the user is clicking through. The previous row is
   * kept and restored on failure, because an optimistic update with no rollback is not optimism,
   * it is a lie the user finds out about on the next reload.
   */
  const update = useCallback(
    async (id: string, patch: Partial<NewApplication>): Promise<string | null> => {
      let previous: ApplicationView | undefined;
      setApplications((current) =>
        current.map((application) => {
          if (application.id !== id) return application;
          previous = application;
          return { ...application, ...patch } as ApplicationView;
        }),
      );

      try {
        const response = await fetch(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!response.ok) {
          const message = await readError(response, "Could not save that change.");
          if (previous) {
            const restored = previous;
            setApplications((current) =>
              current.map((application) => (application.id === id ? restored : application)),
            );
          }
          return message;
        }

        // Take the server's row rather than keeping the guess: it carries `lastActivityAt`,
        // which the optimistic copy has no way to know.
        const body = await response.json();
        setApplications((current) =>
          current.map((application) => (application.id === id ? body.application : application)),
        );
        return null;
      } catch {
        if (previous) {
          const restored = previous;
          setApplications((current) =>
            current.map((application) => (application.id === id ? restored : application)),
          );
        }
        return UNREACHABLE;
      }
    },
    [],
  );

  /** Delete one, optimistically, restoring it at its original position on failure. */
  const remove = useCallback(async (id: string): Promise<string | null> => {
    let removed: ApplicationView | undefined;
    let index = -1;
    setApplications((current) => {
      index = current.findIndex((application) => application.id === id);
      if (index === -1) return current;
      removed = current[index];
      return current.filter((application) => application.id !== id);
    });

    const restore = () => {
      if (!removed) return;
      const row = removed;
      const at = index;
      setApplications((current) => {
        const next = [...current];
        next.splice(at < 0 ? 0 : at, 0, row);
        return next;
      });
    };

    try {
      const response = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!response.ok) {
        restore();
        return await readError(response, "Could not delete that application.");
      }
      return null;
    } catch {
      restore();
      return UNREACHABLE;
    }
  }, []);

  return { applications, state, reload, create, update, remove };
}

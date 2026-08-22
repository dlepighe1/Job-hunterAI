"use client";

/** Client-side access to `/api/outreach`. */

import { useCallback, useEffect, useState } from "react";

import type { OutreachChannel, OutreachStatus } from "@/lib/outreach";
import type { LoadState } from "@/lib/use-applications";

export interface OutreachView {
  id: string;
  userId: string;
  contactId: string | null;
  applicationId: string | null;
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  status: OutreachStatus;
  sentAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewOutreach {
  contactId?: string | null;
  applicationId?: string | null;
  channel?: OutreachView["channel"];
  subject?: string | null;
  body: string;
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
): Promise<{ state: LoadState; messages?: OutreachView[] }> {
  if (response.status === 401) return { state: { kind: "unauthenticated" } };
  if (response.status === 503) {
    return {
      state: {
        kind: "unconfigured",
        message: await readError(response, "Drafts need a database."),
      },
    };
  }
  if (!response.ok) {
    return {
      state: { kind: "failed", message: await readError(response, "Could not load your drafts.") },
    };
  }
  const body = await response.json();
  return { state: { kind: "ready" }, messages: body.messages ?? [] };
}

export function useOutreach() {
  const [messages, setMessages] = useState<OutreachView[]>([]);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/outreach")
      .then(classify)
      .then((next) => {
        if (cancelled) return;
        if (next.messages) setMessages(next.messages);
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

  const create = useCallback(async (input: NewOutreach): Promise<string | null> => {
    try {
      const response = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) return await readError(response, "Could not save the draft.");

      const body = await response.json();
      setMessages((current) => [body.message as OutreachView, ...current]);
      return null;
    } catch {
      return UNREACHABLE;
    }
  }, []);

  const update = useCallback(
    async (
      id: string,
      patch: {
        subject?: string | null;
        body?: string;
        status?: OutreachStatus;
        sentAt?: string | null;
        repliedAt?: string | null;
      },
    ): Promise<string | null> => {
      try {
        const response = await fetch(`/api/outreach/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!response.ok) return await readError(response, "Could not save that change.");

        const body = await response.json();
        setMessages((current) =>
          current.map((message) => (message.id === id ? (body.message as OutreachView) : message)),
        );
        return null;
      } catch {
        return UNREACHABLE;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<string | null> => {
    let removed: OutreachView | undefined;
    let index = -1;
    setMessages((current) => {
      index = current.findIndex((message) => message.id === id);
      if (index === -1) return current;
      removed = current[index];
      return current.filter((message) => message.id !== id);
    });

    const restore = () => {
      if (!removed) return;
      const row = removed;
      const at = index < 0 ? 0 : index;
      setMessages((current) => {
        const next = [...current];
        next.splice(at, 0, row);
        return next;
      });
    };

    try {
      const response = await fetch(`/api/outreach/${id}`, { method: "DELETE" });
      if (!response.ok) {
        restore();
        return await readError(response, "Could not delete that draft.");
      }
      return null;
    } catch {
      restore();
      return UNREACHABLE;
    }
  }, []);

  return { messages, state, reload, create, update, remove };
}

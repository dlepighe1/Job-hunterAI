"use client";

/** Client-side access to `/api/contacts`. Same shape as `use-applications`; see there for
 *  why the load states are distinguished rather than collapsed into one error string. */

import { useCallback, useEffect, useState } from "react";

import type { ContactView } from "@/lib/network";
import type { LoadState } from "@/lib/use-applications";

export type NewContact = {
  name: string;
  roleTitle?: string | null;
  company?: string | null;
  email?: string | null;
  contactUrl?: string | null;
  applicationId?: string | null;
  notes?: string | null;
};

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
): Promise<{ state: LoadState; contacts?: ContactView[] }> {
  if (response.status === 401) return { state: { kind: "unauthenticated" } };
  if (response.status === 503) {
    return {
      state: {
        kind: "unconfigured",
        message: await readError(response, "Contacts need a database."),
      },
    };
  }
  if (!response.ok) {
    return {
      state: { kind: "failed", message: await readError(response, "Could not load contacts.") },
    };
  }
  const body = await response.json();
  return { state: { kind: "ready" }, contacts: body.contacts ?? [] };
}

export function useContacts() {
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/contacts")
      .then(classify)
      .then((next) => {
        if (cancelled) return;
        if (next.contacts) setContacts(next.contacts);
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

  const create = useCallback(async (input: NewContact): Promise<string | null> => {
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) return await readError(response, "Could not save the contact.");

      const body = await response.json();
      setContacts((current) => [body.contact as ContactView, ...current]);
      return null;
    } catch {
      return UNREACHABLE;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<string | null> => {
    let removed: ContactView | undefined;
    let index = -1;
    setContacts((current) => {
      index = current.findIndex((contact) => contact.id === id);
      if (index === -1) return current;
      removed = current[index];
      return current.filter((contact) => contact.id !== id);
    });

    const restore = () => {
      if (!removed) return;
      const row = removed;
      const at = index < 0 ? 0 : index;
      setContacts((current) => {
        const next = [...current];
        next.splice(at, 0, row);
        return next;
      });
    };

    try {
      const response = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!response.ok) {
        restore();
        return await readError(response, "Could not delete that contact.");
      }
      return null;
    } catch {
      restore();
      return UNREACHABLE;
    }
  }, []);

  return { contacts, state, reload, create, remove };
}

"use client";

import { useState } from "react";

export type WaitlistFeature = "network" | "outreach" | "general";
export type WaitlistState = "idle" | "sending" | "done" | "error";

/**
 * The waitlist signup state machine.
 *
 * Extracted because `ComingSoon` and the landing page's `WaitlistCapture` each carried a
 * byte-identical copy of this fetch, its four states and its error handling. Two copies of a
 * network call is two places to fix a bug in, and the two presentations differ only in
 * markup, which is exactly what a hook is for.
 */
export function useWaitlist(feature: WaitlistFeature) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<WaitlistState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, feature }),
      });
      const data = await response.json();

      if (!response.ok) {
        setState("error");
        setMessage(data.message ?? "Could not save that. Try again in a moment.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Could not reach the server.");
    }
  }

  return { email, setEmail, state, message, submit };
}

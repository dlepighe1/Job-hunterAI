"use client";

/**
 * The current time, read safely.
 *
 * `Date.now()` during render is impure: the server and the client read different clocks, so
 * any output derived from it mismatches on hydration, and React's own lint rule refuses it.
 * Relative timestamps ("2 hours ago") are exactly the case that tempts you to do it anyway.
 *
 * So the clock is an external store, the same way `localStorage` is on the Settings screen.
 * The value is cached at module scope and refreshed on one shared interval, which also means
 * twenty "2 hours ago" labels on a page share one timer rather than twenty.
 *
 * **The server snapshot is 0**, deliberately. Callers treat 0 as "no clock yet" and render an
 * absolute date, which is correct on the server and upgrades to a relative one after
 * hydration. Returning a real server timestamp would produce a value that is wrong by however
 * long the page took to reach the browser and then never corrects itself.
 */

import { useSyncExternalStore } from "react";

/** A minute. Relative labels are minute-grained, so refreshing faster changes nothing. */
const TICK_MS = 60_000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      for (const listener of listeners) listener();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(onChange);
    // Stop the timer once nothing is watching. A page with no relative timestamps on it
    // should not be waking up every minute.
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since the epoch on the client; 0 during server render. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}

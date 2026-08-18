import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIMITS,
  MemoryRateLimitStore,
  checkRateLimit,
  clientAddress,
  resetRateLimit,
  scopeFor,
} from "@/lib/rate-limit";

beforeEach(() => resetRateLimit());
afterEach(() => vi.useRealTimers());

describe("the token bucket", () => {
  it("allows up to the limit, then refuses", async () => {
    const store = new MemoryRateLimitStore();

    for (let i = 0; i < 3; i++) {
      await expect(store.take("k", 3, 60_000)).resolves.toMatchObject({ allowed: true });
    }
    await expect(store.take("k", 3, 60_000)).resolves.toMatchObject({ allowed: false });
  });

  it("says how long to wait, which a user can act on", async () => {
    const store = new MemoryRateLimitStore();
    await store.take("k", 1, 60_000);

    const refused = await store.take("k", 1, 60_000);

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBeGreaterThan(0);
    expect(refused.retryAfter).toBeLessThanOrEqual(60);
  });

  it("refills over time rather than resetting on a window boundary", async () => {
    vi.useFakeTimers();
    const store = new MemoryRateLimitStore();

    await store.take("k", 2, 60_000);
    await store.take("k", 2, 60_000);
    await expect(store.take("k", 2, 60_000)).resolves.toMatchObject({ allowed: false });

    // Half a window has passed, so one of two tokens is back.
    vi.advanceTimersByTime(30_000);
    await expect(store.take("k", 2, 60_000)).resolves.toMatchObject({ allowed: true });
  });

  it("does not let a fast-polling client starve itself, or gain from polling", async () => {
    // A rejection must neither discard the accrued refill (which would starve a polling
    // client forever) nor double-count it (which would reward polling with a faster
    // refill). Retrying every second against a 10s refill gets through at exactly 10s.
    vi.useFakeTimers();
    const store = new MemoryRateLimitStore();

    await store.take("k", 1, 10_000);
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(1_000);
      await store.take("k", 1, 10_000);
    }

    vi.advanceTimersByTime(1_000);
    await expect(store.take("k", 1, 10_000)).resolves.toMatchObject({ allowed: true });
  });

  it("keeps separate keys independent", async () => {
    const store = new MemoryRateLimitStore();

    await store.take("a", 1, 60_000);

    await expect(store.take("b", 1, 60_000)).resolves.toMatchObject({ allowed: true });
  });

  it("forgets fully-refilled buckets so the map cannot grow unbounded", async () => {
    vi.useFakeTimers();
    const store = new MemoryRateLimitStore();

    for (let i = 0; i < 50; i++) await store.take(`ip-${i}`, 5, 1_000);
    vi.advanceTimersByTime(5_000);
    await store.take("trigger-sweep", 5, 1_000);

    // @ts-expect-error reaching into the private map is the only way to observe the sweep
    expect(store.buckets.size).toBeLessThan(5);
  });
});

describe("scope selection", () => {
  it("gives Claude its own bucket regardless of who is calling", () => {
    expect(scopeFor(false, "claude")).toBe("claudeUser");
  });

  it("separates guests from signed-in users on the free engines", () => {
    expect(scopeFor(true, "finetuned")).toBe("freeGuest");
    expect(scopeFor(false, "finetuned")).toBe("freeUser");
  });

  it("limits Claude more strictly than the free engines", () => {
    // SPEC §4. Asserted against the constants rather than restating them, so tuning the
    // numbers cannot quietly invert the relationship.
    expect(LIMITS.claudeUser.limit).toBeLessThan(LIMITS.freeUser.limit);
    expect(LIMITS.freeGuest.limit).toBeLessThan(LIMITS.freeUser.limit);
  });
});

describe("free and paid buckets drain independently", () => {
  it("does not spend a user's Claude allowance on free analyses", async () => {
    for (let i = 0; i < LIMITS.freeUser.limit; i++) {
      await checkRateLimit("user_123", "freeUser");
    }
    await expect(checkRateLimit("user_123", "freeUser")).resolves.toMatchObject({ allowed: false });

    await expect(checkRateLimit("user_123", "claudeUser")).resolves.toMatchObject({ allowed: true });
  });
});

describe("clientAddress", () => {
  it("takes the leftmost x-forwarded-for entry, which is the real client", () => {
    // The rightmost is the platform's own proxy. Bucketing on it would put every guest on
    // the internet into one shared bucket.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 10.0.0.1" });

    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns null rather than inventing an address", () => {
    expect(clientAddress(new Headers())).toBeNull();
  });
});

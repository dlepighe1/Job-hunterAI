/**
 * Token-bucket rate limiting for `/api/score`.
 *
 * Two things are being protected, and they are not the same thing:
 *
 *   1. **Compute.** `/api/score` is reachable without an account (SPEC §5.1 lets guests use
 *      the matcher), so an unauthenticated caller can spend the scoring service's CPU.
 *      Guests are bucketed by IP; signed-in users by Clerk id, which is the better key
 *      because it survives a changing address.
 *   2. **Money.** The Claude engine costs real currency per call. It gets its own, much
 *      stricter bucket, per SPEC §4: "Stricter limit on the Claude engine than on the free
 *      engines."
 *
 * ---
 *
 * **Deployment limitation, read before making the URL public.** The default store is
 * in-memory and therefore per-instance. On a serverless host with N warm instances the
 * effective limit is N times what is configured here, and it resets on every cold start.
 * That is adequate for local development and a single always-on container, and it is NOT
 * adequate as the only cost control on a public URL.
 *
 * SPEC Part 7 calls for Upstash Redis or equivalent, and SPEC §4 says this is "not optional
 * before the URL is public". `RateLimitStore` is the seam: implement `take()` against
 * Redis, pass it to `configureRateLimit()`, and nothing else changes. That is Phase 1d.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left after this call. */
  remaining: number;
  /** Seconds until the next token. Only meaningful when `allowed` is false. */
  retryAfter: number;
}

export interface RateLimitStore {
  take(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  /** Test seam. A Redis-backed store may make this a no-op. */
  reset(): void;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket.
 *
 * Tokens refill continuously rather than resetting on a window boundary, which avoids the
 * stampede a fixed window creates at the top of each period, where everyone who was throttled
 * retries at the same instant.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  async take(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    this.sweep(now, windowMs);

    const refillPerMs = limit / windowMs;
    const bucket = this.buckets.get(key) ?? { tokens: limit, updatedAt: now };

    const refilled = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);

    if (refilled < 1) {
      // Write nothing. The bucket is only ever advanced by a SUCCESSFUL take, so `refilled`
      // stays a single multiply-and-add from the last one. Persisting it on each rejection
      // instead would re-round the running total on every poll, and a client retrying once
      // a second against a ten-second refill would accumulate to 0.9999999999999999 and
      // never be let through, a rate limiter that is wrong only under load.
      const msUntilNextToken = (1 - refilled) / refillPerMs;
      return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(msUntilNextToken / 1000)) };
    }

    const remaining = refilled - 1;
    this.buckets.set(key, { tokens: remaining, updatedAt: now });
    return { allowed: true, remaining: Math.floor(remaining), retryAfter: 0 };
  }

  reset(): void {
    this.buckets.clear();
    this.lastSweep = 0;
  }

  /**
   * Drop buckets that have refilled to full, since they are indistinguishable from a caller
   * that has never been seen. Without this the map grows one entry per distinct IP,
   * forever, which is a slow memory leak with an attacker-controlled key.
   *
   * Safe despite `updatedAt` only advancing on a successful take: a full window since the
   * last success means the bucket has refilled to `limit`, so deleting it and recreating
   * it full are the same thing. A caller being refused continuously cannot use this to
   * reset itself early.
   */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt >= windowMs) this.buckets.delete(key);
    }
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

/** Swap the backing store. Call once at startup with a Redis-backed store in production. */
export function configureRateLimit(next: RateLimitStore): void {
  store = next;
}

export function resetRateLimit(): void {
  store.reset();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The limits.
 *
 * Free engines are generous: they cost CPU on a machine that is already running, and the
 * matcher is genuinely iterative: a user tailoring a resume will re-score it a dozen times
 * in a sitting, and that is the product working, not abuse.
 *
 * Claude is not generous, because each call is a charge on someone's card.
 */
export const LIMITS = {
  freeUser: { limit: 40, windowMs: HOUR },
  freeGuest: { limit: 12, windowMs: HOUR },
  claudeUser: { limit: 8, windowMs: HOUR },
} as const;

export type RateLimitScope = keyof typeof LIMITS;

/**
 * Which bucket a request falls into.
 *
 * Guests never reach `claudeUser`: the Claude engine requires a session. An
 * unauthenticated endpoint that spends API credits is precisely the "surprise invoice"
 * SPEC §2.4 warns about, and no per-IP limit fixes it, because IPs are cheap and a card is not.
 * `/api/score` rejects that combination before it gets here.
 */
export function scopeFor(isGuest: boolean, engine: string): RateLimitScope {
  if (engine === "claude") return "claudeUser";
  return isGuest ? "freeGuest" : "freeUser";
}

export async function checkRateLimit(
  identifier: string,
  scope: RateLimitScope,
): Promise<RateLimitResult> {
  const { limit, windowMs } = LIMITS[scope];
  // Scope is part of the key so the paid bucket and the free bucket drain independently.
  // Otherwise a user who ran 40 free analyses could not run the Claude call they paid for.
  return store.take(`${scope}:${identifier}`, limit, windowMs);
}

/**
 * The client's address, for bucketing guests.
 *
 * `x-forwarded-for` is client-controllable in general, but on Vercel and every comparable
 * host the platform proxy rewrites it, and the LEFTMOST entry is the real client. Reading
 * the rightmost would bucket every guest under the proxy's own address, which is one shared
 * bucket for the entire internet.
 *
 * Returns null when there is no usable address rather than inventing one, so the caller can
 * decide: an unbucketable guest is refused, not waved through.
 */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

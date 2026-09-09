/**
 * The waitlist vocabulary: which unshipped feature a "notify me" signup is about.
 *
 * These strings are the `feature` CHECK constraint on the `waitlist` table, so a value the
 * database rejects is a runtime insert failure rather than a type error.
 *
 * It lives in its own module because it is genuinely shared and has nowhere else to sit
 * without dragging something unwanted along. It was previously written out three times:
 *
 *   - `lib/use-waitlist.ts`, which is a "use client" React hook, so no server module can
 *     import from it.
 *   - `lib/db.ts`, which opens a Supabase client, so no client component can import from it.
 *   - `app/api/waitlist/route.ts`, as a `z.enum` — the copy that mattered most, since it is
 *     the gate deciding what reaches the database in the first place.
 *
 * The client hook and the server writer sit on opposite sides of a boundary neither can
 * cross, which is exactly the case a pure module exists for. Same shape as `lib/outreach.ts`
 * and its statuses: no React, no server-only imports, nothing but the vocabulary.
 */

export const WAITLIST_FEATURES = ["network", "outreach", "general"] as const;
export type WaitlistFeature = (typeof WAITLIST_FEATURES)[number];

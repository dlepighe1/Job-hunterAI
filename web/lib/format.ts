/**
 * Date rendering for the application surfaces.
 *
 * One module rather than a `toLocaleDateString` call per component, for three reasons that
 * each produced a real bug class before this existed:
 *
 * 1. **ISO dates leaked into the interface.** `ApplicationsTable` rendered
 *    `date.toISOString().slice(0, 10)` and the drawer rendered `application.appliedAt` raw,
 *    so the pipeline showed "2026-03-21" in a product whose every other number is
 *    deliberately typeset. The redesign specifies `MMM d, yyyy` everywhere.
 *
 * 2. **A calendar day is not an instant.** `applied_at` is a Postgres `date`, so it arrives
 *    as "2026-03-21" with no time and no zone. `new Date("2026-03-21")` resolves that to UTC
 *    midnight, and rendering it in any zone west of Greenwich moves it to the 20th. Parsing
 *    is therefore lexical here: a date-only string never becomes a local instant.
 *
 * 3. **`toLocaleDateString` is not stable between server and client.** It reads the host's
 *    zone and ICU data, so the server and the browser can disagree about the same value and
 *    React reports the difference as a hydration mismatch. The month table below is fixed,
 *    so both sides always produce the same string.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** `YYYY-MM-DD`, optionally followed by a time this function ignores. */
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

interface CalendarDay {
  year: number;
  /** 1-indexed, as written in the string rather than as `Date` counts them. */
  month: number;
  day: number;
}

/**
 * Read the calendar day out of an ISO string without going through `Date`.
 *
 * Validates the ranges itself: "2026-13-45" matches the shape but names no real day, and
 * `Date` would silently roll it forward into the following year rather than reject it.
 */
function readCalendarDay(value: string): CalendarDay | null {
  const match = CALENDAR_DAY.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Reject a day the month does not have. Constructed in UTC so the check is not itself
  // subject to the timezone problem this module exists to avoid.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month, day };
}

/**
 * A date column as the interface renders it: `MMM d, yyyy`.
 *
 * The day is not zero-padded, per the specification's own examples ("Mar 21, 2026").
 *
 * Returns null rather than a placeholder when there is nothing to render. The empty copy
 * differs by column, "Not sent yet" against "No response recorded", and choosing it here
 * would force every caller to share one wording that fits none of them.
 */
export function formatAppDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const parsed = readCalendarDay(value);
  if (!parsed) return null;

  return `${MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
}

/**
 * A timestamp with its time, for activity feeds where the ordering within a day matters.
 *
 * Rendered in UTC on purpose. The alternative is the browser's zone, which the server does
 * not share, and a timestamp is the one value in this product that a user reads once and
 * never compares against a wall clock. Consistency between the two renders is worth more
 * here than local-time convenience.
 */
export function formatAppDateTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const day = formatAppDate(value);
  if (!day) return null;

  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;

  const hours = String(at.getUTCHours()).padStart(2, "0");
  const minutes = String(at.getUTCMinutes()).padStart(2, "0");

  return `${day} at ${hours}:${minutes}`;
}

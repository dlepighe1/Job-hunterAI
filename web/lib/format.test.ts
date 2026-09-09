import { describe, expect, it } from "vitest";

import { formatAppDate, formatAppDateTime } from "@/lib/format";

/**
 * The date format the redesigned application surfaces use: `MMM d, yyyy`.
 *
 * The day is NOT zero-padded. The lo-fi boards render "Mar 03, 2026" in a couple of cells,
 * but the written specification says `MMM d, yyyy` and spells its examples "Mar 21, 2026",
 * so the prose wins over what is almost certainly an image-generation artifact.
 */
describe("formatAppDate", () => {
  it("renders a date-only column as MMM d, yyyy", () => {
    expect(formatAppDate("2026-03-21")).toBe("Mar 21, 2026");
    expect(formatAppDate("2025-06-19")).toBe("Jun 19, 2025");
  });

  it("does not zero-pad the day", () => {
    expect(formatAppDate("2026-03-03")).toBe("Mar 3, 2026");
    expect(formatAppDate("2025-06-09")).toBe("Jun 9, 2025");
  });

  it("covers every month", () => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    months.forEach((name, index) => {
      const month = String(index + 1).padStart(2, "0");
      expect(formatAppDate(`2026-${month}-15`)).toBe(`${name} 15, 2026`);
    });
  });

  /**
   * The reason this module exists rather than a `toLocaleDateString` call at each site.
   *
   * `applied_at` is a `date` column, so it arrives as "2026-03-21", a CALENDAR day with no
   * instant attached. `new Date("2026-03-21")` parses that as UTC midnight, and formatting
   * the result in a timezone west of Greenwich renders the day before. A user in Chicago
   * would watch every applied date sit one day earlier than the one they typed.
   *
   * The parse is therefore lexical: the string is split on its hyphens and never becomes a
   * local instant at all.
   */
  it("never shifts a calendar day across timezones", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Chicago", "Pacific/Kiritimati", "Etc/GMT+12"]) {
        process.env.TZ = zone;
        expect(formatAppDate("2026-03-21")).toBe("Mar 21, 2026");
        expect(formatAppDate("2026-01-01")).toBe("Jan 1, 2026");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  /** A timestamptz still renders as its calendar day, so the two column kinds agree. */
  it("accepts a full timestamp and renders its day", () => {
    expect(formatAppDate("2025-05-30T14:22:05.000Z")).toBe("May 30, 2025");
  });

  /**
   * Empty states are the caller's decision, not this function's. Returning a placeholder
   * here would put "n/a" in one column and "No response recorded" in another for the same
   * underlying null, and the copy belongs at the call site where the meaning is known.
   */
  it("returns null for a missing or unparseable date", () => {
    expect(formatAppDate(null)).toBeNull();
    expect(formatAppDate("")).toBeNull();
    expect(formatAppDate("not a date")).toBeNull();
    expect(formatAppDate("2026-13-45")).toBeNull();
  });
});

describe("formatAppDateTime", () => {
  /**
   * Rendered in UTC deliberately. A timestamp formatted in the browser's zone disagrees with
   * the same timestamp formatted on the server during SSR, and React reports that as a
   * hydration mismatch. Day-granular truth is what this product needs from an activity feed,
   * so both sides render the same string and there is nothing to reconcile.
   */
  it("renders the UTC day and time", () => {
    expect(formatAppDateTime("2025-05-30T14:22:05.000Z")).toBe("May 30, 2025 at 14:22");
  });

  it("is stable across timezones", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Chicago", "Asia/Tokyo"]) {
        process.env.TZ = zone;
        expect(formatAppDateTime("2025-05-30T14:22:05.000Z")).toBe("May 30, 2025 at 14:22");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns null for a missing or unparseable timestamp", () => {
    expect(formatAppDateTime(null)).toBeNull();
    expect(formatAppDateTime("nonsense")).toBeNull();
  });
});

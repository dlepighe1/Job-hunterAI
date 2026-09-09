import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPANY_LOGOS } from "@/lib/company-logos";
import { normalizeCompanyName, resolveCompanyMark } from "@/lib/company-marks";

/** A stand-in for the generated index, so these tests describe the RULES rather than
 *  whichever brands happen to be vendored this week. */
const INDEX: Record<string, string> = {
  stripe: "stripe",
  google: "google",
  microsoft: "microsoft",
  notion: "notion",
};

describe("normalizeCompanyName", () => {
  it("lowercases and strips whitespace", () => {
    expect(normalizeCompanyName("  Stripe  ")).toBe("stripe");
    expect(normalizeCompanyName("Beacon Grid")).toBe("beacongrid");
  });

  // A user types the company the way it appears on the posting, which is inconsistent about
  // legal form. "Stripe", "Stripe Inc" and "Stripe, Inc." are one employer.
  it("strips legal suffixes", () => {
    for (const written of [
      "Stripe Inc",
      "Stripe, Inc.",
      "Stripe LLC",
      "Stripe Ltd.",
      "Stripe Limited",
      "Stripe Corporation",
      "Stripe GmbH",
      "Stripe PLC",
    ]) {
      expect(normalizeCompanyName(written)).toBe("stripe");
    }
  });

  it("strips a leading article", () => {
    expect(normalizeCompanyName("The Boeing Company")).toBe("boeing");
  });

  it("strips punctuation and diacritics", () => {
    expect(normalizeCompanyName("Nestlé S.A.")).toBe("nestle");
    expect(normalizeCompanyName("Ben & Jerry's")).toBe("benjerrys");
  });

  /**
   * "Group" is NOT a legal suffix. "Pinehurst Group" is the company's actual name, and
   * stripping it would collapse every "<something> Group" onto its bare first word and
   * match the wrong brand.
   */
  it("keeps words that are part of the name", () => {
    expect(normalizeCompanyName("Pinehurst Group")).toBe("pinehurstgroup");
    expect(normalizeCompanyName("Helixion Health")).toBe("helixionhealth");
  });

  it("survives an empty or symbol-only name", () => {
    expect(normalizeCompanyName("")).toBe("");
    expect(normalizeCompanyName("   ")).toBe("");
    expect(normalizeCompanyName("!!!")).toBe("");
  });
});

describe("resolveCompanyMark", () => {
  it("finds a vendored mark by normalized name", () => {
    expect(resolveCompanyMark("Stripe", INDEX)).toEqual({
      kind: "local",
      slug: "stripe",
      src: "/img/logos/stripe.svg",
    });
  });

  it("finds it regardless of how the user typed the legal form", () => {
    expect(resolveCompanyMark("  STRIPE, Inc. ", INDEX)).toMatchObject({
      kind: "local",
      slug: "stripe",
    });
  });

  it("falls back to a monogram when the company is not vendored", () => {
    expect(resolveCompanyMark("Helixion Health", INDEX)).toEqual({
      kind: "monogram",
      initial: "H",
    });
  });

  /**
   * The guard that matters most.
   *
   * Matching is exact against the normalized key, never a prefix or a substring. A fuzzy
   * rule is how "Apple Dental Group" ends up wearing Apple's trademark, and a confidently
   * wrong logo is worse than no logo: it misidentifies the employer on a row the user is
   * reading to decide what to do next.
   */
  it("never matches on a prefix or substring", () => {
    expect(resolveCompanyMark("Googleplex Ventures", INDEX).kind).toBe("monogram");
    expect(resolveCompanyMark("Micro", INDEX).kind).toBe("monogram");
    expect(resolveCompanyMark("Stripes Bakery", INDEX).kind).toBe("monogram");
  });

  it("takes the initial from the first letter or digit, not from punctuation", () => {
    expect(resolveCompanyMark("  ·acme", INDEX)).toMatchObject({ initial: "A" });
    expect(resolveCompanyMark("3M Innovations", INDEX)).toMatchObject({ initial: "3" });
  });

  // An application cannot be saved without a company, but a whitespace-only value can still
  // reach the renderer, and a blank circle reads as a broken image.
  it("has a mark even for an unusable name", () => {
    expect(resolveCompanyMark("", INDEX)).toEqual({ kind: "monogram", initial: "?" });
    expect(resolveCompanyMark("   ", INDEX)).toEqual({ kind: "monogram", initial: "?" });
  });

  it("points every local mark at a real path under the committed logo directory", () => {
    for (const name of Object.keys(INDEX)) {
      const mark = resolveCompanyMark(name, INDEX);
      expect(mark.kind).toBe("local");
      if (mark.kind === "local") {
        expect(mark.src).toBe(`/img/logos/${mark.slug}.svg`);
      }
    }
  });
});

/**
 * The shipped index, as opposed to the fixture above.
 *
 * It is empty today by decision, so this asserts the invariant rather than the contents: the
 * day someone populates it, a typo'd slug must fail here and not as a broken image in a row
 * of someone's job search. Mirrors the guard `components/hero/copy.test.ts` already keeps
 * over the marketing hero's logo files.
 */
describe("the shipped company logo index", () => {
  it("ships a file for every slug it names", () => {
    for (const [key, slug] of Object.entries(COMPANY_LOGOS)) {
      expect(
        existsSync(join(process.cwd(), "public", "img", "logos", `${slug}.svg`)),
        `COMPANY_LOGOS["${key}"] points at missing public/img/logos/${slug}.svg`,
      ).toBe(true);
    }
  });

  it("is keyed by already-normalized names, so lookups can hit", () => {
    for (const key of Object.keys(COMPANY_LOGOS)) {
      expect(normalizeCompanyName(key), `"${key}" is not in normalized form`).toBe(key);
    }
  });
});

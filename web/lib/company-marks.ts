/**
 * Resolving a company name to a mark for the applications table, grid and drawer.
 *
 * **Today every row resolves to a monogram**, because `COMPANY_LOGOS` ships empty. That file
 * carries the reasoning; the short version is that the available icon sets cover roughly two
 * thirds of a real employer list and miss Microsoft and Amazon, and a table with marks on
 * some rows and letters on others reads as broken rather than restrained.
 *
 * Nothing here is fetched. A favicon service would solve coverage, but it would send one
 * request per company to a third party, and the set of companies a person has applied to is
 * close to the most sensitive thing this product holds. Local files also cannot rate-limit,
 * cannot go down, cannot flicker in on scroll, and cannot break a row with a 404.
 *
 * `resolveCompanyMark` returns a discriminated union rather than a URL string precisely so a
 * `remote` case can be added later without touching a single component: only this function
 * and the renderer's switch would change. Populating `COMPANY_LOGOS` is likewise a data
 * change, not a code change.
 *
 * Any file this does point at follows the convention the marketing hero already established,
 * `public/img/logos/{slug}.svg`.
 */

import { COMPANY_LOGOS } from "@/lib/company-logos";

export type CompanyMark =
  | { kind: "local"; slug: string; src: string }
  | { kind: "monogram"; initial: string };

/**
 * Trailing tokens that describe a legal form rather than the company.
 *
 * Deliberately conservative. "Group", "Labs", "Partners", "Systems" and "Health" all look
 * like suffixes and are not: "Pinehurst Group" and "Helixion Health" are the whole names,
 * and stripping the second word would collapse them onto a bare first token that could then
 * collide with an unrelated vendored brand.
 */
const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "lllc", "ltd", "limited", "co", "company", "corp",
  "corporation", "gmbh", "plc", "ag", "nv", "bv", "sa", "sas", "spa", "ab", "oy", "oyj",
  "as", "aps", "pty", "llp", "lp", "kk", "srl", "sarl", "sl", "bhd", "sdn",
]);

/** Combining diacritical marks, stripped after an NFD decomposition so "é" folds to "e". */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Reduce a typed company name to a stable lookup key.
 *
 * Diacritics are folded so "Nestlé" and "Nestle" agree, punctuation and spaces are dropped
 * so "Ben & Jerry's" and "Ben and Jerrys" do not, and a leading article goes because "The
 * Boeing Company" is filed under Boeing everywhere a human would look for it.
 */
export function normalizeCompanyName(name: string): string {
  const folded = name
    .normalize("NFD")
    // Strip combining marks, so é becomes e rather than staying a separate code point.
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    // Periods go BEFORE tokenizing, so a dotted abbreviation survives as one token.
    // Splitting first would turn "S.A." into "s" and "a", and neither is a legal suffix,
    // so "Nestlé S.A." would normalize to "nestlesa" and match nothing.
    .replace(/\./g, "");

  const tokens = folded
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  if (tokens.length === 0) return "";

  // Drop a leading article, but never if it is the entire name.
  if (tokens.length > 1 && tokens[0] === "the") tokens.shift();

  // Drop legal forms from the end, repeatedly: "Stripe Inc. Ltd" is rare but free to handle.
  // Never drop the last remaining token, or "Co" as a company name normalizes to nothing.
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join("");
}

/** The letter shown when there is no vendored mark. First letter or digit of the name. */
function monogramFor(name: string): string {
  const match = /[a-z0-9]/i.exec(name.normalize("NFD").replace(COMBINING_MARKS, ""));
  return match ? match[0].toUpperCase() : "?";
}

/**
 * The mark for a company.
 *
 * Lookup is an EXACT match on the normalized key. There is no prefix, substring or
 * edit-distance fallback, and that omission is the point: a fuzzy rule puts Apple's
 * trademark on "Apple Dental Group", and a confidently wrong logo misidentifies the employer
 * on a row someone is reading to decide what to do next. A monogram is never wrong.
 *
 * `index` is injectable so the tests can describe the rules without depending on which
 * brands happen to be vendored.
 */
export function resolveCompanyMark(
  company: string,
  index: Record<string, string> = COMPANY_LOGOS,
): CompanyMark {
  const key = normalizeCompanyName(company);
  const slug = key ? index[key] : undefined;

  if (slug) {
    return { kind: "local", slug, src: `/img/logos/${slug}.svg` };
  }

  return { kind: "monogram", initial: monogramFor(company) };
}

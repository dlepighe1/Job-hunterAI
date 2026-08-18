import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AtsAnalysis } from "@/lib/ats";
import { KeywordGaps } from "./KeywordGaps";

/**
 * The invariant this file exists for: no user-facing string in the keyword panel may claim
 * the model detects keyword stuffing.
 *
 * That claim shipped for months on the strength of a plausible argument, that the model's
 * hard negatives are keyword-dense wrong-role resumes so an unevidenced term should be
 * caught. The research repository tested it (`Results/behavioral_tests.json` there) and
 * found the opposite: appending unevidenced tool names raised the score on 52 of 52
 * resumes. A wrong-role resume and a plausible resume with a skills line bolted on are
 * different attacks and only the first was trained against.
 *
 * A prose assertion is the right shape here because the defect was prose. Nothing about the
 * component's types or props would have caught it, and the next person to reword this panel
 * needs to be stopped by a failing test rather than by remembering a research result.
 *
 * `renderToStaticMarkup` rather than a DOM: this repo's suite runs in `environment: "node"`
 * with no jsdom and no @testing-library, matching `components/backdrop/backdrop.test.tsx`.
 */
const WITH_GAPS: AtsAnalysis = {
  score: 40,
  matched: ["python"],
  missing: ["kubernetes", "terraform"],
  gaps: [
    { keyword: "kubernetes", occurrences: 3, inRequirements: true, priority: "high" },
    { keyword: "terraform", occurrences: 1, inRequirements: false, priority: "low" },
  ],
};

const NO_GAPS: AtsAnalysis = {
  score: 100,
  matched: ["python", "sql"],
  missing: [],
  gaps: [],
};

/** Visible prose only: tags stripped, entities decoded, whitespace collapsed. */
function visibleText(analysis: AtsAnalysis | null): string {
  return renderToStaticMarkup(<KeywordGaps keywords={analysis} />)
    .replace(/<[^>]*>/g, " ")
    // React escapes apostrophes as `&#x27;`, so a named-entity table alone misses them and
    // every prose assertion below silently stops matching.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("KeywordGaps stuffing warning", () => {
  it("warns at the point of the suggestion whenever gaps are listed", () => {
    expect(visibleText(WITH_GAPS)).toContain("don't add a term you can't back up");
  });

  it("never claims the model detects stuffing", () => {
    const text = visibleText(WITH_GAPS);

    // The exact sentences that were wrong, so a revert is caught by name.
    expect(text).not.toContain("trained to catch");
    expect(text).not.toContain("reproduces exactly the pattern");

    // And the general shape of the claim, so a reworded revert is caught too: no verb of
    // detection or punishment may appear anywhere near the stuffing warning.
    for (const verb of ["catch", "catches", "detect", "detects", "penalis", "penaliz", "flags"]) {
      expect(text).not.toContain(verb);
    }
  });

  it("states the measured direction, that stuffing raises the score", () => {
    const text = visibleText(WITH_GAPS);
    expect(text).toContain("raised the score on 52 of 52");
    expect(text).toMatch(/cannot tell a skill your resume evidences from one it merely claims/);
  });

  it("does not warn when the resume has no gaps to close", () => {
    expect(visibleText(NO_GAPS)).not.toContain("back up");
  });

  it("still says nothing about detection in the empty state", () => {
    const text = visibleText(null);
    for (const verb of ["catch", "detect", "penalis", "penaliz"]) {
      expect(text).not.toContain(verb);
    }
  });
});

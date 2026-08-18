/**
 * Turning one analysis into the things a user can act on.
 *
 * Every value here is derived from what an engine actually returned. That constraint is the
 * whole design: the tempting version of this file invents "Skills 88 / Experience 83 / Role
 * alignment 86", four confident dimensions no engine in this product measures. Those numbers
 * would be indistinguishable from real ones on screen, which is exactly why they must not
 * exist (§37, §78).
 *
 * What the engines really produce is a score, per-requirement coverage with the matching
 * sentence, and literal keyword coverage. Everything below is counted from those.
 */

import type { KeywordGap } from "@/lib/ats";
import type { Requirement, ScoreResult } from "@/lib/types";

/** Enough to be useful, few enough to read. A list of twenty is a keyword dump. */
const MAX_STRENGTHS = 6;
const MAX_GAPS = 6;
const MAX_RECOMMENDATIONS = 4;

export interface BreakdownRow {
  label: string;
  /** 0 to 100. */
  value: number;
  /** How it was computed, shown so the number is checkable rather than authoritative. */
  basis: string;
}

/**
 * The sub-measures, and only the ones that were measured.
 *
 * Two exist. Requirement coverage counts parsed requirements the resume evidences; keyword
 * coverage is literal string matching. An engine that produces neither gets an empty
 * breakdown and the UI shows none, which is better than three invented bars.
 */
export function breakdown(result: ScoreResult): BreakdownRow[] {
  const rows: BreakdownRow[] = [];

  if (result.requirements.length > 0) {
    // A partial counts as half: calling it covered overstates the resume, calling it missing
    // understates it, and the evidence genuinely is present but thin.
    const weight = result.requirements.reduce(
      (sum, requirement) =>
        sum + (requirement.status === "covered" ? 1 : requirement.status === "partial" ? 0.5 : 0),
      0,
    );
    rows.push({
      label: "Requirement coverage",
      value: Math.round((weight / result.requirements.length) * 100),
      basis: `${result.requirements.length} requirements parsed from the posting; partials count as half`,
    });
  }

  if (result.keywords) {
    rows.push({
      label: "Keyword coverage",
      value: Math.round(result.keywords.score),
      basis: "Literal term matching, the way an applicant tracking system reads",
    });
  }

  return rows;
}

export interface Strength {
  label: string;
  /** The resume sentence that covered it. Never invented: a covered requirement always
   *  cites the sentence that covered it (FEATURES.md §3.2 acceptance). */
  evidence: string;
  similarity: number;
}

/** Covered requirements, strongest evidence first. */
export function strengths(result: ScoreResult): Strength[] {
  return result.requirements
    .filter((requirement) => requirement.status === "covered")
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_STRENGTHS)
    .map((requirement) => ({
      label: requirement.requirement,
      evidence: requirement.evidence,
      similarity: requirement.similarity,
    }));
}

export interface Gap {
  label: string;
  importance: "high" | "medium";
  evidence: "missing" | "weak";
  /** Why it matters, where the posting tells us. */
  note: string;
}

function keywordImportance(gap: KeywordGap): "high" | "medium" {
  return gap.priority === "high" ? "high" : "medium";
}

/**
 * The gaps worth acting on.
 *
 * §39: not every unmatched word is a gap. A missing parsed requirement always counts; a
 * missing keyword only counts when the posting repeats it or states it among its
 * requirements, which is what `priority` already encodes. Everything else is vocabulary.
 */
export function importantGaps(result: ScoreResult): Gap[] {
  const gaps: Gap[] = [];
  const seen = new Set<string>();

  const add = (gap: Gap) => {
    const id = gap.label.trim().toLowerCase();
    if (!id || seen.has(id)) return;
    seen.add(id);
    gaps.push(gap);
  };

  for (const requirement of result.requirements) {
    if (requirement.status === "missing") {
      add({
        label: requirement.requirement,
        importance: "high",
        evidence: "missing",
        note: "Stated in the posting and not evidenced anywhere in the résumé.",
      });
    } else if (requirement.status === "partial") {
      add({
        label: requirement.requirement,
        importance: "medium",
        evidence: "weak",
        note: "Something in the résumé is close, but it does not clearly evidence this.",
      });
    }
  }

  for (const gap of result.keywords?.gaps ?? []) {
    if (gap.priority === "low") continue;
    add({
      label: gap.keyword,
      importance: keywordImportance(gap),
      evidence: "missing",
      note: gap.inRequirements
        ? `Appears in the posting's requirements${gap.occurrences > 1 ? `, ${gap.occurrences} times` : ""}.`
        : `Mentioned ${gap.occurrences} times in the posting.`,
    });
  }

  // High importance first, so the list opens with what costs most.
  return gaps
    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "high" ? -1 : 1))
    .slice(0, MAX_GAPS);
}

function share(requirements: Requirement[], status: Requirement["status"]): number {
  if (requirements.length === 0) return 0;
  return requirements.filter((requirement) => requirement.status === status).length /
    requirements.length;
}

/**
 * What could be stronger, in the résumé's presentation rather than its content.
 *
 * Each observation is triggered by a measured proportion, so the panel stays silent when
 * there is nothing to say. Generic advice printed regardless of the analysis is the
 * "improve your keywords" failure mode this exists to avoid.
 */
export function weaknesses(result: ScoreResult): string[] {
  const items: string[] = [];
  const requirements = result.requirements;

  if (requirements.length > 0) {
    if (share(requirements, "missing") >= 0.4) {
      items.push(
        "A large share of the posting's requirements are not evidenced anywhere in the résumé. That usually means the résumé is aimed at a different role, not that it is badly written.",
      );
    }

    if (share(requirements, "partial") >= 0.3) {
      items.push(
        "Several requirements are nearly covered: the résumé mentions the area but the evidence for the specific thing asked for is thin. Naming the tool, the scale, or the outcome usually closes these.",
      );
    }
  }

  if (result.keywords && result.keywords.score < 50 && (result.keywords.matched.length > 0 || result.keywords.missing.length > 0)) {
    items.push(
      "Literal term coverage is low. An applicant tracking system matches strings rather than meaning, so a résumé can describe the right experience in words the filter will not find.",
    );
  }

  return items;
}

export interface Recommendation {
  title: string;
  detail: string;
  impact: "high" | "medium";
}

/**
 * What to change, named specifically.
 *
 * §42: "Improve keywords" is not a recommendation. Each item names the requirement it is
 * about and says what evidencing it would take.
 *
 * The stuffing warning rides along with the highest-impact item rather than sitting in a
 * footer, because that is where the temptation is. FEATURES.md §3.2 is emphatic that the
 * product must NOT claim the model catches stuffing, and it was measured not to: appending
 * roughly thirteen words of a posting's tool names raised the score on 52 of 52 résumés.
 * The truthful warning is that it works on the number and fails on the reader.
 */
export function recommendations(result: ScoreResult): Recommendation[] {
  const gaps = importantGaps(result);
  if (gaps.length === 0) return [];

  const items: Recommendation[] = gaps.slice(0, MAX_RECOMMENDATIONS).map((gap, index) => ({
    title:
      gap.evidence === "missing"
        ? `Evidence ${gap.label}, or decide it is out of scope`
        : `Strengthen the evidence for ${gap.label}`,
    detail:
      gap.evidence === "missing"
        ? `${gap.note} If you have done this, name where and at what scale. If you have not, adding the term raises the score and will not survive a human reader, because the model cannot tell a skill you evidence from one you merely claim.`
        : `${gap.note} Say what you actually did with it, since the tool name alone reads as familiarity, and the evidence is what a reviewer is looking for.`,
    impact: gap.importance === "high" && index < 2 ? "high" : "medium",
  }));

  return items;
}

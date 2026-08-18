import Link from "next/link";

import { ArrowUpRightIcon } from "@/components/icons";

/**
 * A screen for a Phase 1 feature that is planned and not yet built.
 *
 * Distinct from `ComingSoon`, which is for the Phase 2 and 3 features that are deferred
 * pending legal and data-sourcing questions. These are just not written yet.
 *
 * The reason this exists at all: the pages it replaces were rendering invented data:
 * pipelines of applications nobody made, interview rates for a user with no interviews,
 * "98% match" on roles that were never scored. A demo shell is a reasonable thing to build
 * a design against, and a terrible thing to ship, because a number on a screen is a claim.
 * SPEC Appendix B forbids the specific claims those numbers made.
 */
export function PhasePlaceholder({
  phase,
  title,
  summary,
  willDo,
}: {
  phase: string;
  title: string;
  summary: string;
  willDo: string[];
}) {
  return (
    <div className="stage-narrow">
      <span className="page-kicker">{phase}</span>
      <h1>{title}</h1>
      <p>{summary}</p>

      <div className="obsidian-panel" style={{ marginTop: 30 }}>
        <h2 className="panel-title">What it will do</h2>
        <ul className="spec-list">
          {willDo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="callout">
        <p>
          The matcher works now. Score a resume against a posting and see requirement
          coverage and keyword gaps.
        </p>
        <Link href="/matcher" className="button button--primary">
          Open the matcher
          <ArrowUpRightIcon />
        </Link>
      </div>
    </div>
  );
}

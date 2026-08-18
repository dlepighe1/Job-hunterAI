"use client";

/**
 * The analysis, read as a report rather than as a score.
 *
 * Wraps the existing result panels, which already handle the score, requirement coverage,
 * keyword gaps and written feedback, and adds the four sections the product was missing:
 * a breakdown of what was measured, what is working, what could be stronger, and what to
 * change.
 *
 * All four come from `lib/analysis-insights.ts`, which derives them from the engine's own
 * output. Nothing here is generated prose about a résumé the component has not seen.
 */

import { KeywordGaps } from "@/components/matcher/KeywordGaps";
import { RequirementCoverage } from "@/components/matcher/RequirementCoverage";
import { ScorePanel } from "@/components/matcher/ScorePanel";
import { WrittenFeedback } from "@/components/matcher/WrittenFeedback";
import {
  breakdown,
  importantGaps,
  recommendations,
  strengths,
  weaknesses,
} from "@/lib/analysis-insights";
import type { ScoreResult } from "@/lib/types";

export function AnalysisReport({
  result,
  isGuest,
  onElevate,
  canElevate,
}: {
  result: ScoreResult;
  isGuest: boolean;
  onElevate: () => void;
  canElevate: boolean;
}) {
  const rows = breakdown(result);
  const strong = strengths(result);
  const gaps = importantGaps(result);
  const soft = weaknesses(result);
  const actions = recommendations(result);

  const hasScore = result.score !== null;

  return (
    <div className="report">
      {hasScore && <ScorePanel result={result} />}

      {/*
        Restated next to the number every single time. FEATURES.md §2.3 and the brief both
        require it, and a caveat that lives only in onboarding is a caveat nobody has read
        by the time they are looking at a 74.
      */}
      {hasScore && (
        <p className="report__caveat">
          This measures how closely the résumé matches the posting. It is not a prediction
          that you will be interviewed or hired, and it is not an ATS pass rate.
        </p>
      )}

      {rows.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">WHAT WAS MEASURED</div>
          {rows.map((row) => (
            <div className="pf-row report__breakdown" key={row.label}>
              <span>
                <b>{row.label}</b>
                <small>{row.basis}</small>
              </span>
              <span className="report__breakdown-value">
                <b>{row.value}</b>
                <span className="pf-meter">
                  <i style={{ width: `${row.value}%` }} />
                </span>
              </span>
            </div>
          ))}
          {/* Names the dimensions that are deliberately absent, so their absence does not
              read as an oversight. */}
          <p className="report__note">
            Only what an engine actually measures appears here. There is no separate
            &ldquo;skills&rdquo; or &ldquo;experience&rdquo; score, since nothing in this product
            computes those, and showing them would mean inventing them.
          </p>
        </section>
      )}

      {strong.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">STRONG MATCHES</div>
          <ul className="report__list">
            {strong.map((item) => (
              <li key={item.label}>
                <b>{item.label}</b>
                {/* The sentence that covered it. A covered requirement always cites its
                    evidence, which is the acceptance criterion in FEATURES.md §3.2. */}
                {item.evidence && <q>{item.evidence}</q>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">IMPORTANT GAPS</div>
          <ul className="report__list report__list--gaps">
            {gaps.map((gap) => (
              <li key={gap.label}>
                <span className="report__gap-head">
                  <b>{gap.label}</b>
                  <span className="report__chip" data-tone={gap.importance}>
                    {gap.importance} importance
                  </span>
                  <span className="report__chip" data-tone="evidence">
                    evidence: {gap.evidence}
                  </span>
                </span>
                <small>{gap.note}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RequirementCoverage requirements={result.requirements} />
      <KeywordGaps keywords={result.keywords} />
      <WrittenFeedback result={result} />

      {soft.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">WHAT COULD BE STRONGER</div>
          <ul className="report__prose">
            {soft.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {actions.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">RECOMMENDED CHANGES</div>
          <ul className="report__actions">
            {actions.map((action) => (
              <li key={action.title}>
                <span className="report__action-head">
                  <b>{action.title}</b>
                  <span className="report__chip" data-tone={action.impact}>
                    {action.impact} impact
                  </span>
                </span>
                <p>{action.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canElevate && (
        <div className="report__cta">
          <button type="button" className="button button--primary" onClick={onElevate}>
            Elevate résumé
          </button>
          <p>
            Rewrites what the résumé already says so the relevant experience is easier to
            find. It never adds a job, a skill, a metric or a qualification you did not give
            it, and your master résumé is untouched, since elevating creates a new version.
          </p>
        </div>
      )}

      {isGuest && (
        <p className="report__note">
          You&apos;re signed out, so none of this was stored: not the résumé, not the
          posting, not the result.
        </p>
      )}
    </div>
  );
}

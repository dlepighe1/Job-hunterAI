"use client";

/**
 * Match Distribution: how the roles you are targeting score against your baseline resume.
 *
 * The bands come from `BANDS` in `benchmark.ts`, shared with the research repository and
 * the live scorer, so a 0.72 cannot be "competitive" here and "good" in the matcher.
 *
 * Two things this must never say, both from FEATURES.md §2.3 and restated in the brief:
 * this is résumé-to-job relevance, and it is not a probability of an interview, a hire, or
 * getting through an ATS. The subtitle carries that rather than a tooltip, because a
 * caveat nobody hovers is a caveat nobody reads.
 */

import Link from "next/link";

import { matchDistribution } from "@/lib/velocity";
import type { ApplicationView } from "@/lib/use-applications";

export function MatchDistribution({ applications }: { applications: ApplicationView[] }) {
  const bands = matchDistribution(applications);
  const scored = applications.filter((application) => application.matchScore !== null).length;

  return (
    <section className="obsidian-panel dash-panel">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Match Distribution</h2>
          <p className="dash-panel__sub">Based on baseline résumé matches</p>
        </div>
      </header>

      {bands.length === 0 ? (
        <div className="dash-panel__empty-block">
          <p>Your match portfolio is still empty.</p>
          <p>
            Analyse a job description against a résumé and save the result, and the spread of
            those scores appears here.
          </p>
          <Link href="/matcher" className="button button--ghost">
            Open the matcher
          </Link>
        </div>
      ) : (
        <>
          <ul className="band-list">
            {bands.map((band) => (
              <li key={band.label}>
                <div className="band-list__head">
                  <span>
                    <b>{band.label}</b>
                    <small>{band.range}</small>
                  </span>
                  <span className="band-list__count">
                    {band.count} {band.count === 1 ? "role" : "roles"}
                    <b>{band.share}%</b>
                  </span>
                </div>
                <div className="pf-meter" data-tone={band.tone}>
                  <i style={{ width: `${band.share}%` }} />
                </div>
              </li>
            ))}
          </ul>

          {/*
            The strong band being empty is the expected result, not a bug: the fine-tuned
            model's measured ceiling is about 0.85 and it underscores strong matches by
            roughly 0.17. Saying so beats letting the user read an empty bar as failure.
          */}
          {bands[0].count === 0 && (
            <p className="dash-panel__note">
              An empty strong band is normal. The calibrated model rarely predicts above 85,
              it underscores strong matches by about 17 points, so ordering matters more
              here than the absolute number.
            </p>
          )}

          <p className="dash-panel__note">
            Measures résumé-to-job relevance across {scored} scored{" "}
            {scored === 1 ? "application" : "applications"}. Not a probability of an
            interview, an offer, or passing an ATS.
          </p>

          <Link href="/applications" className="dash-panel__link">
            View full match portfolio →
          </Link>
        </>
      )}
    </section>
  );
}

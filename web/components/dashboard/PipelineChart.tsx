"use client";

/**
 * Application Pipeline: where the opportunities currently stand.
 *
 * Each bar is a link into the Applications table filtered to that stage, which is the
 * interconnection the brief asks for: a chart you can only look at answers "where are
 * they" and then strands you.
 *
 * Rejected and withdrawn are absent from the funnel on purpose. A funnel is a sequence, and
 * hanging two terminal outcomes off the end turns a shape that reads left-to-right into a
 * bar chart of unrelated categories. Both remain reachable through the table's filters.
 */

import Link from "next/link";

import { conversionRate, pipelineStages } from "@/lib/velocity";
import type { ApplicationView } from "@/lib/use-applications";

const TONES: Record<string, string> = {
  saved: "var(--edge)",
  applied: "var(--cyan)",
  screening: "var(--teal)",
  interview: "var(--violet)",
  offer: "var(--gold)",
};

export function PipelineChart({ applications }: { applications: ApplicationView[] }) {
  const stages = pipelineStages(applications);
  const max = Math.max(1, ...stages.map((stage) => stage.count));

  const applied = stages.find((stage) => stage.status === "applied")?.count ?? 0;
  const interviews = stages.find((stage) => stage.status === "interview")?.count ?? 0;
  const rate = conversionRate(applied, interviews);

  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <section className="obsidian-panel dash-panel">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Application Pipeline</h2>
          <p className="dash-panel__sub">Where your opportunities currently stand</p>
        </div>
      </header>

      {total === 0 ? (
        <div className="dash-panel__empty-block">
          <p>No applications tracked yet.</p>
          <Link href="/applications" className="button button--ghost">
            Add an application
          </Link>
        </div>
      ) : (
        <>
          <ul className="funnel">
            {stages.map((stage) => (
              <li key={stage.status}>
                <Link
                  href={`/applications?status=${stage.status}`}
                  className="funnel__bar"
                  aria-label={`${stage.count} ${stage.label}, open the applications table filtered to this stage`}
                >
                  <b>{stage.count}</b>
                  <span
                    className="funnel__fill"
                    style={{
                      height: `${Math.max(4, (stage.count / max) * 100)}%`,
                      background: TONES[stage.status],
                    }}
                    aria-hidden="true"
                  />
                  <small>{stage.label}</small>
                </Link>
              </li>
            ))}
          </ul>

          <div className="funnel__foot">
            {/*
              One metric, and only when the denominator supports it. §13 forbids fabricated
              conversion values, and a rate from three applications is one application
              wearing a percent sign.
            */}
            {rate === null ? (
              <span className="dash-panel__note">
                A conversion rate needs at least five sent applications to mean anything.
              </span>
            ) : (
              <span>
                Applied → Interview <b>{rate}%</b>
              </span>
            )}
            <Link href="/applications" className="dash-panel__link">
              View all →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

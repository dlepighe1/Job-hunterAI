"use client";

/**
 * Staged progress while an analysis runs.
 *
 * A spinner alone, for up to sixty seconds of cold start, is indistinguishable from a hung
 * page, and users reload, which starts a second cold request behind the first.
 *
 * **These stages are advisory, not measured.** The scoring service returns one response; it
 * does not stream progress. So the steps advance on a timer calibrated to a typical warm
 * request, and the component says so rather than implying a progress bar. §35 forbids faking
 * a percentage, and a fake percentage is exactly what this would be if it showed a number.
 */

import { useEffect, useState } from "react";

import { SpinnerIcon } from "@/components/icons";

const STAGES = [
  "Reading the job description",
  "Reading the résumé",
  "Identifying key requirements",
  "Comparing experience and skills",
  "Ranking important gaps",
  "Building your report",
] as const;

/** Roughly how a warm request feels. Deliberately slower than the fastest case so the list
 *  does not finish and then sit there while the request is still out. */
const STEP_MS = 900;

export function AnalysisProgress({ isWaking }: { isWaking: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Stops at the last stage rather than looping: a list that restarts implies the work
    // restarted, which would be alarming and untrue.
    const timer = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, STEP_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="analysis-progress" aria-live="polite" aria-busy="true">
      {isWaking && (
        <div className="notice" data-tone="info">
          <strong>Waking the model service</strong>
          <p>
            The scoring service sleeps when nobody is using it, and starting it takes 30 to 60
            seconds while it loads the model. This is normal for the first analysis after a
            quiet period, and it&apos;s still running, so please don&apos;t reload.
          </p>
        </div>
      )}

      <ol className="analysis-progress__list">
        {STAGES.map((label, index) => {
          const state = index < stage ? "done" : index === stage ? "active" : "pending";
          return (
            <li key={label} data-state={state}>
              <span className="analysis-progress__mark" aria-hidden="true">
                {state === "done" ? "✓" : state === "active" ? <SpinnerIcon /> : "○"}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {/* Says what the list is. Without this it reads as measured progress, and the service
          returns one response rather than streaming stages. */}
      <p className="analysis-progress__note">
        These steps are indicative, since the scoring service returns one result rather than
        reporting progress, so this shows what it is doing, not how far along it is.
      </p>
    </div>
  );
}

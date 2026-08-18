/**
 * The dashboard's numbers, derived from applications the user actually created.
 *
 * A pure function over the list, deliberately: the dashboard replaced a screen of invented
 * metrics: "INTERVIEW RATE 18.7%", "AVG. MATCH QUALITY 91%", priority targets at "99.4%
 * MATCH", and the way that happens again is a component computing a figure inline where
 * nothing can check it. Every number here is counted or positional, and each one is tested.
 *
 * What this deliberately does NOT compute:
 *
 * - **An interview or offer RATE.** A percentage over a handful of applications is noise
 *   wearing a decimal point, and it reads as a prediction about the next one.
 * - **A mean score.** FEATURES.md §2.3 supports ordering these numbers, not arithmetic on
 *   them. A mean invites "my average match is 63%", a claim about a distribution the model
 *   was never evaluated to make.
 * - **Anything at all when the pipeline is empty.** `isEmpty` exists so the screen can say
 *   so rather than render a wall of confident zeroes.
 */

import { APPLICATION_STATUSES, type ApplicationStatus, isTerminal } from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";

/** Five is enough to show activity without the dashboard quietly becoming the table. */
const RECENT_LIMIT = 5;

export interface Summary {
  total: number;
  isEmpty: boolean;
  /** Still capable of producing an outcome, everything not rejected or withdrawn. */
  live: number;
  closed: number;
  byStatus: Record<ApplicationStatus, number>;
  /** How many applications carry a score at all. The rest have never been analysed. */
  scored: number;
  /**
   * The median score, 0 to 1, or null when nothing has been scored.
   *
   * Positional, so it names a score some application actually has. For an even count it
   * takes the lower of the two middle values rather than averaging them, since an average of
   * 0.4 and 0.7 is 0.55, which is a number no application in the list holds.
   */
  medianScore: number | null;
  /** True when the scored rows do not agree on calibration, which makes the median a
   *  comparison across two different meanings (FEATURES.md §2.2). */
  medianIsMixed: boolean;
  recent: ApplicationView[];
}

export function summarize(applications: ApplicationView[]): Summary {
  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>;

  let live = 0;
  for (const application of applications) {
    byStatus[application.status] = (byStatus[application.status] ?? 0) + 1;
    if (!isTerminal(application.status)) live += 1;
  }

  const scoredRows = applications.filter(
    (application): application is ApplicationView & { matchScore: number } =>
      application.matchScore !== null,
  );

  const sorted = [...scoredRows].sort((a, b) => a.matchScore - b.matchScore);
  const medianScore = sorted.length
    ? sorted[Math.floor((sorted.length - 1) / 2)].matchScore
    : null;

  const calibrationStates = new Set(scoredRows.map((row) => row.matchCalibrated));

  const recent = [...applications]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, RECENT_LIMIT);

  return {
    total: applications.length,
    isEmpty: applications.length === 0,
    live,
    closed: applications.length - live,
    byStatus,
    scored: scoredRows.length,
    medianScore,
    medianIsMixed: calibrationStates.size > 1,
    recent,
  };
}

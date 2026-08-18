/**
 * The dashboard's chart derivations.
 *
 * Pure functions over the applications the client already holds, for the same reason
 * `summary.ts` exists: the screen this replaced carried invented metrics, and the way that
 * happens again is a component computing a figure inline where no test can see it.
 *
 * Two rules run through all of it:
 *
 * - **Count events, never infer them.** An application with no applied date was saved and
 *   never sent, so it is not activity. An application at `screening` with no recorded
 *   response date contributes no response, since the employer may well have replied, but this
 *   product does not know when, and a guessed date drawn on a time series is a fabricated
 *   measurement.
 * - **Refuse a ratio the data cannot support.** `conversionRate` returns null rather than
 *   dividing by zero or reporting a rate off two applications.
 */

import { BANDS } from "@/lib/benchmark";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";

export type RangeId = "30d" | "8w" | "3m" | "6m";

export interface Range {
  id: RangeId;
  label: string;
  /** How many buckets the window is divided into. */
  buckets: number;
  /** Days per bucket. 1 for the daily view, 7 for weekly, ~30 for monthly. */
  bucketDays: number;
  default?: boolean;
}

export const RANGES: readonly Range[] = [
  { id: "30d", label: "30 days", buckets: 30, bucketDays: 1 },
  { id: "8w", label: "8 weeks", buckets: 8, bucketDays: 7, default: true },
  { id: "3m", label: "3 months", buckets: 12, bucketDays: 7 },
  { id: "6m", label: "6 months", buckets: 6, bucketDays: 30 },
] as const;

export interface VelocityPoint {
  /** Axis label: "W1" for weekly buckets, a date for daily. */
  label: string;
  /** Inclusive start of the bucket, ISO date. */
  start: string;
  applications: number;
  responses: number;
  interviews: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Parse a date column that may be a bare `YYYY-MM-DD` or a full timestamp. */
function dayOf(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

/**
 * Applications, responses and interviews bucketed over a window.
 *
 * Every bucket is emitted even when empty, so the chart has a continuous axis and a quiet
 * fortnight reads as a quiet fortnight rather than as a gap in the data.
 */
export function velocitySeries(
  applications: ApplicationView[],
  rangeId: RangeId,
  now: Date = new Date(),
): VelocityPoint[] {
  const range = RANGES.find((candidate) => candidate.id === rangeId) ?? RANGES[1];
  const today = startOfDay(now);
  const span = range.buckets * range.bucketDays;
  const windowStart = today - (span - 1) * DAY_MS;

  const points: VelocityPoint[] = Array.from({ length: range.buckets }, (_, index) => {
    const start = windowStart + index * range.bucketDays * DAY_MS;
    return {
      label:
        range.bucketDays === 1
          ? new Date(start).toISOString().slice(5, 10)
          : `W${index + 1}`,
      start: new Date(start).toISOString().slice(0, 10),
      applications: 0,
      responses: 0,
      interviews: 0,
    };
  });

  const bucketFor = (day: number): number | null => {
    if (day < windowStart || day > today) return null;
    const index = Math.floor((day - windowStart) / (range.bucketDays * DAY_MS));
    return index >= 0 && index < points.length ? index : null;
  };

  for (const application of applications) {
    // Applied, not created. A saved posting the user never sent is not activity, and
    // counting it would report work that did not happen.
    const applied = bucketFor(dayOf(application.appliedAt) ?? Number.NaN);
    if (applied !== null) points[applied].applications += 1;

    // A response is the employer replying, a different event, on its own date. Without a
    // recorded date there is nothing to plot, and inventing one would be a fabricated point.
    const responded = bucketFor(dayOf(application.respondedAt ?? null) ?? Number.NaN);
    if (responded !== null) {
      points[responded].responses += 1;
      if (
        application.status === "interview" ||
        application.status === "offer"
      ) {
        points[responded].interviews += 1;
      }
    }
  }

  return points;
}

export interface PipelineStage {
  status: ApplicationStatus;
  label: string;
  count: number;
}

/**
 * The five funnel stages, in pipeline order.
 *
 * Rejected and withdrawn are deliberately absent: a funnel is a sequence, and hanging two
 * terminal outcomes off the end of it turns a shape that reads left-to-right into a bar
 * chart of unrelated categories. They remain reachable through the Applications filters.
 */
const FUNNEL: ApplicationStatus[] = ["saved", "applied", "screening", "interview", "offer"];

const STAGE_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
};

export function pipelineStages(applications: ApplicationView[]): PipelineStage[] {
  const counts = new Map<string, number>(APPLICATION_STATUSES.map((status) => [status, 0]));
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  return FUNNEL.map((status) => ({
    status,
    label: STAGE_LABELS[status],
    count: counts.get(status) ?? 0,
  }));
}

/** Below this the ratio is noise wearing a decimal point. */
const MIN_FOR_RATE = 5;

/**
 * Applied → interview, as a whole percentage, or null.
 *
 * Null covers both a zero denominator and a denominator too small to mean anything. §13:
 * do not fabricate conversion values, since "50%" from two applications is not a conversion
 * rate, it is one application.
 */
export function conversionRate(applied: number, interviews: number): number | null {
  if (applied < MIN_FOR_RATE) return null;
  return Math.round((interviews / applied) * 100);
}

export interface MatchBand {
  label: string;
  /** Human range, e.g. "85–100". */
  range: string;
  count: number;
  /** Percent of SCORED applications, not of all of them. */
  share: number;
  tone: "good" | "active" | "muted";
}

/**
 * Scored applications bucketed into the three published bands.
 *
 * The thresholds come from `BANDS` in `benchmark.ts`, which the research repository and the
 * live scorer share, so a 0.72 cannot be "competitive" on this chart and "good" in the
 * matcher. Only three buckets appear here because the dashboard is a summary; the matcher
 * shows all five.
 *
 * A note worth keeping in view: the fine-tuned model's measured ceiling is about 0.85
 * (FEATURES.md §2.3), so the strong band is expected to be sparse or empty for most users.
 * That is a true statement about the model, and the component shows the real count rather
 * than rescaling the bands to make the chart look fuller.
 */
export function matchDistribution(applications: ApplicationView[]): MatchBand[] {
  const scored = applications.filter(
    (application): application is ApplicationView & { matchScore: number } =>
      application.matchScore !== null,
  );

  if (scored.length === 0) return [];

  const strongMin = BANDS.find((band) => band.label === "Strong match")?.min ?? 0.85;
  const goodMin = BANDS.find((band) => band.label === "Good match")?.min ?? 0.7;

  const buckets: MatchBand[] = [
    {
      label: "Strong match",
      range: `${Math.round(strongMin * 100)}–100`,
      count: 0,
      share: 0,
      tone: "good",
    },
    {
      label: "Competitive",
      range: `${Math.round(goodMin * 100)}–${Math.round(strongMin * 100) - 1}`,
      count: 0,
      share: 0,
      tone: "active",
    },
    {
      label: "Lower match",
      range: `Below ${Math.round(goodMin * 100)}`,
      count: 0,
      share: 0,
      tone: "muted",
    },
  ];

  for (const application of scored) {
    if (application.matchScore >= strongMin) buckets[0].count += 1;
    else if (application.matchScore >= goodMin) buckets[1].count += 1;
    else buckets[2].count += 1;
  }

  for (const bucket of buckets) {
    bucket.share = Math.round((bucket.count / scored.length) * 100);
  }

  return buckets;
}

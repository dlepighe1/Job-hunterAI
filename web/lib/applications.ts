/**
 * Application status, and the rules for moving between statuses.
 *
 * FEATURES.md §4.3 asks for automatic status transitions driven by in-app events. This
 * module is that rule set, written as a pure function so the rules live in one readable
 * place and can be tested without a database, a session, or a network.
 *
 * Free of server-only imports, since the table renders these labels in the browser.
 */

/**
 * The seven statuses, in pipeline order.
 *
 * This list is also the `status` CHECK constraint on the `applications` table
 * (`supabase/schema.sql:54`). Adding one here without a migration produces an insert
 * failure at runtime rather than a type error at build, so the two are asserted equal in
 * `applications.test.ts`.
 */
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * The kinds of thing that can happen to an application.
 *
 * `analysis_run` and `note_added` are here deliberately even though they move nothing:
 * every event goes through this function, and an event the function does not know about
 * would otherwise have to be filtered by the caller, which is exactly where the rule
 * would rot.
 */
export type ApplicationEvent =
  | "created"
  | "applied"
  | "screening_scheduled"
  | "interview_scheduled"
  | "offer_received"
  | "rejected"
  | "withdrawn"
  | "analysis_run"
  | "note_added";

/**
 * How far along the pipeline a status sits. Outcomes are absent on purpose: they are not
 * a further stage, they are the end of the line, and giving `rejected` a rank would put it
 * in a comparison it does not belong in.
 */
const PIPELINE_RANK: Partial<Record<ApplicationStatus, number>> = {
  saved: 0,
  applied: 1,
  screening: 2,
  interview: 3,
  offer: 4,
};

/** The two closed outcomes. Reaching one ends automatic transitions for that row. */
const TERMINAL: ReadonlySet<ApplicationStatus> = new Set(["rejected", "withdrawn"]);

/** The status an event implies, or null when the event says nothing about the pipeline. */
const EVENT_IMPLIES: Record<ApplicationEvent, ApplicationStatus | null> = {
  created: "saved",
  applied: "applied",
  screening_scheduled: "screening",
  interview_scheduled: "interview",
  offer_received: "offer",
  rejected: "rejected",
  withdrawn: "withdrawn",
  analysis_run: null,
  note_added: null,
};

/** Whether an application is closed. A closed application is not moved by later events. */
export function isTerminal(status: ApplicationStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * The status after an event, given the status before it.
 *
 * Two rules, and both exist because this runs automatically on every event rather than
 * when a user asks for it:
 *
 *   1. **Never backwards.** A pipeline event can only advance. An "applied" event arriving
 *      after an interview was scheduled, whether a duplicate, a retry or an out-of-order write,
 *      would otherwise drag the row back to the start and the user would watch the tracker
 *      undo progress they made themselves.
 *   2. **An outcome is final.** Once rejected or withdrawn, nothing automatic reopens it.
 *      Reopening a closed application is a deliberate act and goes through an explicit
 *      status change, which is a different code path with a user behind it.
 */
export function nextStatus(
  current: ApplicationStatus,
  event: ApplicationEvent,
): ApplicationStatus {
  if (isTerminal(current)) return current;

  const implied = EVENT_IMPLIES[event];
  if (!implied) return current;

  // An outcome applies from anywhere in the pipeline: you can be rejected at any stage.
  if (isTerminal(implied)) return implied;

  const from = PIPELINE_RANK[current] ?? 0;
  const to = PIPELINE_RANK[implied] ?? 0;
  return to > from ? implied : current;
}

const LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** The human-readable form. Sentence case, because it renders inside a table cell. */
export function statusLabel(status: ApplicationStatus): string {
  return LABELS[status];
}

/**
 * The tone a status carries, for the one place colour is applied.
 *
 * Colour is never the sole carrier of meaning (FEATURES.md §2.6), and the label always renders
 * alongside, so this drives a `data-tone` attribute rather than replacing any text.
 */
export function statusTone(status: ApplicationStatus): "neutral" | "active" | "good" | "bad" {
  if (status === "offer") return "good";
  if (status === "rejected" || status === "withdrawn") return "bad";
  if (status === "saved") return "neutral";
  return "active";
}

/**
 * A stored match score, as the table renders it.
 *
 * FEATURES.md §2.3 makes every part of this string load-bearing:
 *
 * - **"out of 100", never "%".** A percentage reads as a probability, "72% likely to get
 *   this job", and the model was trained against a scoring rubric, not hiring outcomes.
 *   Nothing in its evaluation supports that reading.
 * - **The calibration state, always.** Switching engines must never silently change what a
 *   number means, so an uncalibrated score says so wherever it appears rather than only in
 *   the matcher where it was produced.
 * - **An em dash for no score**, not a zero. The keyword and base engines produce no score
 *   at all, and a 0 would sort and read as a measured "no match" rather than "nothing has
 *   been scored here yet".
 *
 * Takes the 0-to-1 score used everywhere in this codebase and converts at the point of
 * display, which is the only place the two units are allowed to meet.
 */
export function formatMatchScore(score: number | null, calibrated: boolean): string {
  if (score === null) return "n/a";
  const display = Math.max(0, Math.min(100, Math.round(score * 100)));
  return `${display} out of 100 · ${calibrated ? "calibrated" : "uncalibrated"}`;
}

/** Whether a string is one of the seven statuses. Used at the API boundary. */
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

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
 * Where the job is actually done.
 *
 * These three strings are the `work_model` CHECK constraint on the `applications` table, and
 * `applications.test.ts` asserts the pairing the same way it does for status.
 *
 * "onsite" rather than "in-person": the column stores the identifier, `WORK_MODEL_LABELS`
 * carries what a user reads. The approved boards say "In-person", so that is the label, and
 * changing your mind about the wording later must not require a migration.
 */
export const WORK_MODELS = ["remote", "hybrid", "onsite"] as const;

export type WorkModel = (typeof WORK_MODELS)[number];

const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "In-person",
};

export function workModelLabel(model: WorkModel): string {
  return WORK_MODEL_LABELS[model];
}

export function isWorkModel(value: unknown): value is WorkModel {
  return typeof value === "string" && (WORK_MODELS as readonly string[]).includes(value);
}

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

/** Whether a score passed through the Platt calibrator, as the interface words it. */
export type Calibration = "calibrated" | "uncalibrated";

/**
 * A stored match score, broken into the parts the interface renders separately.
 *
 * The redesigned surfaces all show the value and its calibration on two lines rather than
 * one: a table cell with `72/100` above `calibrated`, a grid ring with the number inside
 * and the state beneath, a drawer header pairing both with the engine name. Formatting that
 * as a single string and splitting it at each call site is how the three drift apart on
 * rounding, so the split happens once, here.
 */
export interface MatchDisplay {
  /**
   * The 0-to-100 integer, for the grid's progress ring to sweep an arc from.
   *
   * Null rather than 0 when nothing was scored. A 0 would draw an empty ring, which reads
   * as a measured floor rather than an absent measurement, and those are different claims.
   */
  score: number | null;
  /** `72/100`, or an em dash when nothing has been scored. */
  label: string;
  calibration: Calibration | null;
  /** The one-line form, for `aria-label` and anywhere a single string is all that fits. */
  full: string;
  scored: boolean;
}

/**
 * FEATURES.md §2.3 makes every part of this load-bearing:
 *
 * - **Never "%".** A percentage reads as a probability, "72% likely to get this job", and
 *   the model was trained against a scoring rubric, not hiring outcomes. Nothing in its
 *   evaluation supports that reading. The redesign compressed "72 out of 100" to "72/100"
 *   so the value fits a table cell and a ring at the density the approved boards call for.
 *   The denominator stays visible, which is the part the rule is actually about.
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
export function matchDisplay(score: number | null, calibrated: boolean): MatchDisplay {
  if (score === null) {
    return {
      score: null,
      label: "—",
      calibration: null,
      // Words rather than the dash: this is what a screen reader announces, and "—" is
      // either read aloud as "em dash" or skipped entirely.
      full: "Not scored yet",
      scored: false,
    };
  }

  const display = Math.max(0, Math.min(100, Math.round(score * 100)));
  const calibration: Calibration = calibrated ? "calibrated" : "uncalibrated";
  const label = `${display}/100`;

  return {
    score: display,
    label,
    calibration,
    full: `${label} · ${calibration}`,
    scored: true,
  };
}

/** The one-line form. Kept as a function of its own because most call sites want only this. */
export function formatMatchScore(score: number | null, calibrated: boolean): string {
  return matchDisplay(score, calibrated).full;
}

/**
 * The engine's display name, from the identifier stored on the row.
 *
 * `applications.match_engine` holds the internal id, `finetuned`, and the drawer used to
 * render that string straight into the interface. Mapping happens here, at the presentation
 * layer, so the stored identifier and the words a user reads can change independently: the
 * column is a database contract with a CHECK constraint behind it, and the label is copy.
 *
 * Names match `ENGINE_META` in `lib/types.ts` rather than the approved boards, which write
 * "Fine-Tuned MPNet" and "Keyword Coverage". The product already had a house casing for
 * these and the boards are not authoritative about it.
 *
 * Deliberately does NOT import `ENGINE_META`. That module pulls in the ATS analyser and the
 * benchmark bands, and this function is called from table cells that need none of it. The
 * two lists are asserted equal in `applications.test.ts` instead.
 */
const ENGINE_LABELS: Record<string, string> = {
  finetuned: "Fine-tuned MPNet",
  base: "Base MPNet",
  keyword: "Keyword coverage",
  claude: "Claude",
  gemma: "Gemma (OpenRouter)",
};

export function engineLabel(engine: string | null): string | null {
  if (!engine) return null;
  // An unrecognised id renders as itself rather than as "Unknown": a row scored by an engine
  // this build has never heard of is a real thing during a rollout, and hiding which one it
  // was makes the number less interpretable, not more.
  return ENGINE_LABELS[engine] ?? engine;
}

/** Whether a string is one of the seven statuses. Used at the API boundary. */
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Whether an employer response is the newest thing on this application.
 *
 * FEATURES.md §4 asks for rows with meaningful employer activity to be visually elevated.
 * The honest signal already on the row is `responded_at`, set when the user records that the
 * employer replied. There is no Gmail integration in this product and nothing here invents
 * one.
 *
 * The comparison against `lastActivityAt` is what stops the flag becoming permanent. A row
 * that was replied to eight months ago and worked on since is not waiting on anybody, and if
 * every responded application stayed lit the highlight would mark most of a mature pipeline
 * and mean nothing. Elevated therefore means "they answered and nothing has happened since",
 * which is exactly the row worth looking at today.
 *
 * `updated_at` moves on any edit, including a status change or a note, so acting on the row
 * clears the flag by itself. That is the intended behaviour: it is an inbox, not a badge.
 */
export function hasUnansweredEmployerResponse(
  respondedAt: string | null,
  lastActivityAt: string,
): boolean {
  if (!respondedAt) return false;

  const responded = new Date(respondedAt).getTime();
  const active = new Date(lastActivityAt).getTime();
  if (Number.isNaN(responded) || Number.isNaN(active)) return false;

  return responded >= active;
}

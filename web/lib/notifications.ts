/**
 * What is waiting on the user right now.
 *
 * The dashboard's right rail asks for two panels that must not say the same thing.
 * Recent Intelligence is retrospective: things that happened, newest first. This is the other
 * half, and the rule that keeps them apart is that **every notification names something the
 * user could act on**, not something that occurred.
 *
 * The harder constraint is what this may be built from. The approved board shows rows like
 * "Résumé viewed by 3 recruiters", which this product cannot know: there is no Gmail
 * integration, no tracking pixel, and no employer-side signal of any kind. Inventing one
 * would be the exact failure FEATURES.md §2.6 exists to prevent, so every rule below reads a
 * column that is really there:
 *
 *   responded_at   the user recorded that an employer replied
 *   status         the user moved the application along
 *   is_default     whether the matcher has a résumé to reach for
 *
 * Pure, and takes `now` as an argument rather than reading the clock, so the tests are not
 * time-dependent and the component can pass the value it already has from `useNow`.
 */

import { hasUnansweredEmployerResponse, statusLabel } from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";
import type { ResumeView } from "@/lib/use-resumes";

export type NotificationTone = "action" | "progress" | "setup";

export interface Notification {
  id: string;
  /** What happened, in a few words. */
  title: string;
  /** Which record it concerns. */
  detail: string;
  /** ISO timestamp the row is sorted by. */
  at: string;
  tone: NotificationTone;
  /** Where acting on it starts. */
  href: string;
}

/** The rail is a summary, not an inbox. Past this the panel stops being scannable. */
const MAX = 6;

/** Stages worth surfacing. Saved and applied are the resting states of a pipeline and would
 *  make every row in the tracker a notification. */
const NOTABLE_STAGES = new Set(["screening", "interview", "offer"]);

export function buildNotifications(
  applications: ApplicationView[],
  resumes: ResumeView[],
): Notification[] {
  const items: Notification[] = [];

  for (const application of applications) {
    /**
     * The one genuinely actionable signal in the data model: they replied, and nothing has
     * happened since. Touching the row clears it, because `updated_at` moves.
     */
    if (hasUnansweredEmployerResponse(application.respondedAt, application.lastActivityAt)) {
      items.push({
        id: `responded-${application.id}`,
        title: "Employer responded",
        detail: `${application.role} at ${application.company}`,
        at: application.respondedAt as string,
        tone: "action",
        href: `/applications?open=${application.id}`,
      });
      continue;
    }

    // Awareness rather than action: something is live and moving.
    if (NOTABLE_STAGES.has(application.status)) {
      items.push({
        id: `stage-${application.id}`,
        title: `${statusLabel(application.status)} stage`,
        detail: `${application.role} at ${application.company}`,
        at: application.lastActivityAt,
        tone: "progress",
        href: `/applications?open=${application.id}`,
      });
    }
  }

  /**
   * Setup gaps, which are the only notifications not tied to an application.
   *
   * Both are real conditions with a real consequence: with no résumé the matcher has nothing
   * to score, and with no default it cannot pick one for you. Neither is invented, and
   * neither appears once it has been dealt with.
   */
  if (resumes.length === 0) {
    items.push({
      id: "setup-no-resume",
      title: "No résumé saved",
      detail: "Upload one so the matcher has something to score",
      at: new Date(0).toISOString(),
      tone: "setup",
      href: "/resumes",
    });
  } else if (!resumes.some((resume) => resume.isDefault)) {
    items.push({
      id: "setup-no-default",
      title: "No default résumé",
      detail: "Pick the one the matcher should reach for",
      at: new Date(0).toISOString(),
      tone: "setup",
      href: "/resumes",
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX);
}

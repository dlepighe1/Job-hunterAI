/**
 * Outreach: messages the user writes here and sends themselves.
 *
 * **The half of FEATURES.md §7 that is missing, and why.** §7 is blocked on which email
 * service to use, how sending reputation is protected, and how consent and unsubscribe work
 * under CAN-SPAM and GDPR. Every one of those is a question about SENDING. It also excludes
 * bulk or automated sending and purchased contact lists regardless of the answers.
 *
 * So this app does not send. It holds a draft, the user copies it into their own mail
 * client, and comes back to record what happened. That leaves §7's sketch intact apart from
 * "send from the user's own address": draft assistance grounded in a specific posting,
 * reply detection feeding Application status, and follow-up reminders all work without a
 * single outbound message leaving this service.
 *
 * It is also why `sentAt` is a fact the user reports rather than a timestamp this app
 * writes: it did not send the message and must not claim to know when it left.
 *
 * Pure functions, no server-only imports, since the Outreach screen renders these in the browser.
 */

import type { ApplicationEvent } from "@/lib/applications";

export const OUTREACH_STATUSES = ["draft", "sent", "replied", "no_reply"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export type OutreachAction = "marked_sent" | "reply_received" | "marked_no_reply";

/** A week. Long enough not to nag, short enough that the thread is still warm. */
const FOLLOW_UP_DAYS = 7;
const FOLLOW_UP_MS = FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000;

/**
 * The status after the user records something.
 *
 * One rule carries the weight: **a reply is never downgraded.** It is a fact the user
 * observed, and the only things that could overwrite it are a late timeout or a stray click
 * neither of which is evidence that the reply did not happen.
 */
export function nextOutreachStatus(
  current: OutreachStatus,
  action: OutreachAction,
): OutreachStatus {
  if (current === "replied") return "replied";

  switch (action) {
    case "marked_sent":
      return "sent";
    case "reply_received":
      return "replied";
    case "marked_no_reply":
      // Nothing was sent, so there is nothing to have gone unanswered.
      return current === "draft" ? "draft" : "no_reply";
  }
}

/**
 * The application-pipeline event an outreach status implies, if any.
 *
 * FEATURES.md §4.3 wanted automatic status transitions from "email detection of rejections
 * and interview invites", and deferred it because it needs mailbox access and its own
 * consent story. A reply the user records themselves is the same signal with neither
 * requirement, so it is the one thing here that moves an application.
 *
 * Sending is deliberately not a signal. People write to a contact before applying as often
 * as after, so inferring a pipeline stage from it would put a status on a row the user
 * never claimed, the same rule `analysis_run` follows in `lib/applications.ts`.
 */
export function outreachEventFor(status: OutreachStatus): ApplicationEvent | null {
  return status === "replied" ? "screening_scheduled" : null;
}

/**
 * Whether a sent message is old enough to deserve a nudge.
 *
 * Only ever true for something actually sent and still unanswered. A reminder to follow up
 * on a message that was answered, or never sent, is the kind of notification that teaches
 * people to ignore all of them.
 */
export function followUpDue(
  message: { status: OutreachStatus; sentAt: string | null },
  now: Date = new Date(),
): boolean {
  if (message.status !== "sent" || !message.sentAt) return false;

  const sent = new Date(message.sentAt).getTime();
  if (Number.isNaN(sent)) return false;

  return now.getTime() - sent >= FOLLOW_UP_MS;
}

const LABELS: Record<OutreachStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  replied: "Replied",
  no_reply: "No reply",
};

export function outreachStatusLabel(status: OutreachStatus): string {
  return LABELS[status];
}

export function outreachStatusTone(
  status: OutreachStatus,
): "neutral" | "active" | "good" | "bad" {
  if (status === "replied") return "good";
  if (status === "no_reply") return "bad";
  if (status === "sent") return "active";
  return "neutral";
}

/**
 * A starting draft, grounded in the specific role and company.
 *
 * §7 asks for "draft assistance for a first message, grounded in the specific posting and
 * resume", and excludes "anything that would work identically if the recipient had never
 * heard of the user". This is a template with the concrete details filled in and the
 * genuinely personal sentence left as a blank the user has to write, because the one line a
 * template cannot supply is the one that makes the message worth sending, so it is marked
 * rather than invented.
 *
 * No model call. A generated message the user did not write, sent to a stranger, is the
 * thing §7's exclusion is pointing at.
 */
export function draftTemplate(input: {
  contactName?: string | null;
  company?: string | null;
  role?: string | null;
}): string {
  const name = input.contactName?.trim() || "there";
  const role = input.role?.trim() || "the role";
  const company = input.company?.trim() || "your team";

  return [
    `Hi ${name},`,
    "",
    `I applied for ${role} at ${company} and wanted to introduce myself directly.`,
    "",
    "[One or two sentences on why this specific team: something you know about their work that a template could not tell you. If you can't fill this in, the message is not ready to send.]",
    "",
    "Happy to share more if it's useful, and equally happy to be told the timing is wrong.",
    "",
    "Thanks for reading,",
  ].join("\n");
}

"use client";

/**
 * Recent Intelligence: what just happened.
 *
 * Strictly retrospective. It is not a task list and must not become one: Priority Targets
 * already answers "what should I do", and a second panel that also answers it produces two
 * lists that disagree.
 *
 * Every row is an event that actually occurred, derived from stored timestamps. There is no
 * "no activity detected for 7 days" style row here even though the reference art shows one,
 * that is an absence, not an event, and the honest place for it is the follow-up logic on
 * the Outreach screen where the app knows what was sent.
 */

import Link from "next/link";

import { statusLabel } from "@/lib/applications";
import { formatAppDate } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import type { ApplicationView } from "@/lib/use-applications";

const MAX_ITEMS = 6;

interface Event {
  id: string;
  at: string;
  source: string;
  mark: string;
  body: string;
  tone: "cyan" | "teal" | "violet" | "muted";
  href: string;
}

/**
 * "17 min ago", "2 hours ago", "Yesterday". Absolute past a week, since "9 days ago" is harder
 * to place than a date.
 *
 * `now` of 0 means the server is rendering and has no usable clock, so it falls back to the
 * absolute date. The client upgrades it to a relative one after hydration.
 */
function relative(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  if (now === 0) return formatAppDate(iso) ?? "";
  const minutes = Math.round((now - then) / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  // Past a week the absolute date is easier to place than "23 days ago", and it uses the
  // same MMM d, yyyy the rest of the redesigned surfaces do rather than an ISO slice.
  return formatAppDate(iso) ?? "";
}

export function RecentIntelligence({
  applications,
  resumeCount,
}: {
  applications: ApplicationView[];
  resumeCount: number;
}) {
  const now = useNow();

  const events: Event[] = [];

  for (const application of applications) {
    // An employer response is the highest-signal thing that happens in a job search, so it
    // gets its own row rather than being folded into a generic "updated".
    if (application.respondedAt) {
      events.push({
        id: `${application.id}-responded`,
        at: application.respondedAt,
        source: application.company,
        mark: application.company.slice(0, 1).toUpperCase(),
        body: `Response recorded · now ${statusLabel(application.status).toLowerCase()}`,
        tone: "teal",
        href: `/applications?open=${application.id}`,
      });
      continue;
    }

    if (application.appliedAt) {
      events.push({
        id: `${application.id}-applied`,
        at: application.appliedAt,
        source: application.company,
        mark: application.company.slice(0, 1).toUpperCase(),
        body: `Applied for ${application.role}`,
        tone: "cyan",
        href: `/applications?open=${application.id}`,
      });
      continue;
    }

    events.push({
      id: `${application.id}-saved`,
      at: application.createdAt,
      source: application.company,
      mark: application.company.slice(0, 1).toUpperCase(),
      body: `Saved ${application.role}`,
      tone: "muted",
      href: `/applications?open=${application.id}`,
    });
  }

  const recent = events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_ITEMS);

  return (
    <section className="obsidian-panel dash-panel">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Recent Intelligence</h2>
          <p className="dash-panel__sub">What&apos;s happened recently</p>
        </div>
        <Link href="/applications" className="dash-panel__link">
          View all →
        </Link>
      </header>

      {recent.length === 0 ? (
        <div className="dash-panel__empty-block">
          <p>Nothing has happened yet.</p>
          <p>
            {resumeCount === 0
              ? "Save a résumé and track an application, and events appear here as they happen."
              : "Track an application and its events appear here."}
          </p>
        </div>
      ) : (
        <ul className="feed">
          {recent.map((event) => (
            <li key={event.id}>
              <Link href={event.href}>
                <span className="feed__mark" data-tone={event.tone} aria-hidden="true">
                  {event.mark}
                </span>
                <span className="feed__text">
                  <b>{event.source}</b>
                  <small>{event.body}</small>
                </span>
                <time dateTime={event.at}>{relative(event.at, now)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

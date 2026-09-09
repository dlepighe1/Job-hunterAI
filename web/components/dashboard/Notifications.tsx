"use client";

/**
 * Notifications: what is waiting on you.
 *
 * The rules that decide what appears live in `lib/notifications.ts`, where they can be
 * tested. The short version is that every row names something actionable and is derived from
 * a column that exists, which is why there is no "your résumé was viewed by 3 recruiters"
 * here despite the approved board showing one. Nothing in this product can know that.
 *
 * Paired with Recent Intelligence beneath it, which is the retrospective half. The two must
 * not overlap: this one is about what to do, that one is about what happened.
 */

import Link from "next/link";

import { formatAppDate } from "@/lib/format";
import { buildNotifications } from "@/lib/notifications";
import type { ApplicationView } from "@/lib/use-applications";
import type { ResumeView } from "@/lib/use-resumes";

export function Notifications({
  applications,
  resumes,
}: {
  applications: ApplicationView[];
  resumes: ResumeView[];
}) {
  const items = buildNotifications(applications, resumes);

  return (
    <section className="obsidian-panel dash-panel rail-panel">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Notifications</h2>
          <p className="dash-panel__sub">Things waiting on you</p>
        </div>
      </header>

      {items.length === 0 ? (
        /* A genuinely empty inbox is good news and says so, rather than showing a hollow
           card that reads as something failing to load. */
        <p className="report__note">
          Nothing needs your attention. Responses and live interviews show up here.
        </p>
      ) : (
        <ul className="feed">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="feed__row">
                <span className="feed__mark" data-tone={item.tone} aria-hidden="true" />
                <span className="feed__body">
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </span>
                {/* Setup gaps carry no meaningful date, so they show none rather than the
                    epoch the sort uses to keep them last. */}
                {item.tone !== "setup" && (
                  <time className="feed__when" dateTime={item.at}>
                    {formatAppDate(item.at)}
                  </time>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

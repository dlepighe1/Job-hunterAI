"use client";

/**
 * The four top-level counts.
 *
 * Each one is a count of something the user created, and each secondary line is a second
 * count, never a rate, a trend arrow with no baseline, or a projection. The screen this
 * replaced carried "INTERVIEW RATE 18.7%" over a pipeline nobody had used, and the way that
 * happens again is a KPI card computing something clever.
 *
 * "Connections" from the reference is rendered as Contacts, because that is the thing this
 * product actually has. A card labelled Connections over a number that counts contacts is a
 * small lie that costs nothing to avoid.
 */

import Link from "next/link";

import { BriefcaseIcon, TargetIcon, UsersIcon } from "@/components/icons";

export interface Kpi {
  label: string;
  value: number;
  secondary: string;
  href: string;
  icon: React.ReactNode;
  tone: "cyan" | "teal" | "violet" | "gold";
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </svg>
  );
}

export function KpiCards({
  contacts,
  applications,
  interviews,
  upcomingInterviews,
  resumes,
  tailored,
  appliedThisWeek,
  contactsThisMonth,
}: {
  contacts: number;
  applications: number;
  interviews: number;
  upcomingInterviews: number;
  resumes: number;
  tailored: number;
  appliedThisWeek: number;
  contactsThisMonth: number;
}) {
  const cards: Kpi[] = [
    {
      label: "Contacts",
      value: contacts,
      secondary:
        contactsThisMonth > 0 ? `+${contactsThisMonth} this month` : "None added this month",
      href: "/network",
      icon: <UsersIcon />,
      tone: "violet",
    },
    {
      label: "Applications",
      value: applications,
      secondary: appliedThisWeek > 0 ? `+${appliedThisWeek} this week` : "None sent this week",
      href: "/applications",
      icon: <BriefcaseIcon />,
      tone: "cyan",
    },
    {
      label: "Interviews",
      value: interviews,
      secondary:
        upcomingInterviews > 0
          ? `${upcomingInterviews} at offer stage`
          : "None at interview stage",
      href: "/applications?status=interview",
      icon: <TargetIcon />,
      tone: "teal",
    },
    {
      label: "Résumés",
      value: resumes,
      secondary: tailored > 0 ? `${tailored} tailored versions` : "No tailored versions",
      href: "/resumes",
      icon: <DocumentIcon />,
      tone: "gold",
    },
  ];

  return (
    <section className="kpi-row" aria-label="Overview">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="obsidian-panel kpi">
          <span className="kpi__icon" data-tone={card.tone} aria-hidden="true">
            {card.icon}
          </span>
          <span className="kpi__text">
            <small>{card.label}</small>
            <b>{card.value}</b>
            <em>{card.secondary}</em>
          </span>
        </Link>
      ))}
    </section>
  );
}

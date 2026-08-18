"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CareerIntelligence } from "@/components/dashboard/CareerIntelligence";
import { HuntDrawer } from "@/components/dashboard/HuntDrawer";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { MatchDistribution } from "@/components/dashboard/MatchDistribution";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { PriorityTargets } from "@/components/dashboard/PriorityTargets";
import { RecentIntelligence } from "@/components/dashboard/RecentIntelligence";
import { RoleLandscape } from "@/components/dashboard/RoleLandscape";
import { VelocityChart } from "@/components/dashboard/VelocityChart";
import { useDevIdentity } from "@/components/DevIdentity";
import { useDashboard } from "@/lib/use-dashboard";
import { useNow } from "@/lib/use-now";

/**
 * The authenticated home.
 *
 * Every panel answers a different question, and that is the constraint that decides what is
 * allowed on this page:
 *
 *   KPI cards:           how much am I doing?
 *   Velocity:            how is that changing over time?
 *   Match Distribution: how strong are the roles I am targeting?
 *   Pipeline:            where do my live opportunities stand?
 *   Role Landscape:      what else does my experience support?
 *   Priority Targets:    what have I decided to focus on?
 *   Recent Intelligence: what just happened?
 *   Career Intelligence: what patterns are emerging?
 *
 * Three things are deliberately absent. There is no "Upcoming" panel, because interview
 * dates already live on the applications they belong to and a second copy would drift. No
 * "Today's Mission", which overlaps Priority Targets. And no "Job Hunt Pulse", since a composite
 * score with no defined interpretation is less useful than any one of the sentences in
 * Career Intelligence.
 *
 * This is the third version of this page. The first invented its metrics; the second was
 * honest but static. This one counts real data and says so when there is none.
 */
export default function DashboardPage() {
  const { user } = useUser();
  const dev = useDevIdentity();
  const { data, state, reload } = useDashboard();
  const [huntOpen, setHuntOpen] = useState(false);
  const now = useNow();

  const { applications, contacts, affinities, insights, counts } = data;

  const derived = useMemo(() => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const month = 30 * 24 * 60 * 60 * 1000;

    const since = (iso: string | null, window: number) => {
      if (!iso) return false;
      const at = new Date(iso).getTime();
      return !Number.isNaN(at) && now - at <= window;
    };

    return {
      interviews: applications.filter((a) => a.status === "interview").length,
      offers: applications.filter((a) => a.status === "offer").length,
      appliedThisWeek: applications.filter((a) => since(a.appliedAt, week)).length,
      contactsThisMonth: contacts.filter((c) => since(c.createdAt, month)).length,
    };
  }, [applications, contacts, now]);

  const firstName =
    user?.firstName?.trim() ||
    user?.fullName?.trim().split(" ")[0] ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    (dev.active ? dev.name : "") ||
    "there";

  // Before hydration there is no clock, so the neutral greeting renders and is replaced
  // once the client has one. Reading the hour during render would mismatch on hydration
  // for anyone whose server and browser disagree about the time of day.
  const greeting =
    now === 0
      ? "Welcome back"
      : (() => {
          const hour = new Date(now).getHours();
          return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
        })();

  return (
    <>
      <header className="dash-header">
        <div>
          <h1>
            {greeting}, {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p>Here&apos;s how your career search is developing.</p>
        </div>

        <div className="dash-header__actions">
          {/* Hunt, not a generic Search. The primary utility on this page is getting to the
              boards the user actually applies through. */}
          <button type="button" className="button button--primary" onClick={() => setHuntOpen(true)}>
            Hunt
          </button>
        </div>
      </header>

      {state.kind === "loading" && (
        <div className="dash-grid" aria-busy="true">
          <div className="kpi-row">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 96 }} />
            ))}
          </div>
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 260 }} />
        </div>
      )}

      {state.kind === "unauthenticated" && (
        <div className="notice" data-tone="info">
          <strong>Sign in to see your dashboard</strong>
          This page summarises data stored against an account. The matcher works signed out
          and stores nothing:{" "}
          <Link href="/matcher" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            score a resume
          </Link>{" "}
          without one.
        </div>
      )}

      {state.kind === "unconfigured" && (
        <div className="notice" data-tone="warn">
          <strong>No database configured</strong>
          {state.message}
        </div>
      )}

      {state.kind === "failed" && (
        <div className="notice" data-tone="error" role="alert">
          <strong>Could not load your dashboard</strong>
          {state.message}
          <div className="page-actions">
            <button type="button" className="button button--ghost" onClick={reload}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="dash-grid">
          <KpiCards
            contacts={counts.contacts}
            applications={counts.applications}
            interviews={derived.interviews}
            upcomingInterviews={derived.offers}
            resumes={counts.resumes}
            tailored={counts.tailored}
            appliedThisWeek={derived.appliedThisWeek}
            contactsThisMonth={derived.contactsThisMonth}
          />

          <div className="dash-row dash-row--analytics">
            <VelocityChart applications={applications} />
            <MatchDistribution applications={applications} />
            <PipelineChart applications={applications} />
          </div>

          <div className="dash-row dash-row--landscape">
            <RoleLandscape affinities={affinities} baselineCount={counts.baselineAnalyses} />
            <PriorityTargets applications={applications} contacts={contacts} />
            <RecentIntelligence applications={applications} resumeCount={counts.resumes} />
          </div>

          <CareerIntelligence insights={insights} />
        </div>
      )}

      <HuntDrawer open={huntOpen} onClose={() => setHuntOpen(false)} />
    </>
  );
}

"use client";

/** One fetch for the whole dashboard. See `app/api/dashboard/route.ts` for why it is
 *  assembled server-side rather than by five parallel client requests. */

import { useCallback, useEffect, useState } from "react";

import type { CareerInsights, RoleAffinity } from "@/lib/career";
import type { ContactView } from "@/lib/network";
import type { ApplicationView, LoadState } from "@/lib/use-applications";

export interface DashboardData {
  applications: ApplicationView[];
  resumes: Array<{ id: string; label: string; isDefault: boolean; isTailored: boolean }>;
  contacts: ContactView[];
  affinities: RoleAffinity[];
  insights: CareerInsights;
  counts: {
    applications: number;
    resumes: number;
    tailored: number;
    contacts: number;
    baselineAnalyses: number;
  };
}

const EMPTY: DashboardData = {
  applications: [],
  resumes: [],
  contacts: [],
  affinities: [],
  insights: { sufficient: false, items: [], analysed: 0 },
  counts: { applications: 0, resumes: 0, tailored: 0, contacts: 0, baselineAnalyses: 0 },
};

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

export function useDashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/dashboard")
      .then(async (response) => {
        if (cancelled) return;

        if (response.status === 401) return setState({ kind: "unauthenticated" });
        if (response.status === 503) {
          const body = await response.json().catch(() => ({}));
          return setState({
            kind: "unconfigured",
            message: body.message ?? "The dashboard needs a database.",
          });
        }
        if (!response.ok) {
          return setState({ kind: "failed", message: "Could not load your dashboard." });
        }

        setData((await response.json()) as DashboardData);
        setState({ kind: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed", message: UNREACHABLE });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  return { data, state, reload };
}

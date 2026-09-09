"use client";

/**
 * Match Distribution and Application Pipeline, in one card with a segmented switch.
 *
 * They were two panels side by side. Merging them is the brief's call and it is a good one:
 * both describe the same set of applications, only one is worth looking at in any given
 * moment, and side by side each got half the width it needed to be legible.
 *
 * The switch changes what is shown and nothing else. No navigation, no refetch, no loss of
 * scroll position; both views are already computed from the same array in memory.
 *
 * Neither view is given a fixed height. A card that reserves the taller view's space leaves
 * a hole under the shorter one, and these two are close enough in height that the reflow on
 * switching is smaller than that hole would be.
 */

import { useState } from "react";

import { MatchDistribution } from "@/components/dashboard/MatchDistribution";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import type { ApplicationView } from "@/lib/use-applications";

type View = "distribution" | "pipeline";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "distribution", label: "Match Distribution" },
  { id: "pipeline", label: "Application Pipeline" },
];

export function MatchPipelineSwitcher({ applications }: { applications: ApplicationView[] }) {
  const [view, setView] = useState<View>("distribution");

  return (
    <div className="switcher">
      <div className="switcher__tabs" role="group" aria-label="Analytics view">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={view === option.id}
            onClick={() => setView(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/*
        Both panels render their own heading, which the switch now duplicates. Each is
        hidden from the accessibility tree rather than removed, because the heading is what
        the panel's own `aria` structure hangs off, and the visible label is the tab.
      */}
      <div className="switcher__body" data-view={view}>
        {view === "distribution" ? (
          <MatchDistribution applications={applications} />
        ) : (
          <PipelineChart applications={applications} />
        )}
      </div>
    </div>
  );
}

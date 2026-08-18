"use client";

/**
 * Role Landscape: "what other roles does my experience already support?"
 *
 * Role-based, never company-based. The question is about the user's own transferable
 * evidence, and grouping by employer answers a different one.
 *
 * Everything on this panel comes from BASELINE analyses. A tailored resume is a rewrite
 * aimed at one posting, and letting those scores define the user's natural affinities would
 * have the product report them as strongest wherever it most recently helped them rewrite.
 * The filter lives in `lib/career.ts` and is enforced by test, not by this component.
 *
 * The adjacency reasons are hand-written rather than derived from title similarity, because
 * §77 requires every suggestion to be explainable in transferable evidence, which means
 * the reason has to exist before the suggestion does.
 */

import { useMemo, useState } from "react";

import { Drawer } from "@/components/ui/Drawer";
import {
  ADJACENCY_CATEGORIES,
  type AdjacencyCategory,
  type AdjacentRole,
  type RoleAffinity,
  adjacentRoles,
} from "@/lib/career";

const CATEGORY_LABELS: Record<AdjacencyCategory, string> = {
  technical: "Technical adjacencies",
  "cross-functional": "Cross-functional",
  "non-technical": "Broader moves",
};

const CATEGORY_COLORS: Record<AdjacencyCategory, string> = {
  technical: "var(--cyan)",
  "cross-functional": "var(--violet)",
  "non-technical": "var(--gold)",
};

type Filter = "all" | AdjacencyCategory;

/** Radar geometry. */
const SIZE = 300;
const CENTRE = SIZE / 2;
const RADIUS = 108;

interface Spoke {
  role: string;
  category: AdjacencyCategory;
  /** 0 to 1. The affinity if we have measured it, otherwise null. */
  affinity: number | null;
  detail: AdjacentRole;
}

export function RoleLandscape({
  affinities,
  baselineCount,
}: {
  affinities: RoleAffinity[];
  baselineCount: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Spoke | null>(null);

  /** The user's strongest measured role anchors the map. */
  const primary = affinities[0] ?? null;

  const spokes: Spoke[] = useMemo(() => {
    if (!primary) return [];
    const measured = new Map(
      affinities.map((affinity) => [affinity.role.toLowerCase(), affinity.affinity]),
    );

    return adjacentRoles(primary.role).map((role) => ({
      role: role.role,
      category: role.category,
      // Null where the user has never had a posting for that role analysed. Shown as
      // "not measured" rather than as a number, because an unmeasured adjacency is a suggestion
      // about direction, not a score.
      affinity: measured.get(role.role.toLowerCase()) ?? null,
      detail: role,
    }));
  }, [affinities, primary]);

  const shown = spokes.filter((spoke) => filter === "all" || spoke.category === filter);

  /**
   * Not enough evidence yet.
   *
   * §69 and §21: say so rather than drawing a radar from two data points, which would look
   * exactly as authoritative as one drawn from forty.
   */
  if (!primary || baselineCount < 3) {
    return (
      <section className="obsidian-panel dash-panel dash-panel--landscape">
        <header className="dash-panel__head">
          <div>
            <h2 className="panel-title">Role Landscape</h2>
            <p className="dash-panel__sub">How your evidence aligns with related roles</p>
          </div>
        </header>
        <div className="dash-panel__empty-block">
          <p>We&apos;re still learning your career landscape.</p>
          <p>
            Analyse more roles against your master résumé, {baselineCount} so far. Adjacent
            technical and cross-functional directions appear once there is enough baseline
            evidence to say something honest about them.
          </p>
        </div>
      </section>
    );
  }

  // Spokes are laid out on a circle starting at 12 o'clock.
  const angle = (index: number, total: number) =>
    (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const point = (index: number, total: number, radius: number) => ({
    x: CENTRE + Math.cos(angle(index, total)) * radius,
    y: CENTRE + Math.sin(angle(index, total)) * radius,
  });

  // Unmeasured spokes sit at a low fixed radius so the polygon still closes; they are drawn
  // hollow so they never read as a measurement.
  const polygon = shown
    .map((spoke, index) => {
      const value = spoke.affinity ?? 0.25;
      const { x, y } = point(index, shown.length, RADIUS * value);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <>
      <section className="obsidian-panel dash-panel dash-panel--landscape">
        <header className="dash-panel__head">
          <div>
            <h2 className="panel-title">Role Landscape</h2>
            <p className="dash-panel__sub">How your evidence aligns with related roles</p>
          </div>
        </header>

        <div className="landscape">
          <div className="landscape__primary pf-panel">
            <div className="pf-panel__head">PRIMARY FIT</div>
            <div className="landscape__primary-body">
              <b>{primary.role}</b>
              <span className="landscape__score">{Math.round(primary.affinity * 100)}</span>
              <small>
                out of 100 · median of {primary.sampleSize} baseline{" "}
                {primary.sampleSize === 1 ? "analysis" : "analyses"} · {primary.confidence}{" "}
                confidence
              </small>
              <p>
                Your strongest measured alignment. Derived from original résumé analyses
                only, since tailored versions are excluded so a rewrite cannot redefine your
                profile.
              </p>
            </div>
          </div>

          <div className="landscape__chart">
            <div className="landscape__filters" role="group" aria-label="Filter adjacencies">
              {(["all", ...ADJACENCY_CATEGORIES] as Filter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="landscape__filter"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option === "all" ? "All" : CATEGORY_LABELS[option]}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="dash-panel__note">No adjacencies in that category.</p>
            ) : (
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="landscape__radar"
                role="img"
                aria-label={`Role adjacency map centred on ${primary.role}`}
              >
                {[0.25, 0.5, 0.75, 1].map((ring) => (
                  <circle
                    key={ring}
                    cx={CENTRE}
                    cy={CENTRE}
                    r={RADIUS * ring}
                    fill="none"
                    stroke="var(--edge-soft)"
                    strokeWidth="1"
                  />
                ))}

                {shown.map((spoke, index) => {
                  const outer = point(index, shown.length, RADIUS);
                  return (
                    <line
                      key={spoke.role}
                      x1={CENTRE}
                      y1={CENTRE}
                      x2={outer.x}
                      y2={outer.y}
                      stroke="var(--edge-soft)"
                      strokeWidth="1"
                    />
                  );
                })}

                <polygon
                  points={polygon}
                  fill="color-mix(in srgb, var(--cyan) 16%, transparent)"
                  stroke="var(--cyan)"
                  strokeWidth="1.5"
                />

                {shown.map((spoke, index) => {
                  const at = point(index, shown.length, RADIUS * (spoke.affinity ?? 0.25));
                  const label = point(index, shown.length, RADIUS + 26);
                  return (
                    <g key={spoke.role}>
                      <circle
                        cx={at.x}
                        cy={at.y}
                        r="4"
                        fill={spoke.affinity === null ? "var(--obsidian)" : CATEGORY_COLORS[spoke.category]}
                        stroke={CATEGORY_COLORS[spoke.category]}
                        strokeWidth="1.5"
                      />
                      <text
                        x={label.x}
                        y={label.y}
                        className="landscape__label"
                        textAnchor={
                          label.x < CENTRE - 12 ? "end" : label.x > CENTRE + 12 ? "start" : "middle"
                        }
                      >
                        {spoke.role}
                      </text>
                      <text
                        x={label.x}
                        y={label.y + 12}
                        className="landscape__value"
                        textAnchor={
                          label.x < CENTRE - 12 ? "end" : label.x > CENTRE + 12 ? "start" : "middle"
                        }
                      >
                        {spoke.affinity === null
                          ? "not measured"
                          : `${Math.round(spoke.affinity * 100)}`}
                      </text>
                    </g>
                  );
                })}

                <circle cx={CENTRE} cy={CENTRE} r="5" fill="var(--cyan)" />
              </svg>
            )}
          </div>

          {/* The list is the keyboard and screen-reader path to the same information, and
              the only way to open a role's detail. The radar is a picture of it. */}
          <ul className="landscape__list">
            {shown.map((spoke) => (
              <li key={spoke.role}>
                <button type="button" onClick={() => setSelected(spoke)}>
                  <span
                    className="landscape__dot"
                    style={{ background: CATEGORY_COLORS[spoke.category] }}
                    aria-hidden="true"
                  />
                  <span className="landscape__list-role">
                    <b>{spoke.role}</b>
                    <small>{CATEGORY_LABELS[spoke.category]}</small>
                  </span>
                  <span className="landscape__list-score">
                    {spoke.affinity === null ? "n/a" : Math.round(spoke.affinity * 100)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.role ?? ""}
        subtitle={selected ? CATEGORY_LABELS[selected.category] : undefined}
      >
        {selected && (
          <div className="role-detail">
            <div className="pf-panel">
              <div className="pf-stat">
                <small>CURRENT ALIGNMENT</small>
                <strong>
                  {selected.affinity === null ? "n/a" : Math.round(selected.affinity * 100)}
                </strong>
                <p>
                  {selected.affinity === null
                    ? "You have not analysed a posting for this role yet, so there is no measured alignment, only the reasoning below for why it is adjacent."
                    : "Out of 100, from baseline analyses of postings for this role."}
                </p>
              </div>
            </div>

            <h3>Why this is adjacent</h3>
            <p>{selected.detail.rationale}</p>

            <h3>Transferable evidence</h3>
            <ul className="role-detail__list">
              {selected.detail.transferable.map((item) => (
                <li key={item} data-tone="good">
                  {item}
                </li>
              ))}
            </ul>

            <h3>Current gaps</h3>
            <ul className="role-detail__list">
              {selected.detail.gaps.map((item) => (
                <li key={item} data-tone="gap">
                  {item}
                </li>
              ))}
            </ul>

            {/*
              Says what it is and is not. An adjacency is a direction the evidence supports
              exploring, not a claim that the user qualifies, and the difference is exactly
              what a career tool is tempted to blur.
            */}
            <p className="notice" data-tone="info">
              <strong>What this is</strong>
              A direction your current evidence makes reachable, with the gaps named. It is
              not an assessment that you qualify, and no part of it predicts whether an
              employer would interview you.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}

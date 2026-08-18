"use client";

/**
 * Job Hunt Velocity: applications, responses and interviews over time.
 *
 * Hand-built SVG rather than a charting library. The project has no chart dependency, and
 * adding ~90KB of one to draw three polylines would be the largest thing in the bundle for
 * the least reason. It also means the chart inherits the design tokens directly instead of
 * being themed through a library's own abstraction.
 *
 * The series can be toggled because three overlapping lines on eight buckets is dense, and
 * the useful question is usually about one of them, "am I applying more, or just checking
 * more often". Toggling is a real interaction, not a legend.
 */

import { useMemo, useState } from "react";

import { RANGES, type RangeId, type VelocityPoint, velocitySeries } from "@/lib/velocity";
import type { ApplicationView } from "@/lib/use-applications";

type SeriesId = "applications" | "responses" | "interviews";

const SERIES: Array<{ id: SeriesId; label: string; color: string }> = [
  { id: "applications", label: "Applications", color: "var(--cyan)" },
  { id: "responses", label: "Responses", color: "var(--teal)" },
  { id: "interviews", label: "Interviews", color: "var(--violet)" },
];

/** The viewBox. Fixed so the geometry is simple; the SVG scales to its container. */
const W = 560;
const H = 190;
const PAD = { top: 14, right: 12, bottom: 26, left: 30 };

export function VelocityChart({ applications }: { applications: ApplicationView[] }) {
  const [range, setRange] = useState<RangeId>(
    RANGES.find((candidate) => candidate.default)?.id ?? "8w",
  );
  const [hidden, setHidden] = useState<Set<SeriesId>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => velocitySeries(applications, range), [applications, range]);

  const visible = SERIES.filter((series) => !hidden.has(series.id));

  /**
   * The y-axis ceiling.
   *
   * Computed from the VISIBLE series only, so hiding the largest one rescales the chart to
   * make the remaining detail readable rather than leaving it flat against the floor.
   * Minimum of 4 so an empty or near-empty chart still draws a sensible axis instead of
   * one gridline at zero.
   */
  const max = Math.max(
    4,
    ...points.flatMap((point) => visible.map((series) => point[series.id])),
  );

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;

  function toggle(id: SeriesId) {
    setHidden((current) => {
      const next = new Set(current);
      // Never hide the last visible series: an empty chart is not a view of anything, and
      // the user has no obvious way to discover how to get back from it.
      if (next.has(id)) next.delete(id);
      else if (visible.length > 1) next.add(id);
      return next;
    });
  }

  const active = hover !== null ? points[hover] : null;
  const everything = points.reduce(
    (sum, point) => sum + point.applications + point.responses + point.interviews,
    0,
  );

  return (
    <section className="obsidian-panel dash-panel dash-panel--velocity">
      <header className="dash-panel__head">
        <div>
          <h2 className="panel-title">Job Hunt Velocity</h2>
          <p className="dash-panel__sub">Applications, responses and interviews over time</p>
        </div>

        <label className="dash-range">
          <span className="sr-only">Time range</span>
          <select value={range} onChange={(event) => setRange(event.target.value as RangeId)}>
            {RANGES.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="dash-legend">
        {SERIES.map((series) => {
          const on = !hidden.has(series.id);
          return (
            <button
              key={series.id}
              type="button"
              className="dash-legend__item"
              aria-pressed={on}
              onClick={() => toggle(series.id)}
            >
              <span
                className="dash-legend__dot"
                style={{ background: on ? series.color : "var(--edge)" }}
                aria-hidden="true"
              />
              {series.label}
            </button>
          );
        })}
      </div>

      {everything === 0 ? (
        <p className="dash-panel__empty">
          Nothing to plot yet. Applications appear here once you record the date you sent
          them; responses and interviews appear when you record a reply.
        </p>
      ) : (
        <>
          <svg
            className="velocity"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Job hunt velocity over ${RANGES.find((r) => r.id === range)?.label}`}
            preserveAspectRatio="none"
            onMouseLeave={() => setHover(null)}
          >
            {/* Horizontal gridlines. Four is enough to read a value against without the
                grid competing with the data. */}
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(max * fraction)}
                  y2={y(max * fraction)}
                  stroke="var(--edge-soft)"
                  strokeWidth="1"
                />
                <text x={PAD.left - 8} y={y(max * fraction) + 3} className="velocity__axis" textAnchor="end">
                  {Math.round(max * fraction)}
                </text>
              </g>
            ))}

            {visible.map((series) => {
              const d = points
                .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point[series.id])}`)
                .join(" ");
              return (
                <g key={series.id}>
                  <path d={d} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" />
                  {points.map((point, index) => (
                    <circle
                      key={index}
                      cx={x(index)}
                      cy={y(point[series.id])}
                      r={hover === index ? 4 : 2.5}
                      fill={series.color}
                    />
                  ))}
                </g>
              );
            })}

            {/* Invisible hit areas, one per bucket, full height, so hovering anywhere in a
                column reveals it rather than requiring the pointer to find a 3px dot. */}
            {points.map((point, index) => (
              <rect
                key={point.start}
                x={x(index) - plotW / points.length / 2}
                y={PAD.top}
                width={plotW / points.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
            ))}

            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--cyan)"
                strokeWidth="1"
                opacity="0.4"
              />
            )}

            {points.map((point, index) => (
              <text
                key={point.start}
                x={x(index)}
                y={H - 8}
                className="velocity__axis"
                textAnchor="middle"
              >
                {/* Every label at 8 buckets; every third at 30, or they collide. */}
                {points.length > 12 && index % 5 !== 0 ? "" : point.label}
              </text>
            ))}
          </svg>

          {/* The readout is text, not a floating tooltip: a tooltip is invisible to a
              keyboard user and unreachable on touch. This is always present and announced. */}
          <p className="velocity__readout" aria-live="polite">
            {active ? (
              <>
                <b>{active.start}</b> · {active.applications} applied · {active.responses}{" "}
                {active.responses === 1 ? "response" : "responses"} · {active.interviews}{" "}
                {active.interviews === 1 ? "interview" : "interviews"}
              </>
            ) : (
              <span className="velocity__hint">Hover a point for that period&apos;s numbers.</span>
            )}
          </p>

          {/* The text alternative FEATURES.md §2.6 requires for every chart. */}
          <details className="chart-alt">
            <summary>Read as a table</summary>
            <table className="pf-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Applications</th>
                  <th scope="col">Responses</th>
                  <th scope="col">Interviews</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.start}>
                    <td>{point.start}</td>
                    <td data-numeric="true">{point.applications}</td>
                    <td data-numeric="true">{point.responses}</td>
                    <td data-numeric="true">{point.interviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export type { VelocityPoint };

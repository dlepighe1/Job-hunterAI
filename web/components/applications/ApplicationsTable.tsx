"use client";

/**
 * The applications table and its grid alternative.
 *
 * Precision-flat, not neumorphic. `DESIGN.md` says "if the element carries a value or a state,
 * it is flat", and this carries nothing else. That vocabulary exists because neumorphism
 * measured ~1.1:1 on every boundary against 1.4.11's 3:1, so data surfaces opted out of it
 * rather than the project abandoning the style.
 *
 * Selected state is a ring. Never a 3px left bar.
 *
 * Table is the default view because this is a tracker: the useful action is comparing rows,
 * and cards make comparison harder in exchange for looking softer.
 *
 * There is no Actions column. The company cell is itself the button that opens the drawer,
 * so a trailing "Open" repeated the same action, cost 81px of a 918px table at 1280, and gave
 * keyboard users two stops to reach one destination.
 *
 * Two things the approved boards show that this deliberately does not copy. The status cell
 * stays a `<select>` rather than becoming a static chip, because inline status changes are
 * working functionality and the redesign is not allowed to remove them; it is styled to read
 * as the chip the board draws. And the score ring is one hue rather than a red-amber-green
 * band, for the reason in `ScoreRing`.
 */

import { useMemo, useState } from "react";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  engineLabel,
  hasUnansweredEmployerResponse,
  matchDisplay,
  statusLabel,
  statusTone,
} from "@/lib/applications";
import { formatAppDate } from "@/lib/format";
import type { ApplicationView } from "@/lib/use-applications";

type SortKey =
  | "company"
  | "role"
  | "location"
  | "status"
  | "matchScore"
  | "matchEngine"
  | "appliedAt"
  | "lastActivityAt";

export type ViewMode = "table" | "grid";

/** Column order is specified, not incidental: identity, then the job, then where it stands,
 *  then what was measured, then when. Reading left to right answers "what is this and how is
 *  it going" before it answers "how well did it score". */
const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
  { key: "matchScore", label: "Match", numeric: true },
  { key: "matchEngine", label: "Engine" },
  { key: "appliedAt", label: "Applied", numeric: true },
  { key: "lastActivityAt", label: "Last activity", numeric: true },
];

/** Pipeline order, so sorting by status walks the pipeline rather than the alphabet, which
 *  would read applied, interview, offer, saved and mean nothing. */
const STATUS_ORDER = new Map(APPLICATION_STATUSES.map((status, index) => [status, index]));

function compare(a: ApplicationView, b: ApplicationView, key: SortKey): number {
  if (key === "matchScore") {
    // Unscored rows sort last in BOTH directions. They are absent, not "worse than zero",
    // and letting them lead an ascending sort buries every real measurement.
    if (a.matchScore === null && b.matchScore === null) return 0;
    if (a.matchScore === null) return 1;
    if (b.matchScore === null) return -1;
    return a.matchScore - b.matchScore;
  }
  if (key === "status") {
    return (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0);
  }
  return String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
}

/** The dash a table cell shows for a value that was never recorded. Not "n/a", which reads
 *  as a measurement that came back empty rather than a field nobody filled in. */
const BLANK = "—";

export function ApplicationsTable({
  applications,
  view,
  statusFilter,
  onStatusFilter,
  query,
  onQuery,
  onOpen,
  onStatusChange,
  onTogglePriority,
  busyId,
  selectedId,
}: {
  applications: ApplicationView[];
  view: ViewMode;
  statusFilter: ApplicationStatus | "all";
  onStatusFilter: (status: ApplicationStatus | "all") => void;
  query: string;
  onQuery: (value: string) => void;
  onOpen: (application: ApplicationView) => void;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onTogglePriority: (application: ApplicationView) => void;
  busyId: string | null;
  selectedId: string | null;
}) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "lastActivityAt",
    ascending: false,
  });
  const [priorityOnly, setPriorityOnly] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = applications.filter((application) => {
      if (statusFilter !== "all" && application.status !== statusFilter) return false;
      if (priorityOnly && !application.priority) return false;
      if (!needle) return true;
      return (
        application.company.toLowerCase().includes(needle) ||
        application.role.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      const order = compare(a, b, sort.key);
      return sort.ascending ? order : -order;
    });
  }, [applications, query, sort, statusFilter, priorityOnly]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, ascending: !current.ascending } : { key, ascending: true },
    );
  }

  return (
    <div className="applications">
      <div className="applications__controls">
        <div className="field">
          <label htmlFor="application-search">Search</label>
          <input
            id="application-search"
            type="search"
            className="nm-input"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Company or role…"
          />
        </div>

        <div className="field">
          <label htmlFor="application-status-filter">Status</label>
          <select
            id="application-status-filter"
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value as ApplicationStatus | "all")}
          >
            <option value="all">All statuses</option>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="landscape__filter"
          aria-pressed={priorityOnly}
          onClick={() => setPriorityOnly((value) => !value)}
        >
          ★ Focus only
        </button>

        <p className="applications__count" aria-live="polite">
          {visible.length} of {applications.length}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="pf-panel">
          <div className="pf-panel__head">NO MATCHES</div>
          <p className="applications__none">
            No application matches that search and filter. Clear them to see all{" "}
            {applications.length}.
          </p>
        </div>
      ) : view === "grid" ? (
        <ul className="app-grid">
          {visible.map((application) => {
            const match = matchDisplay(application.matchScore, application.matchCalibrated);
            const attention = hasUnansweredEmployerResponse(
              application.respondedAt,
              application.lastActivityAt,
            );

            return (
              <li
                key={application.id}
                className="pf-panel app-card"
                data-selected={selectedId === application.id}
                data-attention={attention}
              >
                <button
                  type="button"
                  className="app-card__open"
                  onClick={() => onOpen(application)}
                >
                  <span className="app-card__head">
                    <CompanyAvatar company={application.company} />
                    <span className="app-card__ident">
                      <b>{application.company}</b>
                      <small>{application.role}</small>
                    </span>

                    <ScoreRing
                      score={application.matchScore}
                      calibrated={application.matchCalibrated}
                    />
                  </span>

                  <span className="app-card__mid">
                    {application.location && (
                      <span className="app-card__where">{application.location}</span>
                    )}
                    {/* The engine travels with the score wherever the score appears, and on a
                        card there is no Engine column to carry it. */}
                    {match.scored && (
                      <span className="app-card__engine">
                        {engineLabel(application.matchEngine)} · {match.calibration}
                      </span>
                    )}
                  </span>

                  <span className="app-card__foot">
                    <span className="app-card__applied">
                      {formatAppDate(application.appliedAt) ?? "Not sent yet"}
                    </span>
                    <span className="status-chip" data-tone={statusTone(application.status)}>
                      {statusLabel(application.status)}
                    </span>
                  </span>

                  {attention && (
                    <span className="attention-dot">
                      <span className="sr-only">Employer responded, nothing since</span>
                    </span>
                  )}

                  {application.priority && (
                    <span className="app-card__star" aria-hidden="true">
                      ★
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="pf-panel applications__scroll">
          <table className="pf-table applications__table">
            {/* Fixed layout, so the columns are decided by this table and not by whichever
                company in the list happens to have the longest name. Auto layout sized every
                column to its widest cell and pushed the eight past the 918px a 1280 laptop
                actually has, which is a horizontal scrollbar on the primary view of the
                primary screen. Percentages rather than pixels so it still fills a 4K stage. */}
            <colgroup>
              <col style={{ width: 38 }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "11.5%" }} />
              <col style={{ width: "11.5%" }} />
            </colgroup>

            <caption className="sr-only">
              Your applications. Sortable by column; the match score is shown out of 100 with
              its calibration state beside the engine that produced it.
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Focus</span>
                </th>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      data-numeric={column.numeric ? "true" : undefined}
                      aria-sort={active ? (sort.ascending ? "ascending" : "descending") : "none"}
                    >
                      <button type="button" onClick={() => toggleSort(column.key)}>
                        {column.label}
                        <span aria-hidden="true" data-active={active}>
                          {active ? (sort.ascending ? "▲" : "▼") : "◆"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {visible.map((application) => {
                const match = matchDisplay(application.matchScore, application.matchCalibrated);
                const engine = engineLabel(application.matchEngine);
                const attention = hasUnansweredEmployerResponse(
                  application.respondedAt,
                  application.lastActivityAt,
                );

                return (
                  <tr
                    key={application.id}
                    data-selected={selectedId === application.id}
                    data-attention={attention}
                  >
                    <td>
                      <button
                        type="button"
                        className="star-toggle"
                        aria-pressed={application.priority}
                        aria-label={`${application.priority ? "Remove" : "Mark"} ${application.role} at ${application.company} as a focus role`}
                        onClick={() => onTogglePriority(application)}
                        disabled={busyId === application.id}
                      >
                        {application.priority ? "★" : "☆"}
                      </button>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="cell-link cell-company"
                        onClick={() => onOpen(application)}
                      >
                        <CompanyAvatar company={application.company} size="sm" />
                        <b>{application.company}</b>
                        {attention && (
                          <span className="attention-dot">
                            <span className="sr-only">Employer responded, nothing since</span>
                          </span>
                        )}
                      </button>
                    </td>

                    <td>{application.role}</td>

                    <td>{application.location || BLANK}</td>

                    <td>
                      <label className="sr-only" htmlFor={`status-${application.id}`}>
                        Status for {application.company}
                      </label>
                      <select
                        id={`status-${application.id}`}
                        className="status-select"
                        data-tone={statusTone(application.status)}
                        value={application.status}
                        disabled={busyId === application.id}
                        onChange={(event) =>
                          onStatusChange(application.id, event.target.value as ApplicationStatus)
                        }
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Never a percentage, and the denominator stays visible.
                        FEATURES.md §2.3 makes both load-bearing. The calibration state sits
                        in the adjacent Engine cell, where it belongs to the thing that
                        produced it. */}
                    <td data-numeric="true">
                      <span className="score-cell" data-scored={match.scored}>
                        {match.label}
                      </span>
                    </td>

                    <td>
                      {engine ? (
                        <span className="engine-cell">
                          <b>{engine}</b>
                          <small>{match.calibration}</small>
                        </span>
                      ) : (
                        <span className="score-cell">{BLANK}</span>
                      )}
                    </td>

                    <td data-numeric="true">{formatAppDate(application.appliedAt) ?? BLANK}</td>
                    <td data-numeric="true">
                      {formatAppDate(application.lastActivityAt) ?? BLANK}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

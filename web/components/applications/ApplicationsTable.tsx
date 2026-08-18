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
 */

import { useMemo, useState } from "react";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  formatMatchScore,
  statusLabel,
  statusTone,
} from "@/lib/applications";
import type { ApplicationView } from "@/lib/use-applications";

type SortKey = "company" | "role" | "status" | "matchScore" | "appliedAt" | "lastActivityAt";
export type ViewMode = "table" | "grid";

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "matchScore", label: "Match", numeric: true },
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

function formatDate(iso: string | null): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString().slice(0, 10);
}

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
          {visible.map((application) => (
            <li key={application.id} className="pf-panel app-card" data-selected={selectedId === application.id}>
              <button type="button" className="app-card__open" onClick={() => onOpen(application)}>
                <span className="app-card__head">
                  <span className="hunt__mark" aria-hidden="true">
                    {application.company.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <b>{application.company}</b>
                    <small>{application.role}</small>
                  </span>
                  {application.priority && (
                    <span className="target-list__star" aria-label="Focus role">
                      ★
                    </span>
                  )}
                </span>

                <span className="app-card__meta">
                  <span className="status-chip" data-tone={statusTone(application.status)}>
                    {statusLabel(application.status)}
                  </span>
                  <span className="score-cell" data-scored={application.matchScore !== null}>
                    {formatMatchScore(application.matchScore, application.matchCalibrated)}
                  </span>
                </span>

                <span className="app-card__foot">
                  <span>Applied {formatDate(application.appliedAt)}</span>
                  <span>Active {formatDate(application.lastActivityAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pf-panel applications__scroll">
          <table className="pf-table">
            <caption className="sr-only">
              Your applications. Sortable by column; the match score is shown out of 100 with
              its calibration state.
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
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {visible.map((application) => (
                <tr key={application.id} data-selected={selectedId === application.id}>
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
                    <button type="button" className="cell-link" onClick={() => onOpen(application)}>
                      <b>{application.company}</b>
                      {application.location && <small>{application.location}</small>}
                    </button>
                  </td>

                  <td>{application.role}</td>

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

                  {/* "out of 100", never a percentage, and the calibration state always
                      travels with the number, and FEATURES.md §2.3 makes both load-bearing. */}
                  <td data-numeric="true">
                    <span className="score-cell" data-scored={application.matchScore !== null}>
                      {formatMatchScore(application.matchScore, application.matchCalibrated)}
                    </span>
                  </td>

                  <td data-numeric="true">{formatDate(application.appliedAt)}</td>
                  <td data-numeric="true">{formatDate(application.lastActivityAt)}</td>

                  <td>
                    <button type="button" className="row-action" onClick={() => onOpen(application)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

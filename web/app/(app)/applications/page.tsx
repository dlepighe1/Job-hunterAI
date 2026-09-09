"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ApplicationDrawer } from "@/components/applications/ApplicationDrawer";
import { ApplicationsTable, type ViewMode } from "@/components/applications/ApplicationsTable";
import { NewApplicationForm } from "@/components/applications/NewApplicationForm";
import { ArrowUpRightIcon, GridIcon, TableIcon } from "@/components/icons";
import { isApplicationStatus, type ApplicationStatus } from "@/lib/applications";
import { type ApplicationView, type NewApplication, useApplications } from "@/lib/use-applications";

/**
 * The applications pipeline (FEATURES.md §4).
 *
 * Table first, because this is a tracker, and the useful act is comparing rows. Detail opens in the
 * shared right-side drawer rather than on its own route, so the filters, the scroll position
 * and the user's place in the list all survive looking something up.
 *
 * The URL carries `?status=` and `?open=`, which is what makes the dashboard's pipeline bars
 * and Priority Targets link straight into a filtered, opened view rather than dumping the
 * user at the top of an unfiltered table.
 */
function ApplicationsView() {
  const params = useSearchParams();
  const { applications, state, reload, create, update } = useApplications();

  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The deep link, DERIVED rather than copied into state.
   *
   * `?status=` and `?open=` are how the dashboard's pipeline bars and focus list hand off
   * to this screen. Copying them into state in an effect is the obvious version and it is
   * wrong twice over: it renders once with the wrong filter before correcting itself, and
   * it means two sources of truth for the same thing. The user's own choice becomes an
   * override that simply takes precedence.
   */
  const statusParam = params.get("status");
  const openParam = params.get("open");

  const [statusOverride, setStatusOverride] = useState<ApplicationStatus | "all" | null>(null);
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  const [openCleared, setOpenCleared] = useState(false);

  const statusFilter =
    statusOverride ??
    (statusParam && isApplicationStatus(statusParam) ? statusParam : "all");
  const setStatusFilter = setStatusOverride;

  const openId = openOverride ?? (openCleared ? null : openParam);

  const selected = applications.find((application) => application.id === openId) ?? null;

  async function handleCreate(input: NewApplication): Promise<string | null> {
    const outcome = await create(input);
    if ("error" in outcome) return outcome.error;
    setAdding(false);
    setError(null);
    return null;
  }

  async function patch(id: string, changes: Partial<ApplicationView>): Promise<string | null> {
    setBusyId(id);
    const failure = await update(id, changes as Partial<NewApplication>);
    setBusyId(null);
    setError(failure);
    return failure;
  }

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">APPLICATIONS</span>
        <h1>Track every opportunity from discovery to offer</h1>
        <p>
          Company, role, status, and the match score that was actually measured, attached to
          the row rather than recomputed. Scores read out of 100 and always say whether they
          were calibrated; none is a percentage fit or a prediction of an interview.
        </p>

        {state.kind === "ready" && (
          <div className="page-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setAdding((current) => !current)}
              aria-expanded={adding}
            >
              {adding ? "Close" : "Add application"}
            </button>
            <Link href="/matcher" className="button button--ghost">
              Score a résumé
              <ArrowUpRightIcon />
            </Link>

            {/* Icon-only, and aligned right by `.page-actions` pushing it with margin-left.
                The icons are decorative, so each button carries the label a sighted user
                reads from the glyph. */}
            <div className="view-toggle view-toggle--icons" role="group" aria-label="View">
              <button
                type="button"
                aria-pressed={view === "table"}
                aria-label="Table view"
                title="Table view"
                onClick={() => setView("table")}
              >
                <TableIcon />
              </button>
              <button
                type="button"
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                title="Grid view"
                onClick={() => setView("grid")}
              >
                <GridIcon />
              </button>
            </div>
          </div>
        )}
      </header>

      {error && (
        <p className="notice" data-tone="error" role="alert" style={{ marginBottom: 22 }}>
          <strong>That did not save</strong>
          {error}
        </p>
      )}

      {state.kind === "loading" && (
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {state.kind === "unauthenticated" && (
        <div className="notice" data-tone="info">
          <strong>Sign in to track applications</strong>
          An application is a stored row belonging to an account, so there is no guest version
          of this screen. The matcher works signed out and stores nothing:{" "}
          <Link href="/matcher" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            score a résumé
          </Link>{" "}
          without an account, or{" "}
          <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
            create one
          </Link>{" "}
          to keep results.
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
          <strong>Could not load your applications</strong>
          {state.message}
          <div className="page-actions">
            <button type="button" className="button button--ghost" onClick={reload}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="space-y-6">
          {adding && (
            <NewApplicationForm onCreate={handleCreate} onCancel={() => setAdding(false)} />
          )}

          {applications.length === 0 && !adding ? (
            <div className="empty-state">
              <div>
                <p>Your job hunt starts here.</p>
                <p>
                  Track an opportunity to start building your pipeline: add one you have
                  already sent, or score a résumé and save the result. Nothing is seeded here;
                  an empty tracker is the truthful one.
                </p>
              </div>
            </div>
          ) : (
            applications.length > 0 && (
              <ApplicationsTable
                applications={applications}
                view={view}
                statusFilter={statusFilter}
                onStatusFilter={setStatusFilter}
                query={query}
                onQuery={setQuery}
                onOpen={(application) => {
                  setOpenOverride(application.id);
                  setOpenCleared(false);
                }}
                onStatusChange={(id, status) => patch(id, { status })}
                onTogglePriority={(application) =>
                  patch(application.id, { priority: !application.priority })
                }
                busyId={busyId}
                selectedId={openId}
              />
            )
          )}
        </div>
      )}

      <ApplicationDrawer
        application={selected}
        onClose={() => {
          setOpenOverride(null);
          setOpenCleared(true);
        }}
        onPatch={patch}
        busy={busyId !== null}
      />
    </>
  );
}

/** `useSearchParams` needs a Suspense boundary, since without one it opts the whole route into
 *  client-side rendering at build time and Next fails the build. */
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 260 }} />}>
      <ApplicationsView />
    </Suspense>
  );
}

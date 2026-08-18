"use client";

/**
 * Save a matcher result against an application (FEATURES.md §3.3).
 *
 * **Why this re-runs the analysis instead of uploading the result it can already see.**
 *
 * The obvious implementation is to POST the `ScoreResult` sitting in state to a "store this"
 * endpoint. It is one call, it is instant, and it makes every stored score a number the
 * browser supplied. The one feature the append-only schema exists for, plotting score
 * against time to answer "did tailoring actually help?", is only worth plotting if every
 * point on it was computed by the model. A history the client can write is a history that
 * cannot answer its own question.
 *
 * So saving sends the same inputs back to `/api/score` with an `applicationId`, and the
 * server scores and persists in one operation. That costs a second run of the engine the
 * user already chose. For the three free engines it is a local call; for Claude it is a
 * second paid one, and the copy says so before the click rather than after.
 */

import Link from "next/link";
import { useState } from "react";

import { ENGINE_META, type EngineId } from "@/lib/types";
import { useApplications } from "@/lib/use-applications";

export type SaveOutcome = { ok: true } | { ok: false; message: string };

export function SaveResult({
  engine,
  isGuest,
  onSave,
}: {
  engine: EngineId;
  isGuest: boolean;
  /** Re-runs the analysis against this application and persists it. Owned by the matcher
   *  page, which is the thing holding the posting and resume text. */
  onSave: (applicationId: string) => Promise<SaveOutcome>;
}) {
  const { applications, state, create } = useApplications();

  const [target, setTarget] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const creatingNew = target === "__new";
  const costsMoney = ENGINE_META[engine].cost === "per-call";
  const ready = creatingNew
    ? company.trim().length > 0 && role.trim().length > 0
    : target.length > 0;

  /**
   * The result stays on screen throughout, in every branch. That is the whole requirement
   * for the signed-out case and it matters just as much for a failed save: the analysis
   * cost a model call, and losing it to a failed write would make the user pay for it twice.
   */
  if (isGuest) {
    return (
      <div className="notice save-result" data-tone="info">
        <strong>Saving needs an account</strong>
        This result is yours to read now, and it just has nowhere to be stored. Nothing on this
        page has been saved, and nothing will be.{" "}
        <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
          Create an account
        </Link>{" "}
        to keep results against the applications you are tracking.
      </div>
    );
  }

  if (state.kind === "unauthenticated") {
    return (
      <div className="notice save-result" data-tone="info">
        <strong>Signed out</strong>
        Your session ended, so there is nowhere to save this. The result above is unaffected.
      </div>
    );
  }

  if (state.kind === "unconfigured") {
    return (
      <div className="notice save-result" data-tone="warn">
        <strong>Nothing to save to</strong>
        {state.message}
      </div>
    );
  }

  if (savedTo) {
    const application = applications.find((candidate) => candidate.id === savedTo);
    return (
      <div className="notice save-result" data-tone="info">
        <strong>Saved</strong>
        <span className="save-result__done">
          Stored against {application ? `${application.role} at ${application.company}` : "the application"}
        </span>
        <div className="page-actions">
          <Link href="/applications" className="button button--ghost">
            Open applications
          </Link>
          <button type="button" className="button button--ghost" onClick={() => setSavedTo(null)}>
            Save somewhere else
          </button>
        </div>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;

    setSaving(true);
    setError(null);

    let applicationId = target;

    if (creatingNew) {
      const created = await create({ company: company.trim(), role: role.trim() });
      if ("error" in created) {
        setSaving(false);
        return setError(created.error);
      }
      applicationId = created.application.id;
    }

    const outcome = await onSave(applicationId);
    setSaving(false);

    if (!outcome.ok) return setError(outcome.message);

    setSavedTo(applicationId);
    setCompany("");
    setRole("");
  }

  return (
    <form className="pf-panel save-result" onSubmit={submit}>
      <div className="pf-panel__head">SAVE THIS RESULT</div>

      <div className="save-result__body">
        <div className="save-result__row">
          <label className="sr-only" htmlFor="save-target">
            Application to save to
          </label>
          <select
            id="save-target"
            className="nm-input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={saving || state.kind === "loading"}
          >
            <option value="">
              {state.kind === "loading" ? "Loading your applications…" : "Choose an application…"}
            </option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.role}, {application.company}
              </option>
            ))}
            <option value="__new">+ New application</option>
          </select>
        </div>

        {creatingNew && (
          <div className="save-result__row">
            <label className="sr-only" htmlFor="save-company">
              Company
            </label>
            <input
              id="save-company"
              className="nm-input"
              placeholder="Company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              maxLength={200}
              disabled={saving}
            />
            <label className="sr-only" htmlFor="save-role">
              Role
            </label>
            <input
              id="save-role"
              className="nm-input"
              placeholder="Role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              maxLength={200}
              disabled={saving}
            />
          </div>
        )}

        <p className="save-result__note">
          Saving re-runs the analysis on the server so the stored score is one the model
          produced, not one your browser sent, which is what makes the score history worth
          plotting later.
          {costsMoney && " Written feedback is the paid engine, so this is a second call."}
        </p>

        {error && (
          <p className="notice" data-tone="error" role="alert">
            <strong>Not saved</strong>
            {error} The result above is unchanged.
          </p>
        )}

        <div>
          <button type="submit" className="button button--primary" disabled={!ready || saving}>
            {saving ? "Saving…" : "Save to application"}
          </button>
        </div>
      </div>
    </form>
  );
}

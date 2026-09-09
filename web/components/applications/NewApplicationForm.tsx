"use client";

/**
 * Add an application by hand.
 *
 * FEATURES.md §4.1 lists this next to "create from a matcher result" for a reason: most
 * people arrive with applications they already sent, and a tracker that can only record
 * what it scored itself starts empty and stays that way.
 *
 * The visible form is the six fields the approved board draws: Company, Role, Location,
 * Status, Link, Job description. Three more sit behind a disclosure rather than being
 * dropped, and the split is deliberate in both directions.
 *
 * `appliedAt` had to stay reachable: the table has an Applied column, and without a way to
 * set the date every hand-added row would read as an em dash forever. `industry` and
 * `workModel` had to stay reachable because the drawer displays them, and a field the
 * interface shows but never lets you fill is a column that is always empty.
 *
 * Collapsed by default so the common path is the short form the board specifies.
 */

import { useId, useState } from "react";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  WORK_MODELS,
  type WorkModel,
  statusLabel,
  workModelLabel,
} from "@/lib/applications";
import type { NewApplication } from "@/lib/use-applications";

/** Matches `postingText: optionalText(15_000)` in the route's create schema, and
 *  `/api/score`'s own limit. Shown as a counter so the cap is never a surprise on submit. */
const MAX_POSTING = 15_000;

export function NewApplicationForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: NewApplication) => Promise<string | null>;
  onCancel: () => void;
}) {
  const ids = useId();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("saved");
  const [postingUrl, setPostingUrl] = useState("");
  const [postingText, setPostingText] = useState("");

  const [showMore, setShowMore] = useState(false);
  const [appliedAt, setAppliedAt] = useState("");
  const [industry, setIndustry] = useState("");
  const [workModel, setWorkModel] = useState<WorkModel | "">("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = company.trim().length > 0 && role.trim().length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;

    setSaving(true);
    setError(null);

    const failure = await onCreate({
      company: company.trim(),
      role: role.trim(),
      location: location.trim() || null,
      status,
      // The schema validates this as a URL, so an empty string is a 400 rather than
      // "no link". Null is the value that means absent.
      postingUrl: postingUrl.trim() || null,
      postingText: postingText.trim() || null,
      industry: industry.trim() || null,
      workModel: workModel || null,
      // The column is a `date`, and an empty string is not one. Null is the honest value
      // for "they have not applied yet", which is exactly what `saved` means.
      appliedAt: appliedAt || null,
    });

    setSaving(false);
    if (failure) return setError(failure);

    setCompany("");
    setRole("");
    setLocation("");
    setPostingUrl("");
    setPostingText("");
    setIndustry("");
    setWorkModel("");
    setAppliedAt("");
    setStatus("saved");
  }

  return (
    <form className="pf-panel new-application" onSubmit={submit}>
      <div className="pf-panel__head">ADD AN APPLICATION</div>

      <div className="new-application__grid">
        <div className="field">
          <label htmlFor={`${ids}-company`}>Company</label>
          <input
            id={`${ids}-company`}
            className="nm-input"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            required
            maxLength={200}
            placeholder="Company name"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-role`}>Role</label>
          <input
            id={`${ids}-role`}
            className="nm-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            required
            maxLength={200}
            placeholder="Role / job title"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-location`}>Location</label>
          <input
            id={`${ids}-location`}
            className="nm-input"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            maxLength={200}
            placeholder="City, state, or remote"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-status`}>Status</label>
          <select
            id={`${ids}-status`}
            className="nm-input"
            value={status}
            onChange={(event) => setStatus(event.target.value as ApplicationStatus)}
          >
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="field new-application__wide">
          <label htmlFor={`${ids}-link`}>Link</label>
          <input
            id={`${ids}-link`}
            type="url"
            className="nm-input"
            value={postingUrl}
            onChange={(event) => setPostingUrl(event.target.value)}
            maxLength={2000}
            placeholder="https://company.com/job/123"
          />
        </div>
      </div>

      <div className="field new-application__posting">
        <div className="field__head">
          <label htmlFor={`${ids}-posting`}>Job description</label>
          <span className="field__count">
            {postingText.length} / {MAX_POSTING}
          </span>
        </div>
        <textarea
          id={`${ids}-posting`}
          className="nm-textarea"
          rows={5}
          value={postingText}
          onChange={(event) => setPostingText(event.target.value.slice(0, MAX_POSTING))}
          placeholder="Paste job description here…"
        />
        <p className="field__hint">
          Optional. Paste the job description if you have it, and the posting stays with the
          row so this application can be scored later without hunting for it again.
        </p>
      </div>

      <div className="new-application__more">
        <button
          type="button"
          className="row-action"
          aria-expanded={showMore}
          onClick={() => setShowMore((value) => !value)}
        >
          {showMore ? "Hide extra details" : "Add extra details"}
        </button>

        {showMore && (
          <div className="new-application__grid">
            <div className="field">
              <label htmlFor={`${ids}-applied`}>Applied on</label>
              <input
                id={`${ids}-applied`}
                type="date"
                className="nm-input"
                value={appliedAt}
                onChange={(event) => setAppliedAt(event.target.value)}
              />
              <p className="field__hint">Leave blank if you have not sent it yet.</p>
            </div>

            <div className="field">
              <label htmlFor={`${ids}-industry`}>Industry / Department</label>
              <input
                id={`${ids}-industry`}
                className="nm-input"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                maxLength={200}
                placeholder="Healthcare / Analytics"
              />
            </div>

            <div className="field">
              <label htmlFor={`${ids}-work-model`}>Work model</label>
              <select
                id={`${ids}-work-model`}
                className="nm-input"
                value={workModel}
                onChange={(event) => setWorkModel(event.target.value as WorkModel | "")}
              >
                <option value="">Not recorded</option>
                {WORK_MODELS.map((value) => (
                  <option key={value} value={value}>
                    {workModelLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Not saved</strong>
          {error}
        </p>
      )}

      <div className="new-application__actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!ready || saving}>
          {saving ? "Saving…" : "Add application"}
        </button>
      </div>
    </form>
  );
}

"use client";

/**
 * Add an application by hand.
 *
 * FEATURES.md §4.1 lists this next to "create from a matcher result" for a reason: most
 * people arrive with applications they already sent, and a tracker that can only record
 * what it scored itself starts empty and stays that way.
 */

import { useId, useState } from "react";

import { APPLICATION_STATUSES, type ApplicationStatus, statusLabel } from "@/lib/applications";
import type { NewApplication } from "@/lib/use-applications";

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
  const [appliedAt, setAppliedAt] = useState("");
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
      // The column is a `date`, and an empty string is not one. Null is the honest value
      // for "they have not applied yet", which is exactly what `saved` means.
      appliedAt: appliedAt || null,
    });

    setSaving(false);
    if (failure) return setError(failure);

    setCompany("");
    setRole("");
    setLocation("");
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
            placeholder="Optional"
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
      </div>

      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Not saved</strong>
          {error}
        </p>
      )}

      <div className="new-application__actions">
        <button type="submit" className="button button--primary" disabled={!ready || saving}>
          {saving ? "Saving…" : "Add application"}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

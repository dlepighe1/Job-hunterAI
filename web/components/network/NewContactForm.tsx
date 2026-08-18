"use client";

/**
 * Add someone the user already knows.
 *
 * Every field is one the user types from their own knowledge. There is deliberately no
 * "look up", no "import from…", and no paste-a-profile-URL-and-we-fill-the-rest. That last
 * one is a contact scraper with a friendlier label, and FEATURES.md §6 excludes it
 * regardless of how the deferred questions are answered.
 *
 * Only the name is required. A half-remembered contact is still worth recording, and
 * demanding an email address to save one would push people to guess.
 */

import { useId, useState } from "react";

import type { ApplicationView } from "@/lib/use-applications";
import type { NewContact } from "@/lib/use-contacts";

export function NewContactForm({
  applications,
  onCreate,
  onCancel,
}: {
  applications: ApplicationView[];
  onCreate: (input: NewContact) => Promise<string | null>;
  onCancel: () => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 0 && !saving;

  /** Companies already in the pipeline, offered as suggestions so the roll-up groups
   *  cleanly. Free text either way, since the user may know someone at a company they have not
   *  applied to. */
  const knownCompanies = [...new Set(applications.map((application) => application.company))];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setSaving(true);
    setError(null);

    const failure = await onCreate({
      name: name.trim(),
      roleTitle: roleTitle.trim() || null,
      company: company.trim() || null,
      email: email.trim() || null,
      contactUrl: contactUrl.trim() || null,
      applicationId: applicationId || null,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (failure) return setError(failure);

    setName("");
    setRoleTitle("");
    setCompany("");
    setEmail("");
    setContactUrl("");
    setApplicationId("");
    setNotes("");
  }

  return (
    <form className="pf-panel new-application" onSubmit={submit}>
      <div className="pf-panel__head">ADD A CONTACT</div>

      <div className="new-application__grid">
        <div className="field">
          <label htmlFor={`${ids}-name`}>Name</label>
          <input
            id={`${ids}-name`}
            className="nm-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-role`}>Their role</label>
          <input
            id={`${ids}-role`}
            className="nm-input"
            value={roleTitle}
            onChange={(event) => setRoleTitle(event.target.value)}
            maxLength={160}
            placeholder="Optional"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-company`}>Company</label>
          <input
            id={`${ids}-company`}
            className="nm-input"
            list={`${ids}-companies`}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={200}
            placeholder="Optional"
          />
          {/* Suggestions only. Typing a company you have not applied to is expected. */}
          <datalist id={`${ids}-companies`}>
            {knownCompanies.map((known) => (
              <option key={known} value={known} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-email`}>Email</label>
          <input
            id={`${ids}-email`}
            type="email"
            className="nm-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            placeholder="Optional"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-url`}>Profile link</label>
          <input
            id={`${ids}-url`}
            type="url"
            className="nm-input"
            value={contactUrl}
            onChange={(event) => setContactUrl(event.target.value)}
            maxLength={2000}
            placeholder="Optional"
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-application`}>Related application</label>
          <select
            id={`${ids}-application`}
            className="nm-input"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          >
            <option value="">Not tied to one</option>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.role}, {application.company}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor={`${ids}-notes`}>Notes</label>
          <input
            id={`${ids}-notes`}
            className="nm-input"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            placeholder="How you know them, what you last spoke about"
          />
        </div>
      </div>

      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Not saved</strong>
          {error}
        </p>
      )}

      <div className="new-application__actions">
        <button type="submit" className="button button--primary" disabled={!ready}>
          {saving ? "Saving…" : "Add contact"}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

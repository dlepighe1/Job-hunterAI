"use client";

/**
 * Write a first message.
 *
 * The template fills in the role and company and leaves the one sentence that matters
 * blank, marked as a blank. FEATURES.md §7 excludes "anything that would work identically
 * if the recipient had never heard of the user". A fully generated message is exactly
 * that, so the generator stops where the personal part begins and says so.
 *
 * No model call. Draft assistance here is a template with the facts filled in, not prose
 * produced on the user's behalf and sent to a stranger under their name.
 */

import { useId, useState } from "react";

import { draftTemplate } from "@/lib/outreach";
import type { ApplicationView } from "@/lib/use-applications";
import type { ContactView } from "@/lib/network";
import type { NewOutreach } from "@/lib/use-outreach";

export function DraftComposer({
  applications,
  contacts,
  onCreate,
  onCancel,
}: {
  applications: ApplicationView[];
  contacts: ContactView[];
  onCreate: (input: NewOutreach) => Promise<string | null>;
  onCancel: () => void;
}) {
  const ids = useId();
  const [applicationId, setApplicationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<NewOutreach["channel"]>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const application = applications.find((candidate) => candidate.id === applicationId);
  const contact = contacts.find((candidate) => candidate.id === contactId);
  const ready = body.trim().length > 0 && !saving;

  function fillTemplate() {
    setBody(
      draftTemplate({
        contactName: contact?.name ?? null,
        company: application?.company ?? contact?.company ?? null,
        role: application?.role ?? null,
      }),
    );
    if (!subject.trim() && application) {
      setSubject(`${application.role}: introduction`);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setSaving(true);
    setError(null);

    const failure = await onCreate({
      applicationId: applicationId || null,
      contactId: contactId || null,
      channel,
      subject: subject.trim() || null,
      body,
    });

    setSaving(false);
    if (failure) return setError(failure);

    setBody("");
    setSubject("");
  }

  return (
    <form className="pf-panel new-application" onSubmit={submit}>
      <div className="pf-panel__head">WRITE A DRAFT</div>

      <div className="new-application__grid">
        <div className="field">
          <label htmlFor={`${ids}-application`}>About which application</label>
          <select
            id={`${ids}-application`}
            className="nm-input"
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          >
            <option value="">Not tied to one</option>
            {applications.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.role}, {candidate.company}
              </option>
            ))}
          </select>
          <p className="field__hint">
            A reply you record against this will move the application forward.
          </p>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-contact`}>To whom</label>
          <select
            id={`${ids}-contact`}
            className="nm-input"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
          >
            <option value="">Nobody in particular yet</option>
            {contacts.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
                {candidate.company ? `, ${candidate.company}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-channel`}>Channel</label>
          <select
            id={`${ids}-channel`}
            className="nm-input"
            value={channel}
            onChange={(event) => setChannel(event.target.value as NewOutreach["channel"])}
          >
            <option value="email">Email</option>
            <option value="linkedin">LinkedIn</option>
            <option value="referral">Referral</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-subject`}>Subject</label>
          <input
            id={`${ids}-subject`}
            className="nm-input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={300}
            placeholder="Optional"
          />
        </div>
      </div>

      <div style={{ padding: "0 15px 18px" }}>
        <div className="field__head">
          <label htmlFor={`${ids}-body`}>Message</label>
          <button type="button" className="row-action" onClick={fillTemplate}>
            Start from a template
          </button>
        </div>
        <textarea
          id={`${ids}-body`}
          className="nm-textarea"
          style={{ width: "100%" }}
          rows={12}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={saving}
          placeholder="Write the message, or start from the template and replace the bracketed line."
        />
        <p className="field__hint">
          The template leaves one sentence in brackets on purpose. If you cannot fill it in,
          the message is not ready, and the person reading it will be able to tell.
        </p>
      </div>

      {error && (
        <p className="notice" data-tone="error" role="alert">
          <strong>Not saved</strong>
          {error}
        </p>
      )}

      <div className="new-application__actions">
        <button type="submit" className="button button--primary" disabled={!ready}>
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

/**
 * The Tailor stage: review proposed changes side by side and decide on each one.
 *
 * Every change starts UNDECIDED. Nothing is pre-accepted, and "Accept all" is a deliberate
 * second click rather than the default, because the safety property this whole flow rests on is
 * that a human read each rewrite before it went onto their résumé.
 *
 * The original text is always shown next to the proposal. A rewrite you cannot compare is a
 * rewrite you cannot check, and the model has been wrong before.
 */

import { useMemo, useState } from "react";

import type { TailorChange } from "@/lib/providers/tailor";

type Decision = "pending" | "accepted" | "rejected";

export function TailorWorkspace({
  original,
  changes,
  notAdded,
  onSave,
  onBack,
  saving,
}: {
  original: string;
  changes: TailorChange[];
  notAdded: string[];
  onSave: (tailored: string, accepted: number) => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [decisions, setDecisions] = useState<Decision[]>(() => changes.map(() => "pending"));
  const [edits, setEdits] = useState<Record<number, string>>({});

  const accepted = decisions.filter((decision) => decision === "accepted").length;
  const pending = decisions.filter((decision) => decision === "pending").length;

  /**
   * The tailored document, rebuilt from the original with accepted changes applied.
   *
   * Derived rather than stored, so it cannot drift from the decisions above it. Uses a
   * plain string replace of the exact original text, since the provider already guarantees every
   * change's `original` appears verbatim in the résumé, and it drops any that does not.
   */
  const tailored = useMemo(() => {
    let text = original;
    changes.forEach((change, index) => {
      if (decisions[index] !== "accepted") return;
      const replacement = edits[index] ?? change.proposed;
      text = text.replace(change.original, replacement);
    });
    return text;
  }, [original, changes, decisions, edits]);

  function decide(index: number, decision: Decision) {
    setDecisions((current) => current.map((value, i) => (i === index ? decision : value)));
  }

  return (
    <div className="tailor">
      <div className="tailor__bar">
        <div>
          <b>
            {accepted} of {changes.length} accepted
          </b>
          {pending > 0 && <small>{pending} still to review</small>}
        </div>
        <div className="tailor__bar-actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setDecisions(changes.map(() => "accepted"))}
          >
            Accept all
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setDecisions(changes.map(() => "pending"))}
          >
            Reset
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={accepted === 0 || saving}
            onClick={() => onSave(tailored, accepted)}
          >
            {saving ? "Saving…" : "Save tailored version"}
          </button>
        </div>
      </div>

      {/*
        The master is not at risk, and saying so is not reassurance for its own sake, because a
        user who thinks Elevate might overwrite their real résumé will not use it.
      */}
      <p className="notice" data-tone="info">
        <strong>Your master résumé is untouched</strong>
        Saving creates a new version linked to this one. The original stays exactly as it is,
        and remains the résumé the matcher reaches for.
      </p>

      {changes.length === 0 ? (
        <div className="empty-state">
          <div>
            <p>No changes proposed</p>
            <p>
              The model found nothing it could improve without inventing something. That is a
              real result: the gaps in the analysis are things the résumé does not evidence,
              and rewriting cannot manufacture the evidence.
            </p>
          </div>
        </div>
      ) : (
        <ul className="tailor__list">
          {changes.map((change, index) => {
            const decision = decisions[index];
            return (
              <li key={`${change.section}-${index}`} className="pf-panel" data-decision={decision}>
                <div className="pf-panel__head">
                  <span>{change.section}</span>
                  <span className="report__chip" data-tone="evidence">
                    {change.kind}
                  </span>
                </div>

                <div className="tailor__diff">
                  <div className="tailor__side">
                    <small>Original</small>
                    <p>{change.original}</p>
                  </div>
                  <div className="tailor__side" data-side="proposed">
                    <small>Proposed</small>
                    <textarea
                      className="nm-textarea"
                      rows={4}
                      value={edits[index] ?? change.proposed}
                      onChange={(event) =>
                        setEdits((current) => ({ ...current, [index]: event.target.value }))
                      }
                      aria-label={`Proposed text for ${change.section}`}
                    />
                  </div>
                </div>

                <p className="tailor__reason">{change.reason}</p>

                <div className="tailor__actions">
                  <button
                    type="button"
                    className="row-action"
                    aria-pressed={decision === "accepted"}
                    onClick={() => decide(index, decision === "accepted" ? "pending" : "accepted")}
                  >
                    {decision === "accepted" ? "Accepted" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    aria-pressed={decision === "rejected"}
                    onClick={() => decide(index, decision === "rejected" ? "pending" : "rejected")}
                  >
                    {decision === "rejected" ? "Rejected" : "Reject"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        The honest half of the rewrite. These are things the posting wants that the résumé
        does not evidence, and the model was told to list them rather than write them in, and
        showing them turns an invisible refusal into an actionable prompt.
      */}
      {notAdded.length > 0 && (
        <section className="pf-panel">
          <div className="pf-panel__head">NOT ADDED, NO EVIDENCE IN YOUR RÉSUMÉ</div>
          <ul className="report__prose">
            {notAdded.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="report__note">
            These were left out on purpose. If you have done any of them, add the real detail
            yourself and re-run the analysis, which is a genuine improvement. Writing them in
            without the experience raises the score and does not survive an interview.
          </p>
        </section>
      )}

      <div className="tailor__foot">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back to analysis
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * One résumé in the library grid.
 *
 * Layout follows the approved board: title top-left, `•••` top-right, a Master or Tailored
 * badge, then target role, dates, usage count and a truncated note, with the Default badge in
 * the bottom-right corner rather than under the title.
 *
 * The whole card opens the preview. The overflow menu stops its own clicks from reaching that
 * handler, which is why `OverflowMenu` calls `stopPropagation`: without it, opening the menu
 * would also open the drawer behind it.
 *
 * **Colour carries the master/tailored distinction on hover, and never alone.** Cyan for a
 * master, violet for a tailored version, both only on hover and selection. A permanent tint
 * would turn a library of twelve into twelve neon panels, and the badge is what actually
 * states which is which.
 */

import { EyeIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { formatAppDate } from "@/lib/format";
import type { ResumeView } from "@/lib/use-resumes";

/** Long notes truncate to one line in the card. The drawer shows the whole thing. */
const NOTE_LIMIT = 92;

function truncateNote(note: string): string {
  if (note.length <= NOTE_LIMIT) return note;
  // Cut on a word boundary so the ellipsis does not land mid-word.
  const cut = note.slice(0, NOTE_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : NOTE_LIMIT).trimEnd()}…`;
}

export function ResumeCard({
  resume,
  usedIn,
  busy,
  onPreview,
  onRename,
  onDelete,
}: {
  resume: ResumeView;
  usedIn: number;
  busy: boolean;
  onPreview: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const kind = resume.isTailored ? "tailored" : "master";

  return (
    <li className="pf-panel resume-card" data-kind={kind}>
      <button
        type="button"
        className="resume-card__open"
        onClick={onPreview}
        disabled={busy}
        aria-label={`Preview ${resume.label}`}
      >
        <span className="resume-card__head">
          <b className="resume-card__title">{resume.label}</b>
        </span>

        <span className="resume-card__badges">
          <span className="kind-badge" data-kind={kind}>
            {resume.isTailored ? "Tailored" : "Master"}
          </span>
        </span>

        <span className="resume-card__meta">
          <span className="resume-card__field">
            <small>Target role</small>
            <span>{resume.targetRole || "Not set"}</span>
          </span>

          <span className="resume-card__field">
            <small>Updated</small>
            <span>{formatAppDate(resume.updatedAt) ?? "Not recorded"}</span>
          </span>

          <span className="resume-card__field">
            <small>Used in</small>
            <span>
              {usedIn === 0
                ? "No applications"
                : `${usedIn} application${usedIn === 1 ? "" : "s"}`}
            </span>
          </span>
        </span>

        {resume.note && <span className="resume-card__note">{truncateNote(resume.note)}</span>}
      </button>

      <div className="resume-card__corner">
        <OverflowMenu
          label={`Actions for ${resume.label}`}
          actions={[
            { label: "Preview", onSelect: onPreview, icon: <EyeIcon /> },
            { label: "Rename", onSelect: onRename, icon: <PencilIcon /> },
            { label: "Delete", onSelect: onDelete, destructive: true, icon: <TrashIcon /> },
          ]}
        />
      </div>

      {/* Bottom-right, per the board, and outside the button so it is never announced as
          part of the card's own label. */}
      {resume.isDefault && <span className="resume-card__default">Default</span>}
    </li>
  );
}

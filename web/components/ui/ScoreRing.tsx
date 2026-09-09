import { matchDisplay } from "@/lib/applications";

interface ScoreRingProps {
  /** 0-to-1, as scores are carried everywhere in this codebase. Null when unscored. */
  score: number | null;
  calibrated: boolean;
  size?: "sm" | "md";
}

/**
 * The circular match indicator on an application card.
 *
 * **One hue, not a band gradient.** The approved boards tint each ring by how strong the
 * match is, green through amber to red. This renders every scored ring in `--cyan` instead,
 * because in this design system teal, gold and rose already mean affirmative, caution and
 * failure, and a ring that turns gold at 66 would be making a claim about the score that no
 * label on the card states. FEATURES.md §2.6 does not allow colour to carry meaning alone.
 * The number inside the ring is the signal; the arc is how far along it is.
 *
 * **An unscored application draws no arc at all**, and shows an em dash where the number
 * would be. Sweeping zero degrees would be indistinguishable from a measured floor, and
 * "nothing has been scored here" and "this scored 0" are different statements.
 *
 * The class is `match-ring`, not `score-ring`: `.score-ring` was already taken by the
 * marketing page's conic-gradient dial (`app/(marketing)/page.tsx`), whose `::after` painted a
 * neumorphic face behind this one and whose `span` rule blew the value up to 2.125rem.
 *
 * `pathLength="100"` re-bases the dash units so `strokeDasharray` takes the score directly
 * rather than a fraction of 2πr. Same technique the backdrop's contour currents use, for the
 * same reason: it keeps the geometry out of the arithmetic.
 */
export function ScoreRing({ score, calibrated, size = "md" }: ScoreRingProps) {
  const match = matchDisplay(score, calibrated);
  const sweep = match.score ?? 0;

  return (
    <span className="match-ring" data-size={size} data-scored={match.scored}>
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className="match-ring__track" cx="24" cy="24" r="20" pathLength="100" />
        {match.scored && (
          <circle
            className="match-ring__arc"
            cx="24"
            cy="24"
            r="20"
            pathLength="100"
            strokeDasharray={`${sweep} 100`}
          />
        )}
      </svg>

      <span className="match-ring__value">
        {match.scored ? match.score : "—"}
      </span>

      {/* The ring is a picture of a number that is already written inside it, so the whole
          control carries one accessible string rather than three fragments. */}
      <span className="sr-only">{match.full}</span>
    </span>
  );
}

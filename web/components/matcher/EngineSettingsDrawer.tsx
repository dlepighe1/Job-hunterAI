"use client";

/**
 * Everything about the four engines, in the shared right-side drawer.
 *
 * The Matcher's own surface now carries a dropdown with nothing but engine names. All four
 * descriptions used to sit permanently in a column beside the workspace, which meant the
 * screen explained three engines the user had not chosen every time they used the one they
 * had. Moving it here is the whole point of the redesigned header row.
 *
 * Selecting an engine from inside this drawer works and closes it, because someone who opened
 * the settings to compare options is one click from having decided.
 *
 * The badges are constrained by what is TRUE in this codebase rather than by what reads well:
 * `ENGINE_META` carries the cost and the capabilities, and the copy below is derived from it.
 * FEATURES.md §2.6 also means a badge never carries meaning by colour alone, so each one is a
 * word first.
 */

import { Drawer } from "@/components/ui/Drawer";
import { ENGINES, ENGINE_META, type EngineId } from "@/lib/types";
import type { EngineAvailability } from "@/components/matcher/EngineCards";

/**
 * What each engine actually does, at the length the drawer has room for.
 *
 * Every claim here is checkable against the code: the keyword engine runs `lib/ats.ts` and
 * involves no model, the base model is deliberately uncalibrated, and Claude is the only
 * engine whose `cost` is `per-call`.
 */
const DESCRIPTIONS: Record<EngineId, string> = {
  base: "Semantic similarity from the base MPNet model, untrained on this task. It is the comparison point the fine-tuned model is measured against.",
  finetuned:
    "MPNet fine-tuned and calibrated on this project's labelled data. The best-measured option, and the only one whose score is calibrated.",
  keyword:
    "Literal ATS-style keyword matching and ranked keyword gaps. No language model is involved at any point.",
  claude:
    "Deep contextual reading of both documents, with written feedback and suggested rewrites.",
  gemma:
    "An open-weights model over OpenRouter, doing the same job as Claude at no cost. It is here to try the written-feedback path before paying for it: slower, queued behind paid traffic, and not constrained to the output format, so it occasionally has to be asked twice.",
};

/** Capability badges, read off `ENGINE_META` rather than written by hand per engine. */
function badgesFor(engine: EngineId): Array<{ text: string; tone: string }> {
  const meta = ENGINE_META[engine];
  const badges: Array<{ text: string; tone: string }> = [];

  if (engine === "finetuned") badges.push({ text: "Recommended", tone: "cyan" });
  badges.push(
    meta.cost === "per-call" ? { text: "Premium", tone: "gold" } : { text: "Free", tone: "teal" },
  );

  if (engine === "keyword") badges.push({ text: "ATS-style", tone: "muted" });
  else if (engine === "claude") badges.push({ text: "Contextual", tone: "muted" });
  else badges.push({ text: "Semantic", tone: "muted" });

  return badges;
}

export function EngineSettingsDrawer({
  open,
  onClose,
  value,
  onChange,
  availability,
}: {
  open: boolean;
  onClose: () => void;
  value: EngineId;
  onChange: (engine: EngineId) => void;
  availability: EngineAvailability;
}) {
  if (!open) return null;

  return (
    <Drawer open onClose={onClose} title="Engine settings" subtitle="Choose the engine that best fits your analysis needs">
      <ul className="engine-list">
        {ENGINES.map((engine) => {
          const meta = ENGINE_META[engine];
          const guestBlocked = engine === "claude" && availability.isGuest;
          const unavailable = !availability.available[engine] || guestBlocked;
          const selected = value === engine;

          return (
            <li key={engine}>
              <button
                type="button"
                className="engine-option"
                role="radio"
                aria-checked={selected}
                disabled={unavailable}
                onClick={() => {
                  onChange(engine);
                  onClose();
                }}
              >
                <span className="engine-option__head">
                  <b>{meta.name}</b>
                  <span className="engine-option__badges">
                    {badgesFor(engine).map((badge) => (
                      <span key={badge.text} className="engine-badge" data-tone={badge.tone}>
                        {badge.text}
                      </span>
                    ))}
                  </span>
                </span>

                <span className="engine-option__body">{DESCRIPTIONS[engine]}</span>

                {/* Cost is stated in the interface, never in a tooltip. Someone about to
                    spend money is entitled to know before they click, not after. */}
                {meta.cost === "per-call" && (
                  <span className="engine-option__cost">
                    Costs a call to the Anthropic API, and needs an account.
                  </span>
                )}

                {/* The honest capability note. Two of these four produce no score at all,
                    which is the single most surprising thing about the lineup, and hiding it
                    behind a run that returns no number would be worse than saying it here. */}
                {!meta.capabilities.score && (
                  <span className="engine-option__cost" data-tone="muted">
                    Reports coverage and gaps rather than a score.
                  </span>
                )}

                {unavailable && (
                  <span className="engine-option__cost" data-tone="muted">
                    {guestBlocked
                      ? "Needs an account, since it spends money on each run."
                      : "Not available right now."}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="report__note">
        The engine changes how the analysis is performed and how the result should be read. A
        score from one is comparable with a score from the same one, and with others only by
        ordering.
      </p>
    </Drawer>
  );
}

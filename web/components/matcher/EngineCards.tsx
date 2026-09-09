"use client";

/**
 * Pick one engine.
 *
 * Cards rather than a `<select>`, because the choice is not a preference: the four differ
 * in what they produce and one of them costs money. A dropdown hides all of that behind a
 * label the user reads once.
 *
 * Still a radio group underneath. One engine runs per analysis (SPEC §2.4); offering
 * checkboxes would invite a request the API refuses.
 */

import { ENGINES, ENGINE_META, type EngineId } from "@/lib/types";

export interface EngineAvailability {
  available: Record<EngineId, boolean>;
  isGuest: boolean;
}

/** The badge each engine carries, and why. Cost is never in a tooltip. */
const BADGES: Record<EngineId, { text: string; tone: string } | null> = {
  keyword: { text: "Free", tone: "teal" },
  base: null,
  finetuned: { text: "Recommended", tone: "cyan" },
  claude: { text: "Premium", tone: "gold" },
  gemma: { text: "Evaluation", tone: "teal" },
};

const DESCRIPTIONS: Record<EngineId, string> = {
  keyword:
    "Literal ATS-style keyword matching and ranked keyword gaps. No language model is involved.",
  base: "Semantic similarity from the base MPNet model, untrained on this task, the comparison point.",
  finetuned:
    "MPNet fine-tuned and calibrated on this project's labelled data. The best-measured option.",
  claude: "Deep contextual reading of both documents, with written feedback and suggested rewrites.",
  gemma:
    "The same written feedback from a free open-weights model. Slower, and not held to the output format the way Claude is.",
};

export function EngineCards({
  value,
  onChange,
  availability,
  disabled,
}: {
  value: EngineId;
  onChange: (engine: EngineId) => void;
  availability: EngineAvailability;
  disabled: boolean;
}) {
  return (
    <fieldset className="engine-cards" disabled={disabled}>
      <legend>Engine</legend>
      <p className="field__hint">One runs per analysis. The default costs nothing.</p>

      <div className="engine-cards__grid" role="radiogroup" aria-label="Analysis engine">
        {ENGINES.map((engine) => {
          const meta = ENGINE_META[engine];
          const badge = BADGES[engine];
          const guestBlocked = engine === "claude" && availability.isGuest;
          const unavailable = !availability.available[engine] || guestBlocked;

          return (
            <button
              key={engine}
              type="button"
              role="radio"
              aria-checked={value === engine}
              disabled={disabled || unavailable}
              onClick={() => onChange(engine)}
              className="engine-card"
            >
              <span className="engine-card__head">
                <b>{meta.name}</b>
                {badge && (
                  <span className="engine-card__badge" data-tone={badge.tone}>
                    {badge.text}
                  </span>
                )}
              </span>

              <span className="engine-card__body">{DESCRIPTIONS[engine]}</span>

              {/*
                The cost line is part of the card, always. A user about to spend money is
                entitled to know before they click, not after.
              */}
              <span className="engine-card__foot">
                {meta.cost === "per-call" ? (
                  <span data-tone="gold">Costs a call to the Anthropic API</span>
                ) : (
                  <span>Free to run</span>
                )}
                {unavailable && (
                  <span data-tone="muted">
                    {guestBlocked ? "Needs an account" : "Not configured here"}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

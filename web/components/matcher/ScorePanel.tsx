import { ENGINE_META, toDisplayScore, verdictFor, type ScoreResult } from "@/lib/types";

/**
 * The score, its band, and an explicit statement of what it does and does not mean.
 *
 * Almost every line here is a constraint from SPEC Appendix B rather than a design choice:
 *
 *  - The number is a RANKING signal. The model underscores strong matches by roughly 0.17,
 *    overscores weak ones by roughly 0.09, and never predicts above 0.85. Ordering postings
 *    by it is supported; "you are a 72% match" is not, and no amount of UI framing repairs
 *    that. So it is rendered as "72 out of 100", never with a percent sign.
 *  - Whether it is calibrated is stated outright, every time, because an uncalibrated
 *    number is not comparable to a calibrated one on absolute value.
 *  - The band around it is the model's MEASURED error on held-out data, not a per-pair
 *    confidence interval. There is no principled way to compute the latter for one pair.
 */
export function ScorePanel({ result }: { result: ScoreResult }) {
  const meta = ENGINE_META[result.engine];

  if (result.score === null) {
    return <NoScorePanel result={result} />;
  }

  const display = toDisplayScore(result.score);
  const verdict = verdictFor(result.score);

  return (
    <section
      aria-labelledby="score-heading"
      className="result-panel"
    >
      {result.degraded && <DegradedNotice />}

      <h2 id="score-heading" className="panel-title">
        Match score · {meta.name}
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <ScoreDial score={display} ringClass={verdict.ring} />

        <div className="min-w-0 flex-1">
          {/* The band label is text, not just the ring colour: SPEC Part 7 requires that
              colour is never the sole carrier of meaning. */}
          <p className={`font-mono text-lg font-semibold ${verdict.text}`}>{verdict.label}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{verdict.plain}</p>

          {result.errorBand && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              On pairs it has never seen, this model is typically within{" "}
              <span className="font-mono text-slate-800 dark:text-slate-200">
                ±{Math.round((result.errorBand.high - result.errorBand.low) * 50)}
              </span>{" "}
              points, {result.errorBand.basis}. That is its measured error across the whole
              test set, not a confidence interval for this particular pair.
            </p>
          )}
        </div>
      </div>

      <CalibrationStatement result={result} />

      <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
        This score ranks how closely two documents match. It is not a percentage fit, and it
        does not predict whether you will be interviewed or hired, and nothing in the model&apos;s
        evaluation supports that reading. Use it to compare postings against each other.
      </p>
    </section>
  );
}

/** The base and keyword engines produce no score at all, and say so rather than showing a
 *  zero that would read as "you match nothing". */
function NoScorePanel({ result }: { result: ScoreResult }) {
  const meta = ENGINE_META[result.engine];

  return (
    <section
      aria-labelledby="score-heading"
      className="result-panel"
    >
      <h2 id="score-heading" className="panel-title">
        {meta.name}
      </h2>

      {result.rawCosine !== null ? (
        <>
          <p className="mt-3 font-mono text-3xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
            {result.rawCosine.toFixed(3)}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Raw cosine similarity from the un-fine-tuned base model. This is deliberately not
            converted to a score: the calibrator maps the fine-tuned model&apos;s distribution,
            and applying it here would produce a confident number that means nothing. Compare
            it against the fine-tuned engine&apos;s raw similarity on the same pair, not
            against its score.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {meta.tagline}. This engine reports coverage rather than a score, so see the keyword
          breakdown below.
        </p>
      )}
    </section>
  );
}

/** SPEC §2.3 rule 3. The state that otherwise looks exactly like success. */
function DegradedNotice() {
  return (
    <p
      role="alert"
      className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200"
    >
      <strong className="font-semibold">This score is not calibrated.</strong> The scoring
      service is running without its calibrator, most likely having fallen back to the base model.
      The number below has not been mapped onto the scale the evaluation measured, so treat it
      as a rough ordering signal only, and do not compare it against calibrated scores.
    </p>
  );
}

function CalibrationStatement({ result }: { result: ScoreResult }) {
  if (result.calibrated) {
    return (
      <p className="notice">
        <span className="font-semibold">Calibrated.</span> Mapped through a Platt calibrator
        fitted on labelled data, so this number is comparable with other calibrated scores.
        Those labels are synthetic, and they measure fidelity to a scoring rubric, not recruiter
        judgement.
      </p>
    );
  }

  return (
    <p className="notice">
      <span className="font-semibold">Not calibrated.</span> This engine&apos;s number has not
      been mapped onto a measured scale. It is useful for ordering, and it is not comparable
      with the fine-tuned model&apos;s score on absolute value.
    </p>
  );
}

/**
 * The score ring.
 *
 * `aria-hidden` because it is decoration: the number and the band label sit next to it as
 * real text, which is the text alternative SPEC Part 7 asks for. Announcing the SVG as well
 * would read the same value twice.
 */
function ScoreDial({ score, ringClass }: { score: number; ringClass: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;

  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true" focusable="false">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={ringClass}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
          {score}
        </span>
        {/* Screen readers get the units and the scale, which "72" alone does not carry. */}
        <span className="sr-only">out of 100</span>
      </div>
    </div>
  );
}

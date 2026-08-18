import type { AtsAnalysis, KeywordGap } from "@/lib/ats";

/**
 * Ranked keyword gaps, plus the warning that has to sit next to them (SPEC §5.1 items 3-4).
 *
 * Two things this component is careful not to imply:
 *
 *  1. **Priority is not predicted score movement.** It is measured from the posting alone:
 *     how often a term appears, and whether it sits in the requirements section rather than
 *     the company blurb. Presenting it as "add this and your score rises 8 points" would be
 *     inventing a number nobody measured.
 *  2. **The model does not catch a keyword you cannot evidence.** It was long assumed it
 *     did, because the hard negatives in its training data are keyword-dense wrong-role
 *     resumes. The research repository tested that directly and it is false: appending
 *     unevidenced tool names to a weak resume raised the score on 52 of 52 pairs, by 0.085
 *     mean raw cosine (`Results/behavioral_tests.json` there). A wrong-role resume and a
 *     plausible resume with a skills line bolted on are different attacks, and the model
 *     was only ever trained against the first. So the warning is about what a human reader
 *     will do, not about what the score will do, and it appears at the point of the
 *     suggestion rather than in a footnote nobody reads.
 */

const PRIORITY_STYLES: Record<KeywordGap["priority"], string> = {
  high: "bg-rose-50 text-rose-800 ring-1 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/20",
  medium:
    "bg-amber-50 text-amber-900 ring-1 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
  low: "bg-slate-100 text-slate-700 ring-1 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20",
};

export function KeywordGaps({ keywords }: { keywords: AtsAnalysis | null }) {
  if (!keywords) {
    return (
      <section className="result-panel">
        <h2 className="panel-title">
          Keyword coverage
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This posting doesn&apos;t name any skills in the vocabulary this check uses, so
          there is nothing to match literally. That is a limit of the keyword list, not a
          finding about the resume.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="keywords-heading"
      className="result-panel"
    >
      <h2
        id="keywords-heading"
        className="panel-title"
      >
        Keyword coverage
      </h2>

      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
          {keywords.matched.length}/{keywords.matched.length + keywords.missing.length}
        </span>{" "}
        of the skills this posting names appear literally in the resume. Applicant tracking
        systems filter on exact strings, so this is a different question from whether the
        experience is there.
      </p>

      {keywords.gaps.length > 0 && (
        <>
          <h3 className="mt-5 panel-title">
            Gaps, most prominent first
          </h3>
          <ul className="mt-2 space-y-2">
            {keywords.gaps.map((gap) => (
              <li
                key={gap.keyword}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0 dark:border-slate-800"
              >
                <span className="font-mono text-sm text-slate-900 dark:text-slate-100">
                  {gap.keyword}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${PRIORITY_STYLES[gap.priority]}`}
                >
                  {gap.priority} priority
                </span>
                {/* The evidence for the ranking, stated plainly, so the ordering is
                    inspectable rather than something the user has to trust. */}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  named {gap.occurrences} {gap.occurrences === 1 ? "time" : "times"}
                  {gap.inRequirements ? ", in the requirements section" : ", outside the requirements section"}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Priority reflects how prominently the posting asks for a term. It is not a
            prediction of how much your score would move if you added it, which is a number
            nobody has measured.
          </p>

          <StuffingWarning />
        </>
      )}

      {keywords.matched.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-xs text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] dark:text-slate-400 dark:hover:text-slate-100">
            {keywords.matched.length} matched {keywords.matched.length === 1 ? "term" : "terms"}
          </summary>
          <p className="mt-2 font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {keywords.matched.join(" · ")}
          </p>
        </details>
      )}
    </section>
  );
}

/**
 * SPEC §5.1 item 4, placed here rather than in a footer on purpose: it has to be readable
 * in the same glance as the list of words the user is about to paste into their resume.
 *
 * The wording is load-bearing and is pinned by `KeywordGaps.test.tsx`. It must not claim
 * the model detects stuffing, because it measurably does not.
 */
function StuffingWarning() {
  return (
    <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-200">
      <strong className="font-semibold">Don&apos;t add a term you can&apos;t back up.</strong>{" "}
      This model cannot tell a skill your resume evidences from one it merely claims. Adding
      unevidenced terms raised the score on 52 of 52 resumes in testing, so stuffing moves
      this number without making you a better candidate, and it will not survive a human
      reader or an interview. Close a gap by describing work you actually did in the
      posting&apos;s words, or leave it open.
    </p>
  );
}

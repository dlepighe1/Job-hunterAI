import { CheckCircleIcon, MinusCircleIcon, XCircleIcon } from "@/components/icons";
import type { Requirement, RequirementStatus } from "@/lib/types";

/**
 * Each requirement in the posting, marked covered / partial / missing, with the resume
 * sentence that matched it (SPEC §5.1 item 2).
 *
 * The evidence line is the point. A tool that says "you are missing Kubernetes" is guessing
 * as far as the user can tell; one that says "we matched '3+ years Python' against 'Built
 * ETL pipelines in Python'" is showing its work, and a user can disagree with it. Every
 * covered requirement here is traceable to a specific sentence by construction.
 */

const STATUS_META: Record<
  RequirementStatus,
  { label: string; icon: typeof CheckCircleIcon; className: string; order: number }
> = {
  missing: {
    label: "Missing",
    icon: XCircleIcon,
    className: "text-rose-700 dark:text-rose-400",
    order: 0,
  },
  partial: {
    label: "Partial",
    icon: MinusCircleIcon,
    className: "text-amber-700 dark:text-amber-400",
    order: 1,
  },
  covered: {
    label: "Covered",
    icon: CheckCircleIcon,
    className: "text-emerald-700 dark:text-emerald-400",
    order: 2,
  },
};

export function RequirementCoverage({ requirements }: { requirements: Requirement[] }) {
  if (requirements.length === 0) return null;

  // Gaps first. The missing requirements are the actionable part, and burying them under a
  // list of things that already pass is how a report gets skimmed and closed.
  const ordered = [...requirements].sort(
    (a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order,
  );

  const counts = {
    covered: requirements.filter((r) => r.status === "covered").length,
    partial: requirements.filter((r) => r.status === "partial").length,
    missing: requirements.filter((r) => r.status === "missing").length,
  };

  return (
    <section
      aria-labelledby="coverage-heading"
      className="result-panel"
    >
      <h2
        id="coverage-heading"
        className="panel-title"
      >
        Requirement coverage
      </h2>

      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {counts.covered} covered, {counts.partial} partial, {counts.missing} missing, out of{" "}
        {requirements.length} requirements found in the posting.
      </p>

      <ul className="mt-4 space-y-3">
        {ordered.map((requirement, index) => {
          const meta = STATUS_META[requirement.status];
          const Icon = meta.icon;

          return (
            <li
              key={`${requirement.requirement}-${index}`}
              className="flex gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0 dark:border-slate-800"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className}`} />

              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {requirement.requirement}
                </p>

                {/* The status word travels with the icon. An icon alone would make colour
                    and shape the only carriers of meaning. */}
                <p className={`mt-0.5 font-mono text-xs ${meta.className}`}>{meta.label}</p>

                {requirement.evidence ? (
                  <blockquote className="mt-1.5 border-l-2 border-slate-200 pl-3 text-sm text-slate-600 italic dark:border-slate-700 dark:text-slate-400">
                    {requirement.evidence}
                  </blockquote>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-500">
                    No sentence in the resume matched this.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

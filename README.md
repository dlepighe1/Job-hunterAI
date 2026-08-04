# Job-hunterAI

A job-hunt platform built on a calibrated resume and job-description matcher.

**Status: pre-Phase 0.** This repository holds the specification, the recovered application
shell, and the modules that transfer from the research repository. It does not build yet.
See [What needs doing first](#what-needs-doing-first).

| | |
|---|---|
| Build specification | [`docs/SPEC.md`](docs/SPEC.md) |
| Model and evaluation | [Resume-jd-matcher](https://github.com/dlepighe1/Resume-jd-matcher) |
| Phase 1 plan, recovered | [`docs/plans/`](docs/plans/) |
| Superseded prior work | [`reference/legacy-web/`](reference/legacy-web/) |

---

## How this repository relates to the research

The model lives in `Resume-jd-matcher` and is not vendored here. The boundary is one HTTP
contract: that repository publishes a scoring service, this one consumes it. Neither imports
the other's source.

Two constraints from the evaluation bind the product, and both are load-bearing rather than
stylistic. `docs/SPEC.md` Appendix B is the full list.

1. **The score is a ranking signal, not a percentage fit.** The model underscores strong
   matches by roughly 0.17 and never predicts above 0.85. Ordering by score is supported.
   Displaying "you are an 82% match" is not.
2. **The labels are synthetic.** Every metric measures fidelity to a scoring rubric, not to
   recruiter judgement. Never describe the score as a probability of being interviewed.

Read the live numbers from the research repository's `Results/results_summary.json` rather
than copying them into product code. That is exactly how a figure went stale there once.

## Layout

```
docs/SPEC.md          The complete brief: product, architecture, data model, API, build plan
docs/plans/           Phase 1 implementation plan, recovered from the research repo's history
docs/design/          Earlier design documents, kept for provenance
supabase/schema.sql   Starting schema. Predates SPEC Part 3 and needs reconciling
web/                  The application. Next.js 16, React 19, Clerk, Tailwind 4
reference/legacy-web/ Prior work the spec has superseded. Read-only, never imported
```

## What is in `web/` and where it came from

Two sources, because the shell and the scoring modules evolved on different timelines.

**From the Phase 1 shell** (`Resume-jd-matcher` at `27162e1`, before that repo narrowed to
research only): Clerk sign-in and sign-up, the `(app)` and `(marketing)` route groups, the
dashboard, matcher, resumes, settings and applications pages, the locked Network and Outreach
screens, the marketing landing page, `lib/auth.ts`, `lib/nav.ts`, the theme toggle, and the
waitlist capture.

**From the research repository's current `main`**, per `docs/SPEC.md` Appendix A, which says
to copy these rather than rewrite them because each already has tests: `lib/ats.ts`,
`lib/providers/finetuned.ts`, `lib/providers/baseline.ts`, `lib/providers/claude.ts`,
`lib/errors.ts`, `lib/schema.ts`, `lib/benchmark.ts`, and the `api/score` route.

## What is in `reference/legacy-web/`

Twenty files that the specification has since overruled. They are kept because they encode
real decisions and working code, and deleting them would lose that. They are not wired into
the application and should not be imported.

| Superseded | By |
|---|---|
| `api/analyze`, `api/compare`, `api/extract`, `api/share/[id]` | SPEC Part 4, API design |
| `lib/db.ts` | SPEC Part 3, data model |
| `lib/providers/openrouter.ts`, `lib/providers/index.ts` | SPEC Part 2.4, engine policy |
| `components/ResultsView`, `ScoreGauge`, `SkillList`, `ProviderSelect`, `ErrorPanel` | SPEC Phase 1a ports the result components from the research demo |
| `lib/rate-limit.ts` | SPEC Part 7, to be rebuilt per-user rather than per-IP |
| `app/(app)/compare/page.tsx`, `app/results/[id]/page.tsx` | The flows they belong to |

## What needs doing first

`web/` does not compile. Three files import modules that now live under `reference/`, which
is the expected consequence of splitting the shell from the work the spec superseded:

| File | Unresolved |
|---|---|
| `web/app/(app)/matcher/page.tsx` | `@/components/ErrorPanel`, `@/components/ProviderSelect`, `@/components/ResultsView`, and calls to `/api/analyze`, `/api/share`, `/api/extract` |
| `web/app/api/waitlist/route.ts` | `@/lib/db` |
| `web/app/api/waitlist/route.test.ts` | `@/lib/db` |

Every other `@/` import in the tree resolves.

Reconciling those three is Phase 0's first task, and the spec already says how: rebuild the
data-access module against SPEC Part 3 rather than restoring `lib/db.ts`, and port the result
components from the research demo rather than restoring the old ones.

Also outstanding before the first deploy:

- `supabase/schema.sql` predates SPEC Part 3 and needs reconciling against it.
- `web/.env.example` still lists `OPENROUTER_*`, which SPEC Part 2.4 drops.
- The five decisions in SPEC Part 8 are genuine forks. Decision 1, scoring service hosting,
  blocks any deploy that scores anything.

## Running it

Once the three files above are resolved:

```bash
cd web
npm install
cp .env.example .env.local     # fill in Clerk, Supabase, and the scoring service URL
npm run dev
npm test
```

The scoring service comes from the research repository:

```bash
# in Resume-jd-matcher
uvicorn service.main:app --reload --port 8000
```

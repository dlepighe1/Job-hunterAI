# Job-hunterAI

A job-hunt platform built on a calibrated resume and job-description matcher.

**Status: Phase 1c.** The matcher works end to end without an account, and the product loop
around it is built: applications, resumes, dashboard, network and outreach are real screens
backed by real API routes, not placeholders. Persistence is optional by design: with no
`SUPABASE_*` configured the app still runs and the matcher still scores, which is what keeps
the demo working for a visitor with zero setup.

| | |
|---|---|
| Build specification | [`docs/SPEC.md`](docs/SPEC.md) |
| Feature catalogue and status | [`docs/FEATURES.md`](docs/FEATURES.md) |
| Model and evaluation | [Resume-jd-matcher](https://github.com/dlepighe1/Resume-jd-matcher) |
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
than copying them into product code. That is exactly how a figure went stale there once, and
again here: the landing page quoted a rounded-up 0.86 Spearman with no interval.

## What works today

| Surface | State |
|---|---|
| **Matcher** | Works, including for signed-out guests. One engine per analysis, chosen explicitly. Nothing is stored for guests. |
| **Applications** | Built. Table and detail view over `/api/applications`, with status transitions and saved analyses. |
| **Resumes** | Built. Upload, default selection and tailored versions over `/api/resumes`. |
| **Dashboard** | Built. Aggregates over `/api/dashboard`; renders from real counts, not sample data. |
| **Network, Outreach** | Built as screens over `/api/contacts` and `/api/outreach`. The open questions in SPEC §5.3 and §5.4 about storing other people's data still bound what these will do, so treat the feature set as provisional. |

Verified 2026-08-18: all seven authenticated screens render with no horizontal scroll from
1440 down to 390, and the signed-out matcher path was driven end to end with no scoring
service running. What is **not** yet verified is a real signed-in write. The browser pass
used `DEV_BYPASS_AUTH=1`, which serves in-memory fixtures and touches no database. See
`DESIGN.md` under Known open items.

### Engines

One runs per request, on demand, never fanned out (SPEC §2.4).

| Engine | Cost | Produces |
|---|---|---|
| Fine-tuned MPNet + Platt (default) | Free | Calibrated 0-1 score, requirement coverage |
| Base MPNet | Free | Raw cosine only, deliberately no score |
| Keyword coverage | Free, no model | Literal ATS matching and ranked gaps |
| Claude | Per call | Written feedback and suggested rewrites |

Claude requires an account. An unauthenticated endpoint that spends API credits is the
surprise invoice SPEC §2.4 warns about, and no per-IP limit fixes it.

## Layout

```
docs/SPEC.md            The build brief: product, architecture, data model, API, phases
docs/FEATURES.md        Feature-by-feature inventory with status
docs/plans/, design/    Earlier planning documents, kept for provenance
supabase/schema.sql     SPEC Part 3 schema. RLS on everywhere, no permissive policies
web/                    The application. Next.js 16, React 19, Clerk, Tailwind 4
reference/legacy-web/   Prior work the spec superseded. Read-only, never imported
```

Inside `web/`:

```
app/api/score      One engine per request, full error taxonomy, rate limited
app/api/health     Reports whether the scoring service is up AND fine-tuned
app/api/waitlist   Public capture for the two deferred features
lib/db.ts          The ONLY file that may import @supabase/supabase-js
lib/rate-limit.ts  Token bucket. In-memory by default, see the warning below
lib/providers/     One adapter per engine, each with an offline test
components/matcher/ Result rendering: score, coverage, gaps, feedback, errors
```

## Before this goes public

- **Rate limiting is in-memory and therefore per-instance.** On a serverless host with N warm
  instances the effective limit is N times what is configured, and it resets on every cold
  start. `RateLimitStore` is the seam for a Redis-backed implementation; wiring Upstash into
  it is Phase 1d and SPEC §4 calls it "not optional before the URL is public".
- **A daily spend alert on the Anthropic key** (SPEC Part 7). Not built.
- `createRouteMatcher` in `proxy.ts` is deprecated by the installed Clerk version, which
  recommends resource-based checks in each page instead. Harmless today, since the private pages
  hold no data, but the check belongs next to the data when Phase 1b adds some, and
  `lib/db.ts` taking `userId` first is what will actually enforce it.

## Running it

```bash
cd web
npm install
cp .env.example .env.local     # only SCORING_SERVICE_URL is needed to score anything
npm run dev
npm test
```

Every test runs offline: no model downloads, no API calls, no live database (SPEC Part 7).
`lib/db.boundary.test.ts` fails the suite if any file outside `lib/db.ts` imports the
Supabase SDK, which is what keeps the `userId`-scoping guarantee real.

Without Clerk keys the app runs in Clerk's keyless dev mode, which is enough to exercise the
guest matcher. The scoring service comes from the research repository:

```bash
# in Resume-jd-matcher
uvicorn service.main:app --reload --port 8000
```

Without it, the two model engines report themselves unavailable and the matcher falls back to
keyword coverage, which needs no service and no key.

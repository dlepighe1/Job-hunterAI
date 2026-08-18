# Job-hunterAI: feature catalogue

Every feature of the platform, including the ones deliberately not built yet.

**Relationship to `docs/SPEC.md`.** The spec is the build brief: architecture, data model,
API shapes, phase ordering. This is the inventory: what each surface does, what "done" means
for it, and what is deliberately excluded. Where the two disagree, the spec wins on
architecture and this wins on behaviour. Read the spec's Appendix B before writing any
user-facing copy; the constraints there are consequences of the model's evaluation, not
style preferences.

**Status legend.** `built` shipped and tested. `scaffold` the screen exists and renders,
driven by local or mock state with no persistence behind it. `planned` specified, not built.
`deferred` advertised as a locked screen, blocked on a decision recorded in section 9.
`excluded` not being built, with the reason stated.

**Status was read off the working tree**, including uncommitted work, which is a different
picture from the last commit. `web/lib/db.ts` is the single data-access module, with a
boundary test that fails the suite if anything else imports the Supabase client. `/api/score`
runs one engine per request rather than fanning out. Rate limiting, a health route, and a
keyword engine all exist.

**The middle of the product is now built.** `db.ts` reaches every table in
`supabase/schema.sql`, and every screen behind sign-in stores real data: applications with
their analysis history, saved resumes, contacts, and outreach drafts. The placeholder screens
are gone.

Two things are still deliberately absent, and both are decisions rather than gaps. Network
never looks anyone up (no directory, no enrichment, no import) because §6's blocked
questions are all about data this app would go and fetch. Outreach never sends (you copy a
draft into your own mail client) because §7's blockers are all about sending. What each
screen ships is the part of its section that needs neither answer. See `web/lib/network.ts`
and `web/lib/outreach.ts`, where the reasoning sits next to the code.

---

## 1. The product in one paragraph

A private workspace for one person running a job search. It scores a resume against a job
posting, tells the candidate which requirements they do and do not cover, and tracks every
application through a pipeline with the score attached and its history preserved. It is
built on a model measured only against postings it never trained on, and it is constrained
by that measurement: the score is a ranking signal, not a percentage fit, and the platform's
copy is not allowed to pretend otherwise.

---

## 2. Cross-cutting features

These are not one surface's features. Getting any of them wrong damages every surface.

### 2.1 Accounts and identity

| Feature | Status | Notes |
|---|---|---|
| Email and password sign-up | built | Clerk |
| Google sign-in | built | Clerk |
| Route protection | built | `web/proxy.ts`, which is Next 16's replacement for `middleware.ts` |
| Server-side user resolution | built | `web/lib/auth.ts`; `/api/score` uses `getUserIdOrNull` to gate the paid engine |
| Profile and preferences | built | `ensureProfile` runs on the first authenticated write of every kind, because without it a new user's first save dies on a foreign key. `getProfile` is still unused; Clerk owns the profile fields the UI shows |
| Guest mode for the matcher | built | Usable without an account, nothing persisted |
| Sign-up prompt on a guest result | built | The matcher's save panel says an account is needed and does not lose the result |
| Additional social providers | excluded | Deferred until there is demand; each is support surface |
| Team or shared workspaces | excluded | Single-user product by design |

Clerk owns identity. The Next.js server owns authorization, resolving the Clerk user id
server-side and scoping every query to it. Row-level security is enabled on every table as
defence in depth, not as the control.

**Acceptance:** a signed-out visitor can score a pair and see a full result. Nothing they
typed exists anywhere afterwards.

### 2.2 Engine selection

One engine per analysis, chosen by the user, run on demand. Never fan out automatically.

| Engine | Cost | Produces | Status |
|---|---|---|---|
| Fine-tuned MPNet + Platt (default) | Free | Calibrated score, requirement coverage | built |
| Base MPNet | Free | Raw similarity, for the before-and-after comparison | built |
| Keyword coverage | Free, no model | Literal ATS-style matching and ranked gaps | built |

| Claude | Per call | Written feedback, suggested bullet rewrites | built, opt-in and session-gated |

The default costs nothing per call. Language-model engines are opt-in per analysis, because
a default that spends API credits on every keystroke is how a side project generates a
surprise invoice.

`/api/score` takes an `engine` parameter and runs exactly that one. The research demo's
fan-out via `Promise.allSettled` was correct there, where the entire point was watching
engines disagree, and wrong here, where it would spend compute nobody asked for. A comparison
view asks for each engine explicitly. The paid engine additionally requires a session, because
an unauthenticated endpoint that spends API credits is a bill waiting to happen.

**Acceptance:** switching engines never silently changes what a number means. An
uncalibrated engine's output is labelled uncalibrated wherever it appears.

### 2.3 Score presentation rules

Not cosmetic. These follow from the model's measured error profile and each one is
load-bearing.

- The score is displayed with its verdict band and an explicit statement of whether it is
  calibrated.
- Measured error is shown as a band around the score. No per-prediction confidence interval
  is invented, because there is no principled way to compute one for a single pair.
- The score is never described as a probability of being hired, interviewed, or shortlisted.
- The product never claims the model detects keyword stuffing. Measured: unevidenced tool
  names raise the score on every resume tested.
- Nothing implies the score is robust to formatting. Reordering sentences without changing a
  word moves it by 0.041, about a third of the model's typical error.
- The model underscores strong matches by roughly 0.17 and never predicts above 0.85.
  Ordering by score is supported. "You are an 82% match" is not.
- Engine numbers are comparable on ordering, not on absolute value, unless both are
  calibrated.

### 2.4 Privacy and data handling

| Feature | Status | Notes |
|---|---|---|
| Nothing persisted in guest sessions | built | |
| Resume text never in a URL, log line, or analytics event | built | |
| Export all my data | planned | JSON, everything keyed to the user |
| Delete my account | built | `DELETE /api/account` + a typed confirmation in Settings. Was listed built for months while nothing called `deleteAccount`, and was wired properly once applications made it real |
| Shareable result links | excluded for now | If added: private by default, unguessable id, explicit publish |

A resume is personal data and the product holds it because the user asked it to, not as a
side effect.

### 2.5 Reliability and cost control

| Feature | Status | Notes |
|---|---|---|
| Per-user rate limit on scoring | built | `web/lib/rate-limit.ts`, applied in `/api/score` |
| Distinct error codes per failure mode | built | `INVALID_REQUEST`, `TOO_SHORT`, `RATE_LIMITED`, `REFUSED`, `INVALID_OUTPUT`, `PROVIDER_ERROR`, `MODEL_SERVICE_UNREACHABLE`, `CONFIG_ERROR` |
| Cold-start state in the UI | planned | `MODEL_SERVICE_UNREACHABLE` exists but does not distinguish "down" from "waking", and scale-to-zero hosting means 30 to 60 second waits |
| One engine failing never blanks the others | built | `Promise.allSettled` in `/api/score`, each engine reporting its own outcome |
| Daily spend alert | planned | Before the URL is public, not after |
| Health check reporting the scoring service state | built | `/api/health`, backed by `web/lib/providers/health.ts` |

**Acceptance:** every failure mode produces a message a user can act on. "Something went
wrong" is a bug.

### 2.6 Accessibility and presentation

Keyboard navigable, labelled form controls, visible focus, colour never the sole carrier of
meaning, a text alternative for every chart, and a working mobile layout. Dark and light
themes, applied before first paint so there is no flash.

### 2.7 Observability

Log engine, model id, latency, and outcome per analysis. Never log input text. The point is
to answer "which engine is slow and which is failing" without building a corpus of other
people's resumes.

---

## 3. Matcher

The surface the product is named for.

### 3.1 Input

| Feature | Status | Notes |
|---|---|---|
| Paste resume text | built | |
| Paste job posting text | built | |
| Select a saved resume | built | Picker on the matcher; the default loads automatically into an empty box |
| PDF upload and extraction | built | `multipart/form-data`, 5 MB cap, magic-number checked; on the Resumes screen |
| Posting URL fetch | deferred | Major job boards block it; see section 9 |
| Minimum-length validation | built | Below roughly 50 words there is not enough signal |
| Maximum-length cap | built | Enforced independently at every layer that can be reached |

### 3.2 Output

1. **Score**, 0 to 100, with verdict band and calibration status. `built`
2. **Requirement coverage.** Each requirement in the posting marked covered, partial, or
   missing, with the resume sentence that matched it. `built`
3. **Keyword gaps**, ranked. Priority comes from the posting alone: how often a term appears
   and whether it sits in the requirements section rather than the company blurb. It is not
   a prediction of score movement and must not be presented as one. `built`
4. **The keyword-stuffing warning.** Shown at the point of the suggestion, not buried in a
   footer. `built`, and the copy was corrected on 2026-08-18.

   It previously told users that adding an unevidenced term reproduces the pattern the model
   was trained to catch. The research repository tested that directly and it is false:
   appending roughly 13 words of the posting's tool names to a weak resume raised the score
   on 52 of 52 resumes, by 0.085 on average. See `Results/behavioral_tests.json` there.

   The model's hard negatives were keyword-dense resumes from the *wrong role*, which is a
   different attack from a plausible resume with a skills line bolted on, and it was never
   trained against the latter. The shipped copy now says that the score cannot distinguish a
   skill the resume evidences from one it merely claims, so stuffing raises the number
   without making the candidate stronger and will not survive a human reader. Never tell
   users the model catches it. `components/matcher/KeywordGaps.test.tsx` fails if any
   user-facing string in that component starts to.
5. **Written feedback and suggested rewrites.** Only when a language-model engine was
   selected, labelled as coming from that model. `planned`
6. **Engine comparison panel.** Fills per Run click, one engine at a time. `built`

### 3.3 Actions on a result

| Feature | Status |
|---|---|
| Save to Applications, carrying the posting text and the analysis | built |
| Re-run with a different engine | built |
| Copy the gap list | built | Recommended changes name the specific requirement; Outreach drafts copy to clipboard |

Saving **re-runs the analysis server-side** rather than uploading the result the browser is
already holding. The append-only score history exists to answer "did tailoring help?", and a
history the client can write cannot answer its own question. The cost is a second run of the
engine the user already chose, and the UI says so before the click, including that written
feedback is the paid one.

**Acceptance:** a covered requirement always cites the sentence that covered it. A user can
tell which parts of the output came from a model and which are literal string matching.

---

## 4. Applications

Table first. This is a tracker, not a dashboard.

### 4.1 The table

| Feature | Status | Notes |
|---|---|---|
| Columns: company, role, status, match score, applied date, last activity | built | `components/applications/ApplicationsTable.tsx`, precision-flat per `DESIGN.md` |
| Sort by any column | built | Status sorts in pipeline order, not alphabetically; unscored rows sort last in both directions |
| Filter by status | built | |
| Search by company and role | built | |
| Inline status change | built | Optimistic, rolled back on failure |
| Create from a matcher result | built | Pick an existing application or create one inline, from the result |
| Create manually | built | For applications made before the tool existed |
| Bulk delete | planned | Single-row delete is built |
| Table / Grid toggle | built | Table is the default, because this is a tracker and comparing rows is the point |
| Detail in a right-side drawer | built | Overview, match, posting, résumé used with in-place preview, notes, timeline |
| Deep link from the dashboard | built | `?status=` filters, `?open=` opens the drawer |

Statuses: `saved`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`.
The list lives once, in `web/lib/applications.ts`, and a test asserts it equals the `status`
CHECK constraint in `schema.sql`. A value the database rejects is a runtime insert failure,
not a type error.

The match score renders as `72 out of 100 · calibrated` and never as a percentage. An
unscored row shows an em dash, not a zero: the keyword and base engines produce no score at
all, and a `0` would read and sort as a measured "no match".

### 4.2 Detail view

| Feature | Status | Notes |
|---|---|---|
| Full posting and the resume used | planned | `posting_text` is stored on create; no screen reads it yet |
| Analysis history as a timeline | partial | `GET /api/applications/[id]` returns the application with its events; no detail screen renders them yet |
| Score-history chart | planned | The interesting one, see below |
| Notes | partial | Stored and patchable through the API; not yet editable in the table |
| Event log | built (server) | `application_events`; `analysis_run` is written on every save |

**Score history is the feature worth building the schema for.** Because analyses are
append-only, the detail view can plot score against time as the user tailors a resume. That
answers a question most tools avoid: did the suggestions actually help? If the answer is no,
that is a finding worth surfacing rather than hiding.

### 4.3 Automatic status transitions

| Source | Status | Notes |
|---|---|---|
| In-app events (analysis run, application created) | built | `nextStatus(current, event)` in `web/lib/applications.ts`, a pure function with its rules in one place |
| Email detection of rejections and interview invites | deferred | Belongs with Outreach; needs mailbox access and its own consent story |

Two rules make automatic transitions safe to run on every event:

1. **Never backwards.** A pipeline event can only advance an application. Without this, a
   duplicate or out-of-order "applied" event drags a row that reached interview back to the
   start, and the user watches the tracker undo progress they made themselves.
2. **An outcome is final.** Once `rejected` or `withdrawn`, nothing automatic reopens it.
   Reopening is a deliberate act and goes through an explicit status change.

`analysis_run` deliberately moves nothing. Scoring a resume says nothing about where the
application stands, and inferring "applied" from it would put a status on the row the user
never claimed.

---

## 4.4 Dashboard

| Feature | Status | Notes |
|---|---|---|
| KPI counts | built | Counts only. No interview rate, since a percentage over a handful of applications is noise with a decimal point |
| Job Hunt Velocity | built | Applications, responses and interviews; 30d / 8w / 3m / 6m, series toggles. Counts events, never infers them |
| Match Distribution | built | Bands come from `BANDS` in `benchmark.ts`, shared with the research repo |
| Application Pipeline | built | Five funnel stages; each bar links into the filtered table. Conversion rate suppressed below five sent applications |
| Role Landscape | built | Radar over technical / cross-functional / broader adjacencies, with a detail drawer naming transferable evidence and gaps |
| Priority Targets | built | Curated by the user's own star, never an automated feed |
| Recent Intelligence | built | Retrospective only: events that happened, not tasks |
| Career Intelligence | built | Replaces any composite "pulse" score. Says "still learning" rather than inventing a pattern |
| Hunt | built | A launcher for saved job boards. Does **not** search live listings, and says so |

**Role Affinity** is the median of a role's baseline scores, with confidence scaled to the
sample size, because one analysis is an anecdote, and "High confidence" over it is the fake precision
§78 forbids. Adjacency reasons are hand-written rather than derived from title similarity,
because §77 requires every suggestion to be explainable, which means the reason has to exist
before the suggestion does. A role with no map entry gets no suggestions at all.

---

## 5. Resumes

| Feature | Status | Notes |
|---|---|---|
| Store multiple labelled resumes | built | `listResumes` etc. in `db.ts`; `/api/resumes` |
| Mark one as default | built | `setDefaultResume` clears every other flag first, so exactly one can hold it |
| Upload a PDF, store extracted text plus the file | partial | Extraction is built (`/api/resumes/extract`, via `unpdf`); the original file is not yet put in Storage |
| Edit stored text | built | Extraction lands in a textarea before anything is stored |
| Delete, cascading to Storage | built | File removed before the row, because foreign keys cannot reach Storage |
| Version history | excluded for now | Analyses already record which resume produced which score |

The list endpoint does not select `content`, so resume text never leaves the database to
draw a picker. It is fetched only by `GET /api/resumes/[id]`, one resume at a time.

A scanned PDF is reported as having no extractable text (422) rather than saved as an empty
resume that fails later at the matcher, where the cause would be invisible.

---

## 6. Network (partially built)

**Intent.** Companies and people connected to the user's applications, and how the user
reaches them.

| Feature | Status | Notes |
|---|---|---|
| Company records derived from applications the user created | built | `groupByCompany` in `web/lib/network.ts`, a pure function over the user's own rows |
| Which applications sit at which company, and their combined status | built | Shows the furthest stage reached by an *open* application there, since a rejection at one posting says nothing about another still open |
| Optional manual contacts the user enters themselves | built | `contacts` table; nothing but the user writes it |
| Public company information, from a licensed source | **still deferred** | This is the part that needs the answers below |

**Why three of four could ship while the section stayed deferred.** All three blockers, namely
where company data comes from, what lawful basis covers personal data, and how to avoid building
a contact scraper, are questions about data this app would go and FETCH. None of them
arises for a company the user applied to or a person the user typed in. The screen makes
zero external requests, and it says so in a banner rather than letting the absence read as
an unfinished feature.

**Blocked on, for the remaining row:** where company data comes from, what personal data may
be stored and under what lawful basis, and how to provide the feature without building a
contact scraper. These are not implementation details and should not be answered under
delivery pressure.

**Excluded regardless of the answers:** scraping personal contact information; building a
profile of a person who has not consented; any employer-side view of candidates.

---

## 7. Outreach (partially built)

**Intent.** Drafting and sending cold contact, with reply tracking.

| Feature | Status | Notes |
|---|---|---|
| Draft assistance for a first message, grounded in the specific posting | built | A template with the role and company filled in. **No model call**, see below |
| Send from the user's own address rather than a shared pool | **still deferred** | The app sends nothing at all. You copy the draft into your own mail client |
| Reply detection feeding Application status | built, by hand | You record the reply; `outreachEventFor` maps it to a pipeline event. §4.3 wanted this from email detection, which needs mailbox access it does not have |
| Follow-up reminders | built | `followUpDue`: a week of silence on something actually sent and still unanswered |

**Why this could ship while the section stayed deferred.** Every blocker below is a question
about SENDING. Removing sending removes all of them, and what remains is most of the
section. `sent_at` is therefore a fact the user reports, not a timestamp this app writes: it
did not send the message and must not claim to know when it left.

**The draft template deliberately stops short.** It fills in the role and company and leaves
the one genuinely personal sentence as a marked blank. §7 excludes "anything that would work
identically if the recipient had never heard of the user". A fully generated message sent
to a stranger under the user's name is exactly that, so the generator stops where the
personal part begins and says so in the draft.

**Blocked on, for sending:** which email service, how sending reputation is protected, and
how consent and unsubscribe are handled under CAN-SPAM and GDPR.

**Excluded regardless of the answers:** bulk or automated sending; purchased contact lists;
anything that would work identically if the recipient had never heard of the user.

---

## 8. Explicit non-goals

Stated so they do not get re-proposed.

- **No employer-side screening, ranking, or filtering of candidates.** The model scores a
  resume against a posting from the candidate's side to show them their gaps. Pointing the
  same score at a pile of applicants is a different product with a different risk profile.
- **No automated application submission.**
- **No scraping of personal contact information.**
- **No billing in Phase 1.**
- **No team or multi-user workspaces.**
- **No claim the model reads between the lines, understands career narratives, or accounts
  for context.** It computes similarity between two documents.

---

## 9. Open decisions

Genuine forks. Each changes the build, and none has a default that can be assumed.

1. **Scoring service host.** Scale-to-zero is cheap but needs a waking state in the UI and
   30 to 60 second cold starts. Always-on is roughly 7 to 25 USD per month with no cold
   start.
2. **Whether guests can use the matcher.** Better funnel, but it is an unauthenticated
   endpoint that costs compute and needs stricter per-IP limits.
3. **Posting URL fetching.** Convenient, but the major job boards block it. Design for
   failure and fall back to paste, or omit it entirely in Phase 1.
4. **Whether written feedback ships in Phase 1.** The most visibly impressive feature and
   the only one with a per-use cost.
5. **Model versioning.** When the research repository publishes a new checkpoint, do stored
   analyses keep their original scores, which `model_id` already makes possible, or get
   recomputed? Keeping them is recommended: a score chart is meaningless if the scale moved
   underneath it.

---

## 10. What transfers from the research repository

Copy rather than rewrite. Each of these has tests behind it.

| From | What it is |
|---|---|
| `web/lib/ats.ts` | Keyword coverage and gap ranking, with alias handling and boundary rules |
| `web/lib/providers/finetuned.ts` | Scoring service adapter, including the error taxonomy |
| `web/lib/providers/baseline.ts` | Base-model adapter |
| `web/lib/providers/claude.ts` | Claude adapter with schema-constrained output |
| `web/lib/errors.ts` | Error codes and their HTTP mapping |
| `web/lib/schema.ts` | The scoring prompt and its JSON schema |
| `web/lib/benchmark.ts` | Verdict bands, so product and research agree on what a score means |

The boundary between the two repositories is one HTTP contract. The research repository
publishes a scoring service; this one consumes it. Neither imports the other's source.

---

## 11. Testing expectations per feature

Every test offline: no model downloads, no API calls, no live database. Replace the
sentence-transformer with a stub encoder using fixed vectors and the language-model provider
with a stubbed transport, which is what makes assertions about similarity bands and
calibration exact rather than dependent on a live model.

Test the invariants that fail silently, because those are the ones no one notices:

- the calibrator is never applied to base-model output
- no user-facing string claims keyword stuffing is detected, since the research repository
  measured that it is not
- a degraded scoring service is reported, never rendered as a normal score
- one engine failing never blanks the others in a comparison view
- every data-access call is scoped to the current user, and nothing outside `db.ts` imports
  the Supabase client (`db.boundary.test.ts` enforces this)
- guest sessions write nothing
- account deletion leaves no Storage object behind

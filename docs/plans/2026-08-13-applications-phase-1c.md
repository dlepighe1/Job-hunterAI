# Applications: Phase 1c Implementation Plan

> **How to use this plan:** implement it task by task, in order. Steps use checkbox
> (`- [ ]`) syntax so progress is trackable in the file itself.

**Goal:** Close the product loop: score a resume, save the result against an application,
and track that application's status over time. This is what turns the matcher from a demo
into a product, and it is the single highest-value slice for a portfolio MVP.

**Architecture:** Three passes, each leaving a working app. Pass A adds the data access
layer over a schema that already exists. Pass B exposes it as API routes and wires the
`applicationId` hook the score route already validates. Pass C replaces the placeholder
screen with the real table and adds "save this result" to the matcher.

**Spec:** `docs/FEATURES.md` §4 (the table, the detail view, automatic status transitions).

---

## What already exists, and must not be rebuilt

Read this before writing anything. A surprising amount is done.

| Already built | Where |
|---|---|
| `applications`, `analyses`, `application_events` tables **with RLS policies** | `supabase/schema.sql:45,76,96` |
| Supabase client, `isPersistenceConfigured()`, profiles, waitlist | `web/lib/db.ts` |
| `applicationId` accepted and validated on the score route | `web/app/api/score/route.ts:24` |
| An explicit "not built yet" error for it | `web/app/api/score/route.ts:63-67` |
| Rate limiting, auth gating, structured logging | `web/app/api/score/route.ts` |
| The boundary test that keeps DB access server-side | `web/lib/db.boundary.test.ts` |

**The gap is the middle layer**: no data-access functions for applications, no API routes,
and `app/(app)/applications/page.tsx` is still a `PhasePlaceholder`.

## Global Constraints

- **No git operations from this plan.** Commits are made by hand, deliberately, after
  reviewing a finished task, never as a side effect of implementing one.
- **Persistence stays optional.** `isPersistenceConfigured()` is false without `SUPABASE_*`,
  and the app must still run: the matcher works with zero configuration today via the
  `keyword` engine and **that must not regress**. It is what makes the portfolio demo work
  for a visitor with no setup.
- **Tests run offline.** No live database. Follow the existing pattern: stub at the module
  boundary, never open a socket.
- **The table is precision-flat, not neumorphic.** `DESIGN.md` names this explicitly:
  anything carrying a value or a state is flat with an `--edge` border and tight padding.
  A neumorphic data table is off-system.
- **Copy constraints hold** (`FEATURES.md` §2.3): no percentage fit, no score above 85,
  calibration always stated.
- **Never log input text.** Engine, model, latency, outcome only.

---

# PASS A: Data access

### Task 1: Applications CRUD in `lib/db.ts`

**Files:** modify `web/lib/db.ts`; create `web/lib/db.applications.test.ts`

- [ ] **Step 1: Write the failing test**

Follow the stubbing style already used in `db.test.ts`. Cover: create returns the row;
list returns only the caller's rows; update rejects a foreign `userId`; every function
returns a safe empty/false value when `isPersistenceConfigured()` is false.

That last one is the important one: it is what keeps the app running unconfigured.

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement**

```ts
export interface Application {
  id: string;
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  matchScore: number | null;
  appliedAt: string | null;
  lastActivityAt: string;
}
```

`listApplications(userId)`, `createApplication(...)`, `updateApplication(userId, id, patch)`,
`deleteApplication(userId, id)`. Every one takes `userId` as its first argument and filters
on it. RLS is the backstop, not the only guard.

- [ ] **Step 4: Verify it passes, then the whole suite**

- [ ] **Step 5: Checkpoint, stop here**

### Task 2: Analyses and the event log

**Files:** modify `web/lib/db.ts`; extend the test from Task 1

- [ ] **Step 1: Write the failing test**: saving an analysis against an application also
  writes an `application_events` row, and updates the application's `matchScore` and
  `lastActivityAt`.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement** `saveAnalysis(userId, applicationId, result)` and
  `listEvents(userId, applicationId)`. **Store the score, the engine and whether it was
  calibrated**, because a stored score without its engine is not comparable to anything later.
- [ ] **Step 4: Verify**
- [ ] **Step 5: Checkpoint, stop here**

---

# PASS B: API

### Task 3: `/api/applications`

**Files:** create `web/app/api/applications/route.ts`, `[id]/route.ts`, and tests

- [ ] **Step 1: Write the failing test**: mirror `app/api/score/route.test.ts`. Cover: 401
  without a session, 400 on a malformed body (zod), 200 with the caller's rows only, and a
  503-with-explanation when persistence is unconfigured.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement.** `GET` list, `POST` create; `[id]` takes `PATCH` and `DELETE`.
  Validate with zod, take `userId` from the session and **never from the body**.
- [ ] **Step 4: Verify**
- [ ] **Step 5: Checkpoint, stop here**

### Task 4: Wire `applicationId` in the score route

**Files:** modify `web/app/api/score/route.ts`; extend its test

- [ ] **Step 1: Write the failing test**: a scored request with a valid `applicationId`
  persists an analysis; one with an `applicationId` the caller does not own gets 404, not
  403 (do not confirm the existence of another user's row).
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Replace the Phase 1b error at `route.ts:63-67`** with a call to
  `saveAnalysis`. **Persisting must not fail the scoring response**: the score is the thing
  the user asked for. Log the persistence failure and return the result with a flag saying
  it was not saved.
- [ ] **Step 4: Verify**
- [ ] **Step 5: Checkpoint, stop here**

---

# PASS C: Interface

### Task 5: The applications table

**Files:** replace `web/app/(app)/applications/page.tsx`; add components

- [ ] **Step 1: Read `DESIGN.md` "The two vocabularies" before writing any markup.**
  This is a data surface: `.pf-panel`, `--edge` borders, tight padding, no neumorphic
  shadow. Selected state is a ring, **never a 3px left bar**.
- [ ] **Step 2: Build the table.** Columns per `FEATURES.md` §4.1: company, role, status,
  match score, applied date, last activity. Score renders as `72 out of 100 · calibrated`,
  never as a percentage.
- [ ] **Step 3: Empty state.** A real one, in product voice. `FEATURES.md`: an honest empty
  state is not a worse design than a fake full one, so do not seed fake rows.
- [ ] **Step 4: Loading and error states.** Reuse `.skeleton` and `.notice[data-tone]`.
- [ ] **Step 5: Checkpoint, stop here**

### Task 6: Save a result from the matcher

**Files:** modify `web/app/(app)/matcher/page.tsx`

- [ ] **Step 1:** Add "Save to an application" on a result: pick an existing one or create
  one inline. Signed out, it says an account is needed and **does not lose the result**.
- [ ] **Step 2:** Optimistic update, rolled back on failure with the error surfaced.
- [ ] **Step 3: Checkpoint, stop here**

### Task 7: Status transitions

**Files:** `web/lib/applications.ts` + test

- [ ] **Step 1: Write the failing test** for the transition rules in `FEATURES.md` §4.3.
- [ ] **Step 2: Implement as a pure function**: `nextStatus(current, event)`. Pure keeps it
  testable offline and keeps the rules in one readable place.
- [ ] **Step 3: Verify, then run the whole suite and `npm run build`**
- [ ] **Step 4: Checkpoint, stop here**

---

## Acceptance

- [ ] The matcher still works signed-out with **no environment variables at all**
- [ ] With Supabase configured: score → save → appears in the table → status updates
- [ ] Every new route: 401 unauthenticated, 400 malformed, 404 (not 403) for a foreign id
- [ ] No user input text in any log line
- [ ] The table is precision-flat, and `DESIGN.md` is updated to say so
- [ ] `npm test` and `npm run build` both clean

## Deliberately not in this phase

Resumes storage, Network, Outreach, billing, and email. `FEATURES.md` §8 lists them as
non-goals for Phase 1; the placeholder screens stay honest about it.

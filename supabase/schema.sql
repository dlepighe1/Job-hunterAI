-- Job-hunt platform schema. Run in the Supabase SQL editor (or `supabase db push`).
--
-- This is SPEC Part 3. It replaces the pre-spec schema, which had a single `analyses`
-- table keyed on `auth.users` with an `is_public` sharing flag. Clerk owns identity now,
-- so `auth.users` has no rows to point at, and SPEC Part 7 says shareable links, if they
-- ever ship, default to private and are an explicit, separate decision.
--
-- Authorization model. Clerk owns identity; the Next.js server owns authorization. Every
-- query filters on the Clerk user id resolved server-side, through the single data-access
-- module in web/lib/db.ts. Row-level security is enabled on every table with NO permissive
-- policies, so a leaked anon key grants nothing. RLS is defence in depth here, not the
-- primary control. The primary control is that `db.ts` takes userId as its first argument
-- and nothing else talks to Supabase.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Clerk owns identity. This table exists so foreign keys have a local target and so
-- per-user settings have somewhere to live.
create table if not exists profiles (
  id           text primary key,              -- Clerk user id, e.g. "user_2ab..."
  email        text not null,
  created_at   timestamptz not null default now(),
  settings     jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------
create table if not exists resumes (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references profiles(id) on delete cascade,
  label        text not null,                 -- "Data engineer, 2026"
  content      text not null,                 -- extracted plain text
  file_path    text,                          -- Supabase Storage object, nullable
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists resumes_user_idx on resumes (user_id, created_at desc);

-- Master vs tailored, and the lineage between them.
--
-- A master resume is a reusable source document the user wrote. A tailored one is a
-- rewrite of a master for one specific posting. Elevating must NEVER overwrite the master:
-- it creates a child, and `parent_id` records what it came from, so "which resume did I
-- actually send" stays answerable months later.
--
-- Tailored versions are excluded from the main library listing rather than deleted, because they
-- are version history, and a library of forty near-identical documents is not a library.
-- `application_id` is NOT here: it points at `applications`, which this file creates
-- further down, and a forward reference fails on a fresh database. It is added
-- immediately after that table instead.
alter table resumes add column if not exists is_tailored boolean not null default false;
alter table resumes add column if not exists parent_id   uuid references resumes(id) on delete set null;
alter table resumes add column if not exists target_role text;
alter table resumes add column if not exists note        text;
create index if not exists resumes_parent_idx on resumes (parent_id);
create index if not exists resumes_master_idx on resumes (user_id, is_tailored, created_at desc);

-- One default per user, enforced here rather than only in the code that maintains it.
--
-- `setDefaultResume()` clears every flag and then sets one, in that order, so a failure
-- between the two writes leaves the user with no default rather than two. This index is what
-- makes "two" impossible rather than merely unlikely: without it the invariant lives in one
-- function, and the day something else writes `is_default` the product starts asking a row
-- ordering which résumé is the default.
--
-- Partial, because the constraint is on the true rows only. A user may own any number of
-- résumés that are not the default, and a plain unique index on (user_id) would forbid that.
create unique index if not exists resumes_one_default_idx on resumes (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- job_boards
-- ---------------------------------------------------------------------------
-- The Hunt drawer's saved links. That is the whole feature.
--
-- Hunt is explicitly NOT a job search engine in this version: it does not query listings,
-- aggregate postings, or talk to any job API. It holds the boards the user already uses and
-- opens them in a new tab. Searching inside Hunt searches these saved rows by name, not
-- the internet, and the UI says so.
--
-- Keeping it this honest is what makes it shippable now. A "find opportunities" feature
-- built on a licensed feed can be added later without changing this table.
create table if not exists job_boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references profiles(id) on delete cascade,
  name       text not null,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists job_boards_user_idx on job_boards (user_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references profiles(id) on delete cascade,
  company        text not null,
  role_title     text not null,
  location       text,
  posting_url    text,
  posting_text   text,                        -- kept so a score can be recomputed
  resume_id      uuid references resumes(id) on delete set null,
  status         text not null default 'saved'
                 check (status in ('saved','applied','screening','interview','offer','rejected','withdrawn')),
  applied_at     date,
  salary_min     integer,
  salary_max     integer,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists applications_user_idx on applications (user_id, updated_at desc);
create index if not exists applications_status_idx on applications (user_id, status);

-- The latest analysis, cached on the row.
--
-- FEATURES.md §4.1: the table shows the match score "attached rather than recomputed". The
-- authoritative history lives in `analyses`, which is append-only; these three columns are
-- a denormalized copy of its most recent row so listing a pipeline is one query against one
-- table rather than a correlated lateral join per row.
--
-- The engine and the calibration flag travel WITH the number, and that is not optional.
-- FEATURES.md §2.2 requires an uncalibrated engine's output to be labelled uncalibrated
-- wherever it appears, and §2.3 makes numbers from different engines comparable on ordering
-- only. A bare `match_score` column would strip exactly the context that makes it readable,
-- and the table would sort 0.71-from-keyword against 0.71-from-the-calibrated-model as if
-- they meant the same thing.
--
-- Added after the table shipped, so they are `alter ... if not exists` rather than columns
-- in the `create` above: this file is designed to be re-run against an existing project,
-- where `create table if not exists` is a no-op and would silently skip them.
alter table applications add column if not exists match_score      numeric(5,4);
alter table applications add column if not exists match_engine     text;
alter table applications add column if not exists match_calibrated boolean not null default false;

-- Priority is the user's own flag: "this is one I actually care about". It drives Focus
-- Roles on the dashboard, which is deliberately a curated list rather than a recommendation
-- feed, because the product does not get to decide what matters to someone's career.
alter table applications add column if not exists priority boolean not null default false;
-- When the employer first responded. Distinct from updated_at, which any edit touches.
alter table applications add column if not exists responded_at timestamptz;
create index if not exists applications_priority_idx on applications (user_id, priority);

-- Context the detail drawer shows and the table deliberately does not.
--
-- Both are optional and both are entered by the user. Neither is inferred: this product does
-- not have a company database, and guessing that "Helixion Health" is in healthcare from its
-- name is the kind of plausible fabrication FEATURES.md §2.6 exists to prevent.
--
-- `work_model` is constrained rather than free text because it drives a filter later and
-- three spellings of "remote" would defeat that. `industry` stays free text because the
-- taxonomy of industries is genuinely open and a CHECK would be wrong within a month.
alter table applications add column if not exists industry text;
alter table applications add column if not exists work_model text
  check (work_model is null or work_model in ('remote','hybrid','onsite'));

-- The other half of the resume lineage, declared here because it points at the table
-- above. Which posting a tailored resume was written for; null on a master.
alter table resumes add column if not exists application_id uuid references applications(id) on delete set null;

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------
-- One row per scoring run. Applications keep their history rather than overwriting, so
-- "did tailoring my resume help?" is answerable.
--
-- `model_id` is stored on every row, which is what lets a stored analysis keep its
-- original score when the research repo publishes a new checkpoint. Scores are never
-- recomputed in place: a number and the model that produced it travel together or the
-- score history becomes a lie.
create table if not exists analyses (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references profiles(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  resume_id      uuid references resumes(id) on delete set null,
  engine         text not null,               -- see analyses_engine_check below
  model_id       text not null,               -- exact model string, for reproducibility
  score          numeric(5,4),                -- 0 to 1, null for engines that do not score
  calibrated     boolean not null default false,
  result_json    jsonb not null,              -- requirement coverage, keyword gaps, prose
  latency_ms     integer,
  created_at     timestamptz not null default now()
);
create index if not exists analyses_application_idx on analyses (application_id, created_at desc);
create index if not exists analyses_user_idx on analyses (user_id, created_at desc);

-- Baseline vs tailored. The single most important flag in this schema.
--
-- A baseline analysis scored the user's ORIGINAL resume against a posting. A tailored one
-- scored a resume the product had already rewritten for that posting. Only baseline rows
-- may feed Role Affinity or Career Intelligence.
--
-- The reason is not tidiness. Tailoring exists to raise a score, so feeding tailored scores
-- back into the career profile makes the product tell the user they are strongest in
-- whichever direction it most recently helped them fake. A user whose natural evidence
-- supports Data Scientist at 0.81 and whose tailored resume hits 0.94 has a career profile
-- built on 0.81, and the 0.94 says something about the rewrite, not about them.
--
-- `role_title` is denormalised from the application at write time so role affinity can be
-- computed without joining, and so it survives the application being deleted.
alter table analyses add column if not exists is_baseline boolean not null default true;
alter table analyses add column if not exists role_title  text;
create index if not exists analyses_baseline_idx on analyses (user_id, is_baseline, created_at desc);

-- The engine vocabulary, as a NAMED constraint rather than an inline check.
--
-- Inline, it could never change. `create table if not exists` is a no-op against a project
-- that already has the table, so a fifth engine added to lib/types.ts would pass every
-- offline test and then be rejected by a constraint from the first day of the project. Named
-- and dropped first, it is re-stated on every run and an existing database moves with the
-- file. The name is the one Postgres generates for the inline form, so this adopts the
-- constraint already on the live project rather than leaving it behind alongside a second.
--
-- `gemma` is an open-weights model served over OpenRouter. It is an evaluation engine for
-- the generative path, which otherwise could not be exercised without paying Anthropic per
-- iteration. Its score is uncalibrated, exactly as Claude's is.
--
-- `db.constraints.test.ts` parses this list and compares it to ENGINES in lib/types.ts, so
-- the two cannot drift without a test failing offline.
alter table analyses drop constraint if exists analyses_engine_check;
alter table analyses add constraint analyses_engine_check
  check (engine in ('finetuned','base','claude','keyword','gemma'));

-- ---------------------------------------------------------------------------
-- application_events
-- ---------------------------------------------------------------------------
-- Append-only. Feeds the pipeline timeline and, later, automatic status detection.
create table if not exists application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind           text not null,               -- status_changed | analysis_run | note_added
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists application_events_idx on application_events (application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
-- People the user knows about, entered BY THE USER. Nothing else writes this table.
--
-- FEATURES.md §6 permits exactly two sources for Network: companies derived from the user's
-- own applications, and "optional manual contacts the user enters themselves". This is the
-- second. The blocked questions there, namely where company data comes from, what lawful basis
-- covers personal data, and how to offer the feature without building a contact scraper, are
-- all questions about data this app would go and FETCH. They do not arise for a row a user
-- typed, about someone they already know, into their own private notes.
--
-- Excluded regardless of anything: scraping personal contact information, and building a
-- profile of a person who has not consented. So there is no enrichment column, no photo, no
-- social handle, no "last seen", and no import. A name, how to reach them, and why they
-- matter to one application.
--
-- The subject of these rows is a third party who is not the account holder, which is why
-- `notes` is capped and there is nowhere to accumulate a dossier. Cascades with the profile.
create table if not exists contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references profiles(id) on delete cascade,
  name           text not null,
  role_title     text,                        -- "Engineering manager", as the user knows it
  company        text,                        -- free text; matches applications.company by name
  email          text,
  contact_url    text,                        -- a profile URL the user already had
  -- Which application this person relates to. Null for a contact not tied to one.
  application_id uuid references applications(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists contacts_user_idx on contacts (user_id, created_at desc);
create index if not exists contacts_application_idx on contacts (application_id);

-- ---------------------------------------------------------------------------
-- outreach
-- ---------------------------------------------------------------------------
-- Messages the user WROTE and sent THEMSELVES, recorded here so replies can be tracked.
--
-- FEATURES.md §7 is blocked on which email service, how sending reputation is protected,
-- and how consent and unsubscribe work under CAN-SPAM and GDPR. Every one of those is a
-- question about SENDING. This app does not send: it holds a draft, the user copies it into
-- their own mail client, and comes back to record what happened.
--
-- That is also why `sent_at` is a user-supplied fact rather than a system timestamp, because the
-- app did not send it and must not claim to know when it left.
--
-- Excluded regardless: bulk or automated sending, and purchased contact lists. There is no
-- recipient-list column and no scheduling column, so neither has anywhere to live.
create table if not exists outreach (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null references profiles(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  application_id uuid references applications(id) on delete cascade,
  channel        text not null default 'email'
                 check (channel in ('email','linkedin','referral','other')),
  subject        text,
  body           text not null,
  status         text not null default 'draft'
                 check (status in ('draft','sent','replied','no_reply')),
  sent_at        timestamptz,                 -- recorded by the user, not by this app
  replied_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists outreach_user_idx on outreach (user_id, updated_at desc);
create index if not exists outreach_application_idx on outreach (application_id);

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------
-- "Notify me" capture for the locked Network and Outreach screens. Public and
-- unauthenticated by design, since it runs before a visitor has any reason to sign in, so it
-- deliberately has no user_id and holds nothing but an email and which feature was asked
-- about.
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  feature    text not null check (feature in ('network','outreach','general')),
  created_at timestamptz not null default now()
);

-- One row per address per feature.
--
-- The route already trims and lowercases the address before it validates it, precisely so
-- that a dedupe could not be defeated by casing or stray whitespace. Nothing then deduped:
-- a visitor who clicked "notify me" three times was three rows, and the count of people
-- waiting for a feature — the only thing this table is for — was an overstatement nobody
-- could correct after the fact.
--
-- `joinWaitlist()` upserts against this index and ignores the conflict, so signing up twice
-- stays a success for the visitor and stops being a row.
create unique index if not exists waitlist_signup_idx on waitlist (email, feature);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- Enabled everywhere, with no permissive policies anywhere. Every read and write goes
-- through the server with the service-role key, which bypasses RLS by design. Enabling it
-- without policies means a leaked anon key reads nothing, rather than reading everything.
alter table profiles            enable row level security;
alter table resumes             enable row level security;
alter table applications        enable row level security;
alter table analyses            enable row level security;
alter table application_events  enable row level security;
alter table contacts            enable row level security;
alter table outreach            enable row level security;
alter table job_boards          enable row level security;
alter table waitlist            enable row level security;

-- Drop the policy the previous schema created, so re-running this file against an existing
-- project actually closes the hole rather than leaving it in place. It made any row with
-- is_public = true readable by the anon key; neither that column nor that flow exists now.
drop policy if exists "shared analyses are publicly readable" on analyses;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Deleting a profile cascades to resumes, applications, analyses, contacts, outreach and
-- (through applications) application_events. It does NOT delete Supabase Storage objects, because
-- foreign keys cannot reach them. `deleteAccount()` in web/lib/db.ts removes the Storage
-- objects explicitly before deleting the profile row; see SPEC Part 3, "Retention".
--
-- `contacts` cascading matters more than the rest: those rows describe third parties who
-- never had an account here, so they must not outlive the account that recorded them.

-- ---------------------------------------------------------------------------
-- Storage: the resumes bucket
-- ---------------------------------------------------------------------------
-- Holds the ORIGINAL uploaded file, so the résumé preview can show the actual document
-- rather than a re-rendering of the text pulled out of it. The extracted text stays in
-- `resumes.content`, which is what the matcher scores; this is what a human looks at.
--
-- `lib/db.ts` has always referenced this bucket to clean it up on account deletion, and
-- nothing ever created it. Uploads went nowhere and `resumes.file_path` was never written,
-- which is why every preview had only text to show.
--
-- **Private.** `public = false`, so an object is reachable only through a signed URL minted
-- server-side for its owner. A résumé carries a home address and a phone number, and a
-- public bucket makes every one of them a guessable URL away from anyone.
--
-- Objects are keyed `{userId}/{resumeId}.{ext}`, which is what makes the account-deletion
-- cleanup a prefix listing rather than a join.
-- EVERY statement in this section is wrapped, and that is not fastidiousness.
--
-- `scripts/apply-schema.mjs` sends this whole file to the Management API as ONE query, which
-- the API runs in a single transaction. A statement that fails takes all nine tables down
-- with it. The `storage` schema is owned by `supabase_storage_admin` rather than by the role
-- this runs as, so `alter table storage.objects` and `drop policy ... on storage.objects` can
-- both fail with `insufficient_privilege` depending on how the project was provisioned.
--
-- Unguarded, that turns "apply the schema" into "apply nothing, and report an error about a
-- table you did not know existed". Each block below degrades to a notice instead, so the
-- tables always land and anything the role could not do is reported rather than fatal.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'resumes',
    'resumes',
    false,
    10485760,  -- 10 MB, the ceiling MAX_UPLOAD_BYTES enforces before a parser sees bytes
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Could not create the resumes bucket from SQL. Create it in Storage: name "resumes", NOT public, 10 MB limit.';
end $$;

-- Same posture as every table above: RLS on, no permissive policies. Reads and writes go
-- through the server with the service-role key, which bypasses RLS by design, so a leaked
-- anon key can neither list nor fetch a single résumé.
--
-- Supabase enables RLS on `storage.objects` by default, so this is usually a no-op that
-- confirms the state rather than changing it.
do $$
begin
  alter table storage.objects enable row level security;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Could not alter storage.objects (owned by supabase_storage_admin). Supabase enables RLS there by default; verify it in the dashboard.';
end $$;

-- Removes a policy an earlier setup may have added by hand. Re-running this file should
-- close a hole rather than leave it open.
do $$
begin
  drop policy if exists "resumes are publicly readable" on storage.objects;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Could not drop legacy storage policies; check Storage policies in the dashboard.';
end $$;

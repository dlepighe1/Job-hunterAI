/**
 * The single data-access module. Nothing else in this application talks to Supabase.
 *
 * SPEC Part 3 puts authorization in the server rather than in Postgres policies: RLS is
 * enabled on every table with no permissive policies, so the service-role key is the only
 * thing that can read a row, and this module is the only thing that holds it. That trade
 * buys one readable place to audit authorization, at the cost of relying on discipline.
 *
 * The discipline is enforced two ways:
 *
 *   1. Every user-scoped function takes `userId` as its FIRST argument, and applies it as
 *      a filter on the query. A function that reads user data and does not take a userId
 *      is a bug, not a convenience.
 *   2. `db.boundary.test.ts` fails the suite if any file outside this one imports
 *      `@supabase/supabase-js`.
 *
 * Server-only: it reads the service-role key. Importing this from a client component
 * would ship that key to the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { type ApplicationStatus } from "@/lib/applications";
import { env } from "@/lib/env";
import { devStore, nextFixtureId } from "@/lib/dev-fixtures";
import { isDevMode } from "@/lib/dev-mode";
import type { OutreachChannel, OutreachStatus } from "@/lib/outreach";
import type { EngineId, ScoreResult } from "@/lib/types";

/** The Storage bucket holding uploaded resume files. Objects are keyed `{userId}/{name}`,
 *  which is what makes account deletion able to find them. */
export const RESUME_BUCKET = "resumes";

let client: SupabaseClient | null = null;

/**
 * The service-role client, created once.
 *
 * Auth persistence is off: this client is shared across requests on the server and has no
 * user session of its own. Leaving it on would have one request's state leak into the next.
 */
function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Whether Supabase is configured at all.
 *
 * Checked before every persistence path so a missing key produces "persistence is not
 * configured" rather than a stack trace from `required()`. The app is useful without it:
 * the matcher scores fine for a guest with nothing but a scoring service.
 */
export function isPersistenceConfigured(): boolean {
  // Dev mode serves fixtures from memory, so persistence is "configured" in the sense the
  // screens care about, since they render populated rather than showing a no-database notice,
  // while nothing here ever opens a Supabase client. That is deliberate: the mode exists to
  // demo the product with an empty or absent database.
  if (isDevMode()) return true;
  return env.supabase.isConfigured;
}

/** Reset the memoized client. Tests only. Production has exactly one process-wide client. */
export function __resetClientForTests(): void {
  client = null;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  created_at: string;
  settings: Record<string, unknown>;
}

/**
 * Make sure a profile row exists for a Clerk user.
 *
 * Clerk owns identity, so this row is not the account: it is the local target every
 * foreign key needs, created on first authenticated write rather than by a webhook. That
 * choice means there is no window where a signed-in user has no profile and their first
 * save fails on a foreign key violation.
 *
 * `onConflict: "id"` makes it idempotent, and `email` is refreshed on every call so a
 * Clerk-side email change propagates without a separate sync path.
 */
export async function ensureProfile(userId: string, email: string): Promise<boolean> {
  if (isDevMode()) return true;
  const { error } = await getClient()
    .from("profiles")
    .upsert({ id: userId, email }, { onConflict: "id" });

  if (error) {
    console.error("[db] ensureProfile failed", { userId, code: error.code });
    return false;
  }
  return true;
}

/** A user's profile, or null when they have never written anything. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getClient()
    .from("profiles")
    .select("id, email, created_at, settings")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getProfile failed", { userId, code: error.code });
    return null;
  }
  return (data as Profile | null) ?? null;
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Delete everything belonging to a user.
 *
 * The foreign keys in SPEC Part 3 cascade the rows, but they cannot reach Supabase
 * Storage, and an uploaded resume PDF would survive the account that owned it. So Storage is
 * cleared explicitly and FIRST: if the object delete fails we still have the profile row,
 * and the operation can be retried. Deleting the row first would orphan the files with
 * nothing left pointing at them.
 *
 * A resume is personal data (SPEC Part 7). Leaving one behind is the failure that matters
 * here, not a slow delete.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  const storage = getClient().storage.from(RESUME_BUCKET);

  const { data: objects, error: listError } = await storage.list(userId);
  if (listError) {
    console.error("[db] deleteAccount could not list storage", { userId, message: listError.message });
    return false;
  }

  if (objects && objects.length > 0) {
    const paths = objects.map((object) => `${userId}/${object.name}`);
    const { error: removeError } = await storage.remove(paths);
    if (removeError) {
      console.error("[db] deleteAccount could not remove storage", {
        userId,
        count: paths.length,
        message: removeError.message,
      });
      return false;
    }
  }

  // Cascades to resumes, applications, analyses and application_events.
  const { error } = await getClient().from("profiles").delete().eq("id", userId);
  if (error) {
    console.error("[db] deleteAccount failed", { userId, code: error.code });
    return false;
  }
  return true;
}

/**
 * Fixture row -> the shape the app consumes.
 *
 * The fixtures already store camelCase, so these are near-identity: they exist so the dev
 * branches return a COPY. Handing out the live object would let a component mutate the
 * store by editing what it was given.
 */
function toDevApplication(row: (typeof devStore.applications)[number]): Application {
  // `postingText` is dropped rather than destructured-and-ignored: the list shape does not
  // carry it, and an unused binding is a lint error the linter is right about.
  const copy: Record<string, unknown> = { ...row };
  delete copy.postingText;
  return copy as unknown as Application;
}

function toDevResume(row: (typeof devStore.resumes)[number]): Resume {
  return { ...row };
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

/** A stored resume. `content` is the extracted plain text, the thing the matcher scores. */
export interface Resume {
  id: string;
  userId: string;
  label: string;
  content: string;
  /** Supabase Storage object key, `{userId}/{name}`. Null for text pasted directly. */
  filePath: string | null;
  isDefault: boolean;
  /**
   * True for a version this product rewrote for one posting.
   *
   * Tailored versions are version history, not library entries: a resume list of forty
   * near-identical documents is not a library. They are filtered out of the main view and
   * reached through their master instead.
   */
  isTailored: boolean;
  /** The master this was tailored from. Null on a master. */
  parentId: string | null;
  /** The posting it was tailored for. Null on a master. */
  applicationId: string | null;
  targetRole: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeInput {
  label: string;
  content: string;
  filePath?: string | null;
  targetRole?: string | null;
  note?: string | null;
  /** Set by the Elevate flow only. A tailored resume never becomes the default. */
  isTailored?: boolean;
  parentId?: string | null;
  applicationId?: string | null;
}

export type ResumePatch = Partial<
  Pick<ResumeInput, "label" | "content" | "targetRole" | "note">
>;

/** The list view renders labels and dates. Selecting `content` here would pull the full
 *  text of every resume the user owns just to draw a picker. */
const RESUME_LIST_COLUMNS =
  "id, user_id, label, file_path, is_default, is_tailored, parent_id, application_id, target_role, note, created_at, updated_at";
const RESUME_COLUMNS = `${RESUME_LIST_COLUMNS}, content`;

function toResume(row: Record<string, unknown>): Resume {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    // Absent when the row came from the list query, which does not select it.
    content: typeof row.content === "string" ? row.content : "",
    filePath: (row.file_path as string | null) ?? null,
    isDefault: Boolean(row.is_default),
    isTailored: Boolean(row.is_tailored),
    parentId: (row.parent_id as string | null) ?? null,
    applicationId: (row.application_id as string | null) ?? null,
    targetRole: (row.target_role as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Every resume belonging to a user, newest first, without their text. */
export async function listResumes(userId: string): Promise<Resume[]> {
  if (isDevMode()) return devStore.resumes.map(toDevResume);
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("resumes")
    .select(RESUME_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] listResumes failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(toResume);
}

/** One resume with its full text, or null when it does not exist or is not the caller's. */
export async function getResume(userId: string, id: string): Promise<Resume | null> {
  if (isDevMode()) {
    const found = devStore.resumes.find((row) => row.id === id);
    return found ? toDevResume(found) : null;
  }
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("resumes")
    .select(RESUME_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getResume failed", { userId, code: error.code });
    return null;
  }

  return data ? toResume(data as Record<string, unknown>) : null;
}

/**
 * Store a resume.
 *
 * The first one a user saves becomes their default automatically. Without that, a new
 * account has exactly one resume and no default, and everything reaching for "the default"
 * finds nothing while the only possible answer sits right there. Later ones do not take the
 * flag, and that is an explicit choice, through `setDefaultResume`.
 */
export async function createResume(userId: string, input: ResumeInput): Promise<Resume | null> {
  if (isDevMode()) {
    const row = {
      id: nextFixtureId("r"),
      userId,
      label: input.label,
      content: input.content,
      filePath: input.filePath ?? null,
      isDefault: false,
      isTailored: input.isTailored ?? false,
      parentId: input.parentId ?? null,
      applicationId: input.applicationId ?? null,
      targetRole: input.targetRole ?? null,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    devStore.resumes.unshift(row);
    return toDevResume(row);
  }
  if (!isPersistenceConfigured()) return null;

  const { data: existing } = await getClient()
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  // A tailored version is never the default, even as the very first row, because the default is
  // the resume the matcher reaches for, and reaching for a rewrite of one specific posting
  // is exactly wrong.
  const isFirst = ((existing as unknown[] | null) ?? []).length === 0 && !input.isTailored;

  const { data, error } = await getClient()
    .from("resumes")
    .insert({
      user_id: userId,
      label: input.label,
      content: input.content,
      file_path: input.filePath ?? null,
      is_default: isFirst,
      is_tailored: input.isTailored ?? false,
      parent_id: input.parentId ?? null,
      application_id: input.applicationId ?? null,
      target_role: input.targetRole ?? null,
      note: input.note ?? null,
    })
    .select(RESUME_COLUMNS)
    .single();

  if (error) {
    console.error("[db] createResume failed", { userId, code: error.code });
    return null;
  }

  return data ? toResume(data as Record<string, unknown>) : null;
}

/**
 * Rename a resume or correct its text.
 *
 * FEATURES.md §5: extraction is imperfect and the user should be able to fix it, so editing
 * the stored text is a first-class operation rather than a re-upload.
 */
export async function updateResume(
  userId: string,
  id: string,
  patch: ResumePatch,
): Promise<Resume | null> {
  if (isDevMode()) {
    const found = devStore.resumes.find((row) => row.id === id);
    if (!found) return null;
    Object.assign(found, patch, { updatedAt: new Date().toISOString() });
    return toDevResume(found);
  }
  if (!isPersistenceConfigured()) return null;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.targetRole !== undefined) update.target_role = patch.targetRole;
  if (patch.note !== undefined) update.note = patch.note;

  const { data, error } = await getClient()
    .from("resumes")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select(RESUME_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[db] updateResume failed", { userId, code: error.code });
    return null;
  }

  return data ? toResume(data as Record<string, unknown>) : null;
}

/**
 * Make one resume the default, and only one.
 *
 * Two writes, and the order is the whole point. Clearing every flag first means a failure
 * between the two leaves the user with NO default, which is visible and fixed by choosing again.
 * Setting the new one first would leave them with two, and "the default" would then depend
 * on row ordering: not a state anyone can see, and not one they can correct.
 */
export async function setDefaultResume(userId: string, id: string): Promise<boolean> {
  if (isDevMode()) {
    const found = devStore.resumes.find((row) => row.id === id);
    if (!found) return false;
    for (const row of devStore.resumes) row.isDefault = row.id === id;
    return true;
  }
  if (!isPersistenceConfigured()) return false;

  const { error: clearError } = await getClient()
    .from("resumes")
    .update({ is_default: false })
    .eq("user_id", userId);

  if (clearError) {
    console.error("[db] setDefaultResume could not clear the previous default", {
      userId,
      code: clearError.code,
    });
    return false;
  }

  const { data, error } = await getClient()
    .from("resumes")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[db] setDefaultResume failed", { userId, code: error?.code });
    return false;
  }
  return true;
}

/**
 * Delete a resume and any file behind it.
 *
 * Storage first, then the row, the same ordering `deleteAccount` uses and for the same
 * reason: foreign keys cannot reach Supabase Storage, so dropping the row first orphans the
 * PDF with nothing left pointing at it. A resume is personal data (SPEC Part 7); leaving one
 * behind is the failure that matters here, not a slow delete.
 *
 * Analyses referencing this resume keep their rows through `on delete set null`, because a score
 * and the model that produced it are still true after the source document is gone.
 */
export async function deleteResume(userId: string, id: string): Promise<boolean> {
  if (!isPersistenceConfigured()) return false;

  // Establishes ownership and tells us whether there is a file to sweep, in one read.
  const resume = await getResume(userId, id);
  if (!resume) return false;

  if (resume.filePath) {
    const { error: storageError } = await getClient()
      .storage.from(RESUME_BUCKET)
      .remove([resume.filePath]);

    if (storageError) {
      console.error("[db] deleteResume could not remove the file", {
        userId,
        message: storageError.message,
      });
      return false;
    }
  }

  const { error } = await getClient().from("resumes").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    console.error("[db] deleteResume failed", { userId, code: error.code });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * One tracked application, in the shape the UI consumes.
 *
 * Deliberately not the database row. The table stores `role_title` and `updated_at`, and
 * both are wrong names for a React component to carry: `role` is what the column means,
 * and `lastActivityAt` is what the timestamp is FOR. Mapping in one place here means a
 * column rename is a change to `toApplication` and nothing else.
 *
 * `matchScore` is 0 to 1, like every score in this codebase, and is converted to 0-100 only
 * at the point of display. `matchEngine` and `matchCalibrated` travel with it because a
 * score without its engine is not comparable to anything (FEATURES.md §2.2).
 */
export interface Application {
  id: string;
  userId: string;
  company: string;
  role: string;
  location: string | null;
  postingUrl: string | null;
  status: ApplicationStatus;
  /** 0 to 1. Null until an analysis has been saved against this application. */
  matchScore: number | null;
  matchEngine: EngineId | null;
  matchCalibrated: boolean;
  /** ISO date, no time. Null until the user says they actually applied. */
  appliedAt: string | null;
  /** When the employer first responded. Distinct from `lastActivityAt`, which any edit
   *  touches. This one is an event, and the velocity chart plots it. */
  respondedAt: string | null;
  /** The user's own "this one matters" flag. Drives Focus Roles, which is curated by them
   *  rather than recommended by the product. */
  priority: boolean;
  /** The résumé actually sent. Null until an analysis attaches one. */
  resumeId: string | null;
  notes: string | null;
  createdAt: string;
  lastActivityAt: string;
}

/** What a caller may set when creating. `userId` is absent on purpose: it comes from the
 *  session at the call site and is never accepted from a request body. */
export interface ApplicationInput {
  company: string;
  role: string;
  location?: string | null;
  postingUrl?: string | null;
  /** Kept so a score can be recomputed later without asking for the posting again. */
  postingText?: string | null;
  status?: ApplicationStatus;
  appliedAt?: string | null;
  respondedAt?: string | null;
  priority?: boolean;
  resumeId?: string | null;
  notes?: string | null;
}

/** What a caller may change. Every field optional; anything absent is left alone. */
export type ApplicationPatch = Partial<Omit<ApplicationInput, "postingText">>;

/** The columns every read selects. `posting_text` is excluded because it is the largest column
 *  on the row and the list view has no use for it. */
const APPLICATION_COLUMNS =
  "id, user_id, company, role_title, location, posting_url, status, match_score, match_engine, match_calibrated, applied_at, responded_at, priority, resume_id, notes, created_at, updated_at";

/**
 * PostgREST may hand back a `numeric` as a string to preserve precision beyond what a
 * double can hold. A score that arrives as "0.6100" and is used unchecked works by accident
 * in arithmetic and breaks the moment anything compares or formats it.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    company: String(row.company),
    role: String(row.role_title),
    location: (row.location as string | null) ?? null,
    postingUrl: (row.posting_url as string | null) ?? null,
    status: row.status as ApplicationStatus,
    matchScore: toNumber(row.match_score),
    matchEngine: (row.match_engine as EngineId | null) ?? null,
    matchCalibrated: Boolean(row.match_calibrated),
    appliedAt: (row.applied_at as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    priority: Boolean(row.priority),
    resumeId: (row.resume_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    lastActivityAt: String(row.updated_at),
  };
}

/**
 * Every application belonging to a user, most recent activity first.
 *
 * Returns `[]` rather than throwing when persistence is unconfigured. That is what lets the
 * app run with no Supabase variables at all: the Applications screen renders an honest
 * "not configured" state instead of a 500, and the matcher, which needs no database,
 * keeps working.
 */
export async function listApplications(userId: string): Promise<Application[]> {
  if (isDevMode()) return devStore.applications.map(toDevApplication);
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[db] listApplications failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(toApplication);
}

/**
 * One application, or null.
 *
 * Filters on the id AND the user id. Null covers both "no such row" and "not yours", and
 * the caller cannot tell them apart, which is the point. It is what lets the routes answer
 * 404 for a foreign id rather than 403, because a 403 confirms the id is real.
 */
export async function getApplication(userId: string, id: string): Promise<Application | null> {
  if (isDevMode()) {
    const found = devStore.applications.find((row) => row.id === id);
    return found ? toDevApplication(found) : null;
  }
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getApplication failed", { userId, code: error.code });
    return null;
  }

  return data ? toApplication(data as Record<string, unknown>) : null;
}

/**
 * One application with its posting text.
 *
 * Separate from `getApplication` because `posting_text` is by far the largest column on the
 * row, a full job posting, and the list, the score route's ownership check and the
 * dashboard all read applications without ever needing it. Loading it on every read would
 * make the common path pay for the rare one.
 */
export async function getApplicationDetail(
  userId: string,
  id: string,
): Promise<(Application & { postingText: string | null }) | null> {
  if (isDevMode()) {
    const found = devStore.applications.find((row) => row.id === id);
    return found ? { ...toDevApplication(found), postingText: found.postingText } : null;
  }
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("applications")
    .select(`${APPLICATION_COLUMNS}, posting_text`)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db] getApplicationDetail failed", { userId, code: error.code });
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return { ...toApplication(row), postingText: (row.posting_text as string | null) ?? null };
}

/**
 * Create an application for a user.
 *
 * `userId` is stamped from the argument, never read from `input`. The type makes that
 * structural rather than a convention, so a request body cannot hand a row to another
 * account by including a `user_id`.
 */
export async function createApplication(
  userId: string,
  input: ApplicationInput,
): Promise<Application | null> {
  // Writes mutate the in-memory store so the screens are actually exercisable: adding a
  // row, changing a status and starring all behave. It resets when the dev server restarts,
  // which is the right lifetime for a demo.
  if (isDevMode()) {
    const row = {
      id: nextFixtureId("a"),
      userId,
      company: input.company,
      role: input.role,
      location: input.location ?? null,
      postingUrl: input.postingUrl ?? null,
      postingText: input.postingText ?? null,
      status: input.status ?? ("saved" as ApplicationStatus),
      matchScore: null,
      matchEngine: null,
      matchCalibrated: false,
      appliedAt: input.appliedAt ?? null,
      respondedAt: null,
      priority: false,
      resumeId: null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    devStore.applications.unshift(row);
    return toDevApplication(row);
  }

  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("applications")
    .insert({
      user_id: userId,
      company: input.company,
      role_title: input.role,
      location: input.location ?? null,
      posting_url: input.postingUrl ?? null,
      posting_text: input.postingText ?? null,
      status: input.status ?? "saved",
      applied_at: input.appliedAt ?? null,
      notes: input.notes ?? null,
    })
    .select(APPLICATION_COLUMNS)
    .single();

  if (error) {
    console.error("[db] createApplication failed", { userId, code: error.code });
    return null;
  }

  return data ? toApplication(data as Record<string, unknown>) : null;
}

/**
 * Patch an application, scoped to its owner.
 *
 * Only the fields this function names are written. A patch carrying `user_id`, smuggled in
 * from a request body that got past validation, is not forwarded, because the update
 * object is built here rather than spread from the caller's.
 *
 * Returns null when nothing matched, which for a foreign id is the same answer as for a
 * missing one.
 */
export async function updateApplication(
  userId: string,
  id: string,
  patch: ApplicationPatch,
): Promise<Application | null> {
  if (isDevMode()) {
    const found = devStore.applications.find((row) => row.id === id);
    if (!found) return null;
    Object.assign(found, patch, { lastActivityAt: new Date().toISOString() });
    return toDevApplication(found);
  }
  if (!isPersistenceConfigured()) return null;

  const update: Record<string, unknown> = {
    // Any change is activity, and the list sorts on it. Without this, editing a note would
    // leave the row where it was and the ordering would quietly stop meaning anything.
    updated_at: new Date().toISOString(),
  };
  if (patch.company !== undefined) update.company = patch.company;
  if (patch.role !== undefined) update.role_title = patch.role;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.postingUrl !== undefined) update.posting_url = patch.postingUrl;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.appliedAt !== undefined) update.applied_at = patch.appliedAt;
  if (patch.respondedAt !== undefined) update.responded_at = patch.respondedAt;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.resumeId !== undefined) update.resume_id = patch.resumeId;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await getClient()
    .from("applications")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select(APPLICATION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[db] updateApplication failed", { userId, code: error.code });
    return null;
  }

  return data ? toApplication(data as Record<string, unknown>) : null;
}

/** Delete an application, scoped to its owner. Cascades to its analyses and events. */
export async function deleteApplication(userId: string, id: string): Promise<boolean> {
  if (isDevMode()) {
    devStore.applications = devStore.applications.filter((row) => row.id !== id);
    return true;
  }
  if (!isPersistenceConfigured()) return false;

  const { error } = await getClient()
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[db] deleteApplication failed", { userId, code: error.code });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Analyses and the event log
// ---------------------------------------------------------------------------

export interface ApplicationEventRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Persist one scoring run against an application.
 *
 * Three writes, in a deliberate order:
 *
 *   1. **The analysis.** The durable record, append-only, carrying the engine and model id
 *      alongside the number. SPEC Part 3: a score and the model that produced it travel
 *      together or the score history becomes a lie. If this fails, nothing else runs;
 *      there is no result to hang an event or a cached score off.
 *   2. **The event.** The timeline entry. A failure here degrades the timeline; it does not
 *      lose the analysis, so it is logged and the id is still returned.
 *   3. **The cached score on the application.** Denormalized for the list view. Same
 *      reasoning: a stale cache is recoverable, a discarded analysis is not.
 *
 * The caller MUST have established ownership first, and `getApplication` is how, because an
 * insert into `analyses` would otherwise happily point at another user's application. The
 * update in step 3 is scoped anyway, as a second line rather than the only one.
 *
 * Never logs the result text. Engine, model, outcome only (SPEC Part 7).
 */
export async function saveAnalysis(
  userId: string,
  applicationId: string,
  result: ScoreResult,
  /**
   * Whether this scored the user's ORIGINAL resume.
   *
   * Defaults to true, and the default is the safe one: an unflagged analysis counts as
   * evidence about the user, which is only wrong if the caller forgot to say it was
   * tailored. The opposite default would silently drop real evidence.
   *
   * Only `false` when the resume being scored was produced by the Elevate flow. See
   * `lib/career.ts` for why mixing the two corrupts the career profile.
   */
  options: { isBaseline?: boolean; roleTitle?: string | null } = {},
): Promise<string | null> {
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("analyses")
    .insert({
      user_id: userId,
      application_id: applicationId,
      engine: result.engine,
      model_id: result.modelId,
      score: result.score,
      calibrated: result.calibrated,
      is_baseline: options.isBaseline !== false,
      // Denormalised so role affinity needs no join, and so it survives the application
      // being deleted, so the evidence about the user outlives the row it came from.
      role_title: options.roleTitle ?? null,
      result_json: {
        requirements: result.requirements,
        keywords: result.keywords,
        summary: result.summary,
        suggestedBullets: result.suggestedBullets,
        errorBand: result.errorBand,
        rawCosine: result.rawCosine,
        degraded: result.degraded,
      },
      latency_ms: result.latencyMs,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[db] saveAnalysis failed", {
      userId,
      engine: result.engine,
      code: error?.code,
    });
    return null;
  }

  const analysisId = String((data as { id: unknown }).id);

  const { error: eventError } = await getClient()
    .from("application_events")
    .insert({
      application_id: applicationId,
      kind: "analysis_run",
      payload: {
        analysisId,
        engine: result.engine,
        modelId: result.modelId,
        score: result.score,
        calibrated: result.calibrated,
      },
    });

  if (eventError) {
    console.error("[db] saveAnalysis could not append the event", {
      userId,
      code: eventError.code,
    });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // The keyword and base engines deliberately produce no score. Writing a 0 for "no score"
  // would put a number in the history that no engine ever predicted, and the table would
  // render it as a real measurement.
  if (result.score !== null) {
    update.match_score = result.score;
    update.match_engine = result.engine;
    update.match_calibrated = result.calibrated;
  }

  const { error: cacheError } = await getClient()
    .from("applications")
    .update(update)
    .eq("id", applicationId)
    .eq("user_id", userId);

  if (cacheError) {
    console.error("[db] saveAnalysis could not refresh the cached score", {
      userId,
      code: cacheError.code,
    });
  }

  return analysisId;
}

/**
 * Every analysis the user has ever run, flattened for the career engine.
 *
 * Returns the fields `lib/career.ts` needs and nothing else, in particular NOT
 * `result_json`, which carries the full requirement text of every analysis and would be
 * megabytes for an active user. The covered/missing requirement labels are extracted here
 * instead, server-side, so the wire payload stays proportional to the insight.
 *
 * `is_baseline` is selected rather than filtered on, because the caller needs to be able to
 * count tailored runs for display even though only baselines feed the profile.
 */
export async function listAnalysesForProfile(
  userId: string,
  limit = 400,
): Promise<
  Array<{
    roleTitle: string | null;
    score: number | null;
    calibrated: boolean;
    isBaseline: boolean;
    createdAt: string;
    missingRequirements: string[];
    coveredRequirements: string[];
  }>
> {
  if (isDevMode()) return devStore.analyses.map((row) => ({ ...row }));
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("analyses")
    .select("role_title, score, calibrated, is_baseline, created_at, result_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[db] listAnalysesForProfile failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => {
    const result = (row.result_json ?? {}) as { requirements?: unknown };
    const requirements = Array.isArray(result.requirements)
      ? (result.requirements as Array<{ requirement?: unknown; status?: unknown }>)
      : [];

    const covered: string[] = [];
    const missing: string[] = [];
    for (const requirement of requirements) {
      const label = typeof requirement.requirement === "string" ? requirement.requirement : "";
      if (!label) continue;
      if (requirement.status === "covered") covered.push(label);
      else if (requirement.status === "missing") missing.push(label);
    }

    return {
      roleTitle: (row.role_title as string | null) ?? null,
      score: toNumber(row.score),
      calibrated: Boolean(row.calibrated),
      isBaseline: row.is_baseline !== false,
      createdAt: String(row.created_at),
      missingRequirements: missing,
      coveredRequirements: covered,
    };
  });
}

/**
 * The event timeline for one application.
 *
 * `application_events` carries no `user_id` and is scoped through its parent, so
 * ownership is established against `applications` FIRST. Without that check any id at all
 * would read another user's timeline, and RLS would not stop it because the service-role
 * key bypasses RLS by design.
 */
export async function listEvents(
  userId: string,
  applicationId: string,
): Promise<ApplicationEventRow[]> {
  if (isDevMode())
    return devStore.events
      .filter((row) => row.applicationId === applicationId)
      .map(({ id, kind, payload, createdAt }) => ({ id, kind, payload, createdAt }));
  if (!isPersistenceConfigured()) return [];

  const owned = await getApplication(userId, applicationId);
  if (!owned) return [];

  const { data, error } = await getClient()
    .from("application_events")
    .select("id, kind, payload, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] listEvents failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * People the user entered themselves.
 *
 * Every row here describes a third party who never had an account on this service, which
 * makes it the most sensitive table in the schema despite being the simplest. Two rules
 * follow, and they are structural rather than conventional:
 *
 *   1. **Nothing writes this table except the user.** There is no import, no enrichment,
 *      no lookup. `lib/network.ts` documents why that is the whole reason Network could be
 *      built at all while FEATURES.md §6 remains formally deferred.
 *   2. **There is nowhere to accumulate a dossier.** No photo, no social handle, no "last
 *      seen", no activity history. A name, how to reach them, and why they matter to one
 *      application.
 */
export interface Contact {
  id: string;
  userId: string;
  name: string;
  roleTitle: string | null;
  company: string | null;
  email: string | null;
  contactUrl: string | null;
  applicationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  name: string;
  roleTitle?: string | null;
  company?: string | null;
  email?: string | null;
  contactUrl?: string | null;
  applicationId?: string | null;
  notes?: string | null;
}

export type ContactPatch = Partial<ContactInput>;

const CONTACT_COLUMNS =
  "id, user_id, name, role_title, company, email, contact_url, application_id, notes, created_at, updated_at";

function toContact(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    roleTitle: (row.role_title as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    contactUrl: (row.contact_url as string | null) ?? null,
    applicationId: (row.application_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listContacts(userId: string): Promise<Contact[]> {
  if (isDevMode()) return devStore.contacts.map((row) => ({ ...row }));
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] listContacts failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(toContact);
}

export async function createContact(
  userId: string,
  input: ContactInput,
): Promise<Contact | null> {
  if (isDevMode()) {
    const row = {
      id: nextFixtureId("c"),
      userId,
      name: input.name,
      roleTitle: input.roleTitle ?? null,
      company: input.company ?? null,
      email: input.email ?? null,
      contactUrl: input.contactUrl ?? null,
      applicationId: input.applicationId ?? null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    devStore.contacts.unshift(row);
    return { ...row };
  }
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("contacts")
    .insert({
      user_id: userId,
      name: input.name,
      role_title: input.roleTitle ?? null,
      company: input.company ?? null,
      email: input.email ?? null,
      contact_url: input.contactUrl ?? null,
      application_id: input.applicationId ?? null,
      notes: input.notes ?? null,
    })
    .select(CONTACT_COLUMNS)
    .single();

  if (error) {
    // Never the name, never the email. This row is about someone who is not the account
    // holder and never agreed to appear in this service's logs.
    console.error("[db] createContact failed", { userId, code: error.code });
    return null;
  }

  return data ? toContact(data as Record<string, unknown>) : null;
}

export async function updateContact(
  userId: string,
  id: string,
  patch: ContactPatch,
): Promise<Contact | null> {
  if (!isPersistenceConfigured()) return null;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.roleTitle !== undefined) update.role_title = patch.roleTitle;
  if (patch.company !== undefined) update.company = patch.company;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.contactUrl !== undefined) update.contact_url = patch.contactUrl;
  if (patch.applicationId !== undefined) update.application_id = patch.applicationId;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await getClient()
    .from("contacts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select(CONTACT_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[db] updateContact failed", { userId, code: error.code });
    return null;
  }

  return data ? toContact(data as Record<string, unknown>) : null;
}

/**
 * Delete a contact.
 *
 * The one operation on this table that needs no confirmation flow anywhere: removing a
 * record of a third party should be at least as easy as creating it.
 */
export async function deleteContact(userId: string, id: string): Promise<boolean> {
  if (!isPersistenceConfigured()) return false;

  const { error } = await getClient().from("contacts").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    console.error("[db] deleteContact failed", { userId, code: error.code });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------

/**
 * A message the user wrote here and sends themselves.
 *
 * This app never sends anything. See `lib/outreach.ts` for why that is what lets Outreach
 * exist while FEATURES.md §7 stays formally blocked. Two consequences show up in this type:
 * `sentAt` is user-reported rather than system-generated, and there is no recipient list
 * and no schedule column, so bulk and automated sending have nowhere to live.
 */
export interface OutreachMessage {
  id: string;
  userId: string;
  contactId: string | null;
  applicationId: string | null;
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  status: OutreachStatus;
  /** Recorded by the user. This app did not send the message and does not know when it left. */
  sentAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachInput {
  contactId?: string | null;
  applicationId?: string | null;
  channel?: OutreachMessage["channel"];
  subject?: string | null;
  body: string;
}

export interface OutreachPatch {
  subject?: string | null;
  body?: string;
  status?: OutreachStatus;
  sentAt?: string | null;
  repliedAt?: string | null;
}

const OUTREACH_COLUMNS =
  "id, user_id, contact_id, application_id, channel, subject, body, status, sent_at, replied_at, created_at, updated_at";

function toOutreach(row: Record<string, unknown>): OutreachMessage {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    contactId: (row.contact_id as string | null) ?? null,
    applicationId: (row.application_id as string | null) ?? null,
    channel: row.channel as OutreachMessage["channel"],
    subject: (row.subject as string | null) ?? null,
    body: String(row.body),
    status: row.status as OutreachStatus,
    sentAt: (row.sent_at as string | null) ?? null,
    repliedAt: (row.replied_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listOutreach(userId: string): Promise<OutreachMessage[]> {
  if (isDevMode()) return devStore.outreach.map((row) => ({ ...row }));
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("outreach")
    .select(OUTREACH_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[db] listOutreach failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(toOutreach);
}

export async function createOutreach(
  userId: string,
  input: OutreachInput,
): Promise<OutreachMessage | null> {
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("outreach")
    .insert({
      user_id: userId,
      contact_id: input.contactId ?? null,
      application_id: input.applicationId ?? null,
      channel: input.channel ?? "email",
      subject: input.subject ?? null,
      body: input.body,
      status: "draft",
    })
    .select(OUTREACH_COLUMNS)
    .single();

  if (error) {
    // Never the body or the subject, because the message names a person and says something about
    // them, and neither belongs in a log line.
    console.error("[db] createOutreach failed", { userId, code: error.code });
    return null;
  }

  return data ? toOutreach(data as Record<string, unknown>) : null;
}

export async function updateOutreach(
  userId: string,
  id: string,
  patch: OutreachPatch,
): Promise<OutreachMessage | null> {
  if (!isPersistenceConfigured()) return null;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.subject !== undefined) update.subject = patch.subject;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.sentAt !== undefined) update.sent_at = patch.sentAt;
  if (patch.repliedAt !== undefined) update.replied_at = patch.repliedAt;

  const { data, error } = await getClient()
    .from("outreach")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select(OUTREACH_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[db] updateOutreach failed", { userId, code: error.code });
    return null;
  }

  return data ? toOutreach(data as Record<string, unknown>) : null;
}

export async function deleteOutreach(userId: string, id: string): Promise<boolean> {
  if (!isPersistenceConfigured()) return false;

  const { error } = await getClient().from("outreach").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    console.error("[db] deleteOutreach failed", { userId, code: error.code });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Job boards (Hunt)
// ---------------------------------------------------------------------------

/**
 * A saved job board. Hunt is a launcher for these, not a job search engine.
 *
 * It queries no listings, aggregates no postings, and talks to no job API. Searching inside
 * Hunt searches these rows by name. That restraint is what makes the feature shippable
 * honestly today, and it does not block a licensed-feed "find opportunities" feature later.
 */
export interface JobBoard {
  id: string;
  userId: string;
  name: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * The boards every account starts with.
 *
 * Seeded on first read rather than by a migration, because a migration cannot reach a user
 * who signs up tomorrow. Seeding is best-effort: a failure returns the defaults unsaved so
 * the drawer still opens with something useful in it.
 */
export const DEFAULT_JOB_BOARDS = [
  { name: "LinkedIn", url: "https://www.linkedin.com/jobs" },
  { name: "Welcome to the Jungle", url: "https://www.welcometothejungle.com" },
  { name: "Wellfound", url: "https://wellfound.com" },
] as const;

function toJobBoard(row: Record<string, unknown>): JobBoard {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    url: String(row.url),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

export async function listJobBoards(userId: string): Promise<JobBoard[]> {
  if (isDevMode()) return devStore.jobBoards.map((row) => ({ ...row }));
  if (!isPersistenceConfigured()) return [];

  const { data, error } = await getClient()
    .from("job_boards")
    .select("id, user_id, name, url, sort_order, created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[db] listJobBoards failed", { userId, code: error.code });
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map(toJobBoard);
}

export async function createJobBoard(
  userId: string,
  input: { name: string; url: string; sortOrder?: number },
): Promise<JobBoard | null> {
  if (isDevMode()) {
    const row = {
      id: nextFixtureId("b"),
      userId,
      name: input.name,
      url: input.url,
      sortOrder: input.sortOrder ?? devStore.jobBoards.length,
      createdAt: new Date().toISOString(),
    };
    devStore.jobBoards.push(row);
    return { ...row };
  }
  if (!isPersistenceConfigured()) return null;

  const { data, error } = await getClient()
    .from("job_boards")
    .insert({
      user_id: userId,
      name: input.name,
      url: input.url,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id, user_id, name, url, sort_order, created_at")
    .single();

  if (error) {
    console.error("[db] createJobBoard failed", { userId, code: error.code });
    return null;
  }

  return data ? toJobBoard(data as Record<string, unknown>) : null;
}

export async function deleteJobBoard(userId: string, id: string): Promise<boolean> {
  if (isDevMode()) {
    devStore.jobBoards = devStore.jobBoards.filter((row) => row.id !== id);
    return true;
  }
  if (!isPersistenceConfigured()) return false;

  const { error } = await getClient()
    .from("job_boards")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[db] deleteJobBoard failed", { userId, code: error.code });
    return false;
  }
  return true;
}

/**
 * The user's boards, seeding the defaults the first time they have none.
 *
 * Seeding on read rather than at sign-up means it also works for accounts that predate the
 * feature. It is skipped entirely once the user has any board at all, including zero after
 * they deliberately deleted all three, which is why the seed only fires when the insert is
 * against a genuinely empty set and never re-adds a board someone removed on purpose.
 */
export async function listJobBoardsSeeded(userId: string): Promise<JobBoard[]> {
  if (isDevMode()) return devStore.jobBoards.map((row) => ({ ...row }));
  if (!isPersistenceConfigured()) return [];

  const existing = await listJobBoards(userId);
  if (existing.length > 0) return existing;

  // `seeded` is set once, so deleting every board does not re-seed on the next open.
  const { data: profile } = await getClient()
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  const settings = ((profile as { settings?: Record<string, unknown> } | null)?.settings ??
    {}) as Record<string, unknown>;
  if (settings.jobBoardsSeeded) return existing;

  for (const [index, board] of DEFAULT_JOB_BOARDS.entries()) {
    await createJobBoard(userId, { ...board, sortOrder: index });
  }

  const { error } = await getClient()
    .from("profiles")
    .update({ settings: { ...settings, jobBoardsSeeded: true } })
    .eq("id", userId);

  if (error) {
    console.error("[db] could not record the job-board seed", { userId, code: error.code });
  }

  return listJobBoards(userId);
}

// ---------------------------------------------------------------------------
// Waitlist
// ---------------------------------------------------------------------------

export interface WaitlistSignup {
  email: string;
  feature: "network" | "outreach" | "general";
}

/**
 * Record a "notify me" signup for a feature that has not shipped.
 *
 * Deliberately not user-scoped: this is a public, unauthenticated capture from the landing
 * page, and it is the one write in this module that takes no userId. It holds an email and
 * a feature name and nothing else.
 */
export async function joinWaitlist(signup: WaitlistSignup): Promise<boolean> {
  const { error } = await getClient().from("waitlist").insert(signup);

  if (error) {
    // The email is the whole payload here, so it cannot go in the log line.
    console.error("[db] joinWaitlist failed", { feature: signup.feature, code: error.code });
    return false;
  }
  return true;
}

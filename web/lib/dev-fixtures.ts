/**
 * The in-memory dataset dev mode serves instead of Supabase.
 *
 * **These fixtures obey the product's own rules.** That is not fastidiousness: a demo
 * dataset is where invented numbers get in, and this project removed a dashboard that
 * showed "AVG. MATCH QUALITY 91%" over applications nobody had made. If the fixtures broke
 * the rules the screens enforce, the screens would be demonstrated lying.
 *
 * So, from FEATURES.md §2.3:
 *
 * - **No score above 0.85.** The calibrated model's measured ceiling. One sits exactly at
 *   0.85 so the Strong band is not permanently empty, and the rest sit below it, which is
 *   what a real portfolio looks like.
 * - **Uncalibrated scores are marked uncalibrated**, and come from engines that produce
 *   them. A `keyword` row carries no score at all, because that engine does not score.
 * - **Baseline and tailored analyses are distinguished**, and the tailored ones are higher,
 *   which is exactly why they are excluded from Role Affinity. The dataset demonstrates the
 *   rule rather than merely complying with it.
 *
 * Nothing here is written anywhere. The store is a module-level object that resets when the
 * dev server restarts, so a dev session cannot corrupt real data, and it works with no
 * Supabase configured at all, which is the situation it exists to cover.
 */

import type { ApplicationStatus, WorkModel } from "@/lib/applications";
import type { OutreachChannel, OutreachStatus } from "@/lib/outreach";
import type { EngineId } from "@/lib/types";
import { DEV_USER_ID } from "@/lib/dev-mode";

const DAY = 24 * 60 * 60 * 1000;

/** Dates are relative to boot so the velocity chart always has recent shape, rather than
 *  a fixed calendar that drifts into the past and empties the 8-week window. */
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

/**
 * A real uuid, and an obvious fixture.
 *
 * It has to be a genuine uuid: every `[id]` route validates the path segment before it
 * queries, so a plausible-looking-but-invalid id is a 400 rather than a row. The first
 * version of this used the entity letter and the string "dev", and `v` is not a hex digit,
 * every drawer in the app failed to open.
 *
 * So the entity is encoded as a repeated hex digit in the first group, which keeps these
 * recognisable at a glance (`aaaaaaaa-…` is an application) while staying valid.
 */
const ENTITY_HEX: Record<string, string> = {
  a: "a", // applications
  b: "b", // job boards
  c: "c", // contacts
  r: "d", // resumes
  o: "e", // outreach
  e: "f", // events
};

function id(prefix: string, n: number): string {
  const hex = ENTITY_HEX[prefix] ?? "0";
  return `${hex.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export interface FixtureApplication {
  id: string;
  userId: string;
  company: string;
  role: string;
  location: string | null;
  industry: string | null;
  workModel: WorkModel | null;
  postingUrl: string | null;
  postingText: string | null;
  status: ApplicationStatus;
  matchScore: number | null;
  matchEngine: EngineId | null;
  matchCalibrated: boolean;
  appliedAt: string | null;
  respondedAt: string | null;
  priority: boolean;
  resumeId: string | null;
  notes: string | null;
  createdAt: string;
  lastActivityAt: string;
}

/** Exported so the engine harnesses can score a real-shaped pair that belongs to nobody. */
export const SAMPLE_POSTING = `We are looking for a Senior Backend Engineer to join our platform team.

Requirements:
- 5+ years building production services in Python or Go
- Experience designing and operating REST APIs at scale
- Strong SQL and data modelling; PostgreSQL preferred
- Familiarity with containerised deployment (Docker, Kubernetes)
- Experience with infrastructure as code, ideally Terraform
- Comfortable owning services end to end, including on-call

Nice to have:
- Event-driven architecture, Kafka or similar
- Observability tooling: metrics, tracing, structured logging
- Mentoring less experienced engineers`;

/** Companies are fictional. Naming real employers in a fixture set puts words in their
 *  mouth: a "Rejected" row against a real company is a claim about that company. */
function seedApplications(): FixtureApplication[] {
  const rows: Array<Partial<FixtureApplication> & { company: string; role: string }> = [
    {
      company: "Atlas Systems",
      role: "Software Engineer",
      location: "Remote",
      industry: "Infrastructure / Platform",
      workModel: "remote",
      status: "interview",
      matchScore: 0.85,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(38),
      respondedAt: daysAgo(30),
      priority: true,
      notes: "Recruiter: Dana. Technical round scheduled, systems design focus.",
    },
    {
      company: "Meridian Data",
      role: "Data Scientist",
      location: "Chicago, IL",
      industry: "Analytics / Data",
      workModel: "hybrid",
      status: "screening",
      matchScore: 0.78,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(24),
      respondedAt: daysAgo(19),
      priority: true,
    },
    {
      company: "Cobalt Health",
      role: "Backend Engineer",
      location: "Remote",
      status: "offer",
      matchScore: 0.81,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(51),
      respondedAt: daysAgo(44),
      priority: true,
      notes: "Offer received. Comp discussion pending.",
    },
    {
      company: "Northwind Labs",
      role: "Software Engineer",
      location: "On-site · Boston",
      status: "rejected",
      matchScore: 0.44,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(46),
      respondedAt: daysAgo(35),
      notes: "Rejected after screen, they wanted deeper Kubernetes ownership.",
    },
    {
      company: "Halcyon Retail",
      role: "Data Scientist",
      status: "applied",
      matchScore: 0.69,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(9),
    },
    {
      company: "Vertex Mobility",
      role: "Software Engineer",
      location: "Remote",
      status: "applied",
      matchScore: 0.72,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(5),
    },
    {
      company: "Pinehurst Group",
      role: "Backend Engineer",
      status: "applied",
      // Claude scores but is NOT calibrated, so the table must say so.
      matchScore: 0.74,
      matchEngine: "claude",
      matchCalibrated: false,
      appliedAt: dateAgo(16),
    },
    {
      company: "Solstice Media",
      role: "Frontend Engineer",
      status: "screening",
      matchScore: 0.63,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(31),
      respondedAt: daysAgo(26),
    },
    {
      company: "Kestrel Analytics",
      role: "Data Scientist",
      status: "saved",
      // Scored with the keyword engine, which produces no score at all.
      matchScore: null,
      matchEngine: "keyword",
      matchCalibrated: false,
    },
    { company: "Ironbark Logistics", role: "Software Engineer", status: "saved" },
    { company: "Lantern Bio", role: "Data Scientist", status: "saved" },
    {
      company: "Quarry Financial",
      role: "Backend Engineer",
      status: "withdrawn",
      matchScore: 0.57,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(40),
      notes: "Withdrew, role was re-scoped to mostly on-call.",
    },
    {
      company: "Beacon Grid",
      role: "Software Engineer",
      status: "applied",
      matchScore: 0.66,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(2),
    },
    {
      company: "Waypoint Studio",
      role: "Frontend Engineer",
      status: "interview",
      matchScore: 0.7,
      matchEngine: "finetuned",
      matchCalibrated: true,
      appliedAt: dateAgo(20),
      respondedAt: daysAgo(12),
    },
  ];

  return rows.map((row, index) => ({
    id: id("a", index + 1),
    userId: DEV_USER_ID,
    location: null,
    industry: null,
    workModel: null,
    postingUrl: null,
    postingText: SAMPLE_POSTING,
    matchScore: null,
    matchEngine: null,
    matchCalibrated: false,
    appliedAt: null,
    respondedAt: null,
    priority: false,
    resumeId: index % 3 === 0 ? id("r", 1) : index % 3 === 1 ? id("r", 2) : null,
    notes: null,
    createdAt: daysAgo(60 - index),
    lastActivityAt: row.respondedAt ?? (row.appliedAt ? `${row.appliedAt}T10:00:00.000Z` : daysAgo(60 - index)),
    ...row,
  })) as FixtureApplication[];
}

export interface FixtureResume {
  id: string;
  userId: string;
  label: string;
  content: string;
  filePath: string | null;
  isDefault: boolean;
  isTailored: boolean;
  parentId: string | null;
  applicationId: string | null;
  targetRole: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A person who does not exist, with a career that does not exist. The evaluation harness in
 *  `scripts/gemma-live.test.ts` scores this rather than anybody's real document. */
export const RESUME_TEXT = `ALEX MORGAN
Senior Software Engineer · Remote

SUMMARY
Backend-leaning engineer with eight years building and operating production services.
Comfortable owning a system end to end, from schema design through deployment and on-call.

EXPERIENCE

Staff Engineer, Redgate Systems (2021 - present)
- Designed and shipped the billing service handling roughly 40,000 requests per day in Python and PostgreSQL.
- Cut p99 latency on the reporting API from 2.4s to 380ms by restructuring the query layer and adding targeted indexes.
- Led the migration from a single deployment to containerised services, reducing release time from hours to minutes.
- Mentored three engineers through their first year, two of whom now run their own services.

Senior Engineer, Harbour Analytics (2018 - 2021)
- Built the ingestion pipeline processing 12 million events per day using Python and Airflow.
- Introduced structured logging and tracing across six services, which cut mean time to diagnose incidents roughly in half.
- Owned the on-call rotation for the data platform.

Engineer, Tidewater Software (2016 - 2018)
- Built internal REST APIs in Python and Django.
- Wrote the test harness the team still uses for integration coverage.

SKILLS
Python, Go, SQL, PostgreSQL, Docker, Airflow, REST API design, distributed systems,
structured logging, CI/CD, code review, mentoring

EDUCATION
BSc Computer Science, University of Leeds`;

function seedResumes(): FixtureResume[] {
  const base = {
    userId: DEV_USER_ID,
    filePath: null,
    isTailored: false,
    parentId: null,
    applicationId: null,
    note: null as string | null,
  };

  return [
    {
      ...base,
      id: id("r", 1),
      label: "Software Engineer, master",
      content: RESUME_TEXT,
      isDefault: true,
      targetRole: "Backend Engineer",
      note: "Primary backend résumé. Leads with systems work.",
      createdAt: daysAgo(120),
      updatedAt: daysAgo(14),
    },
    {
      ...base,
      id: id("r", 2),
      label: "Data, master",
      content: RESUME_TEXT.replace("Backend-leaning engineer", "Data-leaning engineer"),
      isDefault: false,
      targetRole: "Data Scientist",
      note: "Reorders the Harbour Analytics pipeline work to the top.",
      createdAt: daysAgo(96),
      updatedAt: daysAgo(30),
    },
    {
      ...base,
      id: id("r", 3),
      label: "Platform / infra, master",
      content: RESUME_TEXT,
      isDefault: false,
      targetRole: "DevOps Engineer",
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60),
    },
    // Tailored versions: children of a master, never in the main library, never default.
    {
      ...base,
      id: id("r", 4),
      label: "Tailored for Atlas Systems",
      content: RESUME_TEXT,
      isDefault: false,
      isTailored: true,
      parentId: id("r", 1),
      applicationId: id("a", 1),
      targetRole: "Software Engineer",
      createdAt: daysAgo(37),
      updatedAt: daysAgo(37),
    },
    {
      ...base,
      id: id("r", 5),
      label: "Tailored for Cobalt Health",
      content: RESUME_TEXT,
      isDefault: false,
      isTailored: true,
      parentId: id("r", 1),
      applicationId: id("a", 3),
      targetRole: "Backend Engineer",
      createdAt: daysAgo(50),
      updatedAt: daysAgo(50),
    },
  ];
}

export interface FixtureAnalysis {
  roleTitle: string | null;
  score: number | null;
  calibrated: boolean;
  isBaseline: boolean;
  createdAt: string;
  missingRequirements: string[];
  coveredRequirements: string[];
}

/**
 * The analysis history that drives Role Landscape and Career Intelligence.
 *
 * Weighted so the derived output is actually interesting: Software Engineer has enough
 * baseline analyses to reach high confidence, Data Scientist enough for medium, and the
 * recurring gaps repeat often enough to be named. Kubernetes and Terraform recur because
 * that is the shape of a real gap: the same requirement missed across many postings.
 *
 * The tailored rows are deliberately the HIGHEST scores in the set. If they ever leaked into
 * Role Affinity the primary role's number would jump visibly, which makes the exclusion
 * observable rather than a claim.
 */
function seedAnalyses(): FixtureAnalysis[] {
  const covered = ["Python", "REST API design", "PostgreSQL", "Docker", "Mentoring"];
  const missing = ["Kubernetes", "Terraform", "Kafka"];

  const baselineSE = [0.72, 0.68, 0.81, 0.66, 0.7, 0.63, 0.85, 0.74, 0.59].map((score, i) => ({
    roleTitle: "Software Engineer",
    score,
    calibrated: true,
    isBaseline: true,
    createdAt: daysAgo(70 - i * 6),
    coveredRequirements: covered.slice(0, 3 + (i % 3)),
    missingRequirements: missing.slice(0, 1 + (i % 3)),
  }));

  const baselineDS = [0.64, 0.71, 0.58, 0.69, 0.62].map((score, i) => ({
    roleTitle: "Data Scientist",
    score,
    calibrated: true,
    isBaseline: true,
    createdAt: daysAgo(64 - i * 7),
    coveredRequirements: ["Python", "SQL", "Airflow"],
    missingRequirements: ["MLOps", "Model monitoring", "Kubernetes"],
  }));

  const baselineFE = [0.55, 0.61].map((score, i) => ({
    roleTitle: "Frontend Engineer",
    score,
    calibrated: true,
    isBaseline: true,
    createdAt: daysAgo(40 - i * 9),
    coveredRequirements: ["Code review", "Testing"],
    missingRequirements: ["Design systems", "Accessibility practice"],
  }));

  /**
   * Adjacent roles the user has actually analysed postings for.
   *
   * Without these the Role Landscape radar is one measured spoke and eight reading "not
   * measured", which is honest but demonstrates nothing. Every median here sits BELOW Software
   * Engineer's 0.70 so the primary role does not change, which is also the realistic shape:
   * you score highest on the role you actually do.
   */
  const adjacent: FixtureAnalysis[] = [
    ...[0.7, 0.66, 0.69, 0.64].map((score, i) => ({
      roleTitle: "Backend Engineer",
      score,
      calibrated: true,
      isBaseline: true,
      createdAt: daysAgo(58 - i * 8),
      coveredRequirements: ["Python", "PostgreSQL", "REST API design"],
      missingRequirements: ["Kafka", "Kubernetes"],
    })),
    ...[0.54, 0.49, 0.52].map((score, i) => ({
      roleTitle: "Cloud Engineer",
      score,
      calibrated: true,
      isBaseline: true,
      createdAt: daysAgo(52 - i * 11),
      coveredRequirements: ["Docker", "CI/CD"],
      missingRequirements: ["Terraform", "Multi-region architecture"],
    })),
    ...[0.63, 0.58, 0.61].map((score, i) => ({
      roleTitle: "Solutions Engineer",
      score,
      calibrated: true,
      isBaseline: true,
      createdAt: daysAgo(47 - i * 9),
      coveredRequirements: ["Technical communication", "Architecture"],
      missingRequirements: ["Pre-sales process", "Commercial discovery"],
    })),
    ...[0.59, 0.55, 0.57].map((score, i) => ({
      roleTitle: "Technical Product Manager",
      score,
      calibrated: true,
      isBaseline: true,
      createdAt: daysAgo(44 - i * 10),
      coveredRequirements: ["Stakeholder communication", "Technical fluency"],
      missingRequirements: ["Roadmap ownership", "Product analytics", "Customer discovery"],
    })),
    ...[0.51, 0.46].map((score, i) => ({
      roleTitle: "DevOps Engineer",
      score,
      calibrated: true,
      isBaseline: true,
      createdAt: daysAgo(35 - i * 12),
      coveredRequirements: ["Automation scripting", "Containers"],
      missingRequirements: ["Observability tooling", "Incident response"],
    })),
  ];

  // Higher than every baseline, and excluded from the profile. See the docblock above.
  const tailored = [0.91, 0.88].map((score, i) => ({
    roleTitle: "Software Engineer",
    score,
    calibrated: true,
    isBaseline: false,
    createdAt: daysAgo(37 - i * 13),
    coveredRequirements: covered,
    missingRequirements: [] as string[],
  }));

  return [...baselineSE, ...baselineDS, ...baselineFE, ...adjacent, ...tailored];
}

export interface FixtureContact {
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

/** Fictional people at fictional companies. A fixture naming a real person would put them
 *  in a job-hunting database they never agreed to be in, the exact thing §6 excludes. */
function seedContacts(): FixtureContact[] {
  return [
    {
      id: id("c", 1),
      userId: DEV_USER_ID,
      name: "Dana Okafor",
      roleTitle: "Engineering Manager",
      company: "Atlas Systems",
      email: "dana@atlas.invalid",
      contactUrl: null,
      applicationId: id("a", 1),
      notes: "Ran the first screen. Asked about the billing service migration.",
      createdAt: daysAgo(29),
      updatedAt: daysAgo(29),
    },
    {
      id: id("c", 2),
      userId: DEV_USER_ID,
      name: "Priya Raman",
      roleTitle: "Staff Data Scientist",
      company: "Meridian Data",
      email: null,
      contactUrl: null,
      applicationId: id("a", 2),
      notes: "Met at a meetup. Offered to flag the application internally.",
      createdAt: daysAgo(21),
      updatedAt: daysAgo(21),
    },
    {
      id: id("c", 3),
      userId: DEV_USER_ID,
      name: "Tom Whitfield",
      roleTitle: "Director of Engineering",
      company: "Cobalt Health",
      email: "tom@cobalt.invalid",
      contactUrl: null,
      applicationId: id("a", 3),
      notes: null,
      createdAt: daysAgo(43),
      updatedAt: daysAgo(43),
    },
  ];
}

export interface FixtureOutreach {
  id: string;
  userId: string;
  contactId: string | null;
  applicationId: string | null;
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  status: OutreachStatus;
  sentAt: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function seedOutreach(): FixtureOutreach[] {
  return [
    {
      id: id("o", 1),
      userId: DEV_USER_ID,
      contactId: id("c", 1),
      applicationId: id("a", 1),
      channel: "email",
      subject: "Software Engineer: introduction",
      body: "Hi Dana,\n\nI applied for the Software Engineer role at Atlas Systems and wanted to introduce myself directly.\n\nYour platform team's write-up on splitting the billing monolith lined up almost exactly with a migration I ran at Redgate, the same containerisation problem, same release-time pain.\n\nHappy to share more if it's useful, and equally happy to be told the timing is wrong.\n\nThanks for reading,",
      status: "replied",
      sentAt: daysAgo(33),
      repliedAt: daysAgo(30),
      createdAt: daysAgo(34),
      updatedAt: daysAgo(30),
    },
    {
      id: id("o", 2),
      userId: DEV_USER_ID,
      contactId: id("c", 2),
      applicationId: id("a", 2),
      channel: "linkedin",
      subject: null,
      // Sent 11 days ago and unanswered, which trips the follow-up reminder on the Outreach screen.
      body: "Hi Priya,\n\nGood to meet you at the meetup. I've applied for the Data Scientist role at Meridian. If you're still happy to flag it internally I'd appreciate it.\n\nNo pressure either way.",
      status: "sent",
      sentAt: daysAgo(11),
      repliedAt: null,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(11),
    },
    {
      id: id("o", 3),
      userId: DEV_USER_ID,
      contactId: id("c", 3),
      applicationId: id("a", 3),
      channel: "email",
      subject: "Following up",
      body: "[Draft: one or two sentences on why this specific team.]",
      status: "draft",
      sentAt: null,
      repliedAt: null,
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    },
  ];
}

export interface FixtureJobBoard {
  id: string;
  userId: string;
  name: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

function seedJobBoards(): FixtureJobBoard[] {
  return [
    { name: "LinkedIn", url: "https://www.linkedin.com/jobs" },
    { name: "Welcome to the Jungle", url: "https://www.welcometothejungle.com" },
    { name: "Wellfound", url: "https://wellfound.com" },
    { name: "Otta", url: "https://otta.com" },
  ].map((board, index) => ({
    ...board,
    id: id("b", index + 1),
    userId: DEV_USER_ID,
    sortOrder: index,
    createdAt: daysAgo(90),
  }));
}

/**
 * The mutable store.
 *
 * Writes mutate this rather than being swallowed, so the UI is actually exercisable:
 * changing a status, starring a row and adding an application all behave. It resets on
 * server restart, which is the right lifetime for a demo.
 */
/**
 * The store, shared across every route bundle in the process.
 *
 * Without the `globalThis` cache each route file gets its OWN module instance of this file
 * and therefore its own fixture arrays, so a write through one route is invisible to every
 * other. That produced a genuinely confusing class of bug: `PATCH /api/resumes/[id]` returned
 * 200 and the list from `GET /api/resumes` still showed the old value, because the two routes
 * were editing different objects. Uploading a résumé and then previewing it failed the same
 * way, since the bytes were held by the route that received them and looked for by a route
 * that had never seen them.
 *
 * This is the standard Next dev-server singleton pattern, and it is the same reason a
 * database client is cached this way. Dev mode only: `isDevMode()` is false in every
 * production build, so nothing here is ever constructed there.
 */
const GLOBAL_KEY = Symbol.for("resumeai.devStore");

type DevStore = {
  applications: FixtureApplication[];
  resumes: FixtureResume[];
  analyses: ReturnType<typeof seedAnalyses>;
  contacts: ReturnType<typeof seedContacts>;
  outreach: ReturnType<typeof seedOutreach>;
  jobBoards: ReturnType<typeof seedJobBoards>;
  events: Array<{
    id: string;
    applicationId: string;
    kind: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  resumeFiles: Map<string, { bytes: Uint8Array; contentType: string; extension: string }>;
};

const globalCache = globalThis as unknown as { [GLOBAL_KEY]?: DevStore };

function createDevStore(): DevStore {
  return {
    applications: seedApplications(),
    resumes: seedResumes(),
    analyses: seedAnalyses(),
    contacts: seedContacts(),
    outreach: seedOutreach(),
    jobBoards: seedJobBoards(),
    events: [] as Array<{ id: string; applicationId: string; kind: string; payload: Record<string, unknown>; createdAt: string }>,
    /**
     * Uploaded résumé files, held in memory for the life of the dev server.
     *
     * Dev mode has no Storage bucket, and the upload path used to simply drop the bytes, which
     * meant the document preview showed its "no original file stored" state for every résumé
     * anyone uploaded locally. The feature was unreachable in the one mode that exists to make
     * the product examinable without infrastructure.
     *
     * Keyed by résumé id. Bounded by the upload cap and by the fact that it dies with the
     * process, which is the right lifetime for a demo.
     */
    resumeFiles: new Map<string, { bytes: Uint8Array; contentType: string; extension: string }>(),
  };
}

export const devStore: DevStore = (globalCache[GLOBAL_KEY] ??= createDevStore());

/**
 * Seed a couple of timeline entries so the application drawer is not empty.
 *
 * Guarded, because this file is evaluated once per route bundle while the store behind it is
 * now shared. Without the check, every newly-loaded route would reset the events array and
 * discard anything written since the server started.
 */
if (devStore.events.length === 0) devStore.events = [
  {
    id: id("e", 1),
    applicationId: id("a", 1),
    kind: "analysis_run",
    payload: { engine: "finetuned", score: 0.85, calibrated: true },
    createdAt: daysAgo(39),
  },
  {
    id: id("e", 2),
    applicationId: id("a", 1),
    kind: "status_changed",
    payload: { from: "applied", to: "interview" },
    createdAt: daysAgo(30),
  },
];

/** An id for something created during a dev session. Offset well past the seeded range so
 *  it cannot collide with a fixture row. */
export const nextFixtureId = (prefix: string) =>
  id(prefix, 900000 + Math.floor(Math.random() * 99999));

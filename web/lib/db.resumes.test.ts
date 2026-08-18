import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecorder } from "@/lib/__testing__/supabase-recorder";

const recorder = vi.hoisted(() => {
  // Hoisted so the `vi.mock` factory below can reach it. The factory runs before the
  // module body, so a plain `const` here would be read before initialization.
  return { instance: null as ReturnType<typeof createRecorder> | null };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => recorder.instance!.createClient(),
}));

recorder.instance = createRecorder();
const db = recorder.instance;

import {
  RESUME_BUCKET,
  __resetClientForTests,
  createResume,
  deleteResume,
  getResume,
  listResumes,
  setDefaultResume,
  updateResume,
} from "@/lib/db";

const RESUME_ID = "7c1e0a2b-0000-4000-8000-000000000001";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: RESUME_ID,
    user_id: "user_123",
    label: "Data engineer, 2026",
    content: "Built pipelines in Python and Airflow.",
    file_path: null,
    is_default: true,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  __resetClientForTests();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("with persistence unconfigured", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  it("returns safe empty values and never opens a client", async () => {
    await expect(listResumes("user_123")).resolves.toEqual([]);
    await expect(getResume("user_123", RESUME_ID)).resolves.toBeNull();
    await expect(createResume("user_123", { label: "a", content: "b" })).resolves.toBeNull();
    await expect(updateResume("user_123", RESUME_ID, { label: "a" })).resolves.toBeNull();
    await expect(deleteResume("user_123", RESUME_ID)).resolves.toBe(false);
    await expect(setDefaultResume("user_123", RESUME_ID)).resolves.toBe(false);

    expect(db.log).toHaveLength(0);
  });
});

describe("listResumes", () => {
  // The list view shows labels and dates. Selecting `content` for every row would pull the
  // full text of every resume the user owns to render a picker.
  it("does not fetch the full text of every resume", async () => {
    db.queue("resumes", { data: [row()] });

    await listResumes("user_123");

    const select = db.payload("resumes", "select") as string;
    expect(select).not.toContain("content");
    expect(select).toContain("label");
  });

  it("returns only the caller's rows, newest first", async () => {
    db.queue("resumes", { data: [row(), row({ id: "b" })] });

    const resumes = await listResumes("user_123");

    expect(resumes).toHaveLength(2);
    expect(db.filters("resumes")).toEqual([["user_id", "user_123"]]);
    expect(db.queries("resumes")[0].calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  it("returns an empty list rather than throwing when the query fails", async () => {
    db.queue("resumes", { error: { code: "PGRST301" } });

    await expect(listResumes("user_123")).resolves.toEqual([]);
  });
});

describe("getResume", () => {
  it("filters on the id AND the user id, and includes the text", async () => {
    db.queue("resumes", { data: row() });

    const resume = await getResume("user_123", RESUME_ID);

    expect(resume?.content).toBe("Built pipelines in Python and Airflow.");
    expect(db.filters("resumes")).toEqual([
      ["id", RESUME_ID],
      ["user_id", "user_123"],
    ]);
  });

  it("returns null for another user's resume", async () => {
    db.queue("resumes", { data: null });

    await expect(getResume("user_123", RESUME_ID)).resolves.toBeNull();
  });
});

describe("createResume", () => {
  it("stamps the caller's user id", async () => {
    db.queue("resumes", { data: [] });
    db.queue("resumes", { data: row() });

    await createResume("user_123", { label: "Data engineer, 2026", content: "text" });

    expect(db.payload("resumes", "insert", 1)).toMatchObject({
      user_id: "user_123",
      label: "Data engineer, 2026",
      content: "text",
    });
  });

  /**
   * The first resume is the default, without the user having to say so.
   *
   * Otherwise a brand-new account has exactly one resume and no default, and every screen
   * that reaches for "the default" gets nothing while the obvious answer is sitting right
   * there. Later ones do not steal the flag.
   */
  it("makes the first resume the default automatically", async () => {
    db.queue("resumes", { data: [] });
    db.queue("resumes", { data: row() });

    await createResume("user_123", { label: "First", content: "text" });

    expect(db.payload("resumes", "insert", 1)).toMatchObject({ is_default: true });
  });

  it("does not make a later resume the default", async () => {
    db.queue("resumes", { data: [{ id: "existing" }] });
    db.queue("resumes", { data: row({ is_default: false }) });

    await createResume("user_123", { label: "Second", content: "text" });

    expect(db.payload("resumes", "insert", 1)).toMatchObject({ is_default: false });
  });

  it("returns null rather than throwing when the insert fails", async () => {
    db.queue("resumes", { data: [] });
    db.queue("resumes", { error: { code: "23503" } });

    await expect(createResume("user_123", { label: "a", content: "b" })).resolves.toBeNull();
  });
});

describe("updateResume", () => {
  it("scopes the update to the caller", async () => {
    db.queue("resumes", { data: row() });

    await updateResume("user_123", RESUME_ID, { label: "Renamed" });

    expect(db.filters("resumes")).toEqual([
      ["id", RESUME_ID],
      ["user_id", "user_123"],
    ]);
  });

  // Extraction is imperfect and FEATURES.md §5 says the user should be able to fix it, so
  // editing the text is a first-class operation rather than re-uploading the file.
  it("can replace the extracted text", async () => {
    db.queue("resumes", { data: row() });

    await updateResume("user_123", RESUME_ID, { content: "corrected text" });

    expect(db.payload("resumes", "update")).toMatchObject({ content: "corrected text" });
  });

  it("never writes a user id from the patch", async () => {
    db.queue("resumes", { data: row() });

    await updateResume("user_123", RESUME_ID, { label: "x", userId: "user_attacker" } as never);

    expect(db.payload("resumes", "update")).not.toHaveProperty("user_id");
  });
});

describe("setDefaultResume", () => {
  /**
   * Exactly one default, enforced in two writes: clear every flag for the user, then set
   * the chosen one. Clearing first means a failure between them leaves the user with no
   * default, which is recoverable by picking again. Setting first would leave them with two, and
   * "the default" would then depend on row order, which is not a thing anyone can see or fix.
   */
  it("clears the flag on every other resume before setting it", async () => {
    db.queue("resumes", { error: null });
    db.queue("resumes", { data: row() });

    await expect(setDefaultResume("user_123", RESUME_ID)).resolves.toBe(true);

    expect(db.payload("resumes", "update", 0)).toMatchObject({ is_default: false });
    expect(db.filters("resumes", 0)).toEqual([["user_id", "user_123"]]);

    expect(db.payload("resumes", "update", 1)).toMatchObject({ is_default: true });
    expect(db.filters("resumes", 1)).toEqual([
      ["id", RESUME_ID],
      ["user_id", "user_123"],
    ]);
  });

  it("does not set a new default when clearing the old one failed", async () => {
    db.queue("resumes", { error: { code: "42501" } });

    await expect(setDefaultResume("user_123", RESUME_ID)).resolves.toBe(false);
    expect(db.queries("resumes")).toHaveLength(1);
  });

  it("reports failure when the chosen resume is not the caller's", async () => {
    db.queue("resumes", { error: null });
    db.queue("resumes", { data: null });

    await expect(setDefaultResume("user_123", RESUME_ID)).resolves.toBe(false);
  });
});

describe("deleteResume", () => {
  /**
   * A resume can have an uploaded PDF behind it, and foreign keys cannot reach Supabase
   * Storage. Deleting the row first would orphan the file with nothing left pointing at it,
   * the same failure `deleteAccount` was written to avoid, at a smaller scale.
   */
  it("removes the stored file before the row", async () => {
    db.queue("resumes", { data: row({ file_path: "user_123/resume.pdf" }) });
    db.queueStorage("remove", { error: null });
    db.queue("resumes", { error: null });

    await expect(deleteResume("user_123", RESUME_ID)).resolves.toBe(true);

    expect(db.storage[0]).toMatchObject({
      operation: "remove",
      bucket: RESUME_BUCKET,
      args: [["user_123/resume.pdf"]],
    });
    // Two queries: the ownership read, then the delete. The delete must come after the file.
    expect(db.queries("resumes")).toHaveLength(2);
  });

  it("keeps the row when the file could not be removed, so the delete can be retried", async () => {
    db.queue("resumes", { data: row({ file_path: "user_123/resume.pdf" }) });
    db.queueStorage("remove", { error: { message: "network" } });

    await expect(deleteResume("user_123", RESUME_ID)).resolves.toBe(false);
    expect(db.queries("resumes")).toHaveLength(1);
  });

  it("deletes a resume that has no uploaded file", async () => {
    db.queue("resumes", { data: row({ file_path: null }) });
    db.queue("resumes", { error: null });

    await expect(deleteResume("user_123", RESUME_ID)).resolves.toBe(true);
    expect(db.storage).toHaveLength(0);
  });

  it("refuses to delete another user's resume", async () => {
    db.queue("resumes", { data: null });

    await expect(deleteResume("user_123", RESUME_ID)).resolves.toBe(false);
    expect(db.storage).toHaveLength(0);
    expect(db.queries("resumes")).toHaveLength(1);
  });
});

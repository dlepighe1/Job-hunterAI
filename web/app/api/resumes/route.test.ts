import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
const primaryEmail = vi.fn();
vi.mock("@/lib/auth", () => ({
  getUserIdOrNull: () => getUserIdOrNull(),
  primaryEmail: () => primaryEmail(),
}));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  listResumes: vi.fn(),
  createResume: vi.fn(),
  ensureProfile: vi.fn(),
}));

import { GET, POST } from "@/app/api/resumes/route";
import { createResume, ensureProfile, isPersistenceConfigured, listResumes } from "@/lib/db";
import { MIN_WORDS } from "@/lib/types";

const LONG = "experience building python data pipelines ".repeat(20);

function resume(overrides: Record<string, unknown> = {}) {
  return {
    id: "7c1e0a2b-0000-4000-8000-000000000001",
    userId: "user_123",
    label: "Data engineer, 2026",
    content: LONG,
    filePath: null,
    isDefault: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function create(body: unknown) {
  return POST(
    new Request("http://localhost/api/resumes", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  primaryEmail.mockResolvedValue("person@example.com");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(ensureProfile).mockResolvedValue(true);
  vi.mocked(listResumes).mockResolvedValue([resume()] as never);
  vi.mocked(createResume).mockResolvedValue(resume() as never);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/resumes", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
    expect(listResumes).not.toHaveBeenCalled();
  });

  it("returns the caller's resumes", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(listResumes).toHaveBeenCalledWith("user_123");
  });

  it("503s when persistence is unconfigured", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    expect((await GET()).status).toBe(503);
  });
});

describe("POST /api/resumes", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await create({ label: "a", content: LONG })).status).toBe(401);
    expect(createResume).not.toHaveBeenCalled();
  });

  it("400s without a label", async () => {
    expect((await create({ content: LONG })).status).toBe(400);
    expect(createResume).not.toHaveBeenCalled();
  });

  /**
   * The same floor the matcher enforces. A resume too short to score is a resume that will
   * produce a confident-looking number built on nothing the moment it is used, so better to
   * refuse it at the point of saving than to store it and fail later.
   */
  it("refuses a resume with too little text to score", async () => {
    const response = await create({ label: "Stub", content: "three words only" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toContain(String(MIN_WORDS));
    expect(createResume).not.toHaveBeenCalled();
  });

  it("creates the profile row before the resume that points at it", async () => {
    await create({ label: "Data engineer, 2026", content: LONG });

    expect(ensureProfile).toHaveBeenCalledWith("user_123", "person@example.com");
    expect(vi.mocked(ensureProfile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createResume).mock.invocationCallOrder[0],
    );
  });

  it("stores the resume and returns 201", async () => {
    const response = await create({ label: "  Data engineer, 2026  ", content: LONG });

    expect(response.status).toBe(201);
    expect(createResume).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({ label: "Data engineer, 2026" }),
    );
  });

  it("rejects a body that names a user id", async () => {
    const response = await create({ label: "a", content: LONG, userId: "user_attacker" });

    expect(response.status).toBe(400);
    expect(createResume).not.toHaveBeenCalled();
  });

  // Never log the text. A resume is personal data, and an error path is exactly where it
  // tends to leak into a log line "just for debugging".
  it("keeps the resume text out of the logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await create({ label: "Data engineer, 2026", content: LONG });

    for (const call of info.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("python data pipelines");
    }
  });
});

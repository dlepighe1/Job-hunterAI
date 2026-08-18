import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
const primaryEmail = vi.fn();
vi.mock("@/lib/auth", () => ({
  getUserIdOrNull: () => getUserIdOrNull(),
  primaryEmail: () => primaryEmail(),
}));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  listApplications: vi.fn(),
  createApplication: vi.fn(),
  ensureProfile: vi.fn(),
}));

import { GET, POST } from "@/app/api/applications/route";
import {
  createApplication,
  ensureProfile,
  isPersistenceConfigured,
  listApplications,
} from "@/lib/db";

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: "3f0f4a1e-0000-4000-8000-000000000001",
    userId: "user_123",
    company: "Atlas Systems",
    role: "Data engineer",
    location: null,
    postingUrl: null,
    status: "saved",
    matchScore: null,
    matchEngine: null,
    matchCalibrated: false,
    appliedAt: null,
    notes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    lastActivityAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function list() {
  return GET();
}

function create(body: unknown) {
  return POST(
    new Request("http://localhost/api/applications", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(listApplications).mockResolvedValue([application()] as never);
  vi.mocked(createApplication).mockResolvedValue(application() as never);
  vi.mocked(ensureProfile).mockResolvedValue(true);
  primaryEmail.mockResolvedValue("person@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("GET /api/applications", () => {
  it("401s without a session, and never reads the database", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await list();

    expect(response.status).toBe(401);
    expect(listApplications).not.toHaveBeenCalled();
  });

  it("returns the caller's applications", async () => {
    const response = await list();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ applications: [application()] });
    expect(listApplications).toHaveBeenCalledWith("user_123");
  });

  // 503 rather than 500: nothing is broken, the deployment simply has no database. The
  // message has to say which, because "try again later" is wrong advice for a missing
  // environment variable.
  it("503s with an explanation when persistence is unconfigured", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("NOT_CONFIGURED");
    expect(body.message).toMatch(/Supabase/i);
    expect(listApplications).not.toHaveBeenCalled();
  });
});

describe("POST /api/applications", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    const response = await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(response.status).toBe(401);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("400s on a body that is not JSON", async () => {
    const response = await create("not json {");

    expect(response.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("400s when the company is missing", async () => {
    const response = await create({ role: "Data engineer" });

    expect(response.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("400s on a status outside the seven the schema allows", async () => {
    const response = await create({
      company: "Atlas Systems",
      role: "Data engineer",
      status: "ghosted",
    });

    expect(response.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("creates the application and returns 201", async () => {
    const response = await create({
      company: "  Atlas Systems  ",
      role: "Data engineer",
      status: "applied",
    });

    expect(response.status).toBe(201);
    expect(createApplication).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({ company: "Atlas Systems", role: "Data engineer", status: "applied" }),
    );
  });

  // The session is the only source of identity. The schema is strict, so a body naming a
  // user id is REJECTED rather than having the field quietly dropped: a 400 is visible in
  // a client's own error handling, and a silent drop is not.
  it("rejects a body that names a user id at all", async () => {
    const response = await create({
      company: "Atlas Systems",
      role: "Data engineer",
      userId: "user_attacker",
    });

    expect(response.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("takes the user id from the session", async () => {
    await create({ company: "Atlas Systems", role: "Data engineer" });

    const [userId, input] = vi.mocked(createApplication).mock.calls[0];
    expect(userId).toBe("user_123");
    expect(input).not.toHaveProperty("userId");
    expect(input).not.toHaveProperty("user_id");
  });

  /**
   * `applications.user_id references profiles(id)`, and Clerk owns identity, so there is
   * no profile row until this app makes one. Without this, a brand-new user's very first
   * save fails on a foreign key violation, which surfaces as a flat "could not save" with
   * nothing in the UI to suggest the cause.
   *
   * `ensureProfile` upserts, so this is idempotent and every later create is a no-op write.
   */
  it("creates the profile row before the application that points at it", async () => {
    await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(ensureProfile).toHaveBeenCalledWith("user_123", "person@example.com");
    expect(vi.mocked(ensureProfile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createApplication).mock.invocationCallOrder[0],
    );
  });

  it("does not attempt the insert when the profile could not be created", async () => {
    vi.mocked(ensureProfile).mockResolvedValue(false);

    const response = await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(response.status).toBe(500);
    expect(createApplication).not.toHaveBeenCalled();
  });

  // Clerk always has an email for a signed-in user, but the profile row exists to be a
  // foreign key target, and blocking the first save because the address could not be read
  // would break the feature over a field nothing depends on.
  it("still creates the application when no email could be read", async () => {
    primaryEmail.mockResolvedValue(null);

    const response = await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(response.status).toBe(201);
    expect(ensureProfile).toHaveBeenCalledWith("user_123", "");
  });

  it("500s when the insert fails", async () => {
    vi.mocked(createApplication).mockResolvedValue(null);

    const response = await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(response.status).toBe(500);
  });

  it("503s when persistence is unconfigured", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    const response = await create({ company: "Atlas Systems", role: "Data engineer" });

    expect(response.status).toBe(503);
    expect(createApplication).not.toHaveBeenCalled();
  });
});

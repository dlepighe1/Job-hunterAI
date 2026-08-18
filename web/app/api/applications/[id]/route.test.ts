import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  getApplication: vi.fn(),
  getApplicationDetail: vi.fn(),
  getResume: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
  listEvents: vi.fn(),
}));

import { DELETE, GET, PATCH } from "@/app/api/applications/[id]/route";
import {
  deleteApplication,
  getApplication,
  getApplicationDetail,
  getResume,
  isPersistenceConfigured,
  listEvents,
  updateApplication,
} from "@/lib/db";

const ID = "3f0f4a1e-0000-4000-8000-000000000001";

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
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

/** Next 16 hands route handlers a context whose `params` is a promise. */
function context(id = ID) {
  return { params: Promise.resolve({ id }) };
}

function read(id = ID) {
  return GET(new Request(`http://localhost/api/applications/${id}`), context(id));
}

function patch(body: unknown, id = ID) {
  return PATCH(
    new Request(`http://localhost/api/applications/${id}`, {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    context(id),
  );
}

function remove(id = ID) {
  return DELETE(new Request(`http://localhost/api/applications/${id}`, { method: "DELETE" }), context(id));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(getApplication).mockResolvedValue(application() as never);
  vi.mocked(getApplicationDetail).mockResolvedValue(application() as never);
  vi.mocked(getResume).mockResolvedValue(null);
  vi.mocked(updateApplication).mockResolvedValue(application({ status: "applied" }) as never);
  vi.mocked(deleteApplication).mockResolvedValue(true);
  vi.mocked(listEvents).mockResolvedValue([] as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/applications/[id]", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await read()).status).toBe(401);
    expect(getApplication).not.toHaveBeenCalled();
  });

  it("400s on an id that is not a uuid, without querying", async () => {
    const response = await read("not-a-uuid");

    expect(response.status).toBe(400);
    expect(getApplicationDetail).not.toHaveBeenCalled();
  });

  it("returns the application with its event timeline", async () => {
    vi.mocked(listEvents).mockResolvedValue([
      { id: "e1", kind: "analysis_run", payload: {}, createdAt: "2026-08-02T10:00:00.000Z" },
    ] as never);

    const response = await read();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.application.id).toBe(ID);
    expect(body.events).toHaveLength(1);
  });

  // 404, not 403. A 403 confirms the id names a real row, which is a disclosure in itself,
  // it lets an attacker enumerate valid ids by the status code alone.
  it("404s for an application belonging to another user", async () => {
    vi.mocked(getApplicationDetail).mockResolvedValue(null);

    const response = await read();

    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("application");
  });
});

describe("PATCH /api/applications/[id]", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await patch({ status: "applied" })).status).toBe(401);
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("400s on a status outside the seven the schema allows", async () => {
    const response = await patch({ status: "ghosted" });

    expect(response.status).toBe(400);
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("400s on an empty patch, rather than writing a no-op", async () => {
    const response = await patch({});

    expect(response.status).toBe(400);
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("applies the patch and returns the updated row", async () => {
    const response = await patch({ status: "applied" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.application.status).toBe("applied");
    expect(updateApplication).toHaveBeenCalledWith("user_123", ID, { status: "applied" });
  });

  // Strict schema: a patch naming a user id is refused outright rather than having the
  // field dropped on the way through. The row cannot be reassigned to another account, and
  // the attempt is visible in the response rather than silently ignored.
  it("rejects a patch that names a user id", async () => {
    const response = await patch({ status: "applied", userId: "user_attacker" });

    expect(response.status).toBe(400);
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("never forwards a user id to the database", async () => {
    await patch({ status: "applied" });

    const [userId, , sent] = vi.mocked(updateApplication).mock.calls[0];
    expect(userId).toBe("user_123");
    expect(sent).not.toHaveProperty("userId");
  });

  it("404s when nothing matched, so a foreign id is indistinguishable from a missing one", async () => {
    vi.mocked(updateApplication).mockResolvedValue(null);

    expect((await patch({ status: "applied" })).status).toBe(404);
  });
});

describe("DELETE /api/applications/[id]", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await remove()).status).toBe(401);
    expect(deleteApplication).not.toHaveBeenCalled();
  });

  // The delete itself is scoped to the owner, but it cannot distinguish "deleted nothing"
  // from "deleted a row", so ownership is checked first and a foreign id gets 404 instead
  // of a cheerful 200 that deleted nothing.
  it("404s for an application belonging to another user", async () => {
    vi.mocked(getApplication).mockResolvedValue(null);

    const response = await remove();

    expect(response.status).toBe(404);
    expect(deleteApplication).not.toHaveBeenCalled();
  });

  it("deletes the caller's application", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(deleteApplication).toHaveBeenCalledWith("user_123", ID);
  });

  it("500s when the delete fails", async () => {
    vi.mocked(deleteApplication).mockResolvedValue(false);

    expect((await remove()).status).toBe(500);
  });

  it("503s when persistence is unconfigured", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    expect((await remove()).status).toBe(503);
    expect(deleteApplication).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  updateOutreach: vi.fn(),
  deleteOutreach: vi.fn(),
  getApplication: vi.fn(),
  updateApplication: vi.fn(),
}));

import { DELETE, PATCH } from "@/app/api/outreach/[id]/route";
import {
  deleteOutreach,
  getApplication,
  isPersistenceConfigured,
  updateApplication,
  updateOutreach,
} from "@/lib/db";

const ID = "5d3c1b0a-0000-4000-8000-000000000001";
const APP_ID = "3f0f4a1e-0000-4000-8000-000000000001";

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    userId: "user_123",
    contactId: null,
    applicationId: APP_ID,
    channel: "email",
    subject: "Introduction",
    body: "Hello",
    status: "sent",
    sentAt: "2026-08-01T10:00:00.000Z",
    repliedAt: null,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function application(overrides: Record<string, unknown> = {}) {
  return { id: APP_ID, userId: "user_123", status: "applied", ...overrides };
}

function context(id = ID) {
  return { params: Promise.resolve({ id }) };
}

function patch(body: unknown, id = ID) {
  return PATCH(
    new Request(`http://localhost/api/outreach/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    context(id),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(updateOutreach).mockResolvedValue(message() as never);
  vi.mocked(deleteOutreach).mockResolvedValue(true);
  vi.mocked(getApplication).mockResolvedValue(application() as never);
  vi.mocked(updateApplication).mockResolvedValue(application() as never);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/outreach/[id]", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await patch({ status: "sent" })).status).toBe(401);
    expect(updateOutreach).not.toHaveBeenCalled();
  });

  it("400s on a status outside the four the schema allows", async () => {
    expect((await patch({ status: "bounced" })).status).toBe(400);
    expect(updateOutreach).not.toHaveBeenCalled();
  });

  it("404s for a message the caller does not own", async () => {
    vi.mocked(updateOutreach).mockResolvedValue(null);

    expect((await patch({ status: "sent" })).status).toBe(404);
  });

  /**
   * The one place outreach touches the pipeline. FEATURES.md §4.3 wanted this from email
   * detection and deferred it for needing mailbox access; a reply the user records is the
   * same signal without reading anyone's mail.
   */
  it("advances the linked application when a reply is recorded", async () => {
    vi.mocked(updateOutreach).mockResolvedValue(message({ status: "replied" }) as never);

    const response = await patch({ status: "replied" });

    expect(response.status).toBe(200);
    expect(updateApplication).toHaveBeenCalledWith("user_123", APP_ID, {
      status: "screening",
    });
  });

  // Writing to a contact says nothing about where the application stands, since people write
  // before applying as often as after.
  it("does not touch the application when the message is only marked sent", async () => {
    await patch({ status: "sent" });

    expect(updateApplication).not.toHaveBeenCalled();
  });

  /**
   * `nextStatus` never moves an application backwards. A reply arriving on an application
   * already at interview must not drag it back to screening.
   */
  it("never drags an application backwards on a reply", async () => {
    vi.mocked(updateOutreach).mockResolvedValue(message({ status: "replied" }) as never);
    vi.mocked(getApplication).mockResolvedValue(application({ status: "interview" }) as never);

    await patch({ status: "replied" });

    expect(updateApplication).not.toHaveBeenCalled();
  });

  it("does nothing to the pipeline for a message linked to no application", async () => {
    vi.mocked(updateOutreach).mockResolvedValue(
      message({ status: "replied", applicationId: null }) as never,
    );

    const response = await patch({ status: "replied" });

    expect(response.status).toBe(200);
    expect(getApplication).not.toHaveBeenCalled();
    expect(updateApplication).not.toHaveBeenCalled();
  });

  // The reply is the thing the user recorded. A pipeline write that fails must not report
  // the reply as unsaved, because it was saved.
  it("still succeeds when the pipeline update fails", async () => {
    vi.mocked(updateOutreach).mockResolvedValue(message({ status: "replied" }) as never);
    vi.mocked(updateApplication).mockResolvedValue(null);

    const response = await patch({ status: "replied" });

    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/outreach/[id]", () => {
  it("401s without a session", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect(
      (await DELETE(new Request("http://localhost/api/outreach/x"), context())).status,
    ).toBe(401);
  });

  it("deletes the caller's draft", async () => {
    const response = await DELETE(new Request("http://localhost/api/outreach/x"), context());

    expect(response.status).toBe(200);
    expect(deleteOutreach).toHaveBeenCalledWith("user_123", ID);
  });
});

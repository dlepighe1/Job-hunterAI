import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserIdOrNull = vi.fn();
vi.mock("@/lib/auth", () => ({ getUserIdOrNull: () => getUserIdOrNull() }));

vi.mock("@/lib/db", () => ({
  isPersistenceConfigured: vi.fn(),
  deleteAccount: vi.fn(),
}));

import { DELETE } from "@/app/api/account/route";
import { deleteAccount, isPersistenceConfigured } from "@/lib/db";

function remove(body?: unknown) {
  return DELETE(
    new Request("http://localhost/api/account", {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserIdOrNull.mockResolvedValue("user_123");
  vi.mocked(isPersistenceConfigured).mockReturnValue(true);
  vi.mocked(deleteAccount).mockResolvedValue(true);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/account", () => {
  it("401s without a session, and deletes nothing", async () => {
    getUserIdOrNull.mockResolvedValue(null);

    expect((await remove({ confirm: "DELETE" })).status).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  /**
   * This is the one irreversible operation in the product. A confirmation phrase in the
   * body means a mis-routed fetch, a replayed request, or a curious `DELETE` against the
   * URL cannot erase somebody's account: the caller has to state intent, not just reach
   * the endpoint.
   */
  it("refuses without the typed confirmation", async () => {
    const response = await remove({});

    expect(response.status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match exactly", async () => {
    expect((await remove({ confirm: "delete" })).status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes only the caller's own account", async () => {
    const response = await remove({ confirm: "DELETE" });

    expect(response.status).toBe(200);
    // The id comes from the session. There is no body field that can name a different one.
    expect(deleteAccount).toHaveBeenCalledWith("user_123");
  });

  // deleteAccount returns false when the Storage sweep failed, and it deliberately keeps
  // the profile row in that case so the delete can be retried. Reporting success would
  // tell the user their resumes are gone while the files are still sitting in the bucket.
  it("reports failure rather than claiming a partial delete succeeded", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(false);

    const response = await remove({ confirm: "DELETE" });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toMatch(/not|could/i);
  });

  it("503s when there is no database to delete from", async () => {
    vi.mocked(isPersistenceConfigured).mockReturnValue(false);

    expect((await remove({ confirm: "DELETE" })).status).toBe(503);
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});

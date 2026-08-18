import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

import { getUserIdOrNull, primaryEmail, requireUserId, UnauthorizedError } from "./auth";

beforeEach(() => {
  authMock.mockReset();
  currentUserMock.mockReset();
});

describe("getUserIdOrNull", () => {
  it("returns the userId when signed in", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });
    expect(await getUserIdOrNull()).toBe("user_123");
  });
  it("returns null when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect(await getUserIdOrNull()).toBeNull();
  });
});

describe("primaryEmail", () => {
  it("prefers the address Clerk marks as primary", async () => {
    currentUserMock.mockResolvedValue({
      primaryEmailAddressId: "idn_2",
      emailAddresses: [
        { id: "idn_1", emailAddress: "old@example.com" },
        { id: "idn_2", emailAddress: "current@example.com" },
      ],
    });

    expect(await primaryEmail()).toBe("current@example.com");
  });

  // The profile row exists so foreign keys have a target; the email on it is secondary.
  // Refusing to create one because the primary flag is missing would block the user's first
  // save over a field nothing depends on.
  it("falls back to the first address when no primary is flagged", async () => {
    currentUserMock.mockResolvedValue({
      primaryEmailAddressId: null,
      emailAddresses: [{ id: "idn_1", emailAddress: "only@example.com" }],
    });

    expect(await primaryEmail()).toBe("only@example.com");
  });

  it("returns null when there is no user or no address", async () => {
    currentUserMock.mockResolvedValue(null);
    expect(await primaryEmail()).toBeNull();

    currentUserMock.mockResolvedValue({ primaryEmailAddressId: null, emailAddresses: [] });
    expect(await primaryEmail()).toBeNull();
  });
});

describe("requireUserId", () => {
  it("returns the userId when signed in", async () => {
    authMock.mockResolvedValue({ userId: "user_123" });
    expect(await requireUserId()).toBe("user_123");
  });
  it("throws UnauthorizedError when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(requireUserId()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

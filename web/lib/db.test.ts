import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tables = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
const storage = {
  list: vi.fn(),
  remove: vi.fn(),
};
const storageFrom = vi.fn(() => storage);

/**
 * The Supabase query builder is chainable and terminates in a thenable, so each mocked
 * table is a bag of spies where the terminal call resolves to `{ data, error }`. Building
 * it per-table (rather than one shared builder) is what lets a test assert that the
 * profile delete never ran.
 */
function table(name: string) {
  let entry = tables.get(name);
  if (!entry) {
    const eq = vi.fn().mockResolvedValue({ error: null });
    entry = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn(() => ({ eq })),
      eq,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: entry!.maybeSingle })),
      })),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    tables.set(name, entry);
  }
  return entry;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (name: string) => table(name),
    storage: { from: storageFrom },
  })),
}));

import {
  RESUME_BUCKET,
  __resetClientForTests,
  deleteAccount,
  ensureProfile,
  isPersistenceConfigured,
  joinWaitlist,
} from "@/lib/db";

beforeEach(() => {
  tables.clear();
  vi.clearAllMocks();
  __resetClientForTests();
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  storage.list.mockResolvedValue({ data: [], error: null });
  storage.remove.mockResolvedValue({ error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("isPersistenceConfigured", () => {
  it("is true when both Supabase variables are set", () => {
    expect(isPersistenceConfigured()).toBe(true);
  });

  it("is false when the service-role key is absent", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(isPersistenceConfigured()).toBe(false);
  });

  it("is false when the URL is absent", () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect(isPersistenceConfigured()).toBe(false);
  });
});

describe("ensureProfile", () => {
  it("upserts on the Clerk user id so a repeat call is not an error", async () => {
    await expect(ensureProfile("user_123", "person@example.com")).resolves.toBe(true);

    expect(table("profiles").upsert).toHaveBeenCalledWith(
      { id: "user_123", email: "person@example.com" },
      { onConflict: "id" },
    );
  });

  it("reports failure rather than throwing", async () => {
    table("profiles").upsert.mockResolvedValue({ error: { code: "23505" } });

    await expect(ensureProfile("user_123", "person@example.com")).resolves.toBe(false);
  });
});

describe("joinWaitlist", () => {
  it("inserts the signup", async () => {
    await expect(joinWaitlist({ email: "person@example.com", feature: "network" })).resolves.toBe(
      true,
    );

    expect(table("waitlist").insert).toHaveBeenCalledWith({
      email: "person@example.com",
      feature: "network",
    });
  });

  it("reports failure rather than throwing", async () => {
    table("waitlist").insert.mockResolvedValue({ error: { code: "22001" } });

    await expect(joinWaitlist({ email: "person@example.com", feature: "general" })).resolves.toBe(
      false,
    );
  });
});

describe("deleteAccount", () => {
  it("removes the user's Storage objects before deleting the profile row", async () => {
    storage.list.mockResolvedValue({
      data: [{ name: "resume-a.pdf" }, { name: "resume-b.pdf" }],
      error: null,
    });

    await expect(deleteAccount("user_123")).resolves.toBe(true);

    expect(storageFrom).toHaveBeenCalledWith(RESUME_BUCKET);
    expect(storage.list).toHaveBeenCalledWith("user_123");
    expect(storage.remove).toHaveBeenCalledWith(["user_123/resume-a.pdf", "user_123/resume-b.pdf"]);
    expect(table("profiles").delete).toHaveBeenCalled();
    expect(table("profiles").eq).toHaveBeenCalledWith("id", "user_123");

    // Order matters: the row is the only thing that points at the files. Dropping it first
    // would leave unreachable resumes in Storage, personal data with nothing left to
    // find it by.
    expect(storage.remove.mock.invocationCallOrder[0]).toBeLessThan(
      table("profiles").delete.mock.invocationCallOrder[0],
    );
  });

  it("keeps the profile row when Storage removal fails, so the delete can be retried", async () => {
    storage.list.mockResolvedValue({ data: [{ name: "resume.pdf" }], error: null });
    storage.remove.mockResolvedValue({ error: { message: "network" } });

    await expect(deleteAccount("user_123")).resolves.toBe(false);
    expect(table("profiles").delete).not.toHaveBeenCalled();
  });

  it("keeps the profile row when Storage cannot even be listed", async () => {
    storage.list.mockResolvedValue({ data: null, error: { message: "bucket missing" } });

    await expect(deleteAccount("user_123")).resolves.toBe(false);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(table("profiles").delete).not.toHaveBeenCalled();
  });

  it("still deletes the profile when the user uploaded no files", async () => {
    await expect(deleteAccount("user_123")).resolves.toBe(true);

    expect(storage.remove).not.toHaveBeenCalled();
    expect(table("profiles").delete).toHaveBeenCalled();
  });
});

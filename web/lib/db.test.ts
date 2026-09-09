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

  /**
   * Called before every authenticated write, so the second round-trip is one this process
   * already knows the answer to. A Clerk id is permanent and the row is deleted only by
   * `deleteAccount`, which forgets it.
   */
  it("writes the row once per process, not once per save", async () => {
    await ensureProfile("user_123", "person@example.com");
    await ensureProfile("user_123", "person@example.com");
    await ensureProfile("user_123", "person@example.com");

    expect(table("profiles").upsert).toHaveBeenCalledTimes(1);
  });

  /** The property the cache must not cost: a Clerk-side email change still propagates. */
  it("goes back to the database when the address changes", async () => {
    await ensureProfile("user_123", "person@example.com");
    await ensureProfile("user_123", "moved@example.com");

    expect(table("profiles").upsert).toHaveBeenCalledTimes(2);
    expect(table("profiles").upsert).toHaveBeenLastCalledWith(
      { id: "user_123", email: "moved@example.com" },
      { onConflict: "id" },
    );
  });

  /** Caching an attempt would turn one failed upsert into a process that never retries and
   *  reports success to every later save. */
  it("remembers only a write that succeeded", async () => {
    table("profiles").upsert.mockResolvedValueOnce({ error: { code: "08006" } });

    await expect(ensureProfile("user_123", "person@example.com")).resolves.toBe(false);
    await expect(ensureProfile("user_123", "person@example.com")).resolves.toBe(true);

    expect(table("profiles").upsert).toHaveBeenCalledTimes(2);
  });

  /** Otherwise the next write in this process skips the upsert and fails on the foreign
   *  key, which is the bug the live suite exists to catch. */
  it("forgets a user whose account was deleted", async () => {
    await ensureProfile("user_123", "person@example.com");
    expect(await deleteAccount("user_123")).toBe(true);

    await ensureProfile("user_123", "person@example.com");

    expect(table("profiles").upsert).toHaveBeenCalledTimes(2);
  });
});

describe("joinWaitlist", () => {
  /** Against the unique index on (email, feature): a second "notify me" from the same person
   *  is a success that writes no second row, not an error shown to a visitor. */
  it("records the signup without duplicating it", async () => {
    await expect(joinWaitlist({ email: "person@example.com", feature: "network" })).resolves.toBe(
      true,
    );

    expect(table("waitlist").upsert).toHaveBeenCalledWith(
      { email: "person@example.com", feature: "network" },
      { onConflict: "email,feature", ignoreDuplicates: true },
    );
  });

  it("reports failure rather than throwing", async () => {
    table("waitlist").upsert.mockResolvedValue({ error: { code: "22001" } });

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

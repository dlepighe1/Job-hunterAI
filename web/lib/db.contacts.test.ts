import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecorder } from "@/lib/__testing__/supabase-recorder";

const recorder = vi.hoisted(() => ({
  instance: null as ReturnType<typeof createRecorder> | null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => recorder.instance!.createClient(),
}));

recorder.instance = createRecorder();
const db = recorder.instance;

import {
  __resetClientForTests,
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/lib/db";

const CONTACT_ID = "9a2b4c6d-0000-4000-8000-000000000001";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    user_id: "user_123",
    name: "Dana Okafor",
    role_title: "Engineering manager",
    company: "Atlas Systems",
    email: "dana@example.com",
    contact_url: null,
    application_id: null,
    notes: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
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
    await expect(listContacts("user_123")).resolves.toEqual([]);
    await expect(createContact("user_123", { name: "Dana" })).resolves.toBeNull();
    await expect(updateContact("user_123", CONTACT_ID, { name: "Dana" })).resolves.toBeNull();
    await expect(deleteContact("user_123", CONTACT_ID)).resolves.toBe(false);

    expect(db.log).toHaveLength(0);
  });
});

describe("listContacts", () => {
  it("returns only the caller's contacts", async () => {
    db.queue("contacts", { data: [row()] });

    const contacts = await listContacts("user_123");

    expect(contacts[0].name).toBe("Dana Okafor");
    expect(contacts[0].roleTitle).toBe("Engineering manager");
    expect(db.filters("contacts")).toEqual([["user_id", "user_123"]]);
  });

  it("returns an empty list rather than throwing when the query fails", async () => {
    db.queue("contacts", { error: { code: "PGRST301" } });

    await expect(listContacts("user_123")).resolves.toEqual([]);
  });
});

describe("createContact", () => {
  it("stamps the caller's user id", async () => {
    db.queue("contacts", { data: row() });

    await createContact("user_123", { name: "Dana Okafor", company: "Atlas Systems" });

    expect(db.payload("contacts", "insert")).toMatchObject({
      user_id: "user_123",
      name: "Dana Okafor",
      company: "Atlas Systems",
    });
  });

  /**
   * This row is about a third party who never agreed to be in this service's logs. A failed
   * insert is exactly where a name or an email tends to get added "to help debugging".
   */
  it("keeps the contact's name and email out of the logs when the insert fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.queue("contacts", { error: { code: "23503" } });

    await createContact("user_123", { name: "Dana Okafor", email: "dana@example.com" });

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain("Dana Okafor");
    expect(logged).not.toContain("dana@example.com");
  });

  it("returns null rather than throwing when the insert fails", async () => {
    db.queue("contacts", { error: { code: "23503" } });

    await expect(createContact("user_123", { name: "Dana" })).resolves.toBeNull();
  });
});

describe("updateContact", () => {
  it("scopes the update to the caller", async () => {
    db.queue("contacts", { data: row() });

    await updateContact("user_123", CONTACT_ID, { notes: "Met at a meetup" });

    expect(db.filters("contacts")).toEqual([
      ["id", CONTACT_ID],
      ["user_id", "user_123"],
    ]);
  });

  it("never writes a user id from the patch", async () => {
    db.queue("contacts", { data: row() });

    await updateContact("user_123", CONTACT_ID, { name: "x", userId: "user_attacker" } as never);

    expect(db.payload("contacts", "update")).not.toHaveProperty("user_id");
  });

  it("can clear a field rather than only setting one", async () => {
    db.queue("contacts", { data: row({ email: null }) });

    await updateContact("user_123", CONTACT_ID, { email: null });

    expect(db.payload("contacts", "update")).toMatchObject({ email: null });
  });
});

describe("deleteContact", () => {
  it("scopes the delete to the caller", async () => {
    db.queue("contacts", { error: null });

    await expect(deleteContact("user_123", CONTACT_ID)).resolves.toBe(true);

    expect(db.filters("contacts")).toEqual([
      ["id", CONTACT_ID],
      ["user_id", "user_123"],
    ]);
  });

  it("reports failure rather than throwing", async () => {
    db.queue("contacts", { error: { code: "42501" } });

    await expect(deleteContact("user_123", CONTACT_ID)).resolves.toBe(false);
  });
});

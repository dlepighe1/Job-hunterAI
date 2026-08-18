import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate on the most dangerous switch in the codebase.
 *
 * Every one of these is a test that a bypass cannot be on when it must not be. They are
 * worth more than the feature they guard: dev mode being broken costs an afternoon, dev
 * mode being reachable in production is an unauthenticated read of somebody's data.
 *
 * `vi.resetModules()` between cases because the production hard-fail runs at module load,
 * the module has to be re-imported for each environment under test.
 */

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  setNodeEnv(ORIGINAL_NODE_ENV ?? "test");
});

/**
 * NODE_ENV is typed read-only, so it is redefined rather than assigned. `process.env` is an
 * exotic object that rejects accessor descriptors and partial data descriptors, so all four
 * data-descriptor fields have to be present or it throws.
 */
function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

describe("isDevMode", () => {
  it("is off when the flag is absent", async () => {
    setNodeEnv("development");
    vi.stubEnv("DEV_BYPASS_AUTH", "");

    const { isDevMode } = await import("@/lib/dev-mode");
    expect(isDevMode()).toBe(false);
  });

  it("is on in development with the exact opt-in value", async () => {
    setNodeEnv("development");
    vi.stubEnv("DEV_BYPASS_AUTH", "1");

    const { isDevMode } = await import("@/lib/dev-mode");
    expect(isDevMode()).toBe(true);
  });

  /**
   * The flag is matched literally, not coerced. "true" and "yes" look like an intent to
   * enable and are refused, because a switch this consequential should turn on for exactly one
   * spelling, so nobody enables it by accident with a plausible-looking value.
   */
  it.each(["true", "yes", "on", "TRUE", "0", " 1"])(
    "stays off for the truthy-looking value %j",
    async (value) => {
      setNodeEnv("development");
      vi.stubEnv("DEV_BYPASS_AUTH", value);

      const { isDevMode } = await import("@/lib/dev-mode");
      expect(isDevMode()).toBe(false);
    },
  );

  // The one that matters most.
  it("is off in production even with the flag set", async () => {
    setNodeEnv("production");
    vi.stubEnv("DEV_BYPASS_AUTH", "");

    const { isDevMode } = await import("@/lib/dev-mode");
    expect(isDevMode()).toBe(false);
  });

  it("is off in a test environment without the flag", async () => {
    setNodeEnv("test");
    vi.stubEnv("DEV_BYPASS_AUTH", "");

    const { isDevMode } = await import("@/lib/dev-mode");
    expect(isDevMode()).toBe(false);
  });
});

describe("the production hard-fail", () => {
  /**
   * A production build with the bypass flag set refuses to load at all.
   *
   * There is no configuration in which that combination is what somebody meant, and a
   * process that dies on boot is recoverable in a way that a running server with
   * authentication disabled is not.
   */
  it("refuses to load in production with the flag set", async () => {
    setNodeEnv("production");
    vi.stubEnv("DEV_BYPASS_AUTH", "1");

    await expect(import("@/lib/dev-mode")).rejects.toThrow(/DEV_BYPASS_AUTH/);
  });

  it("loads fine in production without the flag", async () => {
    setNodeEnv("production");
    vi.stubEnv("DEV_BYPASS_AUTH", "");

    await expect(import("@/lib/dev-mode")).resolves.toBeDefined();
  });
});

describe("the fixture identity", () => {
  it("is not shaped like a real Clerk id, so it is obvious if it leaks", async () => {
    setNodeEnv("development");
    const { DEV_USER_ID } = await import("@/lib/dev-mode");

    expect(DEV_USER_ID).not.toMatch(/^user_/);
    expect(DEV_USER_ID).toContain("dev");
  });
});

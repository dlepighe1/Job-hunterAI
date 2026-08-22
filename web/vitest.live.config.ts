import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * The opt-in live-database configuration. **Not** part of `npm test`.
 *
 * SPEC Part 7 requires the default suite to run offline: no model downloads, no API calls,
 * no live database. That rule is what makes the suite fast and deterministic, and it is not
 * being relaxed here — this is a second config, with its own include, run deliberately:
 *
 *     npx vitest run --config vitest.live.config.ts
 *
 * It exists because the mocked database tests cannot see the failures that matter most.
 * They stub at the module boundary, so a foreign-key violation, a NOT NULL, a CHECK
 * constraint, or a numeric overflow all pass happily and then fail against the real project.
 * Applications shipped exactly that way once: nothing called `ensureProfile`, so every new
 * user's first save would have failed, and no mocked test could have caught it.
 *
 * The live specs live under `scripts/` rather than `lib/`, because the default config's
 * include covers `lib`, `app` and `components`. A file named `lib/db.live.test.ts` would
 * match `lib/**\/*.test.ts` and quietly join the offline suite, which is the one outcome
 * this must not have.
 */

/**
 * Read `.env.local` into a plain record.
 *
 * Values are passed to the test process and never logged. Vitest does not load Next's env
 * files, so without this the client would be unconfigured and every persistence path would
 * short-circuit to `null` — the suite would pass by never touching the database, which is
 * the most misleading possible outcome for a test whose entire purpose is to touch it.
 */
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, ".env.local"), "utf8");
  } catch {
    return out;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts"],
    // One file, one database, shared rows. Parallel files would race on cleanup.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      ...loadEnv(),
      // `.env.local` carries DEV_BYPASS_AUTH=1, and dev mode serves in-memory fixtures and
      // opens no Supabase client at all. Left set, every assertion below would pass against
      // the fixture store and prove nothing about the database. Cleared explicitly.
      DEV_BYPASS_AUTH: "",
    },
  },
});

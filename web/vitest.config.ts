import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // `components/` was missing here, which meant a test written under it was collected
    // by nothing and "passed" by never running. The `?(x)` suffix covers `.test.tsx`,
    // which component tests need because they render JSX.
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.ts?(x)",
    ],
    // SPEC Part 7: every test runs offline. No model downloads, no API calls, no live
    // database. The scoring service is reached through `fetch` and Claude through the
    // Anthropic SDK, and both are stubbed in the tests. Nothing here spends a token or
    // opens a socket. These are placeholders so the env getters resolve.
    //
    // SUPABASE_* is deliberately absent: it makes `isPersistenceConfigured()` false by
    // default, so a test that means to exercise a persistence path has to say so.
    env: {
      SCORING_SERVICE_URL: "http://scoring.test",
      ANTHROPIC_API_KEY: "test-key",
    },
  },
});

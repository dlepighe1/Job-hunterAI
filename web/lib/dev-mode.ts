/**
 * Dev mode: sign-in bypassed, screens populated from fixtures, nothing persisted.
 *
 * This exists so the authenticated product can be looked at without a Clerk session or a
 * provisioned database. It is genuinely useful and it is also the most dangerous switch in
 * the codebase: a bypass that reached production would let anyone read the demo user's
 * screens, and worse, would prove that a bypass CAN be on in production.
 *
 * So it is gated three ways, and they are independent on purpose:
 *
 *   1. `NODE_ENV` must not be `production`. A production build cannot enable it at all.
 *   2. `DEV_BYPASS_AUTH` must be exactly `"1"`. Absent, empty, "true", "yes" are all off.
 *      Opting in has to be deliberate rather than the result of a truthy string.
 *   3. If both are somehow contradicted, with a production build carrying the flag set, the app
 *      **refuses to start**. Failing loudly beats a silently open door, and there is no
 *      legitimate configuration in which that combination is what somebody meant.
 *
 * Nothing in dev mode touches Supabase. The fixtures live in memory in
 * `lib/dev-fixtures.ts`, so a dev session cannot write to, corrupt, or read real data, and
 * it works with no database configured at all, which is the state it exists to cover.
 */

/** The flag's exact required value. Not parsed as a boolean; matched as a literal. */
const OPT_IN = "1";

/**
 * Hard failure for the one combination that must never run.
 *
 * Evaluated at module load, so a misconfigured production deploy dies at startup rather
 * than serving one request with authentication disabled. A crash on boot is recoverable in
 * a way that a silent auth bypass is not.
 */
if (process.env.NODE_ENV === "production" && process.env.DEV_BYPASS_AUTH === OPT_IN) {
  throw new Error(
    "DEV_BYPASS_AUTH is set in a production build. This flag disables authentication and " +
      "serves fixture data; it exists for local development only. Refusing to start. " +
      "Unset DEV_BYPASS_AUTH in this environment.",
  );
}

/** Whether the sign-in bypass and fixture data are active. False in every production build. */
export function isDevMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEV_BYPASS_AUTH === OPT_IN;
}

/**
 * The fictional account dev mode signs you in as.
 *
 * Deliberately not a plausible Clerk id (`user_2ab...`). If one of these ever appears in a
 * real database or a log, it should be immediately obvious that it came from here.
 */
export const DEV_USER_ID = "dev-mode-fixture-user";
export const DEV_USER_NAME = "Dev Mode";
export const DEV_USER_EMAIL = "dev@localhost.invalid";

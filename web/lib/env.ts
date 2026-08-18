/**
 * Server-side environment access.
 *
 * Every value is read through a getter, so a missing key throws only when the feature
 * that needs it is actually used. That means the app runs with just SCORING_SERVICE_URL
 * set and the free engines work, while selecting Claude fails with a message that says
 * exactly what to set, instead of the whole app refusing to boot because one optional
 * key is absent.
 *
 * Each namespace also exposes `isConfigured`, which answers the same question without
 * throwing. Routes use it to decide what to offer; the getters are for actually using it.
 *
 * Never import this from a client component: it reads secrets.
 */

export class MissingEnvError extends Error {
  constructor(name: string, hint: string) {
    super(`Missing required environment variable ${name}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

function required(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingEnvError(name, hint);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function isSet(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

export const env = {
  anthropic: {
    get apiKey() {
      return required(
        "ANTHROPIC_API_KEY",
        "Create one at https://console.anthropic.com/settings/keys and add it to web/.env.local",
      );
    },
    /** Sonnet 5 by default: the written-feedback engine is the only one with a per-call
     *  cost, and this is the cheapest model that does the job well. Override with
     *  ANTHROPIC_MODEL. */
    get model() {
      return optional("ANTHROPIC_MODEL", "claude-sonnet-5");
    },
    get isConfigured() {
      return isSet("ANTHROPIC_API_KEY");
    },
  },

  scoringService: {
    /** The FastAPI service hosting the fine-tuned MPNet + Platt calibrator. */
    get url() {
      return required(
        "SCORING_SERVICE_URL",
        "Point this at the Python scoring service (http://localhost:8000 locally, or your container host URL).",
      );
    },
    get isConfigured() {
      return isSet("SCORING_SERVICE_URL");
    },
  },

  supabase: {
    get url() {
      return required("SUPABASE_URL", "Find it in your Supabase project settings > API.");
    },
    /** Service-role key, server-side only. Exposing this to the browser bypasses row-level
     *  security, which SPEC Part 3 relies on as defence in depth. */
    get serviceRoleKey() {
      return required(
        "SUPABASE_SERVICE_ROLE_KEY",
        "Supabase project settings > API > service_role. Server-side only, never expose it to the client.",
      );
    },
    get isConfigured() {
      return isSet("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
    },
  },
} as const;

/**
 * Whether the Claude engine can run at all.
 *
 * Separate from `env.anthropic.isConfigured` only in name, since it reads better at the call
 * site in a route deciding whether to offer a paid engine.
 */
export function hasAnthropicKey(): boolean {
  return env.anthropic.isConfigured;
}

/**
 * Every failure `/api/score` can surface, with the HTTP status it maps to.
 *
 * SPEC §4: "Each failure mode gets a distinct code and a message a user can act on. A rate
 * limit says when to retry. An auth failure blames the configuration, not the user. A cold
 * start says the service is waking. A model refusal is surfaced, never retried silently.
 * Do not collapse these into 'something went wrong'."
 *
 * The distinction that matters most is WAKING vs UNREACHABLE. On a scale-to-zero host the
 * first request after an idle period times out while a container starts and ~420 MB of
 * weights load. That is a "try again in a minute", and it is indistinguishable from a dead
 * service unless the codes are kept apart deliberately.
 */
export type ErrorCode =
  | "INVALID_REQUEST"
  | "TOO_SHORT"
  | "RATE_LIMITED"
  | "REFUSED"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR"
  /** The service is starting up. Retryable, and the UI says so. */
  | "MODEL_SERVICE_WAKING"
  /** The service is not answering at all. Not a cold start. */
  | "MODEL_SERVICE_UNREACHABLE"
  | "NOT_CONFIGURED"
  | "CONFIG_ERROR";

export class AnalyzeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    /** Seconds to wait before retrying. Set for RATE_LIMITED and MODEL_SERVICE_WAKING. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

/** Whether trying again, unchanged, could plausibly succeed. Drives whether the UI offers
 *  a retry button, since offering one for a refusal or a bad key just wastes the user's time. */
export function isRetryable(code: ErrorCode): boolean {
  return code === "RATE_LIMITED" || code === "MODEL_SERVICE_WAKING";
}

/** The JSON body for an error response. Never includes input text (SPEC Part 7). */
export function errorBody(error: AnalyzeError): Record<string, unknown> {
  const body: Record<string, unknown> = { error: error.code, message: error.message };
  if (error.retryAfter !== undefined) body.retryAfter = error.retryAfter;
  return body;
}

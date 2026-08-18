"use client";

import { isRetryable, type ErrorCode } from "@/lib/errors";

export interface AnalyzeFailure {
  code: ErrorCode | "NETWORK";
  message: string;
  retryAfter?: number;
}

/**
 * One failure, explained in terms the user can act on.
 *
 * SPEC §4: "Do not collapse these into 'something went wrong'." The API already keeps the
 * codes apart; this component's job is not to throw that away by rendering them all the
 * same. A cold start gets a retry button and a "this is normal" note. A refusal gets
 * neither, because retrying a refusal just wastes the user's time.
 */
export function ErrorPanel({
  failure,
  onRetry,
}: {
  failure: AnalyzeFailure;
  onRetry?: () => void;
}) {
  const waking = failure.code === "MODEL_SERVICE_WAKING";
  const retryable = failure.code === "NETWORK" || isRetryable(failure.code as ErrorCode);

  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 ${
        waking
          ? "border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-950"
          : "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950"
      }`}
    >
      <p
        className={`font-mono text-xs tracking-wider uppercase ${
          waking ? "text-blue-800 dark:text-blue-300" : "text-rose-800 dark:text-rose-300"
        }`}
      >
        {HEADINGS[failure.code] ?? "Analysis failed"}
      </p>

      <p
        className={`mt-2 text-sm leading-relaxed ${
          waking ? "text-blue-900 dark:text-blue-200" : "text-rose-900 dark:text-rose-200"
        }`}
      >
        {failure.message}
      </p>

      {ADVICE[failure.code] && (
        <p
          className={`mt-2 text-xs leading-relaxed ${
            waking ? "text-blue-800 dark:text-blue-300" : "text-rose-800 dark:text-rose-300"
          }`}
        >
          {ADVICE[failure.code]}
        </p>
      )}

      {retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-current px-4 font-mono text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {failure.retryAfter ? `Try again (wait ${failure.retryAfter}s)` : "Try again"}
        </button>
      )}
    </div>
  );
}

const HEADINGS: Partial<Record<AnalyzeFailure["code"], string>> = {
  MODEL_SERVICE_WAKING: "The model is waking up",
  MODEL_SERVICE_UNREACHABLE: "Can't reach the scoring service",
  RATE_LIMITED: "Too many analyses",
  TOO_SHORT: "Not enough text to score",
  REFUSED: "The model declined this content",
  INVALID_OUTPUT: "Unusable result",
  PROVIDER_ERROR: "The engine failed",
  CONFIG_ERROR: "Server configuration problem",
  NOT_CONFIGURED: "Engine unavailable",
  INVALID_REQUEST: "Bad request",
  NETWORK: "Couldn't reach the server",
};

const ADVICE: Partial<Record<AnalyzeFailure["code"], string>> = {
  MODEL_SERVICE_WAKING:
    "The scoring service sleeps when nobody is using it, and loading the model takes 30 to 60 seconds. This is normal for the first analysis after a quiet period, and a second attempt usually works.",
  MODEL_SERVICE_UNREACHABLE:
    "Keyword coverage doesn't need the model service, so you can still run that engine now.",
  REFUSED: "Retrying won't change this: the model declined the content itself.",
  CONFIG_ERROR:
    "This is a problem with how the server is set up, not with anything you did. Nothing you change here will fix it.",
  NOT_CONFIGURED: "Pick one of the other engines, since the free ones need no configuration.",
};

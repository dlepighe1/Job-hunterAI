/**
 * `GET /health` on the scoring service.
 *
 * The interesting field is `fine_tuned`. The service loads the base model when the
 * fine-tuned weights are missing or fail to load, which keeps it answering requests, but
 * a base-model answer is uncalibrated, and SPEC §2.3 rule 3 requires the product to
 * surface that state rather than serve those numbers as if they were calibrated. That is
 * the whole reason this adapter exists.
 */

import { env } from "@/lib/env";

/** Short on purpose. A health check that blocks for the full cold-start window is not a
 *  health check: the point is a fast answer, and "waking" IS an answer. */
const TIMEOUT_MS = 6_000;

export type ServiceHealth =
  | {
      reachable: true;
      modelId: string;
      calibrator: string | null;
      /** False when the service fell back to the base model. A degraded state. */
      fineTuned: boolean;
    }
  | {
      reachable: false;
      reason: "not_configured" | "waking" | "unreachable";
      message: string;
    };

interface HealthResponse {
  status: string;
  model_id: string;
  calibrator: string | null;
  fine_tuned: boolean;
}

export async function checkScoringService(): Promise<ServiceHealth> {
  if (!env.scoringService.isConfigured) {
    return {
      reachable: false,
      reason: "not_configured",
      message: "SCORING_SERVICE_URL is not set, so no engine that needs the model can run.",
    };
  }

  const baseUrl = env.scoringService.url.replace(/\/$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // A timeout on a scale-to-zero host almost always means the container is cold rather
    // than broken, and those two need different words in front of a user: one says wait,
    // the other says something is wrong. A connection refused is the second kind.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return timedOut
      ? {
          reachable: false,
          reason: "waking",
          message:
            "The scoring service did not answer within 6 seconds. It scales to zero, so it is probably still starting up.",
        }
      : {
          reachable: false,
          reason: "unreachable",
          message: `Could not reach the scoring service at ${baseUrl}.`,
        };
  }

  if (!response.ok) {
    return {
      reachable: false,
      reason: "unreachable",
      message: `The scoring service answered ${response.status} on /health.`,
    };
  }

  let data: HealthResponse;
  try {
    data = (await response.json()) as HealthResponse;
  } catch {
    return {
      reachable: false,
      reason: "unreachable",
      message: "The scoring service returned a /health body that is not JSON.",
    };
  }

  return {
    reachable: true,
    modelId: data.model_id,
    calibrator: data.calibrator ?? null,
    // Absent is treated as degraded, not as healthy. An older service that predates the
    // flag should read as "cannot confirm this is the fine-tuned model", because that is
    // exactly what is true, and the failure this guards against is silent.
    fineTuned: data.fine_tuned === true,
  };
}

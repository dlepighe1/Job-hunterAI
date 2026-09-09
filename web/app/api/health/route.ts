import { NextResponse } from "next/server";

import { isPersistenceConfigured } from "@/lib/db";
import { hasAnthropicKey, hasOpenRouterKey } from "@/lib/env";
import { checkScoringService } from "@/lib/providers/health";

/** Never cached: a health check that answers from last week's cache is worse than none. */
export const dynamic = "force-dynamic";

/**
 * What this deployment can actually do right now.
 *
 * Public and unauthenticated, and deliberately says nothing a stranger could not learn by
 * clicking around: which capabilities are on, and whether the model service is up. No
 * URLs, no key fragments, no user data.
 *
 * `degraded` is the field worth alerting on. It is true when the scoring service is up but
 * serving the base model instead of the fine-tuned one (SPEC §2.3 rule 3), the failure
 * that otherwise looks exactly like success.
 */
export async function GET() {
  const scoring = await checkScoringService();

  const degraded = scoring.reachable && !scoring.fineTuned;

  const body = {
    status: scoring.reachable ? (degraded ? "degraded" : "ok") : "unavailable",
    scoringService: scoring.reachable
      ? {
          reachable: true as const,
          modelId: scoring.modelId,
          calibrator: scoring.calibrator,
          fineTuned: scoring.fineTuned,
          note: degraded
            ? "The service is serving the UN-fine-tuned base model. Scores from it are not calibrated and must not be presented as if they were."
            : null,
        }
      : { reachable: false as const, reason: scoring.reason, message: scoring.message },
    capabilities: {
      // Which engines this deployment can offer, which is a different question from
      // whether the user picked one.
      finetuned: scoring.reachable,
      base: scoring.reachable,
      keyword: true, // pure string matching, no service and no key
      claude: hasAnthropicKey(),
      gemma: hasOpenRouterKey(),
      persistence: isPersistenceConfigured(),
    },
  };

  // 200 while degraded: the deployment is serving traffic, and a load balancer pulling it
  // out would not help. The `status` field is what a human or an alert reads.
  return NextResponse.json(body, { status: scoring.reachable ? 200 : 503 });
}

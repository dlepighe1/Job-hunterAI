import { NextResponse } from "next/server";

import { getUserIdOrNull } from "@/lib/auth";
import { careerInsights, roleAffinities } from "@/lib/career";
import {
  isPersistenceConfigured,
  listAnalysesForProfile,
  listApplications,
  listContacts,
  listResumes,
} from "@/lib/db";

/**
 * Everything the dashboard needs, in one request.
 *
 * Assembled server-side rather than by five parallel client fetches for two reasons. The
 * career derivation needs the full analysis history, which is far larger than the insight
 * it produces, so sending it to the browser to be reduced there would ship megabytes to save
 * a few milliseconds. And the dashboard's own rule is that no metric is computed inline in
 * a component; keeping the derivation here and in `lib/career.ts` is what makes that
 * enforceable.
 *
 * The velocity series is deliberately NOT computed here. It is derived from application
 * dates the client already holds, and duplicating that logic on the server would give the
 * chart two sources of truth.
 */
export async function GET() {
  const userId = await getUserIdOrNull();
  if (!userId) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in to see your dashboard." },
      { status: 401 },
    );
  }

  if (!isPersistenceConfigured()) {
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message:
          "The dashboard summarises stored data, and this deployment has no database configured. The matcher still works and stores nothing.",
      },
      { status: 503 },
    );
  }

  const [applications, resumes, analyses, contacts] = await Promise.all([
    listApplications(userId),
    listResumes(userId),
    listAnalysesForProfile(userId),
    listContacts(userId),
  ]);

  // Baseline only, and the filter lives here rather than in the caller so no future screen
  // can reach past it. See `lib/career.ts` for why mixing the two corrupts the profile.
  const affinities = roleAffinities(analyses);
  const insights = careerInsights(
    analyses,
    applications.map((application) => ({
      status: application.status,
      role: application.role,
    })),
  );

  return NextResponse.json({
    applications,
    resumes: resumes.map((resume) => ({
      id: resume.id,
      label: resume.label,
      isDefault: resume.isDefault,
      isTailored: resume.isTailored,
    })),
    contacts,
    affinities,
    insights,
    counts: {
      applications: applications.length,
      // Masters only. Counting tailored versions would make "8 resumes" mean "2 resumes and
      // 6 rewrites of them", which is a different and much less useful number.
      resumes: resumes.filter((resume) => !resume.isTailored).length,
      tailored: resumes.filter((resume) => resume.isTailored).length,
      contacts: contacts.length,
      baselineAnalyses: analyses.filter((analysis) => analysis.isBaseline).length,
    },
  });
}

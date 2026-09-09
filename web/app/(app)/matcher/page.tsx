"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { useDevIdentity } from "@/components/DevIdentity";
import { SettingsIcon, SpinnerIcon, TrendingUpIcon } from "@/components/icons";
import { AnalysisProgress } from "@/components/matcher/AnalysisProgress";
import { AnalysisReport } from "@/components/matcher/AnalysisReport";
import type { EngineAvailability } from "@/components/matcher/EngineCards";
import { EngineSettingsDrawer } from "@/components/matcher/EngineSettingsDrawer";
import { ResumeInput } from "@/components/matcher/ResumeInput";
import { ErrorPanel, type AnalyzeFailure } from "@/components/matcher/ErrorPanel";
import { SaveResult, type SaveOutcome } from "@/components/matcher/SaveResult";
import { TailorWorkspace } from "@/components/matcher/TailorWorkspace";
import { importantGaps } from "@/lib/analysis-insights";
import { formatAppDate } from "@/lib/format";
import type { TailorResult } from "@/lib/providers/tailor";
import { ENGINE_META, MIN_WORDS, wordCount, type EngineId, type ScoreResult } from "@/lib/types";

const ASSUME_AVAILABLE: EngineAvailability["available"] = {
  finetuned: true,
  base: true,
  keyword: true,
  claude: true,
  gemma: true,
};

const WAKING_AFTER_MS = 8_000;

type Stage = "input" | "analysis" | "tailor";

function firstAvailable(available: EngineAvailability["available"], isGuest: boolean): EngineId {
  const order: EngineId[] = ["finetuned", "base", "keyword"];
  const found = order.find((engine) => available[engine]);
  if (found) return found;
  return !isGuest && available.claude ? "claude" : "finetuned";
}

/**
 * Match and elevate a résumé.
 *
 * Three stages in ONE workspace. Input, analysis and tailoring are the same task continuing,
 * so they are the same page transitioning, because routing between three screens would discard the
 * work in progress and make "go back and change the engine" a navigation problem.
 *
 * The inputs are never cleared by moving between stages. An analysis costs a model call and
 * a tailoring pass costs a paid one; losing the pasted posting because the user pressed back
 * would make them pay for it twice.
 */
function MatcherWorkspace() {
  const { isSignedIn, isLoaded } = useUser();
  const dev = useDevIdentity();
  const params = useSearchParams();
  const handoffId = params.get("resume");
  /**
   * Dev mode counts as signed in here.
   *
   * `DEV_BYPASS_AUTH` is a server flag: the API routes honour it through `isDevMode()`, but
   * Clerk's `useUser` knows nothing about it, so this screen used to render its guest state
   * against a fixture user whose résumés the API would happily return. That made "Choose from
   * Resumes" unreachable in the one mode built for demonstrating the product.
   */
  const isGuest = !dev.active && isLoaded && !isSignedIn;

  const [stage, setStage] = useState<Stage>("input");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [engine, setEngine] = useState<EngineId>("finetuned");
  const [available, setAvailable] = useState(ASSUME_AVAILABLE);

  const [result, setResult] = useState<ScoreResult | null>(null);
  const [failure, setFailure] = useState<AnalyzeFailure | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWaking, setIsWaking] = useState(false);

  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [savingTailored, setSavingTailored] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((health) => {
        if (cancelled || !health?.capabilities) return;
        setAvailable({
          finetuned: Boolean(health.capabilities.finetuned),
          base: Boolean(health.capabilities.base),
          keyword: Boolean(health.capabilities.keyword),
          claude: Boolean(health.capabilities.claude),
          gemma: Boolean(health.capabilities.gemma),
        });
      })
      .catch(() => {
        // A failed health check is not itself worth showing. The engines report their own
        // problems precisely, and guessing here would add a second story.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (wakingTimer.current) clearTimeout(wakingTimer.current);
    };
  }, []);

  /**
   * Pick up a résumé handed over from the Résumés screen.
   *
   * The URL carries the résumé's ID, never its text. A résumé is personal data and SPEC
   * Part 7 keeps it out of URLs specifically: a URL lands in history, in referrers, and in
   * every log the request passes through. An opaque uuid is not the document, and fetching
   * it still requires the session.
   */
  useEffect(() => {
    if (!handoffId) return;
    let cancelled = false;

    fetch(`/api/resumes/${handoffId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.resume?.content) setResumeText(body.resume.content);
      })
      .catch(() => {
        // The picker below still works; a failed handoff is not worth an error panel.
      });

    return () => {
      cancelled = true;
    };
  }, [handoffId]);

  const engineUsable = available[engine] && !(engine === "claude" && isGuest);
  const activeEngine = engineUsable ? engine : firstAvailable(available, isGuest);

  const jdWords = wordCount(jobDescription);
  const resumeWords = wordCount(resumeText);
  const canAnalyze = jdWords >= MIN_WORDS && resumeWords >= MIN_WORDS && !isAnalyzing;

  async function analyze() {
    setIsAnalyzing(true);
    setIsWaking(false);
    setResult(null);
    setFailure(null);
    setStage("analysis");

    wakingTimer.current = setTimeout(() => setIsWaking(true), WAKING_AFTER_MS);

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, resumeText, engine: activeEngine }),
      });
      const data = await response.json();

      if (!response.ok) {
        setFailure({ code: data.error, message: data.message, retryAfter: data.retryAfter });
        return;
      }
      setResult(data as ScoreResult);
    } catch {
      setFailure({
        code: "NETWORK",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      if (wakingTimer.current) clearTimeout(wakingTimer.current);
      setIsWaking(false);
      setIsAnalyzing(false);
    }
  }

  /** Ask for proposed rewrites, then move to the Tailor stage. The analysis stays in state
   *  so returning to it costs nothing. */
  async function elevate() {
    if (!result) return;
    setTailoring(true);
    setTailorError(null);
    setStage("tailor");

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          resumeText,
          gaps: importantGaps(result).map((gap) => gap.label),
          // Rewrite with the engine that just did the analysis, when that engine can write
          // at all. Otherwise a user who deliberately chose the free engine would find the
          // paid one running on their behalf, which is the surprise the whole engine picker
          // exists to prevent. For a non-generative analysis there is nothing to carry over,
          // so the server picks.
          engine:
            result.engine === "claude" || result.engine === "gemma" ? result.engine : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setTailorError(data.message ?? "The rewrite failed.");
        return;
      }
      setTailorResult(data as TailorResult);
    } catch {
      setTailorError("Could not reach the server. Your analysis is unchanged.");
    } finally {
      setTailoring(false);
    }
  }

  /** Save the accepted rewrite as a NEW résumé. The master is never touched. */
  async function saveTailored(tailored: string, accepted: number) {
    setSavingTailored(true);
    setSavedNotice(null);

    try {
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The label is shown in the résumé library, so it uses the same date format
          // as every other date in the product rather than an ISO slice.
          label: `Tailored ${formatAppDate(new Date().toISOString())}`,
          content: tailored,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setSavedNotice(body.message ?? "Could not save the tailored version.");
        return;
      }
      setSavedNotice(
        `Saved as a new résumé with ${accepted} ${accepted === 1 ? "change" : "changes"} applied. Your master is unchanged.`,
      );
    } catch {
      setSavedNotice("Could not reach the server. Nothing was saved.");
    } finally {
      setSavingTailored(false);
    }
  }

  async function saveResultTo(applicationId: string): Promise<SaveOutcome> {
    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, resumeText, engine: activeEngine, applicationId }),
      });
      const data = await response.json();

      if (!response.ok) {
        return { ok: false, message: data.message ?? "Could not save this result." };
      }
      if (data.saved === false) {
        return { ok: false, message: "The analysis ran but could not be stored." };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "Could not reach the server." };
    }
  }

  const steps: Array<{ id: Stage; label: string }> = [
    { id: "input", label: "Input" },
    { id: "analysis", label: "Analysis" },
    { id: "tailor", label: "Tailor" },
  ];
  const stageIndex = steps.findIndex((step) => step.id === stage);

  return (
    <>
      <header className="page-header">
        <span className="page-kicker">MATCHER</span>
        <h1>Match &amp; elevate your résumé</h1>
        <p>
          See how well a résumé aligns with a posting, which requirements it covers, which it
          misses, and what to change. The score measures document relevance and is not a
          prediction that you will be interviewed.
        </p>

        {/* The stepper is a progress indicator, and also the way back. Each completed stage
            is reachable, because reviewing the analysis mid-rewrite is a normal thing to
            want and re-running it would cost another model call. */}
        <ol className="stepper" aria-label="Progress">
          {steps.map((step, index) => (
            <li key={step.id} data-state={index === stageIndex ? "current" : index < stageIndex ? "done" : "todo"}>
              <button
                type="button"
                disabled={index > stageIndex}
                onClick={() => setStage(step.id)}
                aria-current={index === stageIndex ? "step" : undefined}
              >
                <span aria-hidden="true">{index + 1}</span>
                {step.label}
              </button>
            </li>
          ))}
        </ol>

        {isGuest && (
          <p className="notice" data-tone="info" style={{ marginTop: 18 }}>
            <strong>Nothing is stored</strong>
            You&apos;re not signed in, so nothing you paste here is saved: not the résumé,
            not the posting, not the result.{" "}
            <Link href="/sign-up" style={{ color: "var(--cyan)", textDecoration: "underline" }}>
              Create an account
            </Link>{" "}
            to keep results and track applications.
          </p>
        )}
      </header>

      {stage === "input" && (
        <>
          {/*
            One horizontal row: the engine, its settings, and the primary action pushed right.
            It replaces a column of four engine cards plus a Match Setup summary panel, which
            between them described three engines the user had not picked and restated inputs
            already visible beside them.

            Load Example is gone with them. It filled both boxes with a fixture, which is a
            demo affordance on a screen whose whole job is the user's own documents.
          */}
          <div className="engine-row">
            <div className="engine-row__picker">
              <label htmlFor="matcher-engine">Engine</label>
              <select
                id="matcher-engine"
                className="nm-input"
                value={activeEngine}
                disabled={isAnalyzing}
                onChange={(event) => setEngine(event.target.value as EngineId)}
              >
                {/*
                  Names only, which is what the brief asks for. The one exception is an
                  engine that cannot run: selecting it would silently fall back to another
                  and score with something the user did not choose, so it says so and is
                  disabled. The engine cards this replaced disabled them too.
                */}
                {(Object.keys(ENGINE_META) as EngineId[]).map((engine) => {
                  const blocked =
                    !available[engine] || (engine === "claude" && isGuest);
                  return (
                    <option key={engine} value={engine} disabled={blocked}>
                      {ENGINE_META[engine].name}
                      {blocked ? " (unavailable)" : ""}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                className="icon-button"
                aria-label="Engine settings"
                title="Engine settings"
                onClick={() => setEngineSettingsOpen(true)}
                disabled={isAnalyzing}
              >
                <SettingsIcon />
              </button>
            </div>

            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className="button button--primary engine-row__action"
            >
              {isAnalyzing ? (
                <>
                  <SpinnerIcon className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <TrendingUpIcon className="h-4 w-4" />
                  Analyze match
                </>
              )}
            </button>
          </div>

          {/*
            Two things the dropdown alone cannot say, and both change how the next click
            behaves. Neither existed while four engine cards carried their own descriptions
            beside the workspace; compressing that into a name-only picker dropped them, and
            a user whose engine was swapped out from under them deserves to be told.
          */}
          {engine !== activeEngine && (
            <p className="engine-row__note" data-tone="warn" role="status">
              {ENGINE_META[engine].name} is unavailable right now, so{" "}
              {ENGINE_META[activeEngine].name} will run instead.
            </p>
          )}

          {!ENGINE_META[activeEngine].capabilities.score && (
            <p className="engine-row__note" role="status">
              {ENGINE_META[activeEngine].name} reports requirement coverage and keyword gaps
              rather than a score. Nothing here will produce a number.
            </p>
          )}

          <div className="matcher-workspace">
            <section className="matcher-field">
              <div className="field__head">
                <h2>Job description</h2>
                <span className="field__count" data-short={jdWords > 0 && jdWords < MIN_WORDS}>
                  {jdWords} {jdWords === 1 ? "word" : "words"}
                </span>
              </div>
              <p className="field__hint">
                Paste the full posting, including the requirements section, since that&apos;s
                where the ranking gets its signal.
              </p>
              <textarea
                id="job-description"
                className="nm-textarea"
                rows={14}
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                disabled={isAnalyzing}
                placeholder="Paste the job description here…"
                aria-label="Job description"
              />
            </section>

            <ResumeInput
              value={resumeText}
              onChange={setResumeText}
              words={resumeWords}
              disabled={isAnalyzing}
              isGuest={isGuest}
            />
          </div>

          {!canAnalyze && !isAnalyzing && (jdWords > 0 || resumeWords > 0) && (
            <p className="field__hint">
              Both texts need at least {MIN_WORDS} words. Below that there isn&apos;t enough
              signal to score honestly.
            </p>
          )}

          <EngineSettingsDrawer
            open={engineSettingsOpen}
            onClose={() => setEngineSettingsOpen(false)}
            value={activeEngine}
            onChange={setEngine}
            availability={{ available, isGuest }}
          />
        </>
      )}

      {stage === "analysis" && (
        <div aria-live="polite" aria-busy={isAnalyzing}>
          {isAnalyzing && <AnalysisProgress isWaking={isWaking} />}

          {!isAnalyzing && failure && (
            <>
              <ErrorPanel failure={failure} onRetry={analyze} />
              {/* §93: a failed engine must not cost the user their inputs. */}
              <div className="page-actions">
                <button type="button" className="button button--ghost" onClick={() => setStage("input")}>
                  Back to input, your text is still there
                </button>
              </div>
            </>
          )}

          {!isAnalyzing && result && (
            <>
              <AnalysisReport
                result={result}
                isGuest={isGuest}
                onElevate={elevate}
                canElevate={!isGuest}
              />
              <SaveResult engine={activeEngine} isGuest={isGuest} onSave={saveResultTo} />
            </>
          )}
        </div>
      )}

      {stage === "tailor" && (
        <div aria-live="polite">
          {tailoring && <AnalysisProgress isWaking={false} />}

          {!tailoring && tailorError && (
            <div className="notice" data-tone="error" role="alert">
              <strong>The rewrite did not run</strong>
              {tailorError}
              <div className="page-actions">
                <button type="button" className="button button--ghost" onClick={() => setStage("analysis")}>
                  Back to analysis
                </button>
              </div>
            </div>
          )}

          {!tailoring && tailorResult && (
            <>
              {savedNotice && (
                <p className="notice" data-tone="info" role="status">
                  <strong>Saved</strong>
                  {savedNotice}
                </p>
              )}
              <TailorWorkspace
                original={resumeText}
                changes={tailorResult.changes}
                notAdded={tailorResult.notAdded}
                onSave={saveTailored}
                onBack={() => setStage("analysis")}
                saving={savingTailored}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

/** `useSearchParams` needs a Suspense boundary, or Next opts the whole route into
 *  client-side rendering at build time and fails the build. */
export default function MatcherPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
      <MatcherWorkspace />
    </Suspense>
  );
}

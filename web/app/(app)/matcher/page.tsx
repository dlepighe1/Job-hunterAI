"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { SpinnerIcon, TrendingUpIcon } from "@/components/icons";
import { AnalysisProgress } from "@/components/matcher/AnalysisProgress";
import { AnalysisReport } from "@/components/matcher/AnalysisReport";
import { EngineCards, type EngineAvailability } from "@/components/matcher/EngineCards";
import { ErrorPanel, type AnalyzeFailure } from "@/components/matcher/ErrorPanel";
import { SaveResult, type SaveOutcome } from "@/components/matcher/SaveResult";
import { SavedResumePicker } from "@/components/matcher/SavedResumePicker";
import { TailorWorkspace } from "@/components/matcher/TailorWorkspace";
import { importantGaps } from "@/lib/analysis-insights";
import { EXAMPLE_JD, EXAMPLE_RESUME } from "@/lib/examples";
import type { TailorResult } from "@/lib/providers/tailor";
import { MIN_WORDS, wordCount, type EngineId, type ScoreResult } from "@/lib/types";

const ASSUME_AVAILABLE: EngineAvailability["available"] = {
  finetuned: true,
  base: true,
  keyword: true,
  claude: true,
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
  const params = useSearchParams();
  const handoffId = params.get("resume");
  const isGuest = isLoaded && !isSignedIn;

  const [stage, setStage] = useState<Stage>("input");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [engine, setEngine] = useState<EngineId>("finetuned");
  const [available, setAvailable] = useState(ASSUME_AVAILABLE);

  const [result, setResult] = useState<ScoreResult | null>(null);
  const [failure, setFailure] = useState<AnalyzeFailure | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWaking, setIsWaking] = useState(false);

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
          label: `Tailored ${new Date().toISOString().slice(0, 10)}`,
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

  function loadExample() {
    setJobDescription(EXAMPLE_JD);
    setResumeText(EXAMPLE_RESUME);
    setResult(null);
    setFailure(null);
    setStage("input");
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
        <div className="matcher-grid">
          <div className="space-y-5">
            <TextAreaField
              id="job-description"
              label="Job description"
              hint="Paste the full posting, including the requirements section, since that's where the ranking gets its signal."
              value={jobDescription}
              onChange={setJobDescription}
              words={jdWords}
              disabled={isAnalyzing}
            />

            {!isGuest && (
              <SavedResumePicker
                onLoad={setResumeText}
                disabled={isAnalyzing}
                fieldIsEmpty={resumeText.length === 0}
              />
            )}

            <TextAreaField
              id="resume"
              label="Résumé"
              hint="Paste the résumé text, or choose a saved one above. Upload a PDF on the Résumés screen."
              value={resumeText}
              onChange={setResumeText}
              words={resumeWords}
              disabled={isAnalyzing}
            />
          </div>

          <div className="space-y-5">
            <EngineCards
              value={activeEngine}
              onChange={setEngine}
              availability={{ available, isGuest }}
              disabled={isAnalyzing}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={analyze}
                disabled={!canAnalyze}
                className="button button--primary"
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

              <button
                type="button"
                onClick={loadExample}
                disabled={isAnalyzing}
                className="button button--ghost"
              >
                Load example
              </button>
            </div>

            {!canAnalyze && !isAnalyzing && (jdWords > 0 || resumeWords > 0) && (
              <p className="field__hint">
                Both texts need at least {MIN_WORDS} words. Below that there isn&apos;t enough
                signal to score honestly.
              </p>
            )}
          </div>
        </div>
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

function TextAreaField({
  id,
  label,
  hint,
  value,
  onChange,
  words,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  words: number;
  disabled: boolean;
}) {
  const short = words > 0 && words < MIN_WORDS;

  return (
    <div>
      <div className="field__head">
        <label htmlFor={id}>{label}</label>
        <span className="field__count" data-short={short}>
          {words} {words === 1 ? "word" : "words"}
          {short && ` , need ${MIN_WORDS} in total`}
        </span>
      </div>

      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={12}
        aria-describedby={`${id}-hint`}
        className="nm-textarea"
        placeholder={`Paste the ${label.toLowerCase()} here…`}
      />

      <p id={`${id}-hint`} className="field__hint">
        {hint}
      </p>
    </div>
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

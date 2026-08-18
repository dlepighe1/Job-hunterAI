import Link from "next/link";

import { MarketingNav } from "@/app/(marketing)/_components/MarketingNav";
import { WaitlistCapture } from "@/app/(marketing)/_components/WaitlistCapture";
import { ObsidianBackdrop } from "@/components/backdrop/ObsidianBackdrop";
import { HeroShowcase } from "@/components/hero/HeroShowcase";
import { Reveal } from "@/components/Reveal";
import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  EyeOffIcon,
  LockIcon,
  SendIcon,
  ShieldIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/icons";

/**
 * The public landing page.
 *
 * Section order changed deliberately. The evidence section used to sit directly under the
 * hero, which meant the first thing a visitor read after the headline was a disclaimer:
 * "this is not a percentage fit, it does not predict interviews". That is true and it stays
 * on the page, but leading with it reads as apology rather than rigour. Capability first,
 * then the measurement that backs it: the 0.83 correlation is a credential when it is framed
 * as methodology and a warning label when it is framed as a caveat.
 *
 * Section names were engineering-status voice: "Built in order", "Not yet built", "In
 * build". A visitor does not care about build sequence. They are product voice now, and the
 * honesty they carried is intact: a deferred feature still says it is deferred and still says
 * why.
 *
 * Every claim here survives SPEC Appendix B. No percentage fit, no invented company logos,
 * no named users, no tier that does not exist.
 */
function Mark() {
  return (
    <span className="marketing-mark">
      <span>R</span> ResumeAI
    </span>
  );
}

export default function MarketingHome() {
  return (
    <div className="marketing-shell">
      <ObsidianBackdrop />
      <MarketingNav />

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow">
              <i /> A private workspace for one job search
            </div>
            <h1>
              Find out what your resume is <em>missing.</em>
            </h1>
            <p className="hero-lede">
              Score a resume against a posting, see which requirements it doesn&apos;t
              evidence, and find the terms an applicant tracking system would fail to match.
              Built on a model that publishes its evaluation, including where it goes wrong.
            </p>
            <div className="hero-actions">
              <Link href="/matcher" className="button button--primary">
                Try it, no account needed
                <ArrowUpRightIcon />
              </Link>
              <a href="#evidence" className="button button--ghost">
                See the evidence
              </a>
            </div>
            {/* Prose, not three pills. These were identical capsules with identical dots, which is
                badge soup, the pattern that signals "trust me" instead of earning it. The
                three claims are also not the same kind of thing: one is a guarantee, one a
                capability, one a refusal. A sentence can carry that; a row of matching
                chips flattens them into decoration. */}
            <p className="trust-line">
              Nothing stored for guests. Every match traced back to a sentence. No automated
              emailing, ever.
            </p>
          </div>

          <HeroShowcase />
        </section>

        <ProductPreview />

        <section className="platform-section" id="platform">
          <Reveal>
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  <i /> The platform
                </div>
                <h2>Everything for one job search.</h2>
              </div>
              <p>
                Four surfaces, one workspace. Two of them are deliberately unbuilt, and the
                reason is not engineering effort. It is that they touch other people&apos;s
                data before they touch yours.
              </p>
            </div>
          </Reveal>

          <div className="feature-grid">
            <Link href="/matcher" className="feature-link">
              <article data-state="live">
                <div className="feature-icon">
                  <TargetIcon />
                </div>
                <span>Available now</span>
                <h3>Matcher</h3>
                <p>
                  Score a resume against a posting, with requirement coverage and ranked
                  keyword gaps. Works without an account.
                </p>
                <b>Open the matcher ↗</b>
              </article>
            </Link>

            <article data-state="next">
              <div className="feature-icon">
                <BriefcaseIcon />
              </div>
              <span>In development</span>
              <h3>Applications</h3>
              <p>
                Every application and its status in one table, with the score attached, and
                plotted over time, so you can see whether tailoring actually helped.
              </p>
              <b>Next release</b>
            </article>

            <article>
              <div className="feature-icon">
                <UsersIcon />
              </div>
              <span>On the roadmap</span>
              <h3>Network</h3>
              <p>
                The people behind an application. Held back until we can answer where company
                data comes from and what may be stored about someone who never signed up here.
              </p>
              <b>Not built</b>
            </article>

            <article>
              <div className="feature-icon">
                <SendIcon />
              </div>
              <span>On the roadmap</span>
              <h3>Outreach</h3>
              <p>
                Drafting and sending cold contact. Held back until consent, unsubscribe and
                sending reputation have real answers rather than a checkbox.
              </p>
              <b>Not built</b>
            </article>
          </div>
        </section>

        <section className="precision-section" id="evidence">
          <div className="section-copy">
            <div className="eyebrow">
              <i /> How we measure it
            </div>
            <h2>Scored against held-out data.</h2>
            <p>
              The model was evaluated on 106 pairs from 53 postings it never saw in training,
              across three seeds, and the numbers are published rather than summarised. It
              ranks how closely two documents match, a signal for deciding which of twenty
              postings deserves your afternoon, not a prediction of whether you will be
              interviewed.
            </p>
            <div className="proof-list">
              <div>
                <span>01</span>
                <p>
                  <b>Requirement coverage</b>Each requirement marked covered, partial or
                  missing, next to the resume sentence it matched, so you can disagree with
                  it.
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <b>Ranked keyword gaps</b>Ordered by how prominently the posting asks for
                  them. Not by predicted score movement, which nobody has measured.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <b>Stated calibration</b>Every score says whether it was calibrated. An
                  uncalibrated number is not comparable to a calibrated one.
                </p>
              </div>
            </div>
          </div>

          {/* Precision-flat, deliberately. This is the densest cluster of measured values
              on the page, and neumorphic shadow around each row would both cost the space
              the numbers need and blur the boundaries a reader is comparing across. The
              neumorphic card is the case; the readout inside it is flat and edged. */}
          <Reveal delay={80}>
            <div className="analysis-card">
              <div className="analysis-card__top">
                <span>MEASURED ON HELD-OUT DATA</span>
                <small>106 PAIRS</small>
              </div>

              <div className="pf-panel" style={{ marginTop: 20 }}>
                <div className="pf-stat">
                  <small>Correlation with reference labels</small>
                  <strong>0.83 ± 0.02</strong>
                  <div className="pf-meter">
                    <i style={{ width: "83%" }} />
                  </div>
                  <p>
                    Spearman, across three seeds, on 106 pairs from 53 postings the model
                    never saw in training.
                  </p>
                </div>

                <div className="pf-panel__head">Supporting measures</div>

                <div className="pf-row">
                  <span>Mean absolute error</span>
                  <b>0.12 ± 0.01</b>
                </div>
                <div className="pf-row">
                  <span>Top-1 accuracy across 53 postings</span>
                  <b>85% (73–92%)</b>
                </div>
                <div className="pf-row">
                  <span>Random baseline</span>
                  <b>25%</b>
                </div>
              </div>

              <p className="analysis-note">
                The intervals are wide because the test set is small, and they are quoted for
                that reason. The labels are synthetic: these figures measure fidelity to a
                scoring rubric, not to recruiter judgement.
              </p>
            </div>
          </Reveal>
        </section>

        <section className="security-section" id="privacy">
          <div>
            <div className="eyebrow">
              <i /> Privacy
            </div>
            <h2>Your resume never leaves your control.</h2>
            <p>
              A resume names you, where you have worked and what you were paid to do. It is
              treated as personal data throughout, not as a document to be processed.
            </p>
          </div>
          <div className="security-grid">
            <article>
              <span>
                <EyeOffIcon />
              </span>
              <div>
                <b>Guests store nothing</b>
                <p>
                  Run the matcher without an account and nothing is written down: not the
                  resume, not the posting, not the result.
                </p>
              </div>
            </article>
            <article>
              <span>
                <LockIcon />
              </span>
              <div>
                <b>Never in a log</b>
                <p>
                  Resume and posting text never reaches a log line, a URL, or an analytics
                  event. Only the engine, model and timing are recorded.
                </p>
              </div>
            </article>
            <article>
              <span>
                <ShieldIcon />
              </span>
              <div>
                <b>No sharing to leak</b>
                <p>
                  There is no public link feature. Nothing you analyse can be read by anyone
                  else, because there is no mechanism by which it could be.
                </p>
              </div>
            </article>
          </div>
        </section>

        <WaitlistCapture />

        <section className="final-cta">
          <div>
            <small>NO ACCOUNT REQUIRED</small>
            <h2>
              See what a posting is <em>actually</em> asking for.
            </h2>
          </div>
          <Link href="/matcher" className="button button--primary">
            Start the matcher
            <ArrowUpRightIcon />
          </Link>
        </section>
      </main>

      <footer className="marketing-footer">
        <Mark />
        <p>© {new Date().getFullYear()} ResumeAI. A ranking tool, not a hiring oracle.</p>
        <nav>
          <span>Privacy</span>
          <span>Terms</span>
        </nav>
      </footer>
    </div>
  );
}

/**
 * An illustration of the matcher's output, labelled as one.
 *
 * Every number here is one the product can actually produce: a score of 72 out of 100 in the
 * "Good match" band, coverage counts rather than percentages, and a keyword gap. No percent
 * sign on the score, because it is not a percentage of anything.
 */
function ProductPreview() {
  return (
    <figure className="product-window">
      <div className="product-window__rail">
        <Mark />
        {["Matcher", "Dashboard", "Applications", "Resumes"].map((item, index) => (
          <div key={item} className={index === 0 ? "mini-nav active" : "mini-nav"}>
            <i />
            {item}
          </div>
        ))}
      </div>

      <div className="product-window__main">
        <div className="preview-heading">
          <span>
            <small>MATCHER</small>
            <b>Senior Data Engineer</b>
          </span>
          <i>Fine-tuned · calibrated</i>
        </div>

        <div className="preview-grid">
          <div className="preview-chart">
            <small>REQUIREMENT COVERAGE</small>
            <strong>4 covered · 1 partial · 2 missing</strong>
            <p className="analysis-note">
              &ldquo;Three or more years of Python and SQL&rdquo;, matched against{" "}
              <em>&ldquo;Built ETL pipelines in Python and SQL.&rdquo;</em>
            </p>
            <p className="analysis-note">
              &ldquo;Kubernetes at scale&rdquo;: no sentence in the resume matched this.
            </p>
          </div>

          <div className="preview-score">
            <small>MATCH SCORE</small>
            <div className="score-ring">
              <span>72</span>
            </div>
            <strong>Good match</strong>
            <p>out of 100 · calibrated</p>
          </div>
        </div>

        <figcaption className="preview-caption">
          ILLUSTRATION OF THE MATCHER&apos;S OUTPUT, NOT A REAL ANALYSIS
        </figcaption>
      </div>
    </figure>
  );
}

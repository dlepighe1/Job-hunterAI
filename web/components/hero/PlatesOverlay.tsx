/**
 * The two analysis plates, drawn as product UI.
 *
 * This is a faithful rebuild of the reference composition: a match-analysis panel on the
 * left, the tailored resume re-scored on the right, a connector between them. Same panels,
 * same sub-cards, same score rings, same severity tags, same meter rows, same check list,
 * same four-tile strip along the bottom.
 *
 * **There is no raster under this.** The first attempt generated one, and flat UI is the
 * one thing an image model cannot be asked for, and it returned two objects that read as a
 * door intercom, because "two panels, empty dials, three bars" describes a piece of
 * hardware as readily as it describes software. Drawn as SVG it is crisp at any size,
 * takes its colour from the same tokens as the rest of the product, and every figure on it
 * is a string in this file.
 *
 * **What differs from the reference, and only this:**
 *
 * | Reference | Here | Why |
 * |---|---|---|
 * | `76 → 92`, "Elevated Score" | `61 → 74`, "After tailoring" | spec §4.4. The model never predicts above 0.85, and the product did not do the tailoring, the user did |
 * | `+68% Match Improvement` | `+13 Score change` | Not a figure the model produces |
 * | `100% ATS-Compatibility` | `6/7 Requirements covered` | Coverage is real output; an ATS compatibility percentage is not |
 * | `Stronger: Interview Potential` | `0.83 Model correlation` | FEATURES.md: the model does not predict interviews. 0.83 is the published held-out correlation |
 * | n/a | `out of 100 · calibrated` under each ring | Content rule 2: calibration is always stated |
 *
 * Everything else the reference shows is kept, including the "ATS Verified" badges and the
 * "ELEVATED RESUME" heading.
 *
 * Coordinates are a 1120x630 design space, mapped from the 512x288 reference at 2.1875x.
 * Small type is small on purpose, since it is small in the reference too, and at hero size it
 * reads as the texture of a dense tool rather than as copy anyone is expected to read.
 */

const WEAK_AREAS = [
  { label: "Keyword coverage", tag: "High", tone: "rose" },
  { label: "Leadership examples", tag: "Medium", tone: "gold" },
  { label: "Quantified impact", tag: "Medium", tone: "gold" },
  { label: "Skills coverage", tag: "Low", tone: "cyan" },
] as const;

const IMPROVE_ROWS = [
  { label: "Technical keywords", pct: 60 },
  { label: "Leadership & impact", pct: 45 },
  { label: "Quantified results", pct: 40 },
  { label: "Skills coverage", pct: 55 },
] as const;

const SUMMARY_LINES = [
  "Data engineer with 6+ years building scalable data",
  "pipelines and analytics that drive business impact.",
  "Python, SQL, Spark and cloud platforms.",
] as const;

const BULLETS = [
  ["Designed ETL pipelines processing 12M+ daily", "events, improving data reliability."],
  ["Optimised data models and queries, reducing", "cost and improving performance."],
  ["Led a team of 4 engineers delivering scalable", "data platform features."],
  ["Partnered with product and analytics teams to", "translate needs into data solutions."],
] as const;

const CHECKS = ["Rewritten bullets", "Impact-forward", "ATS-ready", "Keyword optimised"] as const;

const TILES = [
  { value: "+13", label: "Score change", tone: "teal" },
  { value: "6/7", label: "Requirements covered", tone: "cyan" },
  { value: "4", label: "Key areas flagged", tone: "text" },
  { value: "0.83", label: "Model correlation", tone: "text" },
] as const;

/** Verified badge, top-right of each panel. */
function AtsBadge({ x, y }: { x: number; y: number }) {
  return (
    <g className="pl-badge">
      <rect x={x} y={y} width={104} height={20} rx={10} />
      <circle cx={x + 13} cy={y + 10} r={3.5} />
      <text x={x + 24} y={y + 10}>
        ATS Verified
      </text>
    </g>
  );
}

/**
 * A score ring. `value` doubles as the arc length, because `pathLength` is 100.
 *
 * Only the number and its caption sit inside the ring. The `out of 100 · calibrated` line
 * is rendered by the caller *below* the ring's status pill, and it is ~90 units wide, and at
 * any radius that keeps the ring hero-sized it collides with the stroke on both sides.
 */
function ScoreRing({
  cx,
  cy,
  value,
  caption,
  tone,
  delay,
}: {
  cx: number;
  cy: number;
  value: number;
  caption: string;
  tone: string;
  delay: string;
}) {
  return (
    <g>
      <circle className="pl-ring-track" cx={cx} cy={cy} r={56} />
      <circle
        className="pl-ring-value"
        data-tone={tone}
        style={{ "--arc": value, animationDelay: delay } as React.CSSProperties}
        cx={cx}
        cy={cy}
        r={56}
        pathLength="100"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text className="pl-ring-value-text" x={cx} y={cy - 6}>
        {value}
      </text>
      <text className="pl-ring-caption" x={cx} y={cy + 22}>
        {caption}
      </text>
    </g>
  );
}

export function PlatesOverlay() {
  return (
    <svg
      className="hero-overlay hero-overlay--plates"
      viewBox="0 0 1120 630"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* ================= LEFT PLATE: the resume as submitted ================= */}
      <rect className="pl-panel" x={52} y={72} width={442} height={474} rx={18} />

      <text className="pl-panel-title" x={74} y={104}>
        RESUME MATCH ANALYSIS
      </text>
      <AtsBadge x={368} y={90} />
      <line className="pl-divider" x1={74} y1={120} x2={472} y2={120} />

      {/* --- Inputs, left column --- */}
      <text className="pl-label" x={74} y={146}>
        YOUR RESUME
      </text>
      <rect className="pl-card" x={74} y={156} width={132} height={66} rx={8} />
      <rect className="pl-glyph" x={86} y={170} width={12} height={15} rx={2} />
      <text className="pl-strong" x={104} y={176}>
        Software Engineer
      </text>
      <text className="pl-strong" x={104} y={188}>
        Resume.pdf
      </text>
      <text className="pl-ok" x={86} y={210}>
        ✓ Parsed successfully
      </text>

      <text className="pl-label" x={74} y={250}>
        JOB DESCRIPTION
      </text>
      <rect className="pl-card" x={74} y={260} width={132} height={66} rx={8} />
      <rect className="pl-glyph" x={86} y={274} width={13} height={12} rx={2} />
      <text className="pl-strong" x={104} y={280}>
        Senior Data Engineer
      </text>
      <text className="pl-strong" x={104} y={292}>
        Job Description
      </text>
      <text className="pl-ok" x={86} y={314}>
        ✓ Imported
      </text>

      {/* --- The score --- */}
      <ScoreRing cx={264} cy={212} value={61} caption="Match score" tone="cyan" delay="0.25s" />
      <g className="pl-pill" data-tone="gold">
        <rect x={219} y={288} width={90} height={22} rx={11} />
        <circle cx={233} cy={299} r={3.5} />
        <text x={243} y={299}>
          Fair match
        </text>
      </g>
      <text className="pl-ring-scale" x={264} y={324}>
        out of 100 · calibrated
      </text>

      {/* --- Weak areas, right column --- */}
      <rect className="pl-card" x={332} y={156} width={140} height={170} rx={8} />
      <text className="pl-label" x={344} y={176}>
        MISSING &amp; WEAK AREAS
      </text>
      {WEAK_AREAS.map((row, i) => {
        const y = 200 + i * 30;
        return (
          <g key={row.label} className="pl-weak-row" style={{ animationDelay: `${i * 0.12}s` }}>
            <rect className="pl-glyph" x={344} y={y - 5} width={7} height={8} rx={1.5} />
            <text className="pl-row-label pl-row-label--tight" x={357} y={y}>
              {row.label}
            </text>
            <g className="pl-tag" data-tone={row.tone}>
              <rect x={434} y={y - 7} width={30} height={14} rx={7} />
              <text x={449} y={y}>
                {row.tag}
              </text>
            </g>
          </g>
        );
      })}

      {/* --- Areas to improve --- */}
      <rect className="pl-card" x={74} y={346} width={398} height={178} rx={8} />
      <text className="pl-label" x={90} y={368}>
        AREAS TO IMPROVE
      </text>
      {IMPROVE_ROWS.map((row, i) => {
        const y = 394 + i * 32;
        return (
          <g key={row.label}>
            <rect className="pl-glyph" x={90} y={y - 8} width={11} height={11} rx={2} />
            <text className="pl-row-label" x={110} y={y}>
              {row.label}
            </text>
            <rect className="pl-meter-track" x={216} y={y - 3} width={150} height={6} rx={3} />
            <rect
              className="pl-meter-fill"
              style={{ "--pct": row.pct / 100, animationDelay: `${0.4 + i * 0.12}s` } as React.CSSProperties}
              x={216}
              y={y - 3}
              width={150}
              height={6}
              rx={3}
            />
            <text className="pl-pct" x={394} y={y}>
              {row.pct}%
            </text>
            <text className="pl-action" x={410} y={y}>
              Improve ›
            </text>
          </g>
        );
      })}

      {/* ================= CONNECTOR ================= */}
      <g className="pl-connector">
        <rect x={496} y={286} width={108} height={44} rx={10} />
        <text x={550} y={303}>
          RE-SCORED
        </text>
        <text x={550} y={317}>
          AFTER TAILORING
        </text>
      </g>

      {/* ================= RIGHT PLATE: after the user tailored it ================= */}
      <rect className="pl-panel pl-panel--after" x={606} y={72} width={462} height={474} rx={18} />

      <path className="pl-spark" d="M626 98 l5 -9 l5 9 l-5 9 z" />
      <text className="pl-panel-title pl-panel-title--after" x={644} y={104}>
        ELEVATED RESUME
      </text>
      <AtsBadge x={942} y={90} />

      {/* --- The tailored resume itself --- */}
      <rect className="pl-card" x={628} y={130} width={272} height={340} rx={10} />
      <text className="pl-name" x={648} y={166}>
        Alex Morgan
      </text>
      <text className="pl-role" x={648} y={182}>
        Senior Data Engineer
      </text>
      {["alex.morgan@email.com", "San Francisco, CA", "linkedin.com/in/alexmorgan"].map((line, i) => (
        <g key={line}>
          <circle className="pl-dot" cx={652} cy={200 + i * 14} r={2.5} />
          <text className="pl-meta" x={662} y={200 + i * 14}>
            {line}
          </text>
        </g>
      ))}
      <line className="pl-divider" x1={648} y1={252} x2={880} y2={252} />

      <text className="pl-label" x={648} y={270}>
        PROFESSIONAL SUMMARY
      </text>
      {SUMMARY_LINES.map((line, i) => (
        <text key={line} className="pl-body" x={648} y={286 + i * 12}>
          {line}
        </text>
      ))}

      <text className="pl-label" x={648} y={340}>
        EXPERIENCE
      </text>
      <text className="pl-strong" x={648} y={356}>
        Senior Data Engineer · 2021 – Present
      </text>
      <text className="pl-meta" x={648} y={368}>
        DataFlow Inc.
      </text>
      {BULLETS.map((lines, i) => (
        <g key={lines[0]}>
          <circle className="pl-dot" cx={652} cy={385 + i * 24} r={1.8} />
          <text className="pl-body" x={662} y={387 + i * 24}>
            {lines[0]}
          </text>
          <text className="pl-body" x={662} y={397 + i * 24}>
            {lines[1]}
          </text>
        </g>
      ))}

      {/* --- The new score, and the lift into it ---
          The arrow rises from below-left into the ring. It used to run from further down
          and crossed straight through the "Good match" pill. */}
      <path className="pl-arrow" d="M908 264 C 924 258, 936 244, 940 228" pathLength="100" />
      <path className="pl-arrow-head" d="M934 234 l7 -13 l-12 4 z" />
      <ScoreRing cx={986} cy={186} value={74} caption="After tailoring" tone="teal" delay="0.75s" />
      <g className="pl-pill" data-tone="teal">
        <rect x={938} y={264} width={96} height={22} rx={11} />
        <circle cx={952} cy={275} r={3.5} />
        <text x={962} y={275}>
          Good match
        </text>
      </g>
      <text className="pl-ring-scale" x={986} y={300}>
        out of 100 · calibrated
      </text>

      {CHECKS.map((label, i) => {
        const y = 316 + i * 37;
        return (
          <g key={label} className="pl-check" style={{ animationDelay: `${0.9 + i * 0.14}s` }}>
            <rect x={916} y={y} width={140} height={31} rx={8} />
            <rect className="pl-glyph" x={930} y={y + 12} width={7} height={8} rx={1.5} />
            <text x={946} y={y + 16}>
              {label}
            </text>
            <circle className="pl-check-mark" cx={1040} cy={y + 15} r={6} />
          </g>
        );
      })}

      {/* --- Four tiles along the bottom --- */}
      <rect className="pl-card" x={628} y={486} width={428} height={48} rx={8} />
      {TILES.map((tile, i) => {
        const cx = 628 + 53.5 + i * 107;
        return (
          <g key={tile.label}>
            {i > 0 && <line className="pl-divider" x1={628 + i * 107} y1={496} x2={628 + i * 107} y2={524} />}
            <text className="pl-tile-value" data-tone={tile.tone} x={cx} y={508}>
              {tile.value}
            </text>
            <text className="pl-tile-label" x={cx} y={523}>
              {tile.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

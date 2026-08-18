/**
 * The applications tracker, drawn over `applications.webp`.
 *
 * This is the one asset that keeps its raster: a laptop in three-quarter view is a real
 * three-dimensional object, and SVG is the wrong tool for one. Everything on it is drawn
 * here: the table on the screen, the company panel, the two status cards.
 *
 * **The screen table is mapped onto the screen plane by an affine matrix.** The raster's
 * screen is a quadrilateral; `SCREEN` maps a flat 600x400 design box onto its top-left,
 * top-right and bottom-left corners, so the table can be authored as if it were flat and
 * still sit on the glass. It is an affine fit to what is really a perspective projection,
 * so the far edge is a few percent off true, invisible at this size, and the alternative
 * was either faking the angle by eye or abandoning the laptop entirely.
 *
 * **What differs from the reference, and only this:** the pipeline's employers are invented
 * (`Atlas Systems`, `Meridian Data`, …) rather than real-sounding ones, and the profiled
 * company is generic. Spec §4.4 keeps the populated pipeline but not the names, and the
 * applications tracker is unbuilt, and the caption under the frame says so.
 */

/**
 * Maps a flat 600x400 box onto the raster's screen quad. See the docblock.
 *
 * Re-derived when the laptop was re-rendered photorealistically: the new render sits
 * further left with a much larger lens, so the old matrix put the table off the glass.
 * Derived from the screen's top-left, top-right and bottom-left corners, since three points is
 * exactly what an affine transform takes.
 */
const SCREEN = "matrix(0.8017 0.0083 0.18 0.7925 190 152)";

/** The lens the raster draws, in the same coordinate space. The company card sits in it. */
const LENS = { x: 840, y: 206, r: 221 } as const;

const ROWS = [
  { company: "Atlas Systems", role: "Senior Data Engineer", status: "Interviewing", tone: "teal", date: "May 12" },
  { company: "Orbit AI", role: "ML Engineer", status: "Pending", tone: "gold", date: "May 09" },
  { company: "Lumen Health", role: "Data Analyst", status: "Applied", tone: "cyan", date: "May 06" },
  { company: "Meridian Data", role: "Platform Engineer", status: "Tailored", tone: "teal", date: "May 02" },
  { company: "Cobalt Health", role: "Analytics Lead", status: "Applied", tone: "cyan", date: "Apr 28" },
  { company: "Vector Foundry", role: "Data Engineer", status: "Applied", tone: "cyan", date: "Apr 24" },
] as const;

const COMPANY_FACTS = [
  ["Website", "atlassystems.example"],
  ["Industry", "AI infrastructure"],
  ["Headquarters", "Remote-first"],
  ["Hiring", "Actively hiring"],
] as const;

export function ApplicationsOverlay() {
  return (
    <svg
      className="hero-overlay hero-overlay--apps"
      viewBox="0 0 1120 630"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="app-lens-clip">
          <circle cx={LENS.x} cy={LENS.y} r={LENS.r} />
        </clipPath>
        <linearGradient id="app-lens-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--cyan)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ===================== ON THE SCREEN ===================== */}
      <g className="app-screen" transform={SCREEN}>
        <text className="app-screen-title" x={22} y={34}>
          MY JOB APPLICATIONS
        </text>
        <g className="app-filter">
          <rect x={430} y={14} width={148} height={24} rx={12} />
          <text x={504} y={27}>
            All applications
          </text>
        </g>

        <line className="app-rule" x1={22} y1={52} x2={578} y2={52} />
        {["COMPANY", "ROLE", "STATUS", "DATE"].map((h, i) => (
          <text key={h} className="app-col" x={[22, 206, 356, 486][i]} y={70}>
            {h}
          </text>
        ))}

        {ROWS.map((row, i) => {
          const y = 96 + i * 42;
          return (
            <g key={row.company} className="app-row" style={{ animationDelay: `${i * 1.1}s` }}>
              <rect className="app-row-bg" x={16} y={y - 15} width={556} height={34} rx={7} />
              <circle className="app-row-mark" cx={30} cy={y} r={8} />
              <text className="app-row-company" x={46} y={y}>
                {row.company}
              </text>
              <text className="app-row-meta" x={206} y={y}>
                {row.role}
              </text>
              <g className="app-status" data-tone={row.tone}>
                <rect x={356} y={y - 9} width={84} height={19} rx={9} />
                <circle cx={368} cy={y} r={3} />
                <text x={378} y={y}>
                  {row.status}
                </text>
              </g>
              <text className="app-row-meta" x={486} y={y}>
                {row.date}
              </text>
            </g>
          );
        })}

        <text className="app-more" x={300} y={378}>
          View all applications ›
        </text>
      </g>

      {/* ===================== LENS SWEEP ===================== */}
      <g clipPath="url(#app-lens-clip)">
        <rect
          className="app-lens-sweep"
          x={-160}
          y={LENS.y - LENS.r}
          width={160}
          height={LENS.r * 2}
          fill="url(#app-lens-sweep)"
        />
      </g>

      {/* ===================== COMPANY PANEL, INSIDE THE LENS =====================
          The re-rendered laptop carries a far larger magnifier, so the company card sits
          within the glass the way the reference draws it. Its corners are ~155 units from
          the lens centre against a 221 radius, so it stays clear of the rim. */}
      <g className="app-panel">
        <rect x={716} y={118} width={250} height={176} rx={12} />
        <rect className="app-panel-mark" x={732} y={134} width={26} height={26} rx={8} />
        <text className="app-panel-title" x={766} y={145}>
          Atlas Systems
        </text>
        <circle className="app-verified" cx={884} cy={142} r={5.5} />
        <text className="app-panel-meta" x={766} y={158}>
          atlassystems.example
        </text>

        <text className="app-panel-body" x={732} y={182}>
          Intelligent data infrastructure
        </text>
        <text className="app-panel-body" x={732} y={194}>
          for teams that ship.
        </text>

        {COMPANY_FACTS.map(([k, v], i) => (
          <g key={k}>
            <text className="app-fact-key" x={732} y={216 + i * 16}>
              {k}
            </text>
            <text className="app-fact-value" x={950} y={216 + i * 16}>
              {v}
            </text>
          </g>
        ))}

        <line className="app-rule" x1={732} y1={286} x2={950} y2={286} />
      </g>

      {/* ===================== STATUS CARDS =====================
          Placed onto the blank panels the raster already floats, so the drawn content
          lands on a real surface instead of hovering beside one. Coordinates measured off
          the render; regenerating it means re-measuring these. */}
      <g className="app-card">
        <rect x={148} y={50} width={222} height={86} rx={14} />
        <rect className="app-card-mark" x={166} y={68} width={26} height={26} rx={8} />
        <text className="app-card-title" x={202} y={78}>
          Resume v3, Tailored
        </text>
        <text className="app-card-meta" x={202} y={94}>
          Tailored for Atlas Systems
        </text>
        <circle className="app-verified" cx={360} cy={75} r={5.5} />
        <text className="app-card-meta" x={166} y={120}>
          Coverage 6/7 · re-scored 74
        </text>
      </g>

      <g className="app-card">
        <rect x={38} y={252} width={130} height={178} rx={14} />
        <text className="app-card-label" x={56} y={276}>
          THIS WEEK
        </text>
        <text className="app-stat-value" x={56} y={312}>
          6
        </text>
        <text className="app-card-meta" x={56} y={330}>
          applications
        </text>
        <line className="app-rule" x1={56} y1={350} x2={150} y2={350} />
        <text className="app-stat-value" x={56} y={388}>
          2
        </text>
        <text className="app-card-meta" x={56} y={406}>
          interviewing
        </text>
      </g>

      <g className="app-card">
        <rect x={44} y={474} width={232} height={98} rx={14} />
        <text className="app-card-label" x={62} y={496}>
          SAVED NOTE
        </text>
        <text className="app-card-meta" x={62} y={518}>
          Kubernetes is the only gap the
        </text>
        <text className="app-card-meta" x={62} y={532}>
          posting names that the resume
        </text>
        <text className="app-card-meta" x={62} y={546}>
          does not evidence.
        </text>
      </g>

      <g className="app-card">
        <rect x={726} y={416} width={230} height={80} rx={14} />
        <rect className="app-card-mark" x={744} y={436} width={24} height={24} rx={7} />
        <text className="app-card-label" x={778} y={444}>
          NEXT UP
        </text>
        <text className="app-card-title" x={778} y={462}>
          Interview
        </text>
        <text className="app-card-meta" x={744} y={482}>
          Atlas Systems · May 18 · 11:00
        </text>
      </g>
    </svg>
  );
}

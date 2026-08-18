#!/usr/bin/env node
/**
 * Deterministic contour generator for `components/backdrop/TopographicField.tsx`.
 *
 * Run:  node scripts/generate-contours.mjs
 *       node scripts/generate-contours.mjs --seed 20260812 --precision 1
 *
 * It prints the `d` attributes to stdout. They are then pasted into
 * `TopographicField.tsx` as literal strings, because the component must never generate geometry
 * at runtime, because this is static art and every byte of generator code shipped to the
 * browser would be wasted. This script exists so the geometry stays reproducible and
 * tunable: change SEED or PEAKS, re-run, re-paste.
 *
 * ── How the terrain is made ────────────────────────────────────────────────────────────
 * Not marching squares over a noise field (accurate, but it emits fragmentary open
 * polylines that cost a lot of path bytes for a decorative layer). Instead: seeded radial
 * perturbation. Each "peak" is a stack of nested closed rings, where a ring's radius
 * varies with angle as a sum of low-order sine harmonics:
 *
 *     r(theta) = R * (1 + SUM_k a_k * sin(k*theta + phi_k))
 *
 * The harmonic set belongs to the peak, so every ring in a stack is a variation on one
 * shape, which is what makes a stack read as one landform rather than a pile of blobs.
 * Two things then break the "onion" look: amplitudes grow with elevation index (lower
 * contours sprawl, summits tighten) and the ring centre drifts, so the peak leans.
 *
 * Amplitudes are capped well below the ring spacing, which is what keeps nested rings
 * from crossing each other, and crossing contours are the one thing that instantly reads as
 * fake terrain.
 *
 * Sampled points are converted to cubic Béziers with a closed Catmull-Rom spline, so the
 * curves are C1-continuous and never show the polygon they came from.
 */

const argv = process.argv.slice(2);
/**
 * Reads `--name <number>`. Rejects anything non-numeric rather than coercing: `--seed abc`
 * would otherwise become NaN, then `a |= 0` inside the RNG turns that into 0, and the script
 * cheerfully emits a completely different field under the label of the seed you asked for.
 * A generator whose whole value is reproducibility must not fail quietly.
 */
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const raw = argv[i + 1];
  const value = Number(raw);
  if (raw === undefined || raw.trim() === "" || !Number.isFinite(value)) {
    console.error(`--${name} needs a finite number, got ${JSON.stringify(raw)}`);
    process.exit(1);
  }
  return value;
};

// ── Parameters that produced the committed paths ─────────────────────────────────────
const SEED = arg("seed", 20260812);
const PRECISION = arg("precision", 1);
/**
 * Units of arc per sample point. Higher = fewer, longer Bézier segments = fewer bytes.
 * 14 is the point where the curves are still visibly smooth at 2x scale; below ~18 the
 * larger base rings start to show flat spots.
 */
const DENSITY = arg("density", 14);
const VIEWBOX = { w: 1440, h: 900 };

/** Ten paths carry the pulse. The cap is enforced by `backdrop.test.tsx`. */
const PULSE_COUNT = 10;

/**
 * Three landforms, 30 contours total.
 *
 * Two placement rules, both enforced by `validate()` below:
 *
 * 1. No two stacks may overlap. Contour lines from separate peaks crossing each other is
 *    the single most obvious tell of fake terrain: on a real map, a contour that
 *    encloses two summits encloses both of them, it does not intersect its neighbour.
 *    Getting shared enclosing contours right needs a scalar field and marching squares;
 *    keeping the stacks apart gets the same honesty for a fraction of the path bytes.
 * 2. Within a stack, ring `e` must lie strictly inside ring `e + 1`.
 *
 * Centres sit near or past the canvas edges so each stack's visible portion covers more
 * ground than its radius suggests, and so the largest rings read as sweeping open arcs
 * rather than closed blobs. The consequence of rule 1 is empty regions, around the upper
 * centre especially, which is exactly where marketing hero copy lands. That is deliberate:
 * a topographic map is mostly plain, and this layer must never crowd the text.
 */
const PEAKS = [
  { cx: 150, cy: 200, rings: 11, r0: 58, step: 33, spread: 0.55, drift: [30, 18] },
  { cx: 1330, cy: 340, rings: 10, r0: 54, step: 32, spread: 0.62, drift: [-24, 20] },
  { cx: 690, cy: 980, rings: 9, r0: 62, step: 36, spread: 0.5, drift: [20, -26] },
];

// ── Seeded RNG (mulberry32) ──────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const between = (lo, hi) => lo + rand() * (hi - lo);

const num = (n) => {
  const s = n.toFixed(PRECISION);
  return s.replace(/\.?0+$/, "") || "0";
};

/**
 * Closed Catmull-Rom through `pts`, emitted as cubic Béziers.
 * Tension 1/6 is the standard uniform Catmull-Rom -> Bézier conversion.
 */
function closedSpline(pts) {
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  let d = `M${num(pts[0][0])} ${num(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d +=
      `C${num(c1[0])} ${num(c1[1])} ` +
      `${num(c2[0])} ${num(c2[1])} ` +
      `${num(p2[0])} ${num(p2[1])}`;
  }
  return `${d}Z`;
}

// ── Build the field ──────────────────────────────────────────────────────────────────
const contours = [];
/** Every ring-to-ring spacing in px, for the spread diagnostic below. */
const gaps = [];

for (const peak of PEAKS) {
  // Harmonics 2..6 only. k=1 just translates the ring, and anything above 6 turns
  // terrain into a gear.
  const harmonics = [];
  for (let k = 2; k <= 6; k++) {
    harmonics.push({
      k,
      // Falls off as 1/k so the silhouette is dominated by broad lobes, not ripples.
      // The ceiling is what keeps rings from crossing: total perturbation stays well
      // under the guaranteed minimum ring spacing below.
      amp: between(0.03, 0.065) / (k - 1),
      phase: between(0, Math.PI * 2),
      // A slow phase walk up the stack, so nested rings rotate a little relative to each
      // other. This is what stops the stack reading as one shape scaled up.
      drift: between(-0.05, 0.05),
    });
  }

  let radius = peak.r0;
  // Ring spacing as a multiple of `step`, evolved as a bounded random walk rather than
  // drawn independently per ring.
  //
  // Independent draws give every gap the same distribution, so the stack converges on its
  // mean and the rings come out near-evenly spaced, which is what made the field read as
  // an interference pattern rather than terrain. A walk is correlated: a tight gap is
  // likely to be followed by another tight one, so the stack produces *runs* of bunched
  // rings and runs of open ones. That is what a steep face and a plain actually look like.
  //
  // The floor is what keeps rings from crossing: 0.35 * step is 11.6px at step 33, still
  // comfortably above the worst-case ring-to-ring swing in perturbation (~7px) plus centre
  // drift (~3px). `validate()` proves it rather than trusting the arithmetic.
  let gap = 1;

  for (let e = 0; e < peak.rings; e++) {
    const t = e / (peak.rings - 1); // 0 = summit, 1 = base
    if (e > 0) {
      gap = Math.min(1.9, Math.max(0.35, gap + between(-0.35, 0.35)));
      radius += peak.step * gap;
      gaps.push(peak.step * gap);
    }
    const gain = 1 + peak.spread * t;
    const cx = peak.cx + peak.drift[0] * t;
    const cy = peak.cy + peak.drift[1] * t;

    // Point budget scales with circumference: enough to stay smooth, not one more.
    const samples = Math.min(30, Math.max(14, Math.round(radius / DENSITY)));
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const theta = (i / samples) * Math.PI * 2;
      let k = 1;
      for (const h of harmonics) {
        k += h.amp * gain * Math.sin(h.k * theta + h.phase + h.drift * e);
      }
      pts.push([cx + radius * k * Math.cos(theta), cy + radius * k * Math.sin(theta)]);
    }
    contours.push({ d: closedSpline(pts), pts, peak, elevation: e });
  }
}

// ── Validation ───────────────────────────────────────────────────────────────────────
/** Even-odd ray cast. `poly` is a closed ring of sampled points. */
function inside([x, y], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function validate() {
  const problems = [];

  // Rule 2: strict nesting within each stack.
  for (let i = 1; i < contours.length; i++) {
    const a = contours[i - 1];
    const b = contours[i];
    if (a.peak !== b.peak) continue;
    if (!a.pts.every((p) => inside(p, b.pts))) {
      problems.push(`ring ${a.elevation} escapes ring ${b.elevation} of peak at ${a.peak.cx},${a.peak.cy}`);
    }
  }

  // Rule 1: stacks must not overlap. Compare each stack's outermost ring against the
  // others' by true sampled extent, not by nominal radius.
  const outer = PEAKS.map((peak) => {
    const rings = contours.filter((c) => c.peak === peak);
    const last = rings[rings.length - 1];
    const reach = Math.max(...last.pts.map(([x, y]) => Math.hypot(x - peak.cx, y - peak.cy)));
    return { peak, reach };
  });
  for (let i = 0; i < outer.length; i++) {
    for (let j = i + 1; j < outer.length; j++) {
      const gap =
        Math.hypot(outer[i].peak.cx - outer[j].peak.cx, outer[i].peak.cy - outer[j].peak.cy) -
        outer[i].reach -
        outer[j].reach;
      if (gap <= 0) problems.push(`peaks ${i} and ${j} overlap by ${(-gap).toFixed(1)}`);
      else console.error(`  peaks ${i}/${j} clear by ${gap.toFixed(0)}px`);
    }
  }

  if (problems.length) {
    console.error(`\nINVALID GEOMETRY:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}

validate();

// Pulse selection: evenly strided so the ten currents are spread across all three
// landforms and across elevations, rather than clustering on one peak.
const stride = contours.length / PULSE_COUNT;
const pulseIndex = new Set(
  Array.from({ length: PULSE_COUNT }, (_, i) => Math.floor(i * stride + stride / 2)),
);

const out = contours.map((c, i) => ({ d: c.d, pulse: pulseIndex.has(i) }));

const bytes = out.reduce((n, c) => n + c.d.length, 0);
const lo = Math.min(...gaps);
const hi = Math.max(...gaps);
console.error(
  `seed=${SEED} precision=${PRECISION} density=${DENSITY} ` +
    `viewBox=0 0 ${VIEWBOX.w} ${VIEWBOX.h}\n` +
    `contours=${out.length} pulse=${out.filter((c) => c.pulse).length} ` +
    `path-data-bytes=${bytes}\n` +
    // The ratio is the terrain tell. Near 1.5 the rings are effectively evenly spaced and
    // the field reads as an interference pattern; real maps run 5-10x between a cliff and
    // a plain.
    `ring-gap min=${lo.toFixed(1)}px max=${hi.toFixed(1)}px ratio=${(hi / lo).toFixed(2)}x\n` +
    `pulse-indices=[${[...pulseIndex].sort((a, b) => a - b).join(",")}]`,
);

console.log("const CONTOURS: readonly Contour[] = [");
for (const c of out) {
  console.log(`  { d: "${c.d}"${c.pulse ? ", pulse: true" : ""} },`);
}
console.log("];");

/**
 * The contact graph, drawn as product UI to match the reference composition.
 *
 * A person at the centre, four contacts around them, curved edges between, a "May know"
 * suggestion pill, and two contact cards. There is no raster under this: flat UI drawn as
 * SVG is crisp at any size and every string is in this file.
 *
 * **Real company marks, at the owner's explicit direction.**
 *
 * The four contacts carry Stripe, Google, Notion and Microsoft as the reference does.
 * These are other companies' trademarks on a landing page for a feature that does not
 * exist yet, which is a claim of association this product cannot make, and the risk is
 * recorded here rather than argued, because it was asked for directly and it is the
 * owner's call.
 *
 * The artwork lives in `public/img/logos/*.svg`, referenced by `<image>` rather than
 * inlined. Google's four-arc G and Microsoft's four-square are the real geometry; Stripe
 * and Notion are close reproductions. **To use the official brand assets, replace those
 * four files**, and nothing in this component changes. They are same-origin files, not CDN
 * requests, which DESIGN.md forbids.
 *
 * Everything else follows the reference, colour aside: the palette is Cyber Obsidian
 * rather than the reference's indigo and violet.
 */

const HUB = { x: 560, y: 346, r: 92 } as const;

/**
 * The four contacts, spread wider than the graph's first pass, because the discs, the cards and
 * the pill were close enough to read as one mass rather than as separate objects.
 */
const CONTACTS = [
  { id: "stripe", x: 300, y: 198, r: 62, logo: "stripe", hair: "bun" },
  { id: "google", x: 820, y: 198, r: 62, logo: "google", hair: "curls" },
  { id: "microsoft", x: 820, y: 498, r: 62, logo: "microsoft", hair: "headphones" },
  { id: "notion", x: 300, y: 498, r: 62, logo: "notion", hair: "long" },
] as const;

const CARDS = [
  { x: 24, y: 292, company: "Stripe", role: "Product Manager", logo: "stripe" },
  { x: 844, y: 292, company: "Google", role: "Software Engineer", logo: "google" },
] as const;

/** Card geometry. One padding value, used on every side. */
const CARD = { w: 252, h: 128, pad: 20, tile: 52 } as const;

/**
 * The dashed secondary links, written out rather than generated.
 *
 * They were a symmetrical ring joining each contact to the next, which read as a cross
 * laid over the graph, four identical arcs and four dots at the compass points. These are
 * specific relationships instead, each stated once:
 *
 *   1. the hub reaching left toward the Stripe card, with its dot beside that card
 *   2. the Stripe contact down to the Stripe card
 *   3. Notion across to Google, the one link between two contacts
 *   4. the Google contact down to the Google card
 *   5. a short stub off the Google contact ending in its own dot
 *
 * Explicit path data because the positions are the point. A generator would have to be
 * told each of these as an exception anyway.
 */
const HINTS = [
  { id: "hub-left", d: "M468 346 Q 392 368 306 360", dot: [306, 360] },
  { id: "stripe-card", d: "M262 246 Q 210 272 156 292" },
  { id: "notion-google", d: "M362 462 Q 700 520 758 234", dot: [610, 445] },
  { id: "google-card", d: "M858 246 Q 912 272 962 294" },
  { id: "google-dot", d: "M776 242 Q 742 270 708 302", dot: [708, 302] },
] as const;

/**
 * A faceless avatar, in three-quarter profile.
 *
 * Built as a hair mass behind a lighter face offset to the right, so the silhouette reads
 * as someone turned slightly away, the shape the reference uses, rather than as a
 * front-on symbol. The body is wider than the disc on purpose; the caller's clip is what
 * shapes the shoulders and makes the figure fill its circle.
 *
 * No facial features on any variant. Spec §6 excludes profiling people who have not
 * consented, and rendered faces are exactly what that rules out.
 */
function Avatar({ cx, cy, r, hair }: { cx: number; cy: number; r: number; hair?: string }) {
  /**
   * The hub uses a front-facing figure: head centred, shoulders symmetric, no hair mass.
   * It is the visitor looking at themselves, so it reads straight-on; the contacts are
   * turned three-quarters away, which is what the reference does and what makes them read
   * as other people rather than as four copies of the same symbol.
   */
  if (!hair) {
    return (
      <g className="net-avatar">
        <ellipse className="net-body" cx={cx} cy={cy + r * 0.92} rx={r * 1.06} ry={r * 0.72} />
        <circle className="net-face" cx={cx} cy={cy - r * 0.26} r={r * 0.34} />
      </g>
    );
  }

  const faceR = r * 0.3;
  const faceX = cx + r * 0.2;
  const faceY = cy - r * 0.22;

  return (
    <g className="net-avatar">
      {/* Shoulders, drawn first and clipped by the disc. */}
      <ellipse className="net-body" cx={cx + r * 0.08} cy={cy + r * 0.94} rx={r * 1.05} ry={r * 0.7} />

      {/* The hair mass sits behind and to the left of the face, and is the whole reason
          the silhouette reads as turned rather than as a bald circle. */}
      <circle className="net-hair" cx={cx - r * 0.02} cy={cy - r * 0.3} r={r * 0.48} />

      {hair === "bun" && <circle className="net-hair" cx={cx - r * 0.44} cy={cy - r * 0.56} r={r * 0.23} />}

      {hair === "long" && (
        <ellipse className="net-hair" cx={cx - r * 0.3} cy={cy + r * 0.16} rx={r * 0.32} ry={r * 0.5} />
      )}

      {hair === "curls" &&
        [-0.54, -0.16, 0.2].map((k) => (
          <circle
            key={k}
            className="net-hair"
            cx={cx + r * k}
            cy={cy - r * (0.68 - Math.abs(k) * 0.16)}
            r={r * 0.21}
          />
        ))}

      {/* A short neck, not a stem. Tall enough to separate face from shoulders and no
          more, since at the hub's scale a longer one read as a lollipop. */}
      <rect
        className="net-body"
        x={faceX - r * 0.12}
        y={faceY + faceR * 0.62}
        width={r * 0.24}
        height={r * 0.3}
        rx={r * 0.09}
      />

      <circle className="net-face" cx={faceX} cy={faceY} r={faceR} />

      {hair === "headphones" && (
        <>
          <path
            className="net-headband"
            d={`M${cx - r * 0.5} ${cy - r * 0.3} a${r * 0.5} ${r * 0.5} 0 0 1 ${r} 0`}
          />
          <rect
            className="net-earcup"
            x={cx - r * 0.62}
            y={cy - r * 0.34}
            width={r * 0.22}
            height={r * 0.34}
            rx={r * 0.11}
          />
          <rect
            className="net-earcup"
            x={cx + r * 0.4}
            y={cy - r * 0.34}
            width={r * 0.22}
            height={r * 0.34}
            rx={r * 0.11}
          />
        </>
      )}
    </g>
  );
}

/** A company mark on a rounded-square plate, as the reference draws them. */
function CompanyMark({ logo, x, y, size }: { logo: string; x: number; y: number; size: number }) {
  const pad = size * 0.18;
  return (
    <g className="net-badge">
      <rect x={x} y={y} width={size} height={size} rx={size * 0.28} />
      <image
        href={`/img/logos/${logo}.svg`}
        x={x + pad}
        y={y + pad}
        width={size - pad * 2}
        height={size - pad * 2}
      />
    </g>
  );
}

export function NetworkOverlay() {
  return (
    <svg
      className="hero-overlay hero-overlay--network"
      viewBox="0 0 1120 630"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="net-hub-fill" cx="34%" cy="26%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--cyan) 34%, var(--surface-3))" />
          <stop offset="100%" stopColor="var(--pf-surface)" />
        </radialGradient>
        <radialGradient id="net-node-fill" cx="34%" cy="26%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--cyan) 20%, var(--surface-3))" />
          <stop offset="100%" stopColor="var(--pf-surface)" />
        </radialGradient>
        <clipPath id="net-hub-clip">
          <circle cx={HUB.x} cy={HUB.y} r={HUB.r - 6} />
        </clipPath>
        {CONTACTS.map((c) => (
          <clipPath key={c.id} id={`net-clip-${c.id}`}>
            <circle cx={c.x} cy={c.y} r={c.r - 5} />
          </clipPath>
        ))}
      </defs>

      <g className="net-scene">
        {HINTS.map((hint, i) => (
          <g key={hint.id}>
            <path className="net-hint" d={hint.d} />
            {"dot" in hint && hint.dot && (
              <circle
                className="net-hint-dot"
                cx={hint.dot[0]}
                cy={hint.dot[1]}
                r={7}
                style={{ animationDelay: `${i * 0.6}s` }}
              />
            )}
          </g>
        ))}

        {/* Solid edges, hub to each contact, trimmed to both rims so they never run
            through the avatars. */}
        {CONTACTS.map((c, i) => {
          const dx = c.x - HUB.x;
          const dy = c.y - HUB.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const sx = HUB.x + ux * (HUB.r + 3);
          const sy = HUB.y + uy * (HUB.r + 3);
          const ex = c.x - ux * (c.r + 3);
          const ey = c.y - uy * (c.r + 3);
          const mx = (sx + ex) / 2 + (ey - sy) * 0.18;
          const my = (sy + ey) / 2 + (sx - ex) * 0.18;
          const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
          return (
            <g key={c.id}>
              <path className="net-edge" d={d} pathLength="100" style={{ animationDelay: `${0.2 + i * 0.12}s` }} />
              <path className="net-pulse" d={d} pathLength="100" style={{ animationDelay: `${i * 0.9}s` }} />
            </g>
          );
        })}

        {/* The four contacts */}
        {CONTACTS.map((c, i) => (
          <g key={`node-${c.id}`} className="net-node" style={{ animationDelay: `${0.5 + i * 0.1}s` }}>
            <circle className="net-node-body" cx={c.x} cy={c.y} r={c.r - 5} />
            <g clipPath={`url(#net-clip-${c.id})`}>
              <Avatar cx={c.x} cy={c.y} r={c.r - 5} hair={c.hair} />
            </g>
            <circle className="net-node-ring" cx={c.x} cy={c.y} r={c.r} />
            <CompanyMark logo={c.logo} x={c.x + c.r * 0.44} y={c.y + c.r * 0.44} size={42} />
          </g>
        ))}

        {/* "May know": a full pill, as in the reference */}
        <g className="net-suggest">
          <rect x={434} y={48} width={252} height={62} rx={31} />
          <g className="net-suggest-bulb" transform="translate(466 79)">
            <circle cx={0} cy={-2} r={8} />
            <rect x={-3.5} y={6} width={7} height={4} rx={1.5} />
          </g>
          <text className="net-suggest-title" x={492} y={72}>
            May know
          </text>
          <circle className="net-mini-avatar" cx={500} cy={92} r={9} />
          <circle className="net-mini-avatar" cx={516} cy={92} r={9} />
          <text className="net-suggest-meta" x={534} y={96}>
            2 mutuals
          </text>
          <text className="net-chevron" x={662} y={80}>
            ›
          </text>
        </g>

        {/* Contact cards. Equal padding on all four sides, see CARD. */}
        {CARDS.map((card) => (
          <g key={card.company} className="net-card">
            <rect x={card.x} y={card.y} width={CARD.w} height={CARD.h} rx={18} />
            <rect
              className="net-card-tile"
              x={card.x + CARD.pad}
              y={card.y + CARD.pad}
              width={CARD.tile}
              height={CARD.tile}
              rx={14}
            />
            <image
              href={`/img/logos/${card.logo}.svg`}
              x={card.x + CARD.pad + 10}
              y={card.y + CARD.pad + 10}
              width={CARD.tile - 20}
              height={CARD.tile - 20}
            />
            <text className="net-card-title" x={card.x + CARD.pad + CARD.tile + 16} y={card.y + CARD.pad + 20}>
              {card.company}
            </text>
            <text className="net-card-meta" x={card.x + CARD.pad + CARD.tile + 16} y={card.y + CARD.pad + 42}>
              {card.role}
            </text>
            <circle
              className="net-card-status"
              cx={card.x + CARD.w - CARD.pad - 6}
              cy={card.y + CARD.pad + 6}
              r={6}
            />
            <rect
              className="net-card-bar"
              x={card.x + CARD.pad}
              y={card.y + CARD.pad + CARD.tile + 16}
              width={CARD.w - CARD.pad * 2}
              height={7}
              rx={3.5}
            />
            <rect
              className="net-card-bar"
              x={card.x + CARD.pad}
              y={card.y + CARD.pad + CARD.tile + 29}
              width={(CARD.w - CARD.pad * 2) * 0.62}
              height={7}
              rx={3.5}
            />
          </g>
        ))}
      </g>

      {/* The person at the centre, deliberately *outside* `.net-scene`.
          Everything else is tilted; this stays square to the frame and centred, so the one
          figure the visitor is meant to read as themselves is not foreshortened. Its body
          reaches the circumference; the clip is what does that. */}
      <g className="net-hub">
        <circle className="net-hub-halo" cx={HUB.x} cy={HUB.y} r={HUB.r + 14} />
        <circle className="net-hub-body" cx={HUB.x} cy={HUB.y} r={HUB.r - 6} />
        <g clipPath="url(#net-hub-clip)">
          <Avatar cx={HUB.x} cy={HUB.y} r={HUB.r - 6} />
        </g>
        <circle className="net-hub-ring" cx={HUB.x} cy={HUB.y} r={HUB.r} />
        <circle className="net-hub-status" cx={HUB.x + 60} cy={HUB.y + 50} r={19} />
      </g>

      {/* Says the feature does not exist, in the same words `.feature-grid article` uses.
          Outside the tilt so it stays square to the frame. */}
      <g className="net-chip">
        <rect x={30} y={30} width={196} height={34} rx={17} />
        <text x={128} y={48}>
          ON THE ROADMAP
        </text>
      </g>
    </svg>
  );
}

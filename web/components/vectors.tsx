/**
 * Decorative line-art, drawn in the system's own grammar.
 *
 * These are not icons and not stock illustration. Each one is a diagram of
 * something the product actually does (concentric ranking bands, a coverage
 * grid, a distribution curve, a shielded record) reduced to hairlines and set
 * behind content at low opacity. That is the difference between ornament that
 * belongs to a product and ornament that was available.
 *
 * All are `currentColor` on stroke only, so they inherit the accent and cost
 * nothing to theme. Marked `aria-hidden`, since they carry no information a screen
 * reader needs, because the section beside them says it in words.
 */

type VectorProps = { className?: string };

function Frame({ className, children }: VectorProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.75"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Concentric bands: the ranking signal, as rings rather than a single verdict. */
export function RingsVector({ className }: VectorProps) {
  return (
    <Frame className={className}>
      {[92, 74, 56, 38, 20].map((r, i) => (
        <circle key={r} cx="100" cy="100" r={r} opacity={1 - i * 0.14} />
      ))}
      <circle cx="100" cy="100" r="6" fill="currentColor" stroke="none" />
      <path d="M100 8v184M8 100h184" opacity="0.32" strokeDasharray="3 7" />
      <circle cx="100" cy="44" r="3.5" fill="currentColor" stroke="none" opacity="0.75" />
      <circle cx="144" cy="128" r="2.5" fill="currentColor" stroke="none" opacity="0.5" />
    </Frame>
  );
}

/** A coverage grid: requirements met, partial and missing, as filled cells. */
export function GridVector({ className }: VectorProps) {
  const cells = [
    [0, 0, 1], [1, 0, 1], [2, 0, 0], [3, 0, 1],
    [0, 1, 1], [1, 1, 2], [2, 1, 1], [3, 1, 0],
    [0, 2, 1], [1, 2, 1], [2, 2, 1], [3, 2, 1],
    [0, 3, 0], [1, 3, 1], [2, 3, 2], [3, 3, 1],
  ];
  return (
    <Frame className={className}>
      {cells.map(([x, y, state]) => (
        <rect
          key={`${x}-${y}`}
          x={18 + x * 42}
          y={18 + y * 42}
          width="34"
          height="34"
          rx="6"
          fill={state === 1 ? "currentColor" : "none"}
          fillOpacity={state === 1 ? 0.16 : 0}
          strokeDasharray={state === 0 ? "3 4" : undefined}
          opacity={state === 0 ? 0.45 : 1}
        />
      ))}
    </Frame>
  );
}

/** A distribution with an error band: what "0.83 ± 0.02" looks like drawn. */
export function CurveVector({ className }: VectorProps) {
  return (
    <Frame className={className}>
      <path d="M12 168C48 168 56 44 100 44s52 124 88 124" strokeWidth="1.1" />
      <path
        d="M12 168C48 168 60 62 100 62s52 106 88 106"
        opacity="0.4"
        strokeDasharray="4 5"
      />
      <path
        d="M12 168C48 168 52 28 100 28s56 140 88 140"
        opacity="0.4"
        strokeDasharray="4 5"
      />
      <path d="M12 168h176" opacity="0.55" />
      <path d="M100 44v124" opacity="0.4" strokeDasharray="3 6" />
      {[40, 70, 130, 160].map((x) => (
        <path key={x} d={`M${x} 164v8`} opacity="0.4" />
      ))}
    </Frame>
  );
}

/** A record inside a shield: the privacy section's subject, literally. */
export function ShieldVector({ className }: VectorProps) {
  return (
    <Frame className={className}>
      <path d="M100 16 172 44v58c0 44-30 68-72 82-42-14-72-38-72-82V44Z" strokeWidth="1.1" />
      <path d="M100 34 154 55v46c0 34-22 53-54 64-32-11-54-30-54-64V55Z" opacity="0.35" />
      <path d="M74 92h52M74 110h52M74 128h32" opacity="0.7" />
      <rect x="88" y="60" width="24" height="18" rx="4" opacity="0.7" />
      <path d="M94 60v-7a6 6 0 0 1 12 0v7" opacity="0.7" />
    </Frame>
  );
}

/** Stacked plates: the platform's surfaces, one per phase. */
export function StackVector({ className }: VectorProps) {
  return (
    <Frame className={className}>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} opacity={1 - i * 0.2}>
          <path
            d={`M100 ${28 + i * 38} 172 ${52 + i * 38} 100 ${76 + i * 38} 28 ${52 + i * 38}Z`}
            strokeDasharray={i > 1 ? "4 5" : undefined}
          />
        </g>
      ))}
      <circle cx="100" cy="52" r="4" fill="currentColor" stroke="none" />
    </Frame>
  );
}

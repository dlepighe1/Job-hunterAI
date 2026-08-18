# Cyber Obsidian redesign: design spec

**Date:** 2026-08-12
**Scope:** Marketing shell and app chrome. Palette, surface vocabularies, hero, background.
**Not in scope:** Phase 1b persistence. This lands before it.

---

## 0. Why this exists

The product currently renders as obsidian neumorphism with a periwinkle accent (`#adc6ff`),
recorded in `DESIGN.md`. This spec replaces the palette with Cyber Obsidian, replaces the
hero's abstract orb with three product-specific animated assets, and replaces the flat
ambient-glow ground with a topographic/isometric SVG field.

`DESIGN.md` states `--obsidian` is a fixed brand commitment that must not be tuned. **That
line is superseded by this spec at the owner's instruction.** `DESIGN.md` is a recording of
the built system, so it is rewritten as part of this work rather than left contradicting the
code.

Six decisions were settled before this spec was written:

| Decision | Choice |
|---|---|
| Hero asset technique | Hybrid: generated raster base + coded SVG overlay |
| Hero content honesty | Keep the composition, correct the data |
| Visual system | Retune both vocabularies; do not retire neumorphism |
| Light mode | Removed; dark-only |
| Hero staging | Rotating rail, one asset at a time |
| Background intensity | Subtle at rest, alive near the cursor |

---

## 1. Palette

All values below are measured, not estimated. Ratios computed with the WCAG 2.x relative
luminance formula.

### 1.1 Ground and surfaces

| Token | Value | Role |
|---|---|---|
| `--obsidian` | `#08080C` | page ground |
| `--surface` | `#101016` | lowest extrusion |
| `--surface-2` | `#14141B` | mid |
| `--surface-3` | `#18181F` | highest extrusion (Slate Matte) |

Three steps are required because `--nm-face` is a gradient between `--surface-3` and
`--surface`. A single surface value would collapse the extrusion into a flat rectangle.

### 1.2 Foreground

| Token | Value | Role | vs `--obsidian` | vs `--surface-3` |
|---|---|---|---|---|
| `--text` | `#F0F0F5` | primary copy | 17.60 | 15.55 |
| `--text-dim` | `#B9B9C6` | body copy in cards | 10.30 | 9.10 |
| `--muted` | `#888899` | labels, inactive nav | 5.74 | 5.07 |
| `--cyan` | `#56CCF2` | primary action, focus, selected | 10.77 | 9.51 |
| `--teal` | `#00F5A0` | affirmative: calibrated, covered | 13.87 | 12.25 |
| `--gold` | `#F2C14E` | caution: uncalibrated, degraded | 11.91 | 10.52 |
| `--rose` | `#FF7A8A` | failure: missing, error | 8.00 | 7.07 |

`--gold` and `--rose` are additions. The supplied palette has neither, and `FEATURES.md`
§2.3 requires a distinct visual state for uncalibrated and degraded output. Colour is never
the sole carrier of meaning; every state ships a text label beside its colour.

Primary button ink is `#08080C` on a `#56CCF2` fill, at 10.77:1.

### 1.3 Precision-flat layer

| Token | Value | Note |
|---|---|---|
| `--edge` | `#64708A` | 3.82 vs `--surface`, 4.02 vs `--obsidian`, 3.55 vs `--surface-3` |
| `--edge-soft` | `#2A2F3D` | internal row dividers; decorative, exempt from 1.4.11 |
| `--pf-surface` | `#0B0B10` | |
| `--pf-surface-2` | `#131319` | |

`#64708A` was chosen over the closer `#59647A` because the latter measures 2.97 against
`--surface-3`, below the 3:1 floor. `--edge` must clear 3:1 against **every** surface step,
since panels appear at all three elevations.

### 1.4 Neumorphic shadow pair

`--lit` picks up a cyan tint so the single light source reads as cyan-lit rather than
white-lit:

```
--lit:        rgba(180, 230, 255, 0.045)
--lit-strong: rgba(180, 230, 255, 0.065)
--cast:       rgba(0, 0, 0, 0.75)
--cast-deep:  rgba(0, 0, 0, 0.88)
```

The existing constraint holds: the dark-mode highlight stays under ~6% or it reads as a grey
rectangle rather than a lit edge. Offsets, blurs and the three-elevation limit are unchanged
from the current system.

### 1.5 Light mode removal

Delete `:root.light` and every rule keyed to it. Delete `components/ThemeToggle.tsx` and its
call sites. Delete the inline pre-paint theme script in `app/layout.tsx`; `class="dark"` stays
hard-coded on `<html>`.

The Tailwind ramp overrides in `@theme` must be re-pointed at the new values so
`dark:bg-slate-900` and `var(--surface-2)` stay literally the same colour. `slate` maps onto
the new obsidian ramp; `emerald`→teal, `amber`→gold, `rose`→rose. Any `dark:` utility in
`components/matcher/` needs checking against the retuned ramp, since the variant still resolves
but the underlying value moves.

---

## 2. The two vocabularies, retuned

Neumorphism remains the case; precision-flat remains the readout. The rule that decides which
is unchanged: **if the element carries a value or a state, it is flat.** Single light source
at top-left, three elevations, no more.

Two changes make the chrome belong to the neon hero art rather than sit beside it:

1. `--lit` is cyan-tinted (§1.4).
2. Raised surfaces gain a rim: `inset 0 1px 0 rgba(86, 204, 242, 0.10)`, replacing the current
   `border-top: 1px solid var(--hairline)`. It is a light-source artifact, not a border, so it
   does not violate the no-borders rule.

Selected state is unchanged in structure: accent ring plus tint plus accent label, `inset 0 0
0 1px` at ~55% cyan. **The 3px left bar stays banned.** It is the single most recognisable tell
of AI-generated UI and the ring already clears 3:1 alone.

---

## 3. Background

Three fixed, `pointer-events: none` layers on `.marketing-shell` / `.obsidian-app`.

| Layer | z | Technique |
|---|---|---|
| Topographic contours | -3 | Procedurally generated closed paths, inlined |
| Cursor spotlight | -2 | Radial gradient, `rgba(86,204,242,0.04)`, `translate3d` via rAF |
| Grain | -1 | Existing `--grain` at 3.5% |

**The isometric grid was cut** at the owner's instruction after seeing it built. The background
is regional topography only: contour lines, nothing else. The grid read as a dot lattice
rather than a grid at the specified alphas, and rather than retune it, it goes: two competing
line systems behind body copy is one more than the page can carry. `IsometricGrid.tsx` and the
`.grid-node` flicker animation are deleted, not merely hidden.

**Grain is load-bearing and must not be removed.** Near-black gradients band on 8-bit displays
as concentric rings around every glow. `#08080C` is darker than the previous `#070a0b` ground
in the blue channel, so banding risk goes up, not down.

**Budget:** both SVG layers together ≤15KB gzipped. Every stroke colour is a CSS custom
property so recolouring costs no runtime texture work.

### 3.1 Motion

- **Topographic pulse.** A travelling dash on a **maximum of 10** contour paths, 14s infinite
  loop, staggered start offsets. Capped deliberately: `stroke-dashoffset` animates on the main
  thread, so animating every path is how this becomes jank.

  The current rides an **overlay path on top of an intact contour**. Applying the dash to the
  contour itself draws only ~2.3% of it, which deletes the ring from the elevation sequence
  instead of highlighting it. Paths also declare `pathLength="1000"` so the dash period divides
  evenly and no seam shows at the start point.
- **Cursor spotlight.** `requestAnimationFrame`-throttled pointer tracking driving a
  `translate3d` on a single composited layer. Contours within its radius brighten. This is the
  only element that responds to input.

Node flicker is gone with the grid.

All three collapse under `prefers-reduced-motion: reduce`, and a block already exists at
`globals.css:3134`.

---

## 4. Hero

### 4.1 Layout

Copy pinned left and permanent: eyebrow, `h1`, lede, two CTAs, trust row. It never moves,
never fades, and is never occluded by an asset. The reference video's full-screen takeovers
are explicitly rejected.

Right side is a single framed viewport, a neumorphic case at `--nm-lg`, holding one asset at
a time, with three dot controls beneath it.

### 4.2 Rotation

- 6s dwell, 700ms slide-and-crossfade transition
- Pauses on `:hover` and on `:focus-within`
- Dots are real `<button>`s with `aria-pressed`, keyboard reachable, and act as the sole
  control under reduced-motion (where auto-rotation does not run at all)
- The frame has a fixed aspect ratio so rotation never reflows the page

### 4.3 The three assets

Each is a generated raster base (transparent PNG, near-black ground) with an absolutely
positioned SVG/DOM overlay carrying everything that moves.

**Asset 1: Job application interface.** Base: laptop, magnifier, floating cards. Overlay:
magnifier lens sweep, cards drifting on staggered offsets, table rows highlighting in
sequence.

**Asset 2: The two plates.** Base: both plate bodies. Overlay: score rings counting up,
coverage meters filling, connecting arrow drawing.

**Asset 3: Network graph.** Base: nodes and avatars, **reflective ground plane removed**.
Overlay: edges drawing in, node pulse.

### 4.4 Content corrections

The reference art shows data the product cannot produce. `DESIGN.md` "Content rules that
outrank visual ones" #3 and `FEATURES.md` §2.3 both forbid it, and the previous redesign
already removed one such figure. Compositions are kept; content is corrected.

| Reference shows | Ships as | Why |
|---|---|---|
| `76 → 92 Elevated Score` | `61 → 74 after tailoring`, both labelled calibrated | The model never predicts above 0.85 |
| `Revamp & Elevate` | `Re-scored after tailoring` | The product does not rewrite resumes; the user's edits moved the score |
| `+68% Match Improvement` | Cut | Not a figure the model produces |
| `100% ATS Compatibility` | `coverage 4/7 → 6/7` | Coverage is real output; an ATS compatibility percentage is not |
| Real logos (Stripe, Google, Notion, Microsoft) and named people | Anonymised geometric marks, generic avatars | §6 excludes profiling people who have not consented |
| Populated applications pipeline | Kept, with the existing illustration label | Phase 1c is unbuilt |

Every asset keeps a visible `ILLUSTRATION OF THE MATCHER'S OUTPUT, NOT A REAL ANALYSIS`
caption. The network asset additionally carries an `ON THE ROADMAP` chip, matching how the
feature grid already labels unbuilt work.

### 4.5 Performance

- Each hero PNG capped at ~180KB, explicit `width`/`height` to reserve layout
- Only the first asset eager-loaded; the other two lazy
- The first asset must not be the LCP element if a text-only LCP is achievable

---

## 5. Slop audit

Findings to fix as part of this work:

1. `.hero-chip` sits at `left: -8%` / `right: -6%` and will overflow narrow viewports. The
   whole chip system is replaced by the asset rail, so this resolves by deletion.
2. The four-equal-cards `.feature-grid` is a templated pattern. Vary emphasis so the live
   feature reads as primary and the deferred ones recede.
3. `.trust-row` reads as badge soup: three identical pills with identical dots.
4. `h1 { max-width: 13ch }` orphans "missing." awkwardly at several widths.
5. `globals.css:147`: dead `--muted: #79838700;` immediately overridden on the next line.
6. Responsive ladder is 1080 / 900 / 760 / 520. **These blocks must be read before layout
   changes, not after**, because the hero, product window and security grid all have rules there that
   this spec's layout changes would otherwise silently break.

---

## 6. Files

| File | Change |
|---|---|
| `web/app/globals.css` | Palette, vocabularies, hero, background. Largest change. |
| `web/app/layout.tsx` | Remove theme script |
| `web/app/(marketing)/page.tsx` | Hero replacement |
| `web/components/ThemeToggle.tsx` | Delete |
| `web/components/hero/` | New: `HeroShowcase.tsx` plus one overlay component per asset |
| `web/components/backdrop/` | New: `ObsidianBackdrop.tsx`, grid and contour SVGs |
| `web/public/img/hero/` | New: three generated PNG bases |
| `DESIGN.md` | Rewrite to record the built system |

Each hero overlay is its own component with one responsibility, so an asset can be changed
without touching the rail, and the rail can be changed without touching an asset.

---

## 7. Risks

1. **Asset consistency.** Three generated images must agree on light direction, palette and
   perspective. This is the least predictable part of the work and may need several generation
   passes. Mitigation: generate all three from one locked prompt skeleton, varying only the
   subject.
2. **LCP.** Three raster assets in the hero. Mitigated by §4.5, but worth measuring rather
   than assuming.
3. **Light-mode removal reach.** Every `dark:` utility in `components/matcher/` resolves
   through the Tailwind ramps being re-pointed. Compiles either way, so this needs visual
   checking, not just a passing build.
4. **Contrast regressions.** Every ratio in §1 is measured. Any new colour pair introduced
   during implementation gets measured too, not eyeballed.

---

## 8. Acceptance

- Every ratio in §1 verified by script, not by eye
- No user-facing string claims a figure the model cannot produce
- Hero rotation pauses on hover and focus, and does not auto-run under reduced-motion
- Background motion collapses entirely under reduced-motion
- No horizontal scroll at 1080 / 900 / 760 / 520
- `npm test` passes, including `db.boundary.test.ts` and `nav.test.ts`
- `DESIGN.md` describes what is actually in `globals.css`

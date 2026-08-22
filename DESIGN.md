# DESIGN.md: ResumeAI

Recorded from the built system, not from intention. Everything below is in
`web/app/globals.css` unless noted.

---

## The one idea

**Every surface is extruded from the ground, never placed on top of it.**

There is one light source for the entire product, fixed at top-left. A surface is defined by
how it catches that light: a highlight on its top-left edge, a cast shadow to its
bottom-right, not by a border. Anything with a 1px outline as its primary definition is off
system.

The corollary that matters most: **a shadow that disagrees with the light source reads as a
mistake even to someone who cannot say why.** Never flip an offset's sign to "balance" a
composition.

## Ground and surfaces

**Dark only.** There is no light mode and no theme script: `class="dark"` is static on
`<html>`, so obsidian paints on the first frame with nothing to hydrate or downgrade.

| Token | Value | Role |
|---|---|---|
| `--obsidian` | `#08080C` | page ground |
| `--surface` | `#101016` | lowest extrusion |
| `--surface-2` | `#14141B` | mid |
| `--surface-3` | `#18181F` | highest |

These four are the Cyber Obsidian ramp. An earlier revision of this file called `--obsidian`
a fixed brand commitment that must not be tuned; that was superseded deliberately. The ground
moved off a green-cast near-black onto a neutral one with a faint violet cast, which the cyan
accent sits on without the two fighting. (The retired values are deliberately not written
here. This file records what ships, and a dead hex in a doc is one copy-paste away from
coming back.)

They are not tunable by eye now either, but for a better reason: `lib/palette.test.ts`
asserts every one of them, and asserts that body text clears 4.5:1 and `--edge` clears 3:1
against **all four**. Change a surface and the suite tells you which pairing you broke.

Light mode was removed rather than retuned. Maintaining a second full palette that clears
contrast on every surface, for a product whose entire identity is a dark instrument panel,
was cost with no reader.

## The shadow vocabulary

Three elevations, and no more. Past three the light source stops being legible.

```
--nm-sm     -3px -3px 8px  lit,  4px  4px 12px cast    /* chips, buttons at rest      */
--nm        -6px -6px 16px lit,  9px  9px 26px cast    /* cards, panels               */
--nm-lg    -10px -10px 30px lit, 16px 16px 44px deep   /* hero frame, product window  */
--nm-float -14px -14px 38px lit, 22px 22px 60px deep   /* hover only                  */
--nm-inset  inset, reversed                            /* wells, inputs, rails        */
```

`--lit` is **cyan-tinted**, `rgba(180, 230, 255, 0.045)` rather than plain white. One light
source means one light *colour*, and a white highlight over a cyan-accented world reads as a
second, colder lamp. It must stay under ~6%, because above that it reads as a grey rectangle rather
than a lit edge.

Pair every shadow with `--nm-face` (a 145° gradient between `--surface-3` and `--surface`).
The gradient is what sells the extrusion; the shadow alone leaves a flat rectangle.

**The rim is part of the shadow, not a border.** Raised surfaces carry
`inset 0 1px 0 rgba(86, 204, 242, 0.1)` folded into their `box-shadow`, which is the top edge
catching the light. It was previously a `border-top: 1px solid var(--hairline)`, which is
the one thing the system forbids: an element defined by an outline. It looks identical and
is categorically different, and every raised surface now states it the same way.

**The icon well** is the system's most legible gesture and repeats deliberately: an inset
socket (`--nm-inset`) with a raised, accent-coloured icon inside it. Used in `.feature-icon`,
`.proof-list span`, `.security-grid article > span`, and the sidebar nav.

## Type

Self-hosted from `web/public/fonts`. **Nothing loads from a CDN, and nothing may.** Before
this redesign the stylesheet named Inter / Hanken Grotesk / Geist Mono and loaded none of
them; every visitor rendered in Segoe UI. That single bug was the largest single contributor
to the product looking unfinished. Clash Display and Satoshi are preloaded in `<head>`.

| Face | Role | Weights |
|---|---|---|
| **Clash Display** | headings, product mark, card titles, field labels | 200–700 var |
| **Satoshi** | all body copy | 300–900 var + italic |
| **JetBrains Mono** | numbers, labels, eyebrows, buttons, any value | 400 / 500 / 700 |

Every number a user might compare (scores, correlations, latencies, word counts) is mono
and `tabular-nums`. Ranked lists must not shift as digits change.

Scale is fluid and capped: `h1` `clamp(2.6rem, 5.2vw, 4.4rem)`. The old hero rendered at
**102px** on a 1440 viewport and consumed the whole fold, then dropped to 11px inside cards
with nothing between. Do not reintroduce a step larger than the ratio here allows.

`.eyebrow` / `.page-kicker` is the one small-label style: 11px mono, `0.16em` tracking,
uppercase, `--muted`.

## Colour

Restrained: obsidian plus one accent.

- `--cyan` `#56CCF2`: the only accent. Interactive, selected, emphasised.
- `--teal` `#00F5A0`: affirmative state (covered, calibrated, guarantees).
- `--gold` `#F2C14E`: caution (uncalibrated, degraded, costs money, unbuilt).
- `--rose` `#FF7A8A`: failure (missing, error, destructive).

The names are the tokens. `--blue` and `--mint` existed as transitional aliases during the
migration and are gone; `lib/palette.test.ts` fails if either comes back, because two names
for one colour is how a palette quietly forks.

All four clear 4.5:1 against all four surfaces, asserted rather than eyeballed. `--edge`
`#64708A` clears 3:1 against all four, and `#59647A` was rejected at 2.97 on `--surface-3`.

Colour is never the sole carrier of meaning: every state ships a text label beside its
colour and icon (SPEC Part 7).

**Tailwind's ramps are overridden in `@theme`**, not worked around. `slate` maps onto the
obsidian ramp and the three semantic hues onto teal/gold/rose, so `dark:bg-slate-900` and
`var(--surface-2)` are literally the same colour. The matcher components are Tailwind-authored
and the marketing shell is hand-written CSS; this is what keeps them one system. If you add a
Tailwind colour utility, check its ramp is mapped first.

**Accent presets** live once, in `lib/accents.ts`. There are five, each with its own hover.
The list was previously duplicated between Settings and the app layout, and the hover was a
single hard-coded periwinkle applied to every choice, so picking Gold produced a periwinkle
hover.

## Rhythm

One spacing scale, viewport-relative:

- `--gap-section` `clamp(4.5rem, 8vw, 7.5rem)`: between marketing sections
- `--gap-block` `clamp(2rem, 3.5vw, 3.25rem)`: heading to content
- `--shell` `min(1180px, 92vw)`: the measure everything aligns to

More space above a heading than below it. The pre-redesign page ran ~200–250px of unrelated
dead air between sections; that is the failure this scale exists to prevent.

## Motion

`--ease` `cubic-bezier(0.22, 1, 0.36, 1)` on everything. Transitions 0.24–0.42s.

Motion is material, not decoration: cards rise on hover (`--nm` → `--nm-float`), buttons press
in (`--nm-sm` → `--nm-inset`), the hero rail cross-fades on a 6s dwell, the backdrop's data
currents travel on a 14s loop. Because the light is fixed, a pressed control genuinely
inverts its shadow rather than changing colour.

All of it collapses under `prefers-reduced-motion`. Two things need more than the blanket
`animation-duration: 0.001ms` rule to do that honestly, and both are handled explicitly: the
hero rail does not auto-advance at all (its dots still work, since the setting asks for no
*unbidden* motion, not a frozen page), and the spotlight is pointer-driven rather than
keyframed, so the blanket rule cannot reach it.

## Components

Marketing: `.marketing-nav` (inset pill nav) · `.hero-section` / `.hero-showcase` ·
`.product-window` · `.feature-grid` · `.precision-section` / `.analysis-card` ·
`.security-grid` · `.waitlist-grid` · `.final-cta`

App: `.obsidian-app` (inset sidebar + stage) · `.side-nav__item` (raised when active) ·
`.obsidian-panel` · `.roadmap-list` · `.spec-list` · `.stage-narrow` · `.callout`

Forms: `.nm-input` · `.nm-textarea` · `.nm-segment` / `.nm-option` (segmented control,
`aria-pressed`) · `.field__head` / `.field__count`

Feedback: `.notice[data-tone]` · `.form-status[data-tone]` · `.empty-state` · `.skeleton` ·
`.result-panel` · `.coverage-row[data-state]` · `.chip`

Buttons: `.button` + `.button--primary` / `--light` / `--ghost`. Icons inside buttons are
sized by `.button svg` at 15px, because an unsized 24×24 viewBox stretches to the line box and forces
a three-line wrap.

## Content rules that outrank visual ones

These come from SPEC Appendix B and are not style preferences.

1. **No percentage fit.** The score renders as "72 out of 100", never "72%".
2. **Calibration is always stated.** An uncalibrated number is not comparable to a calibrated
   one, and the UI says which it is every time.
3. **Never invent data to fill a layout.** The pre-redesign pages showed fabricated pipelines,
   an "18.7% interview rate", and "98.4% MATCH", a figure the model cannot produce. An honest
   empty state is not a worse design than a fake full one.
4. **Illustrations are labelled.** The landing page's product window and every panel of the
   hero rail say "ILLUSTRATION OF THE MATCHER'S OUTPUT, NOT A REAL ANALYSIS". The network
   panel says "ON THE ROADMAP, NOT A BUILT FEATURE", because that one is not an
   illustration of something the product does. It is an illustration of something it does
   not do yet.
5. **Deferred features say why they are deferred**, in product voice, without pretending to
   work.
6. **No score above 85.** The model never predicts above 0.85. `components/hero/copy.test.ts`
   greps the overlays for a violation, because the person most likely to type 92 into a hero
   is the person least likely to know that.

## The two vocabularies

The system is deliberately bilingual. **Neumorphism is the case; precision-flat is the
readout.**

| | Neumorphic | Precision-flat |
|---|---|---|
| Defined by | light and shadow | an explicit `--edge` border |
| Use for | chrome, nav, cards, marketing, empty states | tables, stats, rows, **any selected state** |
| Boundary contrast | ~1.1:1 (decorative only) | `--edge` 3.48:1 |
| Padding | generous, a shadow needs room | tight, density is the point |

The rule that decides which: **if the element carries a value or a state, it is flat.** If it
is the container around such things, it is neumorphic. `.analysis-card` on the landing page is
the canonical example: a neumorphic card holding a `.pf-panel` readout.

This exists because neumorphism was measured failing WCAG 1.4.11 on every boundary
(~1.1:1 against a 3:1 requirement). Rather than abandon the style, data surfaces opted out of
it. Phase 1c's Applications table must be built in the flat vocabulary.

**It was.** `components/applications/ApplicationsTable.tsx` is `.pf-table` inside a
`.pf-panel`: `--edge` on the panel, `--edge-soft` on the internal row rules, tight padding,
no neumorphic shadow anywhere in it. The internal rules staying at 1.72:1 is deliberate and
not an oversight, since a divider between rows is a decorative separator, which 1.4.11 exempts,
and taking them to 3:1 draws a cage that makes the readout harder to scan rather than
easier. The panel edge and the row text carry identification.

Selected rows use the ring: `inset 0 0 0 1px` at ~55% cyan plus a 7% tint. No left bar.

Two details in that table are content rules wearing visual clothes. The score cell renders
`72 out of 100 · calibrated`, never a percentage, and the calibration state never drops off
in a narrow column. An unscored row renders an em dash at `--muted` rather than a `0` at
`--text`, so a column of "not measured yet" can never be mistaken for a column of readings.

### Selected state: ring, never a side bar

Selected states use an **accent ring plus tint plus accent label**: `inset 0 0 0 1px` at
~55% blue, measured 3.70:1 (engine picker) and 3.36:1 (sidebar). Never the raised shadow
alone, which measures 1.07:1.

A 3px left bar was tried and removed. It is the single most recognisable tell of
AI-generated UI, the project's design detector flags it by name, and it was redundant, since the
ring already cleared 3:1 on its own.

## Obsidian depth

`components/backdrop/ObsidianBackdrop.tsx` holds four fixed, `pointer-events: none`,
`aria-hidden` layers behind everything, at z-indices −4 to −1. It replaced
`.marketing-shell::before/after`, so one component owns the whole stack instead of it being
split between two pseudo-elements and nothing being able to see the others.

1. **Ambient colour field** (−4): three low-alpha radials (`--glow-cyan`, `--glow-teal`) so
   5000px of scroll is not one flat black.
2. **Topographic contours** (−3): 30 static paths, generated once by
   `scripts/generate-contours.mjs` and committed as literal `d` attributes rather than built
   at runtime. Ten of them carry a second, dashed copy on top, the **data currents**, a
   short dash travelling the path on a 14s loop. The currents are separate paths laid *over*
   intact contours, never the contours themselves: a dasharray leaves 2% of a line drawn, so
   applying it to a contour would delete that ring from the map. `pathLength="1000"` makes
   the dash units path-relative, so one cycle returns the pattern exactly where it started
   and the loop has no seam.
3. **Cursor spotlight** (−2): `components/backdrop/Spotlight.tsx`, a soft cyan disc
   following the pointer. Written straight to the node's `transform` inside one shared
   `requestAnimationFrame`, never through React state, because a `setState` per pointer event would
   re-render the tree at mouse-report rate to move one gradient. It declines to run entirely
   under reduced motion *and* on coarse pointers, and stays at opacity 0 until it has a real
   coordinate, so it never sits glowing in the top-left corner.
4. **Grain overlay at 3.5%** (−1): on top of every gradient. Near-black gradients band badly
   on 8-bit displays, visible as concentric rings around every glow; `#08080C` makes that
   worse rather than better. The noise dithers those steps away and is the actual reason the
   obsidian reads as deep rather than stale. Do not remove it when adding glows; **it is
   load-bearing.**

An isometric grid layer was specified and cut during the build. The brief asked for subtle
regional topography, and a lattice behind the contours was a second competing texture rather
than support for the first.

The whole stack costs one composite layer each and nothing ever enters hit-testing or
reflow. The only main-thread work is the ten currents' `stroke-dashoffset`, which is why the
count is capped at ten and `backdrop.test.tsx` enforces the cap.

## The hero rail

`components/hero/HeroShowcase.tsx`. Copy pinned left and permanent; a fixed-ratio framed
viewport right, rotating through three product illustrations on a 6s dwell with three dot
controls beneath.

It replaced an extruded orb carrying three drifting stat chips. The orb showed nothing about
the product, being merely a shape, and the chips put three unrelated figures in a visitor's face
before they had read the headline.

Four properties are load-bearing:

- **The frame has no case.** No fill, no shadow, no rim, no clipping: it reserves height
  and nothing else. It used to be a neumorphic plate, which boxed the illustration in and
  cost it width on every side.
- **The frame's `aspect-ratio` is fixed** and all three panels share one grid cell, so
  rotation cannot reflow the page. Content moving under a reader who did not ask for it is
  the failure a carousel is most prone to.
- **It pauses on hover and on focus.** Anything else fights someone reading, or yanks the
  panel away from someone tabbing the dots.
- **The dots are real `<button>`s** with `aria-pressed` and an accessible label naming the
  asset. The visible dot is 7px; the button around it is 32px.
- **Nothing readable is baked into a raster.** Every figure is drawn in SVG by an overlay in
  `components/hero/`. The reference art had `92`, `+68%` and `100% ATS Compatibility` in its
  pixels (three figures the model cannot produce) and correcting those meant regenerating
  the art and hoping it came back matching its siblings. Now it is a one-line diff.

**Two of the three assets have no raster at all.** The plates and the contact graph are flat
product UI (panels, rows, pills, meters, cards) and that is the one thing an image model
cannot be asked for. Prompted for empty panels and unlabelled dials it returned objects that
read as a door intercom and as five billiard balls, because the description fits hardware as
readily as software. Drawn as SVG they are crisp at any size, take their colour from these
tokens, and every string is in the component.

Only `applications.webp` survives, because a laptop in three-quarter view is a genuinely
three-dimensional object. It is a photorealistic 1600x900 render produced image-to-image
from the reference art, and its edges are **feathered to transparent** by
`scripts/prepare-hero-assets.mjs`, because the hero frame no longer paints a case, so an asset with
a hard near-black rectangle would read as a floating box against a ground it does not quite
match. Its table is mapped onto the screen by an affine matrix in
`ApplicationsOverlay`, an approximation to a real perspective projection, off by a few
percent at the far edge and invisible at this size. Prompt and provenance for that one raster:
`docs/plans/hero-asset-prompts.md`.

**The contact graph carries four real trademarks**, Stripe, Google, Notion and Microsoft,
at the owner's explicit direction, matching the reference art. That is a claim of
association on a page for a feature that does not exist, and it is recorded here rather
than argued. `NetworkOverlay`'s `CONTACTS` and `CARDS` arrays are the single place to
revert it, and `copy.test.ts` documents the narrowing that lets it through: fabricating a
*pipeline* of named employers is still banned, because the applications tracker is unbuilt
and every such row would be evidence of a feature that does not exist.

The overlays reproduce the reference compositions closely. What differs is only content the
model cannot produce, and each component's docblock carries the table of exactly what and
why: `61 → 74` rather than `76 → 92`, coverage counts rather than an ATS-compatibility
percentage, the published `0.83` correlation rather than an interview-potential claim, and
generic marks rather than real companies' logos.

## Anchors and the header

`html` carries `scroll-padding-top: clamp(96px, 11vh, 132px)`. The header floats over the
content rather than reserving space, so an anchor jump used to land a section's true top
underneath the bar, so the eyebrow and the first line of the heading were both swallowed and
the section arrived looking half-scrolled. It is set on `html` rather than per-section so
anything given an id inherits it.

**The nav indicator needs `left: 0`.** It is absolutely positioned inside a flex container,
so without an explicit inline offset it falls back to its static position, the nav's own
5px of padding, and the JS then adds `translateX(tab.offsetLeft)`, which already includes
that same 5px. The pill sat 5px right of its tab and read as a lopsided capsule with the
label off-centre.

## The header

Fully transparent, `pointer-events: none` on the container and `auto` on its children. The
blur belongs to the pill and the Get-started button, not the bar.

It previously painted a translucent obsidian plate the full width of the shell, which slid
over content as a visible rectangular patch. The replacement for legibility is
`.marketing-nav::before`: a full-bleed gradient fading to zero over 130px. It has no side
edges (100vw) and no bottom edge (fades to transparent), so it darkens what passes beneath
without ever reading as a shape. **Never reintroduce a bounded plate here.**

Active section is resolved by a rAF-throttled scroll handler, not an IntersectionObserver, because
these sections are taller than any sensible detection band, so a section could fill the
viewport without its ratio crossing a threshold. The observer version silently failed on
Platform. The indicator is one element translated between tabs so movement reads as a single
continuous object.

## Vectors

`components/vectors.tsx` holds hairline SVG line-art, `currentColor`, `aria-hidden`. Each is a
diagram of something the product does (ranking bands, a coverage grid, a distribution with
its error band, a shielded record, stacked phase plates), not generic ornament. Placed with
`.section-vector` / `.panel-vector` at 11–14% opacity, hidden under 900px.

Note the specificity trap: `.platform-section > *` and `.section-vector` have identical
specificity, so the content-lifting rule must carry `:not(.section-vector)` or it resets the
vector to `position: relative` and drops it into flow.

## Motion

- Scroll reveal (`components/Reveal.tsx`) is one-way, and the observer disconnects after firing. The
  hidden state lives in CSS and is force-cleared under `prefers-reduced-motion`, so a failed
  mount leaves content visible rather than permanently transparent.
- Route transitions via `experimental.viewTransition` in `next.config.ts`, animated through
  `::view-transition-old/new(root)`.
- Auth drawer: 460ms entrance, 300ms exit held open before unmount so it does not snap.

## Auth drawer

`app/(marketing)/_components/AuthDrawer.tsx`. Clerk `<SignIn>`/`<SignUp>` with
`routing="hash"` (the supported embedded mode) inside a custom right-hand drawer. Clerk is
themed onto this product's tokens rather than its own dark preset. Escape closes, focus
returns to the trigger, body scroll locks, and the Clerk hash is cleared on close so it does
not collide with the section anchors.

## The product surfaces

Four authenticated screens carry the product, and each answers a different question. The
constraint that decides what belongs on the Dashboard is that no two panels may answer the
same one, which is why there is no "Upcoming" (interview dates live on the applications they
belong to), no "Today's Mission" (Priority Targets already answers it), and no composite
"pulse" score (a number with no defined interpretation is less useful than one sentence of
Career Intelligence).

### The accent that earns its own hue

`--violet #b3a4ff` was added for **derived intelligence**: Role Landscape, Career
Intelligence, anything the system inferred rather than counted. Cyan is a number the user
produced; violet is a pattern the system claims to see in it. Blurring those two is the
specific failure this product is built to avoid, so they do not share a colour.

It measures 8.13:1 at worst against `--surface-3`, putting it in the same band as cyan (9.51)
and gold (10.52) rather than merely clearing the 4.5 floor. `palette.test.ts` enforces it.

### Baseline versus tailored

The single most important distinction in the schema, and it is a product rule before it is a
technical one. A **baseline** analysis scored the user's original résumé. A **tailored** one
scored a résumé this product rewrote. Only baseline rows may feed Role Affinity or Career
Intelligence.

Tailoring exists to raise a score. Feeding tailored scores back into the career profile would
have the system grade its own homework, reporting the user as strongest in whichever
direction it most recently helped them rewrite. `analyses.is_baseline` carries it,
`lib/career.ts` filters on it, and `career.test.ts` fails if the filter is removed.

### One drawer

`components/ui/Drawer.tsx`. Hunt, application details, résumé preview and role details all
use it. Four separate implementations is the outcome avoided: they drift on width, on timing,
and on whether focus is trapped, which is the one that actually hurts. Escape closes, focus returns
to the trigger, the page behind does not scroll or shift, and nothing renders when closed.

### What the charts refuse to compute

`lib/velocity.ts` and `lib/analysis-insights.ts` both exist so no metric is derived inline in
a component where nothing can test it. Between them they deliberately do NOT produce: an
interview rate, a mean score, a conversion rate under five applications, or component scores
("skills 88 / experience 83") that no engine in this product measures. Each refusal has a
test.

## Known open items

- ~~The app pages beyond `/matcher` were verified by build, not by screenshot.~~
  **Closed 2026-08-18.** All seven authenticated screens (Dashboard, Applications, Resumes,
  Network, Outreach, Settings and Matcher) were walked in a browser under `DEV_BYPASS_AUTH=1`,
  which serves the fixture user without Clerk and so removes the blocker this item described.
  Each renders on the obsidian ground (`rgb(8, 8, 12)`) with no horizontal scroll at 1440,
  1080, 900, 760, 520 or 390. The only console error across all seven is the scoring
  service's 503, which is the correct report when `localhost:8000` is not running.
  What this pass does **not** cover is a real signed-in write: dev mode is backed by
  in-memory fixtures and touches no database, so the foreign-key class of bug described
  below is still only reachable with a provisioned Supabase project.
- Related, and the reason the above is not merely fastidious: shipping Applications
  introduced a foreign-key bug. Nothing called `ensureProfile`, so every new user's first
  save would have failed, and no test caught it because the tests mock the insert. Only a
  real signed-in write would have found it. It is fixed, but the class of bug is not.

  **Narrowed 2026-08-18** by `web/lib/db.schema.test.ts`, which checks every column
  `lib/db.ts` names against `supabase/schema.sql`: 274 references across all nine tables,
  including columns added by `alter table ... add column if not exists`, which a parser
  reading only the `create` bodies reports as missing. It covers the cheapest and most likely
  half of this class — a renamed or misspelled column, which every mocked test accepts and
  which then fails only against the real project. It cannot cover types, nullability,
  constraint violations or foreign keys, so a live signed-in write is still the thing that
  would have caught the `ensureProfile` bug itself.
- ~~`ObsidianBackdrop` is mounted on the marketing shell only.~~ **Closed 2026-08-18.** The
  backdrop now renders on `.obsidian-app` as spec §3 always specified, verified on all seven
  app screens at six widths: fixed, `z-index: -4`, `pointer-events: none`, 30 contours and 10
  animated currents, and it still collapses under reduced motion. The grid layout is
  unchanged (sidebar at x=0 w=264, stage at x=264) because the backdrop root is
  `position: fixed` and so never becomes a grid item.

  Mounting it required splitting the route layout. `ObsidianBackdrop` is a server component
  that ships no JavaScript, and `app/(app)/layout.tsx` was `"use client"` for its Clerk and
  `usePathname` hooks — importing one into the other would have pulled the contour field into
  the client bundle with no visible symptom. The layout is now a server component that passes
  the backdrop into `components/AppShell.tsx` as a prop. `components/backdrop/mount.test.ts`
  fails if either shell stops mounting it, or if either file gains a `"use client"`
  directive.
- `.hero-showcase__frame` sets `background: none` (`globals.css:3767`), not a token-coloured
  surface. Earlier notes claimed the opposite and were wrong. Nothing rests on it today.
  The obsidian ground shows through the frame, and the eager asset finishes loading 35ms
  into a production page load, before `DOMContentLoaded` at 61ms, but the frame is not the
  placeholder it was once described as, and any future work assuming one should read this.

  **Measured 2026-08-18 (Lighthouse 12, `next start`).** The hero raster is confirmed to be
  the LCP element, not the `h1`, on both the mobile and desktop presets. This is recorded as
  acceptable rather than fixed: desktop FCP is 1.2s against LCP 2.0s, so the copy is legible
  roughly 800ms before the image lands, and CLS is 0 because the frame reserves its 16/9 box.
  Around 585ms of that 2.0s is Clerk's dev-instance handshake, which a production instance
  does not perform. Giving the frame a placeholder background would not improve any of this
  and would undo a deliberate Task 10 choice.
- The hero overlays are positioned in the raster's 1120x630 coordinate space by measurement
  against the committed images. Regenerating an asset means re-checking those coordinates,
  because the overlay will not tell you it has drifted, it will just sit slightly off its dial.

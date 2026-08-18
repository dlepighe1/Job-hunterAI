# Cyber Obsidian Redesign Implementation Plan

> **How to use this plan:** implement it task by task, in order. Steps use checkbox
> (`- [ ]`) syntax so progress is trackable in the file itself.

**Goal:** Replace the obsidian/periwinkle neumorphic system with the Cyber Obsidian palette, an SVG topographic background, and a hero rail rotating through three product assets.

**Architecture:** Four sequential passes. Pass A migrates design tokens and removes light mode. Pass B builds the background as fixed, pointer-events-none layers. Pass C replaces the hero orb with a rotating rail of raster-plus-SVG-overlay assets. Pass D fixes the audit findings and rewrites the recorded design docs. Each pass leaves a deployable app.

**Tech Stack:** Next.js 16, React 19, Tailwind 4 (`@theme`), vanilla CSS custom properties, Vitest, Clerk.

**Spec:** `docs/design/2026-08-12-cyber-obsidian-redesign-design.md`

## Global Constraints

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Per `web/AGENTS.md`,
  this Next version has breaking changes from earlier releases; check the guide rather
  than relying on familiarity with an older API.
- **No git operations from this plan.** Commits are made by hand, deliberately, after a
  finished task has been reviewed. Finish a task, record what changed, and stop.
- **Palette values are exact:** `--obsidian #08080C`, `--surface #101016`, `--surface-2 #14141B`, `--surface-3 #18181F`, `--text #F0F0F5`, `--text-dim #B9B9C6`, `--muted #888899`, `--cyan #56CCF2`, `--teal #00F5A0`, `--gold #F2C14E`, `--rose #FF7A8A`, `--edge #64708A`, `--edge-soft #2A2F3D`, `--pf-surface #0B0B10`, `--pf-surface-2 #131319`.
- **Contrast floors:** body text ≥4.5:1, non-text UI and `--edge` ≥3:1 against **every** surface step.
- **Copy constraints (`FEATURES.md` §2.3, Appendix B):** no percentage fit, no score above 85, calibration always stated, never claim the model detects keyword stuffing, never invent data to fill a layout.
- **Motion:** everything collapses under `prefers-reduced-motion: reduce`.
- **No CDN.** Fonts and assets are self-hosted; nothing loads from a network origin.
- **Tests run offline.** No model downloads, no API calls, no live database.
- **Do not reintroduce a 3px left bar** for selected state, or a bounded plate behind the nav.

---

# PASS A: Tokens and light-mode removal

### Task 1: Palette tokens, enforced by a contrast test

**Files:**
- Create: `web/lib/palette.test.ts`
- Modify: `web/app/globals.css:130-252` (the `:root` and `:root.light` blocks)

**Interfaces:**
- Consumes: nothing
- Produces: the token names in Global Constraints, available to every later task

- [x] **Step 1: Write the failing test**

Create `web/lib/palette.test.ts`. The luminance helper lives in the test file, since it is a test-only concern and does not belong in shipped code.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/**
 * Extract a custom property's value from the first :root block.
 *
 * Lower-cased on the way out. The stylesheet writes hex lower-case and these assertions
 * are about the colour, not its spelling. A case mismatch failing the suite would be
 * noise, not a finding.
 */
function token(name: string): string {
  const root = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}", CSS.indexOf(":root {")));
  const match = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found in :root`);
  return match[1].trim().toLowerCase();
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["obsidian", "surface", "surface-2", "surface-3"] as const;

describe("Cyber Obsidian palette", () => {
  it("declares the exact ground and surface values", () => {
    expect(token("obsidian")).toBe("#08080c");
    expect(token("surface")).toBe("#101016");
    expect(token("surface-2")).toBe("#14141b");
    expect(token("surface-3")).toBe("#18181f");
  });

  // Body copy has to clear 4.5:1 on every surface it can land on, not just the darkest.
  it.each(["text", "text-dim", "muted"])("%s clears 4.5:1 on every surface", (fg) => {
    for (const bg of SURFACES) {
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["cyan", "teal", "gold", "rose"])("%s clears 4.5:1 on every surface", (fg) => {
    for (const bg of SURFACES) {
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  // 1.4.11: --edge is the primary definition of every precision-flat panel, and panels
  // appear at all three elevations. #59647A was rejected here, since it measures 2.97 on
  // --surface-3.
  it("--edge clears 3:1 against every surface step", () => {
    for (const bg of SURFACES) {
      expect(contrast(token("edge"), token(bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it("primary button ink clears 4.5:1 on the cyan fill", () => {
    expect(contrast("#08080C", token("cyan"))).toBeGreaterThanOrEqual(4.5);
  });

  it("has no light-mode block", () => {
    expect(CSS).not.toContain(":root.light");
  });

  it("declares no token twice in :root", () => {
    const root = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}", CSS.indexOf(":root {")));
    const names = [...root.matchAll(/--([\w-]+):/g)].map((m) => m[1]);
    expect(names).toHaveLength(new Set(names).size);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: FAIL. `expect(token("obsidian")).toBe("#08080C")` receives `#070a0b`. The duplicate-token test also fails on the dead `--muted: #79838700;` at `globals.css:147`.

- [x] **Step 3: Replace the `:root` block**

In `web/app/globals.css`, replace the token declarations inside `:root` (lines ~131-155). Keep the elevation recipes, radii, spacing and `--ease` exactly as they are; only colours change here.

```css
  /* Ground + extruded surfaces, darkest to lightest. */
  --obsidian: #08080c;
  --surface: #101016;
  --surface-2: #14141b;
  --surface-3: #18181f;

  /* The dual shadow. --lit is the top-left highlight, --cast the bottom-right shadow.
     Cyan-tinted so the single light source reads as cyan-lit rather than white-lit; the
     alpha stays under ~6% or the highlight reads as a grey rectangle, not a lit edge. */
  --lit: rgba(180, 230, 255, 0.045);
  --lit-strong: rgba(180, 230, 255, 0.065);
  --cast: rgba(0, 0, 0, 0.75);
  --cast-deep: rgba(0, 0, 0, 0.88);

  --text: #f0f0f5;
  --text-dim: #b9b9c6;
  --muted: #888899;
  --hairline: rgba(86, 204, 242, 0.07);

  --cyan: #56ccf2;
  --teal: #00f5a0;
  --gold: #f2c14e;
  --rose: #ff7a8a;
```

Delete the dead `--muted: #79838700;` line entirely.

Then update the precision-flat block (lines ~194-198):

```css
  --edge: #64708a;
  --edge-soft: #2a2f3d;
  --pf-surface: #0b0b10;
  --pf-surface-2: #131319;
```

And the ambient fields (lines ~201-202):

```css
  --glow-cyan: color-mix(in srgb, var(--cyan) 9%, transparent);
  --glow-teal: color-mix(in srgb, var(--teal) 6%, transparent);
```

- [x] **Step 4: Alias the retired names so nothing breaks mid-pass**

`--blue` and `--mint` are referenced ~60 times across `globals.css`. Renaming every reference in this task would make the diff unreviewable. Add aliases immediately after the colour block:

```css
  /* Transitional aliases. Every reference is migrated in Task 5; these are deleted there. */
  --blue: var(--cyan);
  --mint: var(--teal);
```

- [x] **Step 5: Delete the `:root.light` block**

Remove `web/app/globals.css:225-252` in full.

- [x] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 7: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 2: Re-point the Tailwind ramps

**Files:**
- Modify: `web/app/globals.css:58-114` (the `@theme` block)
- Test: `web/lib/palette.test.ts` (extend)

**Interfaces:**
- Consumes: tokens from Task 1
- Produces: `slate`/`emerald`/`amber`/`rose` ramps agreeing with the CSS tokens

The matcher components are Tailwind-authored against `slate`, `emerald`, `amber`, `rose`. The ramps must keep resolving to the same values as the hand-written CSS or the two halves of the product drift apart.

- [x] **Step 1: Write the failing test**

Append to `web/lib/palette.test.ts`:

```ts
describe("Tailwind ramp alignment", () => {
  function themeToken(name: string): string {
    const theme = CSS.slice(CSS.indexOf("@theme {"), CSS.indexOf("\n}", CSS.indexOf("@theme {")));
    const match = theme.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`--color-${name} not found in @theme`);
    return match[1].trim();
  }

  // dark:bg-slate-900 and var(--surface-2) must be literally the same colour.
  it("slate maps onto the obsidian ramp", () => {
    expect(themeToken("slate-950")).toBe("#08080c");
    expect(themeToken("slate-900")).toBe("#14141b");
    expect(themeToken("slate-800")).toBe("#18181f");
    expect(themeToken("slate-100")).toBe("#f0f0f5");
  });

  it("semantic ramps land on the semantic tokens", () => {
    expect(themeToken("emerald-400")).toBe("#00f5a0");
    expect(themeToken("amber-400")).toBe("#f2c14e");
    expect(themeToken("rose-400")).toBe("#ff7a8a");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: FAIL. `slate-950` is `#070a0b`.

- [x] **Step 3: Rewrite the ramps**

Replace the ramp declarations in `@theme`:

```css
  --color-brand: var(--accent-color, #56ccf2);
  --color-brand-hover: var(--accent-color-hover, #9ae0fa);
  --color-accent: var(--accent-color, #56ccf2);
  --color-accent-hover: var(--accent-color-hover, #9ae0fa);

  --color-slate-50: #f7f7fa;
  --color-slate-100: #f0f0f5;
  --color-slate-200: #d6d6e0;
  --color-slate-300: #b9b9c6;
  --color-slate-400: #a0a0b0;
  --color-slate-500: #888899;
  --color-slate-600: #64708a;
  --color-slate-700: #2a2f3d;
  --color-slate-800: #18181f;
  --color-slate-900: #14141b;
  --color-slate-950: #08080c;

  --color-emerald-50: #e6fff5;
  --color-emerald-300: #5cf7c0;
  --color-emerald-400: #00f5a0;
  --color-emerald-700: #12855c;
  --color-emerald-800: #0d6144;
  --color-emerald-900: #083b2a;
  --color-emerald-950: #05231a;

  --color-amber-50: #fdf7e8;
  --color-amber-300: #f7d789;
  --color-amber-400: #f2c14e;
  --color-amber-700: #8a6a17;
  --color-amber-900: #3a2d0c;
  --color-amber-950: #221a07;

  --color-rose-50: #fff0f2;
  --color-rose-300: #ffb3bf;
  --color-rose-400: #ff7a8a;
  --color-rose-700: #a3323f;
  --color-rose-800: #7a2b35;
  --color-rose-900: #3b171c;
  --color-rose-950: #240e11;
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: PASS.

- [x] **Step 5: Verify the build compiles**

Run: `cd web && npm run build`
Expected: build succeeds. Tailwind 4 resolves `@theme` at build time, so a malformed hex fails here.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 3: Remove light mode and its dead consumers

**Files:**
- Delete: `web/components/ThemeToggle.tsx`, `web/components/Navbar.tsx`
- Modify: `web/app/layout.tsx:11-19` (remove `THEME_SCRIPT`), `web/app/layout.tsx:58`

`Navbar.tsx` is dead code: `grep -rn "Navbar" --include=*.tsx` returns only its own definition. It is `ThemeToggle`'s only consumer, so both go.

- [x] **Step 1: Write the failing test**

Append to `web/lib/palette.test.ts`:

```ts
describe("light mode is gone", () => {
  it("ships no theme-switching script", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).not.toContain("localStorage");
    expect(layout).not.toContain("classList");
  });

  it("has no .light selectors anywhere in the stylesheet", () => {
    expect(CSS).not.toMatch(/\.light\b/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: FAIL. `layout.tsx` still contains `localStorage`.

- [x] **Step 3: Delete the files and the script**

```bash
rm web/components/ThemeToggle.tsx web/components/Navbar.tsx
```

In `web/app/layout.tsx`, delete the `THEME_SCRIPT` const (lines 11-19, including its docblock) and the `<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />` line. Leave `className="dark h-full antialiased"` on `<html>`, since it still drives Tailwind's `dark:` variant.

Then remove any remaining `:root.light` rules further down `globals.css` (search `\.light`; the grain-opacity override near line 542 is one).

- [x] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: PASS.

- [x] **Step 5: Verify nothing imported the deleted files**

Run: `cd web && npm run build`
Expected: build succeeds with no unresolved-import errors.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 4: Unify and retune the accent system

**Files:**
- Create: `web/lib/accents.ts`, `web/lib/accents.test.ts`
- Modify: `web/app/(app)/settings/page.tsx:20-29`, `web/app/(app)/layout.tsx:89-100`

The accent list is duplicated between Settings and the app layout, both hard-coding the retired periwinkle set. Worse, `--accent-color-hover` is pinned to `#d8e2ff` regardless of choice, so picking Gold yields a periwinkle hover.

- [x] **Step 1: Write the failing test**

Create `web/lib/accents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACCENTS, DEFAULT_ACCENT, resolveAccent } from "./accents";

describe("accent presets", () => {
  it("defaults to cyan", () => {
    expect(resolveAccent(null).color).toBe("#56ccf2");
    expect(DEFAULT_ACCENT).toBe("cyan");
  });

  it("falls back to the default for an unknown id", () => {
    expect(resolveAccent("chartreuse")).toEqual(resolveAccent(DEFAULT_ACCENT));
  });

  // The bug this replaces: hover was hard-coded to #d8e2ff for every accent, so
  // choosing Gold produced a periwinkle hover state.
  it("gives every accent its own hover, never a shared one", () => {
    const hovers = ACCENTS.map((a) => a.hover);
    expect(new Set(hovers).size).toBe(ACCENTS.length);
    for (const accent of ACCENTS) {
      expect(accent.hover).not.toBe(accent.color);
    }
  });

  it("carries no retired periwinkle values", () => {
    const values = ACCENTS.flatMap((a) => [a.color, a.hover]);
    expect(values).not.toContain("#adc6ff");
    expect(values).not.toContain("#d8e2ff");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/accents.test.ts`
Expected: FAIL. `Cannot find module './accents'`.

- [x] **Step 3: Write the module**

Create `web/lib/accents.ts`:

```ts
/**
 * Accent presets, defined once.
 *
 * Previously this list existed twice, in the Settings screen and inline in the app
 * layout, and the two could disagree. The hover colour was worse: a single hard-coded
 * periwinkle applied to every accent, so choosing Gold produced a periwinkle hover.
 */
export interface Accent {
  id: string;
  label: string;
  color: string;
  hover: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: "cyan", label: "Cyan", color: "#56ccf2", hover: "#9ae0fa" },
  { id: "teal", label: "Teal", color: "#00f5a0", hover: "#68ffc6" },
  { id: "gold", label: "Gold", color: "#f2c14e", hover: "#f8da8f" },
  { id: "rose", label: "Rose", color: "#ff7a8a", hover: "#ffadb7" },
  { id: "silver", label: "Silver", color: "#b9b9c6", hover: "#dcdce4" },
] as const;

export const ACCENT_KEY = "resumeai-accent";
export const DEFAULT_ACCENT = "cyan";

export function resolveAccent(id: string | null): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/** Apply an accent to the document root. Both call sites use this; neither reimplements it. */
export function applyAccent(id: string | null): void {
  const accent = resolveAccent(id);
  const root = document.documentElement;
  root.style.setProperty("--accent-color", accent.color);
  root.style.setProperty("--accent-color-hover", accent.hover);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run lib/accents.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Replace both call sites**

In `web/app/(app)/settings/page.tsx`, delete the local `ACCENTS`, `ACCENT_KEY` and `DEFAULT_ACCENT` consts and import them from `@/lib/accents`. Replace the body of `chooseAccent` with:

```ts
  function chooseAccent(id: string) {
    localStorage.setItem(ACCENT_KEY, id);
    applyAccent(id);
    accentListeners.forEach((listener) => listener());
  }
```

In `web/app/(app)/layout.tsx`, replace the effect body (lines 89-100) with:

```ts
  useEffect(() => {
    applyAccent(localStorage.getItem(ACCENT_KEY));
  }, [pathname]);
```

- [x] **Step 6: Run the full suite**

Run: `cd web && npm test`
Expected: PASS. `db.boundary.test.ts` and `nav.test.ts` must still pass.

- [x] **Step 7: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 5: Retune the two vocabularies

**Files:**
- Modify: `web/app/globals.css` (all `--blue`/`--mint` references, `.nm-raised`, `.obsidian-panel`, and every `border-top: 1px solid var(--hairline)`)

- [x] **Step 1: Write the failing test**

Append to `web/lib/palette.test.ts`:

```ts
describe("vocabulary retune", () => {
  it("uses no transitional aliases", () => {
    expect(CSS).not.toMatch(/--blue:\s*var\(--cyan\)/);
    expect(CSS).not.toMatch(/var\(--blue\)/);
    expect(CSS).not.toMatch(/var\(--mint\)/);
  });

  // The rim is a light-source artifact, not a border. Raised surfaces must not be
  // defined by an outline, which is the one rule the whole system rests on.
  it("defines raised surfaces with a rim, not a border-top", () => {
    const raised = CSS.slice(CSS.indexOf(".nm-raised,"), CSS.indexOf("}", CSS.indexOf(".nm-raised,")));
    expect(raised).toContain("inset 0 1px 0");
    expect(raised).not.toContain("border-top");
  });

  it("still bans a left bar for selected state", () => {
    expect(CSS).not.toMatch(/border-left:\s*3px/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: FAIL. aliases still present.

- [x] **Step 3: Migrate every reference**

```bash
cd web
sed -i 's/var(--blue)/var(--cyan)/g; s/var(--mint)/var(--teal)/g' app/globals.css
```

Then delete the two alias lines added in Task 1 Step 4.

- [x] **Step 4: Replace the border-top rim**

In `.nm-raised, .obsidian-panel` (around line 376), replace `border-top: 1px solid var(--hairline);` with the rim folded into the shadow:

```css
.nm-raised,
.obsidian-panel {
  background: var(--nm-face);
  border-radius: var(--r);
  box-shadow:
    var(--nm),
    inset 0 1px 0 rgba(86, 204, 242, 0.1);
}
```

Apply the same substitution to every other rule carrying `border-top: 1px solid var(--hairline)` as a surface definition: `.hero-chip`, `.product-window`, `.feature-grid article`, `.analysis-card`, `.security-grid article`, `.waitlist-card`, `.final-cta`. Leave `border-top` alone where it is a genuine divider (`.marketing-footer`, `.sidebar__bottom`, `.app-footer`, `.page-header`).

- [x] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: PASS.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

# PASS B: Background

### Task 6: The backdrop component

**Files:**
- Create: `web/components/backdrop/ObsidianBackdrop.tsx`, `web/components/backdrop/IsometricGrid.tsx`, `web/components/backdrop/TopographicField.tsx`, `web/components/backdrop/backdrop.test.tsx`
- Modify: `web/app/globals.css` (`.marketing-shell::before/::after`)

**Interfaces:**
- Produces: `<ObsidianBackdrop />`, rendering four fixed layers. Consumed by the marketing page in Task 8 and the app shell in Task 12.

- [x] **Step 1: Write the failing test**

Create `web/components/backdrop/backdrop.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ObsidianBackdrop } from "./ObsidianBackdrop";

describe("ObsidianBackdrop", () => {
  it("is entirely hidden from assistive technology", () => {
    const { container } = render(<ObsidianBackdrop />);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("never intercepts pointer events", () => {
    const { container } = render(<ObsidianBackdrop />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("obsidian-backdrop");
  });

  // stroke-dashoffset animates on the main thread. Animating every contour is how this
  // becomes jank, so the count is capped and the cap is enforced.
  it("animates at most 10 contour paths", () => {
    const { container } = render(<ObsidianBackdrop />);
    const animated = container.querySelectorAll("path[data-pulse='true']");
    expect(animated.length).toBeGreaterThan(0);
    expect(animated.length).toBeLessThanOrEqual(10);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/backdrop/backdrop.test.tsx`
Expected: FAIL. module not found.

- [x] **Step 3: Extend the vitest include glob, REQUIRED, do not skip**

`web/vitest.config.ts` currently reads:

```ts
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
```

`components/` is not covered, so every test written under it in Tasks 6, 7, 8 and 10 would
be collected by nothing and pass by never running. Change the glob to:

```ts
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts?(x)"],
```

Leave `environment: "node"`. Do **not** add `jsdom` or `@testing-library/react`. This
repo's tests are deliberately dependency-light and offline. Rewrite the Step 1 test to
assert on markup from `react-dom/server`'s `renderToStaticMarkup`, which needs no new
dependency and no DOM:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObsidianBackdrop } from "./ObsidianBackdrop";

const HTML = renderToStaticMarkup(<ObsidianBackdrop />);

describe("ObsidianBackdrop", () => {
  it("is entirely hidden from assistive technology", () => {
    const svgs = HTML.match(/<svg\b[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("never intercepts pointer events", () => {
    expect(HTML).toContain("obsidian-backdrop");
  });

  // stroke-dashoffset animates on the main thread. Animating every contour is how this
  // becomes jank, so the count is capped and the cap is enforced.
  it("animates at most 10 contour paths", () => {
    const pulsed = HTML.match(/data-pulse="true"/g) ?? [];
    expect(pulsed.length).toBeGreaterThan(0);
    expect(pulsed.length).toBeLessThanOrEqual(10);
  });
});
```

**Verify the glob change works before moving on:** `cd web && npx vitest run components/`
must collect and run the file. If it reports "No test files found", the glob is wrong and
every later component test is worthless.

- [x] **Step 4: Write the three components**

`IsometricGrid.tsx` draws one `<pattern>` of two line sets at ±30° plus intersection dots, filling a `<rect>`. Stroke `var(--grid-line)`. Dots carry `class="grid-node"`.

`TopographicField.tsx` holds 24-40 contour paths generated once and inlined as literal `d` attributes. Exactly 10 carry `data-pulse="true"`. Do not generate paths at runtime; they are static geometry.

`ObsidianBackdrop.tsx` composes both inside a `.obsidian-backdrop` wrapper, plus the spotlight div and the grain layer.

Every `<svg>` gets `aria-hidden="true"` and `focusable="false"`.

- [x] **Step 5: Add the CSS**

```css
.obsidian-backdrop,
.obsidian-backdrop > * {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}

.obsidian-backdrop { z-index: -4; }
.obsidian-backdrop__grid { z-index: -4; opacity: 0.35; }
.obsidian-backdrop__topo { z-index: -3; }
.obsidian-backdrop__spot { z-index: -2; }
.obsidian-backdrop__grain {
  z-index: -1;
  opacity: 0.035;
  background-image: var(--grain);
  background-repeat: repeat;
}

:root {
  --grid-line: rgba(86, 204, 242, 0.05);
  --topo-line: rgba(86, 204, 242, 0.07);
}

/* Data currents. Capped at 10 paths, see backdrop.test.tsx. */
.obsidian-backdrop__topo path[data-pulse="true"] {
  stroke-dasharray: 6 260;
  animation: topo-pulse 14s linear infinite;
}
@keyframes topo-pulse {
  to { stroke-dashoffset: -266; }
}

.grid-node {
  animation: node-flicker 7s ease-in-out infinite;
}
@keyframes node-flicker {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.6; }
}
```

Remove the radial-gradient `background` from `.marketing-shell::before`, since `ObsidianBackdrop` owns that now, and delete `.marketing-shell::after` entirely, since the grain moves into the component.

- [x] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run components/backdrop/backdrop.test.tsx`
Expected: PASS, 3 tests.

- [x] **Step 7: Check the gzipped budget**

Run: `cd web && npm run build && gzip -c .next/static/**/*.js | wc -c`

More directly: measure the two SVG components' rendered output. The spec budgets ≤15KB gzipped for both layers together. If over, reduce contour path count before reducing precision of the `d` attributes.

- [x] **Step 8: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 7: Cursor spotlight and reduced-motion

**Files:**
- Create: `web/components/backdrop/useSpotlight.ts`, `web/components/backdrop/useSpotlight.test.ts`
- Modify: `web/components/backdrop/ObsidianBackdrop.tsx`, `web/app/globals.css:3134` (the reduced-motion block)

- [x] **Step 1: Write the failing test**

Create `web/components/backdrop/useSpotlight.test.ts`. Test the pure coordinate logic, not the React hook:

```ts
import { describe, expect, it } from "vitest";
import { spotlightTransform } from "./useSpotlight";

describe("spotlightTransform", () => {
  it("centres the gradient on the pointer", () => {
    expect(spotlightTransform(400, 300)).toBe("translate3d(400px, 300px, 0)");
  });

  // translate3d, never top/left, because the spotlight must stay on the compositor and
  // never trigger layout.
  it("only ever emits a 3d transform", () => {
    expect(spotlightTransform(0, 0)).toMatch(/^translate3d\(/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/backdrop/useSpotlight.test.ts`
Expected: FAIL. module not found.

- [x] **Step 3: Write the hook**

```ts
/** Position string for the spotlight layer. Kept pure so it is testable without a DOM. */
export function spotlightTransform(x: number, y: number): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}
```

The hook itself: a `useEffect` registering `pointermove`, storing the latest coordinates in a ref, and writing `element.style.transform = spotlightTransform(x, y)` inside a single `requestAnimationFrame` loop. One rAF, not one per event. It must bail out entirely when `matchMedia("(prefers-reduced-motion: reduce)").matches`, and must remove the listener and cancel the frame on unmount.

- [x] **Step 4: Extend the reduced-motion block**

At `web/app/globals.css:3134`, add:

```css
  .obsidian-backdrop__topo path[data-pulse="true"],
  .grid-node {
    animation: none !important;
  }
  .obsidian-backdrop__spot {
    display: none;
  }
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run components/backdrop/useSpotlight.test.ts`
Expected: PASS.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

**Deviations from this task as written, and why:**

1. The moving layer lives in a new `components/backdrop/Spotlight.tsx` carrying
   `"use client"`, rather than the directive going on `ObsidianBackdrop.tsx`. Marking the
   backdrop itself client would ship its thirty contour paths to the browser as JavaScript
   to gain one gradient. The client leaf is an empty div.
2. Step 4's selectors named `.grid-node` and `path[data-pulse="true"]`. Neither exists:
   Task 6 cut the isometric grid, and the currents are a separate `<g>` rather than
   flagged paths. The reduced-motion block targets `.obsidian-backdrop__currents path`.
3. The hook also declines to run on `(pointer: coarse)`. A touch screen has no hovering
   cursor, so `pointermove` fires only mid-drag, so the glow would chase the finger and
   strand itself where the touch ended.

---

# PASS C: Hero

### Task 8: The rotating rail

**Files:**
- Create: `web/components/hero/rotation.ts`, `web/components/hero/rotation.test.ts`, `web/components/hero/HeroShowcase.tsx`
- Modify: `web/app/(marketing)/page.tsx:82` and `:340-385` (remove `HeroVisual`)

**Interfaces:**
- Produces: `nextIndex(current: number, total: number): number`; `<HeroShowcase />` rendering the framed viewport and its dot controls.

- [x] **Step 1: Write the failing test**

Create `web/components/hero/rotation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextIndex } from "./rotation";

describe("nextIndex", () => {
  it("advances through the assets", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
  });

  it("wraps at the end", () => {
    expect(nextIndex(2, 3)).toBe(0);
  });

  it("stays put when there is only one asset", () => {
    expect(nextIndex(0, 1)).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/hero/rotation.test.ts`
Expected: FAIL. module not found.

- [x] **Step 3: Write the module**

```ts
/** The next asset in the rail, wrapping at the end. */
export function nextIndex(current: number, total: number): number {
  return total <= 1 ? 0 : (current + 1) % total;
}

export const DWELL_MS = 6000;
export const TRANSITION_MS = 700;
```

- [x] **Step 4: Write `HeroShowcase.tsx`**

Requirements, each of which must hold:

- A fixed `aspect-ratio` frame so rotation never reflows the page
- Auto-advance on `DWELL_MS`, paused while `:hover` or `:focus-within` is true
- No auto-advance at all when `prefers-reduced-motion: reduce`
- Dot controls are real `<button type="button">` with `aria-pressed`, an accessible label naming the asset, and visible focus
- The frame carries `aria-roledescription="carousel"` and each panel `aria-hidden` when inactive
- The interval is cleared on unmount

- [x] **Step 5: Wire it into the page**

In `web/app/(marketing)/page.tsx`, replace `<HeroVisual />` at line 82 with `<HeroShowcase />` and delete the `HeroVisual` function (lines 340-385) along with the now-unused `GaugeIcon`, `LayersIcon` and `Image` imports if nothing else uses them.

**Was held back until Task 9 landed, then done.** `HeroShowcase` pointed at three rasters
that did not exist yet, and Next does not resolve a `public/` path at build time, so the
swap would have compiled clean and put three broken images on the landing page. The plan's
architecture line promises each pass leaves a deployable app. Done immediately after Task 9.

**Also folded in here:** Task 11 Step 1's loading strategy. It is four attributes on the
`<Image>` tags this task writes, and splitting them into a later task would have meant
editing the same lines twice.

**Gap in the plan, found and closed here: nothing ever mounted `ObsidianBackdrop`.**
Task 6 built it, tested it, and deleted the `.marketing-shell::before` / `::after` rules it
replaced, but no task in Pass B renders it. Its own Interfaces block says "consumed by the
marketing page in Task 8", and Task 8 as written never mentions it, so the marketing page
shipped with a flat `var(--obsidian)` ground and no contour field, ambient glow or grain at
all. `<ObsidianBackdrop />` is now the first child of `.marketing-shell`. The app shell
still needs it in Task 12.

**Deleted with `HeroVisual`:** the whole `.hero-visual` / `.hero-orb` / `.hero-chip`
vocabulary in `globals.css`, plus the `breathe` and `drift` keyframes that only those rules
used, at the base block and in the 1080 and 760 breakpoints. Nothing renders those class
names any more. Their breakpoint rules are replaced by `.hero-showcase` equivalents, see
Task 12.

- [x] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run components/hero/rotation.test.ts && npm run build`
Expected: PASS, and a clean build with no unused-import errors.

- [x] **Step 7: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 9: Generate the three raster bases

**Files:**
- Create: `web/public/img/hero/applications.png`, `web/public/img/hero/plates.png`, `web/public/img/hero/network.png`
- Create: `docs/plans/hero-asset-prompts.md`

- [x] **Step 1: Write the locked prompt skeleton**

Record it in `docs/plans/hero-asset-prompts.md` so all three are reproducible and consistent. The skeleton fixes: near-black `#08080C` ground, single light source top-left, electric cyan `#56CCF2` primary with vivid teal-green `#00F5A0` accents, matte slate surfaces, soft neumorphic extrusion, no text small enough to be unreadable, generous negative space, no logos of real companies, no photographic human faces.

Vary only the subject line between the three.

- [x] **Step 2: Generate asset 1, job application interface**

Subject: laptop three-quarter view with a magnifier lens over a job listing panel, floating summary cards around it. **No populated company pipeline with real names.**

- [x] **Step 3: Generate asset 2, the two plates**

Subject: two facing analysis plates connected by an arrow. Left plate a score dial, right plate a higher score dial. **Numbers are added by the SVG overlay in Task 10, not baked into the raster**, which is what lets them be corrected without regenerating.

- [x] **Step 4: Generate asset 3, network graph**

Subject: a central node with five satellite nodes and connecting edges, floating in space. **No reflective ground plane**: this is the "water-like platform" to omit. Generic geometric marks, not real company logos. Abstract avatar silhouettes, not photographic faces.

- [x] **Step 5: Compress and verify budget**

Each PNG must land at or under 180KB. Run:

```bash
cd web/public/img/hero && ls -la *.png
```

Expected: all three ≤184320 bytes. If over, reduce dimensions before reducing quality, since these render at roughly 560px wide.

**Done by `web/scripts/prepare-hero-assets.mjs`, which enforces the budget rather than
reporting it**: it resizes to 1120x630, encodes both PNG and WebP, keeps the smaller, and
exits non-zero if anything is over. A checked size that only a human eye compares is a size
that drifts.

**They ship as `.webp`, not `.png`.** WebP won on all three by roughly 5x: 18.3KB, 10.0KB
and 11.1KB against a 180KB budget. The plan named PNG, but 180KB was the constraint that
mattered and format was the means; the repo already served its previous hero asset as WebP.

**Model deviation.** Recraft V4.1 was the first choice, since it takes an explicit hex palette,
which is worth a great deal when the palette is the point, but it needs a paid Higgsfield
plan and returned `job_minimum_basic_plan_required` for all three. Generated on `z_image`
instead, with the palette described in prose. Eight generations, 1.20 credits total.

**The prompt skeleton had to be rewritten before it worked.** Negative constraints were
ignored wholesale: "no reflective ground plane" left a mirrored floor under all three first
attempts, and "no purple" produced a purple laptop UI and a purple card. Restating them as
what *is* present fixed both in one pass. Full findings in `hero-asset-prompts.md`.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 10: Asset overlays

**Files:**
- Create: `web/components/hero/ApplicationsOverlay.tsx`, `web/components/hero/PlatesOverlay.tsx`, `web/components/hero/NetworkOverlay.tsx`, `web/components/hero/copy.test.ts`

**Interfaces:**
- Consumes: `nextIndex`, `DWELL_MS`, `TRANSITION_MS` from Task 8
- Produces: three overlay components, each taking no props

- [x] **Step 1: Write the failing test**

Create `web/components/hero/copy.test.ts`. This is the invariant `FEATURES.md` §11 asks for, and it fails silently otherwise.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "components/hero");
const SOURCES = ["ApplicationsOverlay.tsx", "PlatesOverlay.tsx", "NetworkOverlay.tsx"]
  .map((f) => readFileSync(join(DIR, f), "utf8"))
  .join("\n");

describe("hero copy constraints", () => {
  // FEATURES.md 2.3: the model never predicts above 0.85, so no score above 85.
  it("shows no score above 85", () => {
    const scores = [...SOURCES.matchAll(/\b(\d{2,3})\s*(?:<\/|out of 100)/g)].map((m) => +m[1]);
    for (const score of scores) expect(score).toBeLessThanOrEqual(85);
  });

  it("never presents the score as a percentage", () => {
    expect(SOURCES).not.toMatch(/\d+%\s*(match|fit|compatib)/i);
  });

  it("carries none of the reference art's invented figures", () => {
    expect(SOURCES).not.toContain("+68%");
    expect(SOURCES).not.toContain("100% ATS");
    expect(SOURCES).not.toMatch(/\bElevated Score\b/);
  });

  it("names no real company", () => {
    for (const name of ["Stripe", "Google", "Notion", "Microsoft", "Northstar"]) {
      expect(SOURCES).not.toContain(name);
    }
  });

  it("labels every asset as an illustration", () => {
    expect(SOURCES.match(/NOT A REAL ANALYSIS/g) ?? []).toHaveLength(3);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run components/hero/copy.test.ts`
Expected: FAIL. the three overlay files do not exist.

- [x] **Step 3: Write `ApplicationsOverlay.tsx`**

Absolutely positioned over `applications.png`. Animates: a lens sweep across the magnifier, three summary cards drifting on staggered 7s offsets, table rows highlighting in sequence. Company names are generic (`Atlas Systems`, `Meridian Data`, `Cobalt Health`). Carries the `ILLUSTRATION OF THE MATCHER'S OUTPUT, NOT A REAL ANALYSIS` caption.

- [x] **Step 4: Write `PlatesOverlay.tsx`**

Per spec §4.4, the corrected content:

- Left plate: score `61`, label `out of 100 · calibrated`
- Right plate: score `74`, label `out of 100 · calibrated`
- Connector label: `Re-scored after tailoring`
- Coverage row: `coverage 4/7 → 6/7`
- No `+68%` tile, no `100% ATS Compatibility` tile, no `Elevated Score` label

Animates: both score rings counting up, coverage meters filling, connector arrow drawing.

- [x] **Step 5: Write `NetworkOverlay.tsx`**

Animates edges drawing in and nodes pulsing. Carries an `ON THE ROADMAP` chip, matching how `.feature-grid article` already labels unbuilt work. Generic marks and abstract avatars only.

- [x] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run components/hero/copy.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 7: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 11: Hero performance

**Files:**
- Modify: `web/components/hero/HeroShowcase.tsx`

- [x] **Step 1: Set loading strategy**

Only the first asset gets `priority`; the other two get `loading="lazy"`. Every `<Image>` carries explicit `width` and `height` so the frame reserves layout before the raster arrives.

- [ ] **Step 2: Measure**

Run `cd web && npm run build` and check the route's First Load JS. Then serve and measure LCP in the browser.

Expected: LCP element is the `h1`, not a hero raster. If a raster wins LCP, the frame needs a token-coloured placeholder background so the text paints first.

**STILL NOT DONE. Re-attempted 2026-08-18 against a production build, still unmeasurable
here.** The earlier note blamed the dev server. That was wrong: `npm run build` plus
`next start` gives the same empty timeline, so the cause is the browser harness, not the
server. Three independent routes were tried: a buffered `PerformanceObserver` installed via
an init script before navigation, a post-load read of `performance.getEntriesByType('paint')`,
and the CDP `PerformanceTimeline` domain subscribed to `largest-contentful-paint`. All three
returned zero entries, in a Chromium that lists `largest-contentful-paint` in
`PerformanceObserver.supportedEntryTypes`. This needs Lighthouse or a real browser profile;
it will not yield to another scripted attempt.

Note also that Next 16 no longer prints a First Load JS column, so the build output cannot
answer that half of the step either.

**What was measured instead, and it is more reassuring than last time:**

| Measurement | Value |
|---|---|
| JS transferred on `/` (production) | 239KB across 19 files |
| Eager hero asset `responseEnd` | 35ms |
| `DOMContentLoaded` | 61ms |
| `load` | 208ms |
| Hero raster painted area @1440 | 206,814px2 |
| `h1` painted area @1440 | 113,393px2 |

On area the raster is still the larger candidate, so it probably is the LCP element and this
step's expectation probably does fail. What changed is the stakes: the asset resolves 26ms
before `DOMContentLoaded`, so whichever element wins, it wins at essentially text-paint time.

**A claim in the previous note was false and is retracted.** It said the remedy was already
in place because `.hero-showcase__frame` sets `background: var(--pf-surface)`. It does not:
`globals.css:3767` sets `background: none`, alongside `box-shadow: none` and
`overflow: visible`, which reads as a deliberate choice from the overlay work in Task 10.
The frame is transparent and the obsidian ground shows through it. That is defensible as a
design decision, and it is not a blank frame, but it is not the placeholder the note claimed.

- [x] **Step 3: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

# PASS D: Audit and documentation

### Task 12: Responsive and slop audit

**Files:**
- Modify: `web/app/globals.css:2662-3151` (the four breakpoint blocks)

- [x] **Step 1: Read the existing breakpoint blocks first**

Read `web/app/globals.css` lines 2662-3151 in full **before changing any layout**. The hero, product window and security grid all have rules there. Changing hero layout without reading them is how a working mobile layout silently breaks.

- [x] **Step 2: Fix the audit findings**

1. `.hero-chip` rules at `left: -8%` / `right: -6%`: delete; the chips are gone with `HeroVisual`.
2. `.feature-grid`: vary emphasis so the `data-state="live"` card reads as primary and the two roadmap cards recede. Four identical cards is a templated pattern.
3. `.trust-row`: three identical pills with identical dots read as badge soup. Differentiate or reduce to prose.
4. `h1 { max-width: 13ch }`: retune so "missing." does not orphan. Check at 1440, 1080, 900, 760 and 520.
5. `.hero-section`: confirm the two-column grid collapses cleanly now that the right column is a fixed-aspect frame rather than a free-floating orb.

- [x] **Step 3: Verify no horizontal scroll**

At each of 1440, 1080, 900, 760 and 520, confirm `document.documentElement.scrollWidth <= window.innerWidth`.

- [x] **Step 4: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 13: Rewrite the recorded design docs

**Files:**
- Modify: `web/app/layout.tsx:22-37` (`DESIGN_CONTRACT`), `DESIGN.md`

`DESIGN_CONTRACT` is emitted as a real HTML comment specifically so it is greppable in built output and auditable. It currently states `obsidian #070a0b`, `Periwinkle #adc6ff is the sole accent`, and `extruded orb right carrying three drifting stat chips`, all now false.

- [x] **Step 1: Write the failing test**

Append to `web/lib/palette.test.ts`:

```ts
describe("recorded design docs match the build", () => {
  const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

  it("the design contract names no retired value", () => {
    expect(layout).not.toContain("#070a0b");
    expect(layout).not.toContain("#adc6ff");
    expect(layout).not.toContain("Periwinkle");
    expect(layout).not.toContain("orb");
  });

  it("the design contract names the current ground and accent", () => {
    expect(layout).toContain("#08080C");
    expect(layout).toContain("#56CCF2");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: FAIL. `#070a0b` still present.

- [x] **Step 3: Rewrite `DESIGN_CONTRACT`**

Update OWN-WORLD to Cyber Obsidian `#08080C`, Electric Cyan `#56CCF2` as sole accent with teal affirming, gold cautioning, rose failing. Update FIRST VIEWPORT to describe the pinned copy and rotating asset rail. Keep the THESIS line: refusing confidence theatre is still the thesis, and §4.4 makes it more true, not less.

- [x] **Step 4: Rewrite `DESIGN.md`**

`DESIGN.md` records the built system, so it cannot describe obsidian neumorphism after this lands. Update: the token table, the shadow vocabulary (cyan-tinted `--lit`, the rim), the colour section, the background section (topographic and isometric layers, grain still load-bearing), the hero description, and remove the light-mode paragraph.

Keep verbatim: the single-light-source rule, the three-elevation limit, the two-vocabularies table, the ring-not-left-bar rule, and the content rules in "Content rules that outrank visual ones".

Update the line stating `--obsidian` is a fixed brand commitment, since it was superseded by this spec.

- [x] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run lib/palette.test.ts`
Expected: PASS.

- [x] **Step 6: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

### Task 14: Full verification

- [x] **Step 1: Run the whole suite**

Run: `cd web && npm test`
Expected: PASS, including `db.boundary.test.ts`, `nav.test.ts`, `palette.test.ts`, `accents.test.ts`, `rotation.test.ts`, `copy.test.ts`, `backdrop.test.tsx`, `useSpotlight.test.ts`.

- [x] **Step 2: Build**

Run: `cd web && npm run build`
Expected: clean.

- [x] **Step 3: Walk the acceptance list from spec §8**

- Every §1 ratio verified by `palette.test.ts`, not by eye
- No user-facing string claims a figure the model cannot produce
- Rotation pauses on hover and focus; does not auto-run under reduced motion
- Background motion collapses entirely under reduced motion
- No horizontal scroll at 1080 / 900 / 760 / 520
- `DESIGN.md` describes what is actually in `globals.css`

**Complete as of 2026-08-18.** The two reduced-motion rows that blocked this, the ones the
previous pass called out as most likely to be quietly broken later, since nothing in the
suite covered them, are now closed twice over: once in a real browser via
`page.emulateMedia`, which the harness of the day could not do, and once in the suite, so
they stay closed.

| Item | Status |
|---|---|
| §1 ratios by test | **Verified** via `palette.test.ts`, retired-hex scan covers `layout.tsx` |
| No unproducible figure | **Verified** via `copy.test.ts`, mutation-checked by planting a 92 |
| Rotation pauses on hover/focus | **Verified in browser** |
| Rotation does not auto-run under reduced motion | **Verified.** Under `emulateMedia({ reducedMotion: 'reduce' })` the active panel held index 0 across two full 6s dwells. The dots still drove the rail, which is the other half of the rule: the setting asks for no unbidden motion, not a frozen page. Now covered by `shouldAutoAdvance` in `rotation.test.ts` |
| Background motion collapses under reduced motion | **Verified.** Computed styles, not authored ones: `.obsidian-backdrop__currents path` reports `animation-name: none`, `.obsidian-backdrop__spot` reports `display: none`, and every `.reveal` sits at `opacity: 1` rather than stranded invisible. Now covered by `lib/reduced-motion.test.ts` |
| No horizontal scroll | **Verified** at 1440 / 1080 / 900 / 760 / 520 / 390, on `/` and `/matcher` signed out, and on all seven app screens signed in |
| `DESIGN.md` matches `globals.css` | **Verified**, and one drift found and corrected: the hero frame's background. See Task 11 Step 2 |

New coverage added for this step: `components/hero/rotation.test.ts` (`shouldAutoAdvance`) and
`lib/reduced-motion.test.ts`, which reads the stylesheet the way `palette.test.ts` does. Both
were mutation-checked by flipping `display: none` to `opacity: 0.5` and `animation: none` to
`animation: running` in `globals.css` fails two assertions, and the file was restored.

- [x] **Step 4: Verify with a signed-out browser session**

Load `/` and `/matcher`. The app pages beyond `/matcher` are auth-gated; `DESIGN.md` already flags them as verified by build rather than by screenshot. This redesign touches their chrome, so they need a signed-in pass before this is called done.

**Done 2026-08-18, both halves.**

*Signed out*, against a production build with `DEV_BYPASS_AUTH` cleared: `/` and `/matcher`
both 200 and both on the obsidian ground, `/dashboard` correctly 307s to
`/sign-in?redirect_url=...`. No horizontal scroll at any of the six widths. The matcher was
then driven end to end with no account and no scoring service running: the keyword engine
returned 9/10 coverage and a ranked gap, with the "nothing is stored" notice shown and the
three model engines correctly disabled. That is the zero-setup demo path the global
constraints say must not regress, exercised rather than assumed.

*Signed in*, via `DEV_BYPASS_AUTH=1`: all seven screens walked. See `DESIGN.md`, where this
closes the item that had been standing as the project's largest verification gap.

**A caveat worth keeping.** The first attempt at the signed-out pass was not signed out at
all: `.env.local:45` carries `DEV_BYPASS_AUTH=1` permanently, so an ordinary `next dev` in
this working copy is already the fixture user, and a "signed-out" check run that way proves
nothing. The flag has to be explicitly cleared to see what a visitor sees. The same line
makes `npm run build` fail outright, by design: the guard in `lib/dev-mode.ts` refuses to
build with the bypass set. That is the guard doing its job, but it means a build here needs
`DEV_BYPASS_AUTH= npm run build` until the line leaves `.env.local`.

**Closed since this pass.** `ObsidianBackdrop` was mounted on the marketing shell only,
leaving all seven app screens on a flat ground. It now renders on `.obsidian-app` too, which
is what spec section 3 asked for from the start. See `DESIGN.md` for what the mount required
and what guards it.

- [x] **Step 5: Checkpoint, stop here**

Record the files changed and the test output, then stop. Commits are made by hand:
this step runs no `git add`, `git commit`, `git push`, or `gh`.

---

## Self-review notes

**Spec coverage.** §1 → Tasks 1-2. §1.5 → Task 3. §2 → Task 5. §3 → Tasks 6-7. §4.1-4.2 → Task 8. §4.3 → Tasks 9-10. §4.4 → Task 10. §4.5 → Task 11. §5 → Task 12. §6 → all. §7 risk 1 → Task 9 Step 1 (locked skeleton), risk 2 → Task 11, risk 3 → Task 2 Step 5 and Task 14 Step 4, risk 4 → Task 1. §8 → Task 14.

**Gap found and closed during review.** The spec's file table omitted `layout.tsx`'s `DESIGN_CONTRACT`, `components/Navbar.tsx`, and the duplicated accent system. Tasks 3, 4 and 13 cover them.

**Type consistency.** `nextIndex(current, total)`, `spotlightTransform(x, y)`, `resolveAccent(id)`, `applyAccent(id)`, `ACCENTS`, `ACCENT_KEY`, `DEFAULT_ACCENT` are used with these exact signatures wherever they appear.

**Open question for Task 6.** `web/vitest.config.ts` needs checking before the backdrop test is written: if the environment is not `jsdom` and `@testing-library/react` is absent, use `renderToStaticMarkup` from `react-dom/server` instead of adding a dependency. Task 6 Step 3 covers this.

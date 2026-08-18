import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
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

  it.each(["cyan", "teal", "gold", "rose", "violet"])("%s clears 4.5:1 on every surface", (fg) => {
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

/**
 * Recursively lists every source file under `dir` matching one of `extensions`, skipping test
 * files and build output. Walking the whole tree (rather than checking a single known file) is
 * the point: this is what lets the "light mode is gone" checks below catch theme-switching code
 * reintroduced ANYWHERE under app/ or components/, not just a regression in the one file this
 * migration touched, and what lets the "no retired palette values" guard below catch a retired
 * hex reintroduced anywhere under app/, components/, or lib/, in .ts/.tsx or .css.
 */
function listSourceFiles(dir: string, extensions: string[] = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === ".next" || entry.name === "node_modules") continue;
      out.push(...listSourceFiles(join(dir, entry.name), extensions));
      continue;
    }
    const ext = extname(entry.name);
    const isTestFile = /\.test\.(ts|tsx|css)$/.test(entry.name);
    if (extensions.includes(ext) && !isTestFile) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("light mode is gone", () => {
  const sourceFiles = [join(process.cwd(), "app"), join(process.cwd(), "components")].flatMap((dir) =>
    listSourceFiles(dir),
  );

  it("actually has files to scan", () => {
    // Without this, an empty sourceFiles list makes every scan below pass vacuously.
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("no source file toggles a light/dark theme class", () => {
    const classTogglePattern = /classList\.(add|remove|toggle)\(\s*["'`](light|dark)/;
    const offenders = sourceFiles.filter((file) => classTogglePattern.test(readFileSync(file, "utf8")));
    expect(offenders, `theme class toggle reintroduced in: ${offenders.join(", ") || "(none, this message should not appear)"}`).toEqual(
      [],
    );
  });

  it("no source file toggles theme via a data-theme attribute or a cookie", () => {
    // Covers the other two vectors the class-toggle check above can't see: swapping
    // classList.add/remove/toggle("light"|"dark") for setAttribute("data-theme", …), or
    // persisting the choice in document.cookie instead of localStorage.
    const dataThemeAttrPattern = /setAttribute\(\s*["'`]data-theme["'`]/;
    const cookieThemePattern = /document\.cookie\s*\+?=\s*[^\n;]*theme/;
    const offenders = sourceFiles.filter((file) => {
      const contents = readFileSync(file, "utf8");
      return dataThemeAttrPattern.test(contents) || cookieThemePattern.test(contents);
    });
    expect(
      offenders,
      `theme switch via setAttribute("data-theme", …) or document.cookie found in: ${offenders.join(", ") || "(none, this message should not appear)"}`,
    ).toEqual([]);
  });

  it("no source file reads or writes a 'theme' key via localStorage", () => {
    // Scoped to an actual localStorage call (not just the bare word "theme" anywhere), so a
    // call like `localStorage.getItem("theme")`, `.setItem("theme", v)`, or `.removeItem("theme")`
    // trips it regardless of which method or how many other arguments are passed.
    const themeStoragePattern = /localStorage\.\w+\(\s*["'`]theme["'`]/;
    const offenders = sourceFiles.filter((file) => themeStoragePattern.test(readFileSync(file, "utf8")));
    expect(
      offenders,
      `theme key read/written via localStorage in: ${offenders.join(", ") || "(none, this message should not appear)"}`,
    ).toEqual([]);
  });

  it("has no .light selectors anywhere in the stylesheet", () => {
    expect(CSS).not.toMatch(/\.light\b/);
  });
});

describe("vocabulary retune", () => {
  it("uses no transitional aliases", () => {
    expect(CSS).not.toMatch(/--blue:\s*var\(--cyan\)/);
    expect(CSS).not.toMatch(/var\(--blue\)/);
    expect(CSS).not.toMatch(/var\(--mint\)/);
  });

  // --rim replaced a border-top. It must stay an INSET shadow: the system defines surfaces
  // by how they catch the fixed light source, never by an outline. A --rim that stopped
  // being `inset` would blank the definition on all 14 sites at once, and an invalid
  // comma-item would invalidate the whole box-shadow property.
  it("--rim is an inset light-source shadow, not an outline", () => {
    const rim = token("rim");
    expect(rim).toMatch(/^inset\s/);
    expect(rim).toContain("rgba(86, 204, 242");
    expect(rim).not.toMatch(/border|outline/);
  });

  // The rim is a light-source artifact, not a border. Raised surfaces must not be
  // defined by an outline, which is the one rule the whole system rests on. Checked here
  // as "references the --rim token and still carries an elevation var" rather than the
  // token's literal value, since that value is asserted once, above, so it can't drift silently.
  it("defines raised surfaces with a rim, not a border-top", () => {
    const raised = CSS.slice(CSS.indexOf(".nm-raised,"), CSS.indexOf("}", CSS.indexOf(".nm-raised,")));
    expect(raised).toContain("var(--rim)");
    expect(raised).toMatch(/var\(--nm[a-z-]*\)/);
    expect(raised).not.toContain("border-top");
  });

  it("still bans a left bar for selected state", () => {
    expect(CSS).not.toMatch(/border-left:\s*3px/);
  });
});

describe("no retired palette values remain", () => {
  // Every hex the redesign retired. Task 5 migrated the last live references (the --blue/--mint
  // aliases and the Clerk auth-drawer theming); this guard exists so a retired hex sneaking back
  // in, via a copy-pasted snippet, a merge, or a future task working from stale context, fails
  // the suite instead of shipping.
  const RETIRED_HEXES = [
    "#adc6ff",
    "#d8e2ff",
    "#e9c349",
    "#c8c6c7",
    "#c4b5fd",
    "#fda4af",
    "#8fe0c0",
    "#ffb4ab",
    "#070a0b",
    "#0c1011",
    "#0f1415",
    "#131819",
    "#798387",
    "#a3acb0",
    "#e9edee",
  ];

  // No /g flag: with one it would make retiredHexPattern.test() stateful (lastIndex persists
  // between calls), which silently skips files when reused across the .filter() below.
  const retiredHexPattern = new RegExp(RETIRED_HEXES.join("|"), "i");

  // `app/layout.tsx` used to be excluded here: its DESIGN_CONTRACT still quoted the two
  // retired hexes as a record of the pre-redesign brief, and the carve-out existed so the
  // pattern did not have to be weakened for everyone else. Task 13 rewrote that contract to
  // describe the build that actually ships, so the exclusion is gone and the scan now
  // covers every source file without exception.
  const sourceFiles = [join(process.cwd(), "app"), join(process.cwd(), "components"), join(process.cwd(), "lib")]
    .flatMap((dir) => listSourceFiles(dir, [".ts", ".tsx", ".css"]));

  it("actually has files to scan", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("no retired hex appears anywhere in scanned source", () => {
    const offenders = sourceFiles.filter((file) => retiredHexPattern.test(readFileSync(file, "utf8")));
    expect(
      offenders,
      `retired hex reintroduced in: ${offenders.join(", ") || "(none, this message should not appear)"}`,
    ).toEqual([]);
  });
});

/**
 * `DESIGN_CONTRACT` in `app/layout.tsx` is emitted as a real HTML comment specifically so
 * it is greppable in built output and auditable against the render. That only works while
 * it is true: a contract describing a build that no longer exists is worse than none,
 * because the next reviewer audits against it and "corrects" the wrong side.
 *
 * Before this suite it claimed obsidian `#070a0b`, "Periwinkle #adc6ff is the sole accent",
 * and an "extruded orb right carrying three drifting stat chips". All three were false.
 */
describe("recorded design docs match the build", () => {
  const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

  it("the design contract names no retired value", () => {
    expect(layout).not.toContain("#070a0b");
    expect(layout).not.toContain("#adc6ff");
    expect(layout).not.toContain("Periwinkle");
    expect(layout).not.toMatch(/\borb\b/i);
  });

  it("the design contract names the current ground and accent", () => {
    expect(layout).toContain("#08080C");
    expect(layout).toContain("#56CCF2");
  });

  // The thesis is the one line that survives this redesign unchanged. §4.4 replacing a
  // score of 92 with 74 makes refusing confidence theatre more true, not less, and a
  // rewrite that quietly dropped it would be discarding the reason for the whole spec.
  it("keeps the thesis", () => {
    expect(layout).toContain("shows its working");
    expect(layout).toMatch(/confidence[- ]theatre/i);
  });

  it("DESIGN.md describes the shipped background, not the retired one", () => {
    const design = readFileSync(join(process.cwd(), "..", "DESIGN.md"), "utf8");
    expect(design).not.toContain("#070a0b");
    expect(design).not.toContain("#adc6ff");
    expect(design).toContain("#08080C");
    // The grain is load-bearing, because near-black gradients band without it. Every rewrite of
    // this file has to carry that forward or someone deletes it as decoration.
    expect(design.toLowerCase()).toContain("grain");
  });
});

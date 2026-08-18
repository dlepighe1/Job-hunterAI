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

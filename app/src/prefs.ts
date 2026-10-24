// Browser preferences of the v2 (theme, accent, language, how many rows two home widgets list, the Check view's tiles): stored under `ld-prefs`, the v1's key, with the v1's field
// names (`theme`, `language`), so a choice made in one is the choice of the other; never an intent, never in the
// address. Applied as `data-theme` / `data-accent` / `lang` on `<html>`.
// The v2 writes **only the field that changed** (`changedPrefs`), merged into the stored text: the v1's own fields
// (snap, panel width…) and every field nobody chose are kept, so a language chosen here never writes the v2's default
// theme over the v1's (the v1 opens dark, the v2 light). The v1 writes its whole object
// (`engine/src/app/state/prefs.ts`, `writePrefs`), so a write from the v1 drops `accent`, `homeRuns` and
// `homeChanges`: the v2 then reads their defaults (cobalt, 6, 10). Parsing is pure and tolerant: an unknown or missing value falls back to the default.
import { detectLanguage, isLanguage, setLanguage } from "./i18n";
import type { Language } from "./i18n";
import { DEFAULT_TILES, parseTiles } from "./state/tiles";
import type { Tiles } from "./state/tiles";

export const THEMES = ["light", "dark"] as const;
export const ACCENTS = ["cobalt", "ink"] as const;
export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
/** The rows "Latest collections" (`homeRuns`) and "Latest modifications" (`homeChanges`) may list: each widget's
 *  default first, so the default carries the rail of its settings. */
export const HOME_RUNS = [6, 12, 25, 50, 100] as const;
export const HOME_CHANGES = [10, 25, 50, 100] as const;
export type HomeRuns = (typeof HOME_RUNS)[number];
export type HomeChanges = (typeof HOME_CHANGES)[number];
/** `grid`, `minimap`: the canvas controls of the diagram shell, under the v1's names (a choice made in one is the
 *  choice of the other); the approved mockup's defaults: the grid shown, the minimap hidden. `panel`: the width the
 *  panel opens at (compact or wide; focus is a mode, never stored), under its own name: the v1's `panelWidth` is a
 *  number of pixels and stays the v1's. */
export const PANEL_WIDTHS = ["compact", "wide"] as const;
export type PanelPref = (typeof PANEL_WIDTHS)[number];
/** `checkTiles`: the place of each tile of the Check view (DESIGN.md, Check view, Preference), an object compared by
 *  reference: a gesture writes a new one. */
export type Prefs = Readonly<{ theme: Theme; accent: Accent; language: Language | null; homeRuns: HomeRuns; homeChanges: HomeChanges; grid: boolean; minimap: boolean; panel: PanelPref; checkTiles: Tiles }>;

export const STORAGE_KEY = "ld-prefs";
export const DEFAULT_PREFS: Prefs = Object.freeze({ theme: "light", accent: "cobalt", language: null, homeRuns: 6, homeChanges: 10, grid: true, minimap: false, panel: "compact", checkTiles: DEFAULT_TILES });

const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const oneOf = <T extends string | number>(values: readonly T[], value: unknown, fallback: T): T =>
  (values as readonly unknown[]).includes(value) ? (value as T) : fallback;

/** The preferences read from a stored JSON text; anything unreadable gives the defaults. */
export function parsePrefs(raw: string | null): Prefs {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return Object.freeze({
    theme: oneOf(THEMES, data.theme, DEFAULT_PREFS.theme),
    accent: oneOf(ACCENTS, data.accent, DEFAULT_PREFS.accent),
    language: isLanguage(data.language) ? data.language : null,
    homeRuns: oneOf(HOME_RUNS, data.homeRuns, DEFAULT_PREFS.homeRuns),
    homeChanges: oneOf(HOME_CHANGES, data.homeChanges, DEFAULT_PREFS.homeChanges),
    grid: flag(data.grid, DEFAULT_PREFS.grid),
    minimap: flag(data.minimap, DEFAULT_PREFS.minimap),
    panel: oneOf(PANEL_WIDTHS, data.panel, DEFAULT_PREFS.panel),
    checkTiles: parseTiles(data.checkTiles),
  });
}

/** The fields of `next` that differ from `previous`: what a change writes. Pure. */
export function changedPrefs(previous: Prefs, next: Prefs): Partial<Prefs> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Prefs)[]) if (next[key] !== previous[key]) out[key] = next[key];
  return Object.freeze(out) as Partial<Prefs>;
}

/** The stored text after a change: every other field is kept, the changed ones are replaced. */
export function mergePrefs(raw: string | null, changes: Partial<Prefs>): string {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return JSON.stringify({ ...data, ...changes });
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(storage()?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Writes the changed fields over the stored text, read again at that moment (another tab may have written). */
export function savePrefs(changes: Partial<Prefs>): void {
  const store = storage();
  if (!store || !Object.keys(changes).length) return;
  try {
    store.setItem(STORAGE_KEY, mergePrefs(store.getItem(STORAGE_KEY), changes));
  } catch {
    // a full or blocked storage keeps the page working with the preferences in memory
  }
}

/** Puts the preferences on the page: theme and accent on `<html>`, the language in i18next. */
export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.accent = prefs.accent;
  setLanguage(prefs.language ?? detectLanguage(navigator.languages ?? [navigator.language]));
}

// Browser preferences of the v2 (theme, accent, language): stored under `ld-prefs`, the v1's key, with the v1's field
// names (`theme`, `language`), so a choice made in one is the choice of the other; never an intent, never in the
// address. Applied as `data-theme` / `data-accent` / `lang` on `<html>`.
// The v2 writes by merging: the v1's own fields (grid, panel width…) are kept. The v1 writes its whole object
// (`engine/src/app/state/prefs.ts`, `writePrefs`), so a write from the v1 drops `accent`: the v2 then reads the
// default accent (cobalt). Parsing is pure and tolerant: an unknown or missing value falls back to the default.
import { detectLanguage, isLanguage, setLanguage } from "./i18n";
import type { Language } from "./i18n";

export const THEMES = ["light", "dark"] as const;
export const ACCENTS = ["cobalt", "ink"] as const;
export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Prefs = Readonly<{ theme: Theme; accent: Accent; language: Language | null }>;

export const STORAGE_KEY = "ld-prefs";
export const DEFAULT_PREFS: Prefs = Object.freeze({ theme: "light", accent: "cobalt", language: null });

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;

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
  });
}

/** The stored text after a change: the v1's other fields are kept, ours are replaced. */
export function mergePrefs(raw: string | null, prefs: Prefs): string {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  return JSON.stringify({ ...data, theme: prefs.theme, accent: prefs.accent, language: prefs.language });
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

export function savePrefs(prefs: Prefs): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, mergePrefs(store.getItem(STORAGE_KEY), prefs));
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

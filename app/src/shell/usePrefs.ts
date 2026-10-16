// The page's preferences as one store shared by every component that reads them: read once, applied to `<html>` and
// i18next on every change, stored. `useSyncExternalStore` keeps every reader in step.
import { useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, i18n, isLanguage } from "../i18n";
import type { Language } from "../i18n";
import { applyPrefs, loadPrefs, savePrefs } from "../prefs";
import type { Prefs } from "../prefs";

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function snapshot(): Prefs {
  if (!current) {
    current = loadPrefs();
    applyPrefs(current);
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPrefs(next: Prefs): void {
  current = Object.freeze({ ...next });
  applyPrefs(current);
  savePrefs(current);
  for (const listener of listeners) listener();
}

export function usePrefs(): { prefs: Prefs; language: Language; setPrefs: (next: Prefs) => void } {
  const prefs = useSyncExternalStore(subscribe, snapshot, snapshot);
  const language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  return { prefs, language, setPrefs };
}

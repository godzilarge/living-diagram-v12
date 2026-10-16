// The page's preferences as one store shared by every component that reads them: read once, applied to `<html>` and
// i18next on every change, stored. `useSyncExternalStore` keeps every reader in step. A change writes only the
// fields that changed (`changedPrefs`); a write from another tab (the `storage` event) is read again and applied at
// once, so that no tab keeps, nor writes back, a stale choice.
import { useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, i18n, isLanguage } from "../i18n";
import type { Language } from "../i18n";
import { applyPrefs, changedPrefs, loadPrefs, savePrefs, STORAGE_KEY } from "../prefs";
import type { Prefs } from "../prefs";

let current: Prefs | null = null;
const listeners = new Set<() => void>();
let listening = false;

const notify = (): void => {
  for (const listener of listeners) listener();
};

function snapshot(): Prefs {
  if (!current) {
    current = loadPrefs();
    applyPrefs(current);
  }
  return current;
}

/** Another tab wrote the preferences: this page follows. */
function followStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  current = loadPrefs();
  applyPrefs(current);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("storage", followStorage);
    listening = true;
  }
  return () => listeners.delete(listener);
}

export function setPrefs(next: Prefs): void {
  const changes = changedPrefs(snapshot(), next);
  current = Object.freeze({ ...next });
  applyPrefs(current);
  savePrefs(changes);
  notify();
}

export function usePrefs(): { prefs: Prefs; language: Language; setPrefs: (next: Prefs) => void } {
  const prefs = useSyncExternalStore(subscribe, snapshot, snapshot);
  const language = isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  return { prefs, language, setPrefs };
}

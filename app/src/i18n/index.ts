// The interface language, as in v1 (engine/src/i18n): i18next on its own instance, catalogues embedded (no network
// read, no flash), French and English with the same keys. Keys are typed from the English catalogues: `t("ui:close")`
// is checked by `tsc`. Never translated: what the user typed, identifiers (hostnames, ports, codes).
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { setLanguage as setEngineLanguage } from "@engine/i18n";
import enControl from "./locales/en/control.json";
import enDiagram from "./locales/en/diagram.json";
import enEdit from "./locales/en/edit.json";
import enHome from "./locales/en/home.json";
import enJournal from "./locales/en/journal.json";
import enPanel from "./locales/en/panel.json";
import enPrimitives from "./locales/en/primitives.json";
import enSearch from "./locales/en/search.json";
import enShell from "./locales/en/shell.json";
import enUi from "./locales/en/ui.json";
import frControl from "./locales/fr/control.json";
import frDiagram from "./locales/fr/diagram.json";
import frEdit from "./locales/fr/edit.json";
import frHome from "./locales/fr/home.json";
import frJournal from "./locales/fr/journal.json";
import frPanel from "./locales/fr/panel.json";
import frPrimitives from "./locales/fr/primitives.json";
import frSearch from "./locales/fr/search.json";
import frShell from "./locales/fr/shell.json";
import frUi from "./locales/fr/ui.json";

export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];
/** The language of a browser that announces none we speak. */
export const DEFAULT_LANGUAGE: Language = "en";
export const NAMESPACES = ["ui", "shell", "home", "diagram", "panel", "search", "edit", "control", "journal", "primitives"] as const;

export const resources = {
  en: { ui: enUi, shell: enShell, home: enHome, diagram: enDiagram, panel: enPanel, search: enSearch, edit: enEdit, control: enControl, journal: enJournal, primitives: enPrimitives },
  fr: { ui: frUi, shell: frShell, home: frHome, diagram: frDiagram, panel: frPanel, search: frSearch, edit: frEdit, control: frControl, journal: frJournal, primitives: frPrimitives },
} as const;

type Catalogue = (typeof resources)["en"];
type Plural = "zero" | "one" | "two" | "few" | "many" | "other";
type Base<K extends string> = K extends `${infer B}_${Plural}` ? B : K;
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${Base<K>}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Every key of every namespace, as `namespace:path.to.key` (plural suffixes folded). */
export type TextKey = { [N in keyof Catalogue & string]: `${N}:${Leaves<Catalogue[N]>}` }[keyof Catalogue & string];
export type Translate = (key: TextKey, values?: Record<string, string | number>) => string;

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** The first browser language we speak (`fr-CA` gives French), else English. Pure. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

export const i18n = i18next.createInstance();
void i18n.init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  ns: [...NAMESPACES],
  defaultNS: "ui",
  initAsync: false,
  interpolation: { escapeValue: false },
});

/** Sets the language (synchronous: the catalogues are embedded) and `lang` on the root; the engine's catalogue (the
 *  v1 canvas, the hue and type words the Log's sentences borrow) follows. */
export function setLanguage(language: Language): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
  setEngineLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

/** The typed translate function outside React (a command's toast), in the page's language at the time of the call. */
export const text: Translate = (key, values) => i18n.t(key, values ?? {}) as string;

/** The typed translate function of a component; it re-renders when the language changes. */
export function useText(): Translate {
  const { t } = useTranslation(NAMESPACES as unknown as string[], { i18n });
  return (key, values) => t(key, values ?? {}) as string;
}

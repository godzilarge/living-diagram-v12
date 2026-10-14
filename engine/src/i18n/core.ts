// La langue de l'interface (2026-10-10 : l'application vise aussi un public anglophone), le noyau : i18next, le
// standard de fait, sur une instance propre (jamais le singleton global), sans React et avec le seul français, la
// référence. Les modules partagés avec `/view` (`canvas/format.ts`, la bulle…) appellent `t` d'ici : `/view` et
// `ld render` embarquent ce noyau et restent en français (personne n'y change de langue). L'application ajoute
// l'anglais et React par `index.ts`. Catalogues : `locales/<langue>/<espace>.json`, embarqués (aucune lecture réseau,
// aucun clignotement, un build déterministe) ; les clés sont typées depuis le français (`types.ts`) et un test vérifie
// que l'anglais a les mêmes clés, les mêmes variables et les pluriels de sa langue. Ce qui ne se traduit jamais : le
// contenu saisi (noms de groupe, notes), les identifiants (hostnames, ports, codes).
import i18next from "i18next";
import frCommon from "./locales/fr/common.json";

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
/** La langue de référence, celle des catalogues complets et du repli. */
export const SOURCE_LANGUAGE: Language = "fr";
/** La langue d'un navigateur qui n'en annonce aucune que l'on parle. */
export const DEFAULT_LANGUAGE: Language = "en";
/** Le nom de chaque langue dans sa propre langue : c'est ainsi qu'un sélecteur se lit (« English » pour qui ne lit pas le français). */
export const LANGUAGE_NAMES: Record<Language, string> = { fr: "Français", en: "English" };
export const NAMESPACES = ["common", "shell", "panel", "journal", "checks"] as const;
/** La variante régionale qui formate dates et nombres (`Intl`) : le français de France, l'anglais britannique (celui
 *  du glossaire : colour, neighbour ; jour avant mois, heures sur 24). */
export const LOCALES: Record<Language, string> = { fr: "fr-FR", en: "en-GB" };

/** Le seul catalogue du noyau : le vocabulaire partagé avec `/view` (`common`, en français). L'application ajoute ses
 *  espaces (`shell`, `panel`) et l'anglais (`index.ts`) ; les clés sont typées depuis tous les catalogues français
 *  (`types.ts`), sans les embarquer ici. */
export const resources = { fr: { common: frCommon } } as const;

export const isLanguage = (value: unknown): value is Language => typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** La langue à montrer pour une liste de préférences du navigateur (`navigator.languages`) : la première dont la langue
 *  principale est parlée ici (« fr-CA » → français), sinon l'anglais. Pur. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

/** La langue retenue : celle choisie dans l'application, sinon celle du navigateur. */
export function effectiveLanguage(chosen: Language | null, preferred: readonly string[]): Language {
  return chosen || detectLanguage(preferred);
}

/** Les préférences de langue du navigateur ; aucune sous Node (tests sans DOM). */
export function browserLanguages(): readonly string[] {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  if (!nav) return [];
  if (nav.languages && nav.languages.length) return nav.languages;
  return nav.language ? [nav.language] : [];
}

export const i18n = i18next.createInstance();
// `initAsync: false` : les catalogues sont déjà là, l'instance est prête au retour d'`init` (le premier rendu la lit).
// `escapeValue: false` : React échappe, et la toile n'écrit que du texte (`textContent`), jamais du HTML.
void i18n.init({
  resources,
  lng: SOURCE_LANGUAGE,
  fallbackLng: SOURCE_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  ns: [...NAMESPACES],
  defaultNS: "shell",
  initAsync: false,
  interpolation: { escapeValue: false },
});

/** Change la langue de l'instance (synchrone : les catalogues sont embarqués) ; les composants qui lisent `t` par
 *  `useTranslation` se redessinent. */
export function setLanguage(language: Language): void {
  if (i18n.language !== language) void i18n.changeLanguage(language);
}

/** Des catalogues de plus pour une langue, par espace de noms (l'application ajoute ses espaces et l'anglais). */
export function addLanguage(language: Language, bundles: Record<string, object>): void { 
  for (const [ns, data] of Object.entries(bundles)) i18n.addResourceBundle(language, ns, data, true, true);
}

export const t = i18n.t.bind(i18n);
/** La variante régionale de la langue courante, pour `Intl` (dates, heures, tri). */
/** La ponctuation de la langue : « : » et « ; » avec leurs espaces (fine en français, aucune avant en anglais). */
export const punct = { colon: (): string => t("common:punct.colon"), semicolon: (): string => t("common:punct.semicolon") };

export const locale = (): string => (isLanguage(i18n.language) ? LOCALES[i18n.language] : LOCALES[SOURCE_LANGUAGE]);

/** Un dictionnaire de libellés lu dans le catalogue à chaque accès (`prefix` = « espace:section ») : `MAP[x] || x` suit
 *  la langue de la page ; une clé inconnue rend `undefined`, comme un dictionnaire ordinaire. Pour les modules partagés
 *  avec `/view`, dont les appelants lisent des dictionnaires. */
export function labelMap(prefix: string, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) Object.defineProperty(out, key, { enumerable: true, get: () => t((prefix + "." + key) as never) });
  return Object.freeze(out);
}

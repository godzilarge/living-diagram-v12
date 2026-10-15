// Les préférences du navigateur : le thème, la langue, la grille, l'aimant, la minimap, la largeur du panneau, la barre
// contextuelle (lot 4 de docs/11 : affichée par défaut, Ctrl+. ou le panneau Affichage la masquent), les repères
// d'alignement, leur couleur et l'ordre de « mettre en grille » (lot 8 : repères allumés, chartreuse, par nom, par
// défaut ; propres à chacun, jamais une intention). Ni dans l'adresse (ce n'est pas la
// vue, on ne la partage pas), ni sur le serveur (ce n'est pas une intention) : dans `localStorage`, comme le nom,
// une commodité. Lecture tolérante (une valeur inconnue rend le défaut), écriture silencieuse si le stockage manque.
// Par navigateur, pas par personne : sans compte, il n'y a pas d'identité à qui les attacher (le nom est déclaratif) ;
// le jour d'une vraie authentification, elles iront sur le serveur et ce module restera leur seule porte (2026-10-10).
import { isLanguage } from "../../i18n";
import type { Language } from "../../i18n";
import type { HueName } from "../../canvas/hues";
import type { GridOrder } from "../../canvas/align";
import { guideColor, isGuideHue } from "../canvas/guides";

export type Theme = "dark" | "light";
/** `language` : celle choisie dans l'application, `null` = celle du navigateur (i18n `effectiveLanguage`). */
/** `guides` : les repères d'alignement pendant un glissé ; `guideHue` : leur teinte, `null` = le chartreuse des jetons ;
 *  `gridOrder` : l'ordre de « mettre en grille », le dernier choisi dans le volet. */
export interface Prefs { theme: Theme; language: Language | null; grid: boolean; snap: boolean; minimap: boolean; panelWidth: number; fbar: boolean; guides: boolean; guideHue: HueName | null; gridOrder: GridOrder }

/** La largeur du panneau (glissée par son bord gauche) : 348 par défaut, bornée ; le plafond réel suit aussi la fenêtre. */
export const PANEL_WIDTH = { min: 300, base: 348, max: 760 } as const;
export const clampPanelWidth = (width: number): number => Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, width)));

export const PREFS_KEY = "ld-prefs";
export const defaultPrefs = (): Prefs => ({ theme: "dark", language: null, grid: false, snap: false, minimap: true, panelWidth: PANEL_WIDTH.base, fbar: true, guides: true, guideHue: null, gridOrder: "name" });

/** Les préférences lues dans un texte JSON (ce que le stockage rend) : chaque champ absent ou mal formé vaut son défaut. */
export function parsePrefs(text: string | null): Prefs {
  const prefs = defaultPrefs();
  if (!text) return prefs;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (error) { return prefs; }
  if (typeof raw !== "object" || raw === null) return prefs;
  const got = raw as Record<string, unknown>;
  if (got.theme === "light" || got.theme === "dark") prefs.theme = got.theme;
  if (isLanguage(got.language)) prefs.language = got.language;
  for (const key of ["grid", "snap", "minimap", "fbar", "guides"] as const) if (typeof got[key] === "boolean") prefs[key] = got[key] as boolean;
  if (isGuideHue(got.guideHue)) prefs.guideHue = got.guideHue;
  if (got.gridOrder === "name" || got.gridOrder === "screen") prefs.gridOrder = got.gridOrder;
  if (typeof got.panelWidth === "number" && Number.isFinite(got.panelWidth)) prefs.panelWidth = clampPanelWidth(got.panelWidth);
  return prefs;
}

/** La couleur des repères posée sur la racine (`--guide`, par le CSSOM : jamais un style en ligne) ; `null` la retire,
 *  le chartreuse des jetons revient. */
export function applyGuideColor(hue: HueName | null): void {
  const root = globalThis.document ? globalThis.document.documentElement : null;
  if (!root) return;
  const value = guideColor(hue);
  if (value) root.style.setProperty("--guide", value); else root.style.removeProperty("--guide");
}

export function readPrefs(): Prefs {
  try { return parsePrefs(globalThis.localStorage ? globalThis.localStorage.getItem(PREFS_KEY) : null); } catch (error) { return defaultPrefs(); }
}
export function writePrefs(prefs: Prefs): void {
  try {
    const store = globalThis.localStorage;
    if (store) store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (error) { /* stockage indisponible : les préférences ne vivent que le temps de la page */ }
}

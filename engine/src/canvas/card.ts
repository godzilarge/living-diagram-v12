// La carte d'un équipement sur la toile : ses dimensions et la place de ce qu'elle porte (rail de couleur du type
// sur le bord gauche, icône de type pleine à 40 px, nom en capitales, rôle HA et compte de stack dessous),
// calculées sans DOM depuis le texte. La toile dessine ce plan ; les câbles (où poser le nom d'un port), les cadres
// de cluster et les tests sous Node lisent la même boîte. Un voisin inconnu reste un petit disque, son nom dessous.
// Rien n'est mesuré dans le navigateur : le nom est en chasse fixe (JetBrains Mono, 0,6 em par caractère, plus
// l'interlettrage), le rôle est estimé par classe de caractère ; une carte est donc identique partout, et le dessin
// déterministe. Forme large, sur une ligne, choisie le 2026-10-07 sur les retours d'Orhan (« plus grands, le
// hostname en capitales, l'icône lisible, un rail de couleur ») ; rehaussée le même jour (72, icône pleine à 40 px :
// « encore trop petits, surtout verticalement, les icônes écrasées »). Toutes les cartes d'une run ont la même
// largeur, celle de la plus large arrondie à deux carreaux de grille, et une hauteur multiple de la grille (Orhan,
// 2026-10-07 : « le hostname le plus long détermine la taille de tous les nœuds », pour aligner sur la grille).
import { SIZE as ICON_SIZE } from "./icons";

export interface Box { w: number; h: number }
export interface Slot { x: number; y: number; anchor: "start" | "middle" | "end" }
export interface CardPlan extends Box {
  rx: number;
  /** Le rail de couleur du type : un tracé collé au bord gauche, aux coins de la carte. */
  rail: string;
  /** L'icône de type : translation et échelle de son glyphe (grille 32 × 32, icons.ts). */
  icon: { x: number; y: number; scale: number };
  label: Slot;
  role: Slot | null;
  stack: Slot | null;
}
export interface CardExtras { role: string | null; stack: number | null }

export const STUB_R = 8;
export const LABEL_MAX = 22;
export const CARD_H = 80; // un multiple de la grille de l'application (20)
export const WIDTH_STEP = 40; // la largeur commune : deux carreaux de grille
const LABEL_PX = 15, ROLE_PX = 10, STACK_PX = 11;
const RX = 12, RAIL = 6, PAD = 12, GAP = 12, PAD_RIGHT = 16, SUB_GAP = 8, MIN_W = 168, MAX_W = 360, ICON_SCALE = 1.25;
const ICON_PX = ICON_SIZE * ICON_SCALE; // 40
const MONO_EM = 0.62; // chasse de JetBrains Mono (0,6 em) et l'interlettrage du nom (0,02 em)

// Largeur d'un caractère en em, par classe (Inter) : larges, capitales, étroits, tirets ; le reste (bas-de-casse,
// chiffres tabulaires) à 0,6 em. Estimation haute : un texte tient toujours dans sa carte.
const WIDE = /[MWmw@%]/, UPPER = /[A-Z]/, NARROW = /[ilIjt.,:;'|!]/, DASH = /[-_ ]/;
function em(ch: string): number {
  if (WIDE.test(ch)) return 0.88;
  if (UPPER.test(ch)) return 0.7;
  if (NARROW.test(ch)) return 0.3;
  if (DASH.test(ch)) return 0.42;
  if (ch === "…") return 0.95;
  return 0.6;
}
/** La largeur estimée d'un texte en Inter, en unités du dessin, pour une taille de police en pixels. */
export function textWidth(text: string, px = LABEL_PX): number {
  let total = 0;
  for (const ch of text) total += em(ch);
  return Math.ceil(total * px + 2);
}
/** La largeur d'un texte en chasse fixe : chaque caractère compte autant. */
export const monoWidth = (text: string, px = LABEL_PX): number => Math.ceil(Array.from(text).length * MONO_EM * px + 2);

// Un hostname très long est raccourci au milieu sur la toile ; le nom complet reste dans la bulle, la fiche et aria-label.
export const shortName = (name: string): string => (name.length <= LABEL_MAX ? name : name.slice(0, 11) + "…" + name.slice(-10));
/** Le nom tel que la carte l'écrit : raccourci, en capitales (le nom complet reste partout ailleurs). */
export const displayName = (hostname: string): string => shortName(hostname).toUpperCase();

const clamp = (value: number): number => Math.min(MAX_W, Math.max(MIN_W, Math.round(value)));
const stackText = (count: number): string => "×" + count;
const r2 = (value: number): string => String(Math.round(value * 100) / 100);

// Le rail : la bande de `rail` unités collée au bord gauche, découpée aux coins arrondis de la carte (son bord droit
// rencontre l'arc du coin à `dy` du haut et du bas).
function railPath(w: number, h: number, rx: number, rail: number): string {
  const x0 = -w / 2, y0 = -h / 2;
  const dy = rx - Math.sqrt(rx * rx - (rx - rail) * (rx - rail));
  const top = y0 + dy, bottom = y0 + h - dy;
  return `M${r2(x0 + rail)} ${r2(top)}V${r2(bottom)}A${rx} ${rx} 0 0 1 ${r2(x0)} ${r2(y0 + h - rx)}V${r2(y0 + rx)}A${rx} ${rx} 0 0 1 ${r2(x0 + rail)} ${r2(top)}Z`;
}

// Une ligne : l'icône à gauche du nom ; le rôle HA et le compte de stack, s'il y en a, sur une petite ligne sous le
// nom, qui remonte d'autant (les deux lignes restent centrées dans la hauteur).
function wide(labelW: number, roleW: number, stackW: number, imposed: number): CardPlan {
  const w = Math.max(imposed, naturalWidth(labelW, roleW, stackW));
  const iconX = -w / 2 + RAIL + PAD, textX = iconX + ICON_PX + GAP;
  const sub = roleW > 0 || stackW > 0;
  const subBaseline = 16;
  return { w, h: CARD_H, rx: RX, rail: railPath(w, CARD_H, RX, RAIL),
    icon: { x: iconX, y: -ICON_PX / 2, scale: ICON_SCALE },
    label: { x: textX, y: sub ? -4 : 5.5, anchor: "start" },
    role: roleW ? { x: textX, y: subBaseline, anchor: "start" } : null,
    stack: stackW ? { x: textX + (roleW ? roleW + SUB_GAP : 0), y: subBaseline, anchor: "start" } : null };
}

function naturalWidth(labelW: number, roleW: number, stackW: number): number {
  const subW = roleW + (roleW && stackW ? SUB_GAP : 0) + stackW;
  return clamp(RAIL + PAD + ICON_PX + GAP + Math.max(labelW, subW) + PAD_RIGHT);
}
const measures = (label: string, extras: CardExtras): [number, number, number] => [monoWidth(label),
  extras.role ? textWidth(extras.role.toUpperCase(), ROLE_PX) : 0, extras.stack ? monoWidth(stackText(extras.stack), STACK_PX) : 0];

/** La largeur propre d'une carte, ce que son nom, son rôle HA et son compte de stack demandent. */
export function width(label: string, extras: CardExtras): number {
  return naturalWidth(...measures(label, extras));
}
/** La largeur commune des cartes d'une run : la plus large, arrondie au palier supérieur (`WIDTH_STEP`) ; une petite
 *  différence de longueur de nom ne la change donc pas d'une run à l'autre. Sans carte : la carte minimale. */
export function uniformWidth(widths: number[]): number {
  return Math.ceil(Math.max(MIN_W, ...widths) / WIDTH_STEP) * WIDTH_STEP;
}

/** Le plan de la carte d'un équipement : son nom déjà écrit comme la carte l'écrit (`displayName`), son rôle HA et
 *  son compte de stack s'il en a, la largeur commune de la run (`uniformWidth`) ; jamais plus étroite que son contenu. */
export function plan(label: string, extras: CardExtras, imposed = 0): CardPlan {
  return wide(...measures(label, extras), imposed);
}

/** La distance du centre d'une boîte à son bord dans la direction (dx, dy) : là où un câble en sort. */
export function reach(box: Box, dx: number, dy: number): number {
  const length = Math.hypot(dx, dy) || 1;
  const ux = Math.abs(dx) / length, uy = Math.abs(dy) / length;
  return Math.min(ux > 1e-6 ? box.w / 2 / ux : Infinity, uy > 1e-6 ? box.h / 2 / uy : Infinity);
}

export const card = { plan, width, uniformWidth, textWidth, monoWidth, shortName, displayName, reach, STUB_R, LABEL_MAX, CARD_H, WIDTH_STEP };

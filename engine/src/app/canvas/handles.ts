// Les poignées de redimensionnement d'une annotation (lot 1 de docs/11), la partie pure : où elles sont, quelle taille
// elles ont, ce qu'un glissé de l'une d'elles fait de la boîte, et la pastille qui dit la taille (ou la place) pendant
// le geste. Tout ce qui se voit garde sa taille d'écran : les dimensions en pixels se multiplient par l'inverse du zoom
// (comme les poignées des connecteurs). Quatre coins en carrés de 8, quatre milieux de côté en barres de 14 × 5 posées
// sur le bord ; Maj garde le rapport (coins), Alt redimensionne depuis le centre ; jamais sous 20 ni au-delà de 4 000.
// Testé sous Node (`LDApp.handles`).
import { PILL_H, pillWidth } from "../../canvas/pill";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLE_IDS: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
/** Les tailles à l'écran (px) : un coin, une barre (long × court), leurs zones de saisie, l'écart d'une pastille. */
export const CORNER_PX = 8, BAR_LONG_PX = 14, BAR_SHORT_PX = 5, CORNER_HIT_PX = 14, BAR_HIT_LONG_PX = 18, BAR_HIT_SHORT_PX = 11;
/** Une barre ne se dessine que sur un côté assez long à l'écran pour la distinguer des deux coins. */
export const BAR_MIN_SIDE_PX = 40;
export const PILL_GAP_PX = 8;
export const MIN_SIZE = 20, MAX_SIZE = 4000;

export interface Rect { x: number; y: number; w: number; h: number }
export interface HandleShape { id: HandleId; kind: "corner" | "bar"; box: Rect; hit: Rect; cursor: string }
/** Ce que le geste demande en plus du glissé : garder le rapport (Maj), partir du centre (Alt). */
export interface Mods { ratio?: boolean; center?: boolean }
/** Une pastille posée : son texte, son coin haut gauche dans les coordonnées de la boîte, l'échelle qui lui garde sa taille d'écran. */
export interface PillPlace { text: string; x: number; y: number; scale: number }

export const isCorner = (id: HandleId): boolean => id.length === 2;
const fx = (id: HandleId): number => (id.includes("w") ? 0 : id.includes("e") ? 1 : 0.5);
const fy = (id: HandleId): number => (id.includes("n") ? 0 : id.includes("s") ? 1 : 0.5);
const dirX = (id: HandleId): number => (id.includes("e") ? 1 : id.includes("w") ? -1 : 0);
const dirY = (id: HandleId): number => (id.includes("s") ? 1 : id.includes("n") ? -1 : 0);
const CURSOR: Record<HandleId, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const centred = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2, y: y - h / 2, w, h });
const clamp = (v: number): number => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(v)));
const unzoom = (zoom: number): number => 1 / Math.max(zoom, 0.05);

/** Le point d'une poignée sur une boîte de taille `w × h` (coordonnées de la boîte : coin haut gauche en 0, 0). */
export const handlePoint = (id: HandleId, size: { w: number; h: number }): { x: number; y: number } => ({ x: fx(id) * size.w, y: fy(id) * size.h });

/** Les poignées d'une boîte de taille `w × h` au zoom donné : les barres d'abord, les coins ensuite (dessinés dessus,
 *  ils gagnent là où les zones de saisie se touchent) ; une barre manque sur un côté trop court à l'écran. */
export function handleShapes(size: { w: number; h: number }, zoom: number): HandleShape[] {
  const k = unzoom(zoom);
  const bars: HandleShape[] = [], corners: HandleShape[] = [];
  HANDLE_IDS.forEach((id) => {
    const p = handlePoint(id, size), cursor = CURSOR[id];
    if (isCorner(id)) { corners.push({ id, kind: "corner", cursor, box: centred(p.x, p.y, CORNER_PX * k, CORNER_PX * k), hit: centred(p.x, p.y, CORNER_HIT_PX * k, CORNER_HIT_PX * k) }); return; }
    const across = dirX(id) === 0; // n, s : la barre est horizontale, posée sur le bord haut ou bas
    if ((across ? size.w : size.h) * zoom < BAR_MIN_SIDE_PX) return;
    const box = across ? centred(p.x, p.y, BAR_LONG_PX * k, BAR_SHORT_PX * k) : centred(p.x, p.y, BAR_SHORT_PX * k, BAR_LONG_PX * k);
    const hit = across ? centred(p.x, p.y, BAR_HIT_LONG_PX * k, BAR_HIT_SHORT_PX * k) : centred(p.x, p.y, BAR_HIT_SHORT_PX * k, BAR_HIT_LONG_PX * k);
    bars.push({ id, kind: "bar", cursor, box, hit });
  });
  return bars.concat(corners);
}

/** La boîte après un glissé de la poignée `id` de (dx, dy) en unités du plan. Le côté opposé reste en place ; avec
 *  Alt, c'est le centre (le côté opposé bouge d'autant). Maj garde le rapport, sur les coins seulement. Entiers. */
export function resized(start: Rect, id: HandleId, dx: number, dy: number, mods: Mods = {}): Rect {
  const k = mods.center ? 2 : 1;
  let w = start.w + k * dirX(id) * dx, h = start.h + k * dirY(id) * dy;
  if (!dirX(id)) w = start.w;
  if (!dirY(id)) h = start.h;
  if (mods.ratio && isCorner(id)) { const r = Math.max(w / start.w, h / start.h); w = start.w * r; h = start.h * r; }
  w = clamp(w); h = clamp(h);
  if (mods.center) return { x: Math.round(start.x + (start.w - w) / 2), y: Math.round(start.y + (start.h - h) / 2), w, h };
  return { x: Math.round(id.includes("w") ? start.x + start.w - w : start.x), y: Math.round(id.includes("n") ? start.y + start.h - h : start.y), w, h };
}

/** La pastille « L × H » pendant un redimensionnement : collée à la poignée saisie, du côté où la boîte grandit
 *  (dehors), à sa taille d'écran ; coordonnées de la boîte en cours (`size`). */
export function sizePill(size: { w: number; h: number }, id: HandleId, zoom: number): PillPlace {
  const k = unzoom(zoom), text = size.w + " × " + size.h, pw = pillWidth(text);
  const p = handlePoint(id, size), ix = dirX(id), iy = dirY(id);
  const ox = ix > 0 ? PILL_GAP_PX : ix < 0 ? -(pw + PILL_GAP_PX) : -pw / 2;
  const oy = iy > 0 ? PILL_GAP_PX : iy < 0 ? -(PILL_H + PILL_GAP_PX) : -PILL_H / 2;
  return { text, x: p.x + ox * k, y: p.y + oy * k, scale: k };
}

/** La pastille « X, Y » pendant le glissé d'une annotation : au-dessus de son coin haut gauche, à sa taille d'écran ;
 *  `x`, `y` sont les valeurs qui seront écrites (celles de la fiche : relatives à l'ancre d'une annotation attachée). */
export function positionPill(x: number, y: number, zoom: number): PillPlace {
  const k = unzoom(zoom);
  return { text: x + ", " + y, x: 0, y: -(PILL_H + PILL_GAP_PX) * k, scale: k };
}

export const handles = { HANDLE_IDS, CORNER_PX, BAR_LONG_PX, BAR_SHORT_PX, BAR_MIN_SIDE_PX, MIN_SIZE, MAX_SIZE, handleShapes, handlePoint, resized, sizePill, positionPill, isCorner };

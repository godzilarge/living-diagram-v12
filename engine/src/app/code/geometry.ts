// La géométrie d'un bloc de code (lots 16 et 16 bis de docs/11), la partie pure : chasse fixe, donc tout se calcule et
// rien ne se mesure (la carte d'équipement fait de même). La boîte a la hauteur qu'on lui donne (réponse d'Orhan,
// 2026-10-14 : « une très grosse configuration, je ne veux peut-être pas l'afficher en entier ») : les rangées qui n'y
// tiennent pas défilent, par rangée entière ; seules les rangées visibles sont dessinées (un bloc de 2 000 lignes coûte
// sa fenêtre). Depuis le lot 16 bis, une ligne plus large que la boîte revient à la ligne (`wrap`, Intent 1.7.0) en
// rangées de suite, selon la règle de wrap.ts, la même que l'écriture (CodeMirror) : la lecture et l'écriture ont la
// même gouttière, le même x du texte, la même hauteur de rangée et les mêmes coupures, d'où aucun saut de l'une à
// l'autre. La première rangée montrée (`first`) est un état de vue : ni dans le contrat, ni au journal, ni dans
// l'historique. Sans DOM ni minuterie, testé sous Node (`LDApp.code`).
import { rowsOf } from "./wrap";
import type { Row } from "./wrap";

/** Les mesures d'un bloc, en unités du dessin : en-tête, marges, pied, gouttière, rail de teinte, barre de défilement. */
export const CODE = { HEAD: 34, PAD: 10, FOOT: 26, GUTTER: 12, RAIL: 4, LEFT: 16, SCROLL: 12, GRID: 20, FIT_MAX: 60, PASTE_MAX: 24, MIN_LINES: 3, MIN_W: 240 } as const;
/** Les tailles du code : libres de 8 à 64, comme le contrat l'admet pour tout texte (lot 16 bis : « trop dirigiste »
 *  en S / M / L). */
export const CODE_SIZE: readonly [number, number] = [8, 64];

/** Les polices d'un bloc (chasse fixe seulement) : `em` = l'avance d'un caractère, `ascent` et `descent` celles de la
 *  police (en em), lues dans Chromium sur les fichiers embarqués (Cascadia : 1200, 1900 et 480 pour 2048 unités) ; elles
 *  règlent la coupure, la gouttière et la ligne de base de la lecture. */
export const CODE_FONTS = [
  { id: "jetbrains_mono", family: "JetBrains Mono", short: "JetBrains", em: 0.6, ascent: 1.02, descent: 0.3 },
  { id: "ibm_plex_mono", family: "IBM Plex Mono", short: "Plex Mono", em: 0.6, ascent: 1.025, descent: 0.275 },
  { id: "source_code_pro", family: "Source Code Pro", short: "Source Code", em: 0.6, ascent: 0.984, descent: 0.273 },
  { id: "cascadia_mono", family: "Cascadia Mono", short: "Cascadia", em: 1200 / 2048, ascent: 1900 / 2048, descent: 480 / 2048 },
] as const;
export type CodeFontId = (typeof CODE_FONTS)[number]["id"];
/** L'échantillon d'une police dans le volet et la fiche : ce qui départage dans une configuration (0 / O, 1 / l / I). */
export const FONT_SAMPLE = "interface Gi1/0/1  0O 1lI {}";
const FONT: Record<string, (typeof CODE_FONTS)[number]> = Object.fromEntries(CODE_FONTS.map((f) => [f.id, f]));
const fontOf = (font: string): (typeof CODE_FONTS)[number] => FONT[font] || CODE_FONTS[0];

export const charWidth = (size: number, font: string): number => size * fontOf(font).em;
export const lineHeight = (size: number): number => Math.round(size * 1.55);

/** Le nombre de lignes d'un texte (au moins une). */
export const lineCount = (text: string): number => { let n = 1; for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1; return n; };

/** Ce qu'un bloc montre. `rows` : les rangées du texte (wrap.ts) ; `total` : leur nombre ; `lines` : celui des lignes ;
 *  `visible` : les rangées qui tiennent ; `first` : la première montrée, bornée ; `cols` : les colonnes d'une rangée
 *  (au-delà, sans retour à la ligne, la ligne est coupée avec un repère) ; `cw` : l'avance d'un caractère. */
export interface CodeLayout {
  rows: Row[]; total: number; lines: number; visible: number; first: number; maxFirst: number; scrolls: boolean; foot: number;
  gutter: number; textX: number; cols: number; cw: number; lh: number; w: number; h: number; wrap: boolean;
}
export interface CodeShape { w: number; h: number; size: number; font: string; numbers: boolean; text: string; wrap: boolean }

/** La gouttière : les chiffres du plus grand numéro de ligne et leurs marges. */
export const gutterOf = (lines: number, size: number, font: string): number => Math.ceil(String(Math.max(lines, 1)).length * charWidth(size, font) + 2 * CODE.GUTTER);
/** Le x du texte : après la gouttière, ou une marge de 16 sans numéros. */
export const textXOf = (numbers: boolean, gutter: number): number => CODE.RAIL + (numbers ? gutter : CODE.LEFT);
/** Les colonnes d'une rangée : la largeur moins le texte, la marge de droite et la piste de défilement, **toujours
 *  réservée** (sinon les colonnes dépendraient du défilement, qui dépend des rangées, qui dépendent des colonnes). */
export const colsOf = (w: number, textX: number, size: number, font: string): number => Math.max(8, Math.floor((w - textX - CODE.LEFT - CODE.SCROLL) / charWidth(size, font)));

export function layout(shape: CodeShape, first = 0): CodeLayout {
  const { w, h, size, font, numbers, text, wrap } = shape;
  const lh = lineHeight(size), cw = charWidth(size, font), lines = lineCount(text);
  const gutter = numbers ? gutterOf(lines, size, font) : 0, textX = textXOf(numbers, gutter);
  const cols = colsOf(w, textX, size, font);
  const rows = rowsOf(text, cols, wrap), total = rows.length;
  const room = (foot: number): number => Math.max(1, Math.floor((h - CODE.HEAD - 2 * CODE.PAD - foot) / lh));
  const scrolls = room(0) < total, foot = scrolls ? CODE.FOOT : 0;
  const visible = Math.min(total, room(foot)), maxFirst = Math.max(0, total - visible);
  return { rows, total, lines, visible, first: clampFirst(first, maxFirst), maxFirst, scrolls, foot, gutter, textX, cols, cw, lh, w, h, wrap };
}

export const clampFirst = (first: number, maxFirst: number): number => Math.min(Math.max(0, Math.round(first || 0)), Math.max(0, maxFirst));

/** Le décalage de la ligne de base dans une rangée de hauteur `lh`, comme le navigateur la pose dans une ligne HTML
 *  (l'écriture, CodeMirror) : l'ascendante et la descendante de la police arrondies au pixel, la demi-interligne arrondie
 *  par défaut ; sous Linux (positionnement sous-pixel), une descendante arrondie par défaut prend un pixel à l'ascendante
 *  (Blink, `FontMetrics`). Vérifié dans Chromium de 8 à 64 px pour les quatre polices. C'est le repli : la page mesure la
 *  ligne de base réelle dès que la police est chargée (probe.ts), sur tout navigateur. */
export function baselineOffset(size: number, lh: number, font: string, subpixel = true): number {
  const f = fontOf(font), exactDescent = f.descent * size;
  let ascent = Math.round(f.ascent * size), descent = Math.round(exactDescent);
  if (subpixel && descent < exactDescent && ascent >= 1) { descent += 1; ascent -= 1; }
  return Math.floor((lh - ascent - descent) / 2) + ascent;
}

/** La ligne de base d'une rangée montrée (rang `i` dans la fenêtre) ; `offset` : celui de la rangée, mesuré ou calculé. */
export const baseline = (i: number, lh: number, offset: number): number => CODE.HEAD + CODE.PAD + i * lh + offset;

/** Le x d'une rangée : le texte, plus le retrait d'une rangée de suite. */
export const rowX = (l: Pick<CodeLayout, "textX" | "cw">, row: Row): number => l.textX + (row.cont ? row.hang * l.cw : 0);

/** La hauteur qui montre `total` rangées, `max` au plus, arrondie à la grille : « ajuster au contenu ». */
export function fitHeight(total: number, size: number, max: number = CODE.FIT_MAX): number {
  const rows = Math.min(total, max);
  const h = CODE.HEAD + 2 * CODE.PAD + rows * lineHeight(size) + (total > max ? CODE.FOOT : 0);
  return Math.ceil(h / CODE.GRID) * CODE.GRID;
}
/** La hauteur qui montre tout un bloc (ses rangées à sa largeur : elles ne dépendent pas de la hauteur). */
export const fitHeightOf = (shape: Omit<CodeShape, "h">, max: number = CODE.FIT_MAX): number => fitHeight(layout({ ...shape, h: 0 }).total, shape.size, max);
/** La hauteur la plus basse d'un bloc : trois lignes (les poignées n'iront pas plus bas). */
export const minHeight = (size: number): number => Math.ceil((CODE.HEAD + 2 * CODE.PAD + CODE.MIN_LINES * lineHeight(size)) / CODE.GRID) * CODE.GRID;

/** La largeur d'un bloc collé : la ligne la plus longue, bornée à 380-640, arrondie à la grille. */
export function pasteWidth(text: string, size = 13, font = "jetbrains_mono"): number {
  let longest = 0;
  for (const line of text.split("\n")) longest = Math.max(longest, line.length);
  const w = Math.min(640, Math.max(380, longest * charWidth(size, font) + 80));
  return Math.round(w / CODE.GRID) * CODE.GRID;
}

/** La barre de défilement : la piste à droite, le pouce proportionnel à la fenêtre ; rien si tout tient. */
export function scrollbar(l: CodeLayout): { trackY: number; trackH: number; thumbY: number; thumbH: number; x: number } | null {
  if (!l.scrolls) return null;
  const trackY = CODE.HEAD + 4, trackH = l.h - CODE.HEAD - l.foot - 8;
  const thumbH = Math.max(18, (trackH * l.visible) / l.total);
  const thumbY = trackY + (trackH - thumbH) * (l.maxFirst ? l.first / l.maxFirst : 0);
  return { trackY, trackH, thumbY, thumbH, x: l.w - CODE.SCROLL };
}
/** Le pouce glissé de `dy` pixels d'écran (zoom `z`) depuis la ligne `from` : la première ligne visée. */
export function thumbDrag(l: CodeLayout, from: number, dy: number, z: number): number {
  const bar = scrollbar(l);
  if (!bar || !l.maxFirst) return 0;
  const travel = Math.max(1, (bar.trackH - bar.thumbH) * z);
  return clampFirst(from + (dy * l.maxFirst) / travel, l.maxFirst);
}
/** Un clic sur la piste, au-dessus ou au-dessous du pouce (`y` dans la boîte) : une page de moins ou de plus. */
export function trackClick(l: CodeLayout, y: number): number {
  const bar = scrollbar(l);
  if (!bar) return l.first;
  const page = Math.max(1, l.visible - 1);
  return clampFirst(l.first + (y < bar.thumbY ? -page : y > bar.thumbY + bar.thumbH ? page : 0), l.maxFirst);
}
/** Les touches de défilement d'un bloc sélectionné : une page, le début, la fin ; `null` pour une autre touche. */
export function keyScroll(l: CodeLayout, key: string): number | null {
  const page = Math.max(1, l.visible - 1);
  const to: Record<string, number> = { PageUp: l.first - page, PageDown: l.first + page, Home: 0, End: l.maxFirst };
  return key in to ? clampFirst(to[key], l.maxFirst) : null;
}
/** La molette sur un bloc : les pixels accumulés (`acc`) deviennent des lignes entières, le reste est gardé pour le
 *  cran suivant ; `deltaMode` 1 = lignes, 2 = pages (comme les navigateurs). */
export function wheelLines(acc: number, deltaY: number, deltaMode: number, lh: number, zoom: number, page = 10): { lines: number; acc: number } {
  const step = lh * zoom;
  const px = acc + (deltaMode === 1 ? deltaY * step : deltaMode === 2 ? deltaY * page * step : deltaY);
  const lines = Math.trunc(px / step);
  return { lines, acc: px - lines * step };
}
/** Le pied « lignes 34-58 sur 120 » et « 62 plus bas » / « fin du code », en lignes du texte (pas en rangées) : les
 *  nombres seulement (la page écrit). */
export function footer(l: CodeLayout): { from: number; to: number; total: number; below: number } | null {
  if (!l.scrolls || !l.rows.length) return null;
  const top = l.rows[l.first], bottom = l.rows[Math.min(l.total, l.first + l.visible) - 1];
  return { from: top.line + 1, to: bottom.line + 1, total: l.lines, below: l.lines - (bottom.line + 1) };
}
/** Une boîte redimensionnée : jamais sous trois lignes ni sous la largeur minimale. */
export const boundedBox = (w: number, h: number, size: number): { w: number; h: number } => ({ w: Math.max(CODE.MIN_W, w), h: Math.max(minHeight(size), h) });

/** L'offset dans le texte du début de la ligne `line` (pour ouvrir l'écriture là où l'on lisait). */
export function offsetOfLine(text: string, line: number): number {
  let at = 0;
  for (let i = 0; i < line; i += 1) {
    const next = text.indexOf("\n", at);
    if (next < 0) return text.length;
    at = next + 1;
  }
  return at;
}
/** Où l'écriture s'ouvre pour une première rangée lue : sa ligne, son rang dans la ligne (une rangée de suite) et
 *  l'offset de son premier caractère dans le texte. */
export function openingOf(text: string, l: Pick<CodeLayout, "rows" | "first">): { line: number; k: number; offset: number } {
  const row = l.rows[l.first];
  if (!row) return { line: 0, k: 0, offset: 0 };
  let k = 0;
  for (let i = l.first - 1; i >= 0 && l.rows[i].line === row.line; i -= 1) k += 1;
  return { line: row.line, k, offset: offsetOfLine(text, row.line) + row.from };
}

/** L'inverse : la rangée d'une ligne et de son rang (la lecture reprend où l'écriture était), bornée au texte. */
export function rowOf(l: Pick<CodeLayout, "rows">, at: { line: number; k: number }): number {
  const start = l.rows.findIndex((row) => row.line === at.line);
  if (start < 0) return Math.max(0, l.rows.length - 1);
  let k = 0;
  while (k < at.k && start + k + 1 < l.rows.length && l.rows[start + k + 1].line === at.line) k += 1;
  return start + k;
}

/** Les zones des valeurs sensibles visibles (le survol rappelle leur nature, secret-tip.ts) : un rectangle par morceau
 *  de valeur dans une rangée montrée, en unités du bloc ; une valeur coupée par le retour à la ligne en a deux. */
export function secretBoxes(secrets: readonly { line: number; start: number; end: number }[], l: CodeLayout): { index: number; x: number; y: number; w: number; h: number }[] {
  const out: { index: number; x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < l.visible; i += 1) {
    const row = l.rows[l.first + i];
    if (!row) break;
    secrets.forEach((f, index) => {
      if (f.line !== row.line) return;
      const from = Math.max(f.start, row.from), to = Math.min(f.end, row.to, row.from + l.cols);
      if (from >= to) return;
      out.push({ index, x: rowX(l, row) + (from - row.from) * l.cw, y: CODE.HEAD + CODE.PAD + i * l.lh, w: (to - from) * l.cw, h: l.lh });
    });
  }
  return out;
}

/** La fenêtre de lignes d'une liste à hauteur de ligne fixe (la fiche d'un bloc : seules les lignes visibles sont
 *  rendues, audit du 2026-10-15) : de `from` (inclus) à `to` (exclu), avec `overscan` lignes de marge de chaque côté, et
 *  la hauteur de ce qui n'est pas rendu avant et après (en pixels). */
export function lineWindow(total: number, scrollTop: number, viewH: number, lineH: number, overscan = 20): { from: number; to: number; before: number; after: number } {
  const n = Math.max(0, total), lh = Math.max(1, lineH);
  const top = Math.max(0, Math.floor(Math.max(0, scrollTop) / lh) - overscan);
  const to = Math.min(n, Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewH)) / lh) + overscan);
  const from = Math.min(top, to);
  return { from, to, before: from * lh, after: (n - to) * lh };
}

/** Une zone de l'écran (pixels) et une boîte qui s'y pose. */
export interface WarnZone { left: number; top: number; right: number; bottom: number }
export interface WarnRect { x: number; y: number; w: number; h: number }
/** Où poser l'avertissement des valeurs sensibles (`w` × `h`, pixels d'écran) à côté du bloc qu'on écrit (`block`),
 *  dans la zone visible (sous la barre du haut, au-dessus de la bande, à gauche de la fiche) : à droite s'il y tient,
 *  sinon à gauche, sinon dessous, sinon dessus ; s'il ne tient nulle part, sur le bloc, borné à la zone (le code ne se
 *  lit pas pendant ce choix). À côté, aligné sur le haut du bloc et remonté s'il dépasse ; dessus ou dessous, aligné sur
 *  son bord gauche. Jamais sous la fiche (audit du 2026-10-15, P1). */
export function placeWarn(block: WarnRect, w: number, h: number, zone: WarnZone, gap = 12): { x: number; y: number; side: "right" | "left" | "below" | "above" | "over" } {
  const clampX = (x: number): number => Math.round(Math.max(zone.left, Math.min(x, zone.right - w)));
  const clampY = (y: number): number => Math.round(Math.max(zone.top, Math.min(y, zone.bottom - h)));
  if (block.x + block.w + gap + w <= zone.right) return { x: Math.round(block.x + block.w + gap), y: clampY(block.y), side: "right" };
  if (block.x - gap - w >= zone.left) return { x: Math.round(block.x - gap - w), y: clampY(block.y), side: "left" };
  if (block.y + block.h + gap + h <= zone.bottom) return { x: clampX(block.x), y: Math.round(block.y + block.h + gap), side: "below" };
  if (block.y - gap - h >= zone.top) return { x: clampX(block.x), y: Math.round(block.y - gap - h), side: "above" };
  return { x: clampX(block.x + block.w - w), y: clampY(block.y), side: "over" };
}

export const geometry = { CODE, CODE_FONTS, CODE_SIZE, FONT_SAMPLE, charWidth, lineHeight, lineCount, gutterOf, textXOf, colsOf, layout, clampFirst, baselineOffset, baseline, rowX, fitHeight, fitHeightOf, minHeight, pasteWidth, scrollbar, thumbDrag, trackClick, keyScroll, wheelLines, footer, boundedBox, offsetOfLine, openingOf, rowOf, secretBoxes, lineWindow, placeWarn };

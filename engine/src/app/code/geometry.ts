// La géométrie d'un bloc de code (lot 16 de docs/11), la partie pure : chasse fixe, donc tout se calcule et rien ne se
// mesure (la carte d'équipement fait de même). La boîte a la hauteur qu'on lui donne (réponse d'Orhan, 2026-10-14 :
// « une très grosse configuration, je ne veux peut-être pas l'afficher en entier ») : les lignes qui n'y tiennent pas
// défilent, par ligne entière ; seules les lignes visibles sont dessinées (un bloc de 2 000 lignes coûte sa fenêtre).
// La première ligne montrée (`first`) est un état de vue : ni dans le contrat, ni au journal, ni dans l'historique.
// Sans DOM ni minuterie, testé sous Node (`LDApp.code`).

/** Les mesures d'un bloc, en unités du dessin : en-tête, marges, pied, gouttière, rail de teinte, barre de défilement. */
export const CODE = { HEAD: 34, PAD: 10, FOOT: 26, GUTTER: 12, RAIL: 4, LEFT: 16, SCROLL: 12, GRID: 20, FIT_MAX: 60, PASTE_MAX: 24, MIN_LINES: 3, MIN_W: 240 } as const;
/** Les tailles du code (bornées par l'interface ; le contrat admet 8 à 64 pour toute annotation). */
export const CODE_SIZE: readonly [number, number] = [8, 24];
export const CODE_SIZES: readonly number[] = [10, 11, 12, 13, 14, 15, 16, 18];

/** Les polices d'un bloc (chasse fixe seulement) : `em` = l'avance d'un caractère, mesurée dans Chromium sur un
 *  échantillon réseau (`.impeccable/prototype-lot-16/scripts/chasse.py`) ; elle règle la coupure et la gouttière. */
export const CODE_FONTS = [
  { id: "jetbrains_mono", family: "JetBrains Mono", short: "JetBrains", em: 0.6 },
  { id: "ibm_plex_mono", family: "IBM Plex Mono", short: "Plex Mono", em: 0.6 },
  { id: "source_code_pro", family: "Source Code Pro", short: "Source Code", em: 0.6 },
  { id: "cascadia_mono", family: "Cascadia Mono", short: "Cascadia", em: 0.59 },
] as const;
export type CodeFontId = (typeof CODE_FONTS)[number]["id"];
/** L'échantillon d'une police dans le volet et la fiche : ce qui départage dans une configuration (0 / O, 1 / l / I). */
export const FONT_SAMPLE = "interface Gi1/0/1  0O 1lI {}";
const EM: Record<string, number> = Object.fromEntries(CODE_FONTS.map((f) => [f.id, f.em]));

export const charWidth = (size: number, font: string): number => size * (EM[font] || 0.6);
export const lineHeight = (size: number): number => Math.round(size * 1.55);

/** Le nombre de lignes d'un texte (au moins une). */
export const lineCount = (text: string): number => { let n = 1; for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1; return n; };

/** Ce qu'un bloc montre. `room` : les lignes qui tiennent ; `first` : la première montrée, bornée ; `cols` : les
 *  caractères qui tiennent sur une ligne (au-delà, la ligne est coupée avec un repère). */
export interface CodeLayout {
  total: number; visible: number; first: number; maxFirst: number; scrolls: boolean; foot: number;
  gutter: number; textX: number; cols: number; lh: number; w: number; h: number;
}
export interface CodeShape { w: number; h: number; size: number; font: string; numbers: boolean; total: number }

export function layout(shape: CodeShape, first = 0): CodeLayout {
  const { w, h, size, font, numbers, total } = shape;
  const lh = lineHeight(size);
  const room = (foot: number): number => Math.max(1, Math.floor((h - CODE.HEAD - 2 * CODE.PAD - foot) / lh));
  const scrolls = room(0) < total, foot = scrolls ? CODE.FOOT : 0;
  const visible = Math.min(total, room(foot)), maxFirst = Math.max(0, total - visible);
  const cw = charWidth(size, font);
  const gutter = numbers ? Math.ceil(String(total).length * cw + 2 * CODE.GUTTER) : 0;
  const textX = CODE.RAIL + (numbers ? gutter : CODE.LEFT - CODE.RAIL + 4);
  const cols = Math.max(4, Math.floor((w - textX - CODE.LEFT - (scrolls ? CODE.SCROLL : 0)) / cw));
  return { total, visible, first: clampFirst(first, maxFirst), maxFirst, scrolls, foot, gutter, textX, cols, lh, w, h };
}

export const clampFirst = (first: number, maxFirst: number): number => Math.min(Math.max(0, Math.round(first || 0)), Math.max(0, maxFirst));

/** La ligne de base d'une ligne montrée (rang `i` dans la fenêtre). */
export const baseline = (i: number, lh: number, size: number): number => CODE.HEAD + CODE.PAD + i * lh + lh / 2 + size * 0.36;

/** La hauteur qui montre tout le code, `max` lignes au plus, arrondie à la grille : « ajuster au contenu ». */
export function fitHeight(total: number, size: number, max: number = CODE.FIT_MAX): number {
  const lines = Math.min(total, max);
  const h = CODE.HEAD + 2 * CODE.PAD + lines * lineHeight(size) + (total > max ? CODE.FOOT : 0);
  return Math.ceil(h / CODE.GRID) * CODE.GRID;
}
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
/** Le pied « lignes 34-58 sur 120 » et « 62 plus bas » / « fin du code » : les nombres seulement (la page écrit). */
export function footer(l: CodeLayout): { from: number; to: number; total: number; below: number } | null {
  if (!l.scrolls) return null;
  const to = l.first + l.visible;
  return { from: l.first + 1, to, total: l.total, below: l.total - to };
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

export const geometry = { CODE, CODE_FONTS, CODE_SIZE, CODE_SIZES, FONT_SAMPLE, charWidth, lineHeight, lineCount, layout, clampFirst, baseline, fitHeight, minHeight, pasteWidth, scrollbar, thumbDrag, trackClick, keyScroll, wheelLines, footer, boundedBox, offsetOfLine };

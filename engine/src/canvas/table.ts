// Le tableau d'une annotation (docs/10 §6), la partie pure : la grille depuis les poids de colonnes et de lignes (la
// boîte reste la mesure, les poids se partagent au prorata), les cellules visibles avec leurs fusions, les gestes qui
// rendent un nouveau contenu (une cellule changée, une ligne ou une colonne insérée ou retirée, des cellules fusionnées
// ou séparées, une colonne ou une ligne redimensionnée). Jamais de mutation : chaque geste rend un contenu neuf, que
// la page envoie en entier (le contrat remplace le contenu d'une annotation d'un bloc).
import type { Merge, TableContent } from "../contracts/intent";

export const MAX_ROWS = 30, MAX_COLUMNS = 8, MAX_CELL = 120;
export const MIN_TRACK = 20; // une colonne ou une ligne ne descend jamais sous 20 unités : une cellule reste visible
export interface Frame { x: number; y: number; w: number; h: number }
export interface Grid { xs: number[]; ys: number[]; columns: number; rows: number }
export interface CellBox { r: number; c: number; rows: number; cols: number; x: number; y: number; w: number; h: number; text: string }
export interface Range { r0: number; c0: number; r1: number; c1: number }

export const columnsOf = (content: Pick<TableContent, "rows">): number => (content.rows[0] ? content.rows[0].length : 0);
type Rows = TableContent["rows"];
const asRows = (rows: string[][]): Rows => rows as Rows;
const weights = (given: readonly number[] | null | undefined, count: number): number[] =>
  (given && given.length === count ? given.slice() : new Array<number>(count).fill(1));
// Les frontières d'un axe : la longueur partagée au prorata des poids, arrondie, la dernière exactement au bout.
function tracks(given: readonly number[] | null | undefined, count: number, length: number): number[] {
  const w = weights(given, count), total = w.reduce((sum, v) => sum + v, 0) || 1;
  const out = [0];
  let acc = 0;
  w.forEach((v, i) => { acc += v; out.push(i === count - 1 ? length : Math.round((length * acc) / total)); });
  return out;
}
/** La grille d'un tableau dans sa boîte (repère de la boîte) : les frontières des colonnes et des lignes. */
export function grid(content: Pick<TableContent, "rows" | "widths" | "heights">, frame: Pick<Frame, "w" | "h">): Grid {
  const columns = Math.max(1, columnsOf(content)), rows = Math.max(1, content.rows.length);
  return { xs: tracks(content.widths, columns, frame.w), ys: tracks(content.heights, rows, frame.h), columns, rows };
}

/** La fusion qui couvre une cellule, qu'elle en soit le coin ou non ; rien si la cellule est seule. */
export function mergeAt(content: Pick<TableContent, "merges">, r: number, c: number): Merge | null {
  return content.merges.find((m) => r >= m.row && r < m.row + m.rows && c >= m.col && c < m.col + m.cols) || null;
}
/** Le coin haut gauche de la cellule visible qui porte (r, c) : elle-même, ou le coin de sa fusion. */
export function anchorOf(content: Pick<TableContent, "merges">, r: number, c: number): [number, number] {
  const m = mergeAt(content, r, c);
  return m ? [m.row, m.col] : [r, c];
}
/** Les cellules visibles, avec leur étendue et leur boîte ; une cellule couverte par une fusion n'y est pas. */
export function cells(content: Pick<TableContent, "rows" | "merges">, g: Grid): CellBox[] {
  const out: CellBox[] = [];
  content.rows.forEach((row, r) => row.forEach((text, c) => {
    const m = mergeAt(content, r, c);
    if (m && (m.row !== r || m.col !== c)) return;
    const rows = m ? m.rows : 1, cols = m ? m.cols : 1;
    out.push({ r, c, rows, cols, x: g.xs[c], y: g.ys[r], w: g.xs[c + cols] - g.xs[c], h: g.ys[r + rows] - g.ys[r], text });
  }));
  return out;
}
/** La cellule visible sous un point de la boîte (repère de la boîte), ou rien hors du tableau. */
export function cellAt(content: Pick<TableContent, "rows" | "merges">, g: Grid, x: number, y: number): [number, number] | null {
  if (x < 0 || y < 0 || x > g.xs[g.columns] || y > g.ys[g.rows]) return null;
  let c = 0, r = 0;
  while (c < g.columns - 1 && x >= g.xs[c + 1]) c += 1;
  while (r < g.rows - 1 && y >= g.ys[r + 1]) r += 1;
  return anchorOf(content, r, c);
}
/** La plage entre deux cellules, normalisée et élargie aux fusions qu'elle touche (une fusion entre en entier). */
export function rangeOf(content: Pick<TableContent, "merges">, a: [number, number], b: [number, number]): Range {
  let range: Range = { r0: Math.min(a[0], b[0]), c0: Math.min(a[1], b[1]), r1: Math.max(a[0], b[0]), c1: Math.max(a[1], b[1]) };
  for (let guard = 0; guard < 64; guard += 1) {
    const grown = { ...range };
    content.merges.forEach((m) => {
      const touches = m.row <= range.r1 && m.row + m.rows - 1 >= range.r0 && m.col <= range.c1 && m.col + m.cols - 1 >= range.c0;
      if (!touches) return;
      grown.r0 = Math.min(grown.r0, m.row); grown.c0 = Math.min(grown.c0, m.col);
      grown.r1 = Math.max(grown.r1, m.row + m.rows - 1); grown.c1 = Math.max(grown.c1, m.col + m.cols - 1);
    });
    if (grown.r0 === range.r0 && grown.c0 === range.c0 && grown.r1 === range.r1 && grown.c1 === range.c1) break;
    range = grown;
  }
  return range;
}
export const isSingle = (range: Range): boolean => range.r0 === range.r1 && range.c0 === range.c1;

// Un contenu neuf, ses fusions triées et sans celles qu'une suppression a réduites à une cellule.
function normalized(content: TableContent, merges: Merge[]): TableContent {
  const kept = merges.filter((m) => m.rows * m.cols >= 2 && m.rows >= 1 && m.cols >= 1).sort((a, b) => a.row - b.row || a.col - b.col);
  return { ...content, merges: kept };
}
export function setCell(content: TableContent, r: number, c: number, text: string): TableContent {
  return { ...content, rows: asRows(content.rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? text.slice(0, MAX_CELL) : cell)) : row))) };
}
const average = (values: readonly number[]): number => Math.max(1, Math.round(values.reduce((s, v) => s + v, 0) / values.length));

/** Une ligne de plus, insérée avant l'index `at` (`rows.length` = à la fin) ; une fusion qui enjambe s'allonge. */
export function insertRow(content: TableContent, at: number): TableContent {
  if (content.rows.length >= MAX_ROWS) return content;
  const columns = columnsOf(content);
  const rows = content.rows.slice(); rows.splice(at, 0, new Array<string>(columns).fill(""));
  const heights = content.heights ? content.heights.slice() : null;
  if (heights) heights.splice(at, 0, average(content.heights as number[]));
  const merges = content.merges.map((m) => (m.row >= at ? { ...m, row: m.row + 1 } : m.row + m.rows > at ? { ...m, rows: m.rows + 1 } : m));
  return normalized({ ...content, rows: asRows(rows), heights }, merges);
}
/** Une ligne de moins ; jamais la dernière (le tableau garde une ligne : supprimer l'annotation, sinon). */
export function deleteRow(content: TableContent, at: number): TableContent {
  if (content.rows.length <= 1 || at < 0 || at >= content.rows.length) return content;
  const rows = content.rows.filter((_, i) => i !== at);
  const heights = content.heights ? content.heights.filter((_, i) => i !== at) : null;
  const merges = content.merges.map((m) => (m.row > at ? { ...m, row: m.row - 1 } : m.row + m.rows > at ? { ...m, rows: m.rows - 1 } : m));
  return normalized({ ...content, rows: asRows(rows), heights }, merges);
}
export function insertColumn(content: TableContent, at: number): TableContent {
  if (columnsOf(content) >= MAX_COLUMNS) return content;
  const rows = content.rows.map((row) => { const next = row.slice(); next.splice(at, 0, ""); return next; });
  const widths = content.widths ? content.widths.slice() : null;
  if (widths) widths.splice(at, 0, average(content.widths as number[]));
  const merges = content.merges.map((m) => (m.col >= at ? { ...m, col: m.col + 1 } : m.col + m.cols > at ? { ...m, cols: m.cols + 1 } : m));
  return normalized({ ...content, rows: asRows(rows), widths }, merges);
}
export function deleteColumn(content: TableContent, at: number): TableContent {
  const columns = columnsOf(content);
  if (columns <= 1 || at < 0 || at >= columns) return content;
  const rows = content.rows.map((row) => row.filter((_, j) => j !== at));
  const widths = content.widths ? content.widths.filter((_, j) => j !== at) : null;
  const merges = content.merges.map((m) => (m.col > at ? { ...m, col: m.col - 1 } : m.col + m.cols > at ? { ...m, cols: m.cols - 1 } : m));
  return normalized({ ...content, rows: asRows(rows), widths }, merges);
}
/** Les cellules d'une plage fusionnées en une : le texte est celui du coin haut gauche, les autres gardent le leur
 *  (séparer les rend) ; les fusions déjà dans la plage s'y fondent. */
export function merge(content: TableContent, range: Range): TableContent {
  const full = rangeOf(content, [range.r0, range.c0], [range.r1, range.c1]);
  if (isSingle(full)) return content;
  const outside = content.merges.filter((m) => !(m.row >= full.r0 && m.row + m.rows - 1 <= full.r1 && m.col >= full.c0 && m.col + m.cols - 1 <= full.c1));
  return normalized(content, outside.concat({ row: full.r0, col: full.c0, rows: full.r1 - full.r0 + 1, cols: full.c1 - full.c0 + 1 }));
}
export function split(content: TableContent, r: number, c: number): TableContent {
  const m = mergeAt(content, r, c);
  return m ? normalized(content, content.merges.filter((x) => x !== m)) : content;
}
// Un axe redimensionné : la frontière `index` (entre deux pistes) glisse de `delta` unités ; les deux pistes voisines se
// partagent, aucune ne passe sous MIN_TRACK ; les poids deviennent les longueurs en unités (ce qui est dessiné).
function resized(bounds: number[], index: number, delta: number): number[] | null {
  if (index < 1 || index >= bounds.length - 1) return null;
  const lo = bounds[index - 1] + MIN_TRACK, hi = bounds[index + 1] - MIN_TRACK;
  const at = Math.round(Math.min(hi, Math.max(lo, bounds[index] + delta)));
  if (at === bounds[index] || hi < lo) return null;
  const next = bounds.slice(); next[index] = at;
  return next.slice(1).map((b, i) => Math.max(1, b - next[i]));
}
export function resizeColumn(content: TableContent, g: Grid, index: number, delta: number): TableContent {
  const widths = resized(g.xs, index, delta);
  return widths ? { ...content, widths } : content;
}
export function resizeRow(content: TableContent, g: Grid, index: number, delta: number): TableContent {
  const heights = resized(g.ys, index, delta);
  return heights ? { ...content, heights } : content;
}
/** La boîte qui suit un contenu changé : une colonne ou une ligne de plus agrandit la boîte d'une piste moyenne (les
 *  autres gardent leur taille), une de moins la réduit d'autant ; jamais sous 20 ni au-delà de 4 000. */
export function grownBox(before: Pick<TableContent, "rows" | "widths" | "heights">, after: Pick<TableContent, "rows" | "widths" | "heights">, frame: Pick<Frame, "w" | "h">): { w: number; h: number } {
  const g = grid(before, frame);
  const dc = columnsOf(after) - columnsOf(before), dr = after.rows.length - before.rows.length;
  const colW = Math.round(frame.w / Math.max(1, g.columns)), rowH = Math.round(frame.h / Math.max(1, g.rows));
  const clamp = (v: number): number => Math.min(4000, Math.max(20, Math.round(v)));
  return { w: clamp(frame.w + dc * colW), h: clamp(frame.h + dr * rowH) };
}
/** Un tableau neuf, aux colonnes et lignes égales, sans fusion. */
export const fresh = (rows: string[][], header = true): TableContent => ({ kind: "table", header, rows: asRows(rows), widths: null, heights: null, merges: [] });

export const table = { MAX_ROWS, MAX_COLUMNS, MAX_CELL, MIN_TRACK, columnsOf, grid, mergeAt, anchorOf, cells, cellAt, rangeOf, isSingle, setCell, insertRow, deleteRow, insertColumn, deleteColumn, merge, split, resizeColumn, resizeRow, grownBox, fresh };

// La règle de coupure d'un bloc de code (lot 16 bis de docs/11) : une règle écrite, jamais une mesure. La toile (SVG)
// coupe avec elle, l'écriture (CodeMirror, editor.ts) est contrainte à la suivre (chaque mot reçoit une classe qui
// interdit ou force sa coupure, chaque ligne son retrait) : la lecture et l'écriture coupent aux mêmes caractères,
// d'où aucun saut en passant de l'une à l'autre. Chasse fixe : tout se compte en colonnes. Reprise du prototype du
// 2026-10-15 (vérifiée dans Chromium sur 2 080 lignes tirées au hasard), réécrite ici. Sans DOM, testée sous Node.
//
// La règle, en cinq phrases :
//  1. Une ligne se lit en suites d'espaces et en mots (suites sans espace).
//  2. Les espaces ne coupent jamais une ligne : ils restent au bout de la rangée, même au-delà du bord (comme
//     `white-space: pre-wrap`, où ils « pendent »).
//  3. Un mot qui tient sur une rangée de suite (`cols - hang`) n'est jamais coupé : s'il ne tient pas dans la place qui
//     reste, il passe entier à la rangée suivante.
//  4. Un mot plus long qu'une rangée de suite se coupe au caractère : il remplit la place qui reste, puis des rangées
//     entières.
//  5. Les rangées de suite sont en retrait : l'indentation de la ligne plus deux colonnes (`hang`), au plus la moitié
//     de la largeur et 80 colonnes ; la première rangée a toute la largeur.

/** Une rangée visuelle : la ligne (depuis 0), ses colonnes [from, to), `cont` = rangée de suite (en retrait de `hang`). */
export interface Row { line: number; from: number; to: number; cont: boolean; hang: number }

export const HANG_EXTRA = 2;
/** Le retrait le plus grand : les classes de retrait de l'écriture vont jusque-là (`.hang-0` à `.hang-80`). */
export const HANG_MAX = 80;
const SPACE = 32;

/** Le retrait des rangées de suite d'une ligne : son indentation + 2, au plus la moitié de la largeur et 80 colonnes.
 *  Une ligne d'espaces n'a pas d'indentation à prolonger. */
export function hangOf(text: string, cols: number): number {
  let indent = 0;
  while (indent < text.length && text.charCodeAt(indent) === SPACE) indent += 1;
  if (indent === text.length) indent = 0;
  return Math.max(0, Math.min(indent + HANG_EXTRA, Math.floor(cols / 2), HANG_MAX));
}

/** Les mots d'une ligne : [début, fin) des suites sans espace. */
export function wordsOf(text: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && text.charCodeAt(i) === SPACE) i += 1;
    if (i >= text.length) break;
    const start = i;
    while (i < text.length && text.charCodeAt(i) !== SPACE) i += 1;
    out.push([start, i]);
  }
  return out;
}

/** Un mot « long » se coupe au caractère (règle 4) ; un autre jamais (règle 3). */
export const isLong = (length: number, cols: number, hang: number): boolean => length > cols - hang;

/** Les rangées d'une ligne de `cols` colonnes. Sans retour à la ligne : une seule rangée, entière. */
export function wrapLine(text: string, line: number, cols: number, wrap: boolean): Row[] {
  const hang = wrap ? hangOf(text, cols) : 0;
  if (!wrap || text.length <= cols) return [{ line, from: 0, to: text.length, cont: false, hang }];
  const rows: Row[] = [];
  let start = 0, width = cols;
  const cut = (at: number): void => { rows.push({ line, from: start, to: at, cont: rows.length > 0, hang }); start = at; width = cols - hang; };
  for (const [a, b] of wordsOf(text)) {
    const col = a - start; // la colonne où le mot commence sur la rangée (les espaces d'avant comptés, pendants ou non)
    if (!isLong(b - a, cols, hang)) {
      if (col + (b - a) > width) cut(a);
      continue;
    }
    // un mot long : il remplit la place qui reste, puis des rangées entières
    if (width - col <= 0) cut(a);
    while (b - start > width) cut(start + width);
  }
  rows.push({ line, from: start, to: text.length, cont: rows.length > 0, hang });
  return rows;
}

/** Toutes les rangées d'un texte. */
export function wrapText(text: string, cols: number, wrap: boolean): Row[] {
  const rows: Row[] = [];
  text.split("\n").forEach((line, i) => { for (const row of wrapLine(line, i, cols, wrap)) rows.push(row); });
  return rows;
}

// Les rangées d'un bloc se recalculent quand son texte, sa largeur en colonnes ou le retour à la ligne changent, jamais
// à chaque image (défilement, survol) : quelques entrées, les plus récentes gardées.
const cache = new Map<string, Row[]>();
const CACHE_MAX = 64;
export function rowsOf(text: string, cols: number, wrap: boolean): Row[] {
  const key = cols + "|" + (wrap ? 1 : 0) + "|" + text;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = wrapText(text, cols, wrap);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, rows);
  return rows;
}

export const wrapping = { HANG_EXTRA, HANG_MAX, hangOf, wordsOf, isLong, wrapLine, wrapText, rowsOf };

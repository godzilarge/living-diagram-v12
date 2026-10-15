// Les repères d'alignement et l'aimant aux objets (lot 8 de docs/11), la partie pure : pendant un glissé ou un
// redimensionnement, des lignes disent « aligné avec » et la boîte s'y colle. Le rendu fait foi d'après le prototype
// validé le 2026-10-14 (`.impeccable/prototype-lot-8/`).
//
// En unités du plan. Entrées : la boîte qui bouge (une seule : englobante quand plusieurs éléments bougent), les boîtes
// candidates (cartes, annotations, cadres visibles dans la vue élargie de moitié, 400 au plus, les plus proches
// d'abord) et la tolérance (8 px d'écran rapportés au zoom). Sorties : la correction par axe et ce qu'il faut dessiner.
// Règles : centre ↔ centre et bord ↔ bord ; le centre passe avant un bord ; un écart égal compte comme un bord ; à rang
// égal, le plus proche gagne ; une ligne par axe. L'aimant de la grille s'applique après les repères, sur l'axe qu'ils
// n'ont pas pris ; Ctrl tenu suspend les deux (la page le lit). Sans DOM ni React, testé sous Node (`LDApp.guides`).
import { HUES } from "../../canvas/hues";
import type { HueName } from "../../canvas/hues";

export interface Box { x: number; y: number; w: number; h: number }
export type Axis = "x" | "y";
/** Une boîte candidate : son identité (celle du nœud React Flow), sa boîte, et si elle compte pour l'espacement égal
 *  (une carte, une annotation ; pas un cadre de groupe ni un cluster, qui englobent d'autres boîtes). */
export interface Candidate { id: string; box: Box; spaced: boolean }
/** Un repère d'alignement : sur l'axe `axis` (« x » : une ligne verticale en x = `at`), de `from` à `to` sur l'autre
 *  axe, et les boîtes qu'il aligne (celle qui bouge d'abord). */
export interface Line { axis: Axis; kind: "center" | "edge"; at: number; from: number; to: number; boxes: Box[]; hits: string[] }
/** Un espacement égal : l'écart, et la chaîne des paires de boîtes séparées de cet écart, autour de la boîte posée. */
export interface Gaps { axis: Axis; gap: number; segs: [Box, Box][]; hits: string[] }
export interface Snapped { dx: number; dy: number; lines: Line[]; gaps: Gaps[]; took: { x: boolean; y: boolean } }

/** La tolérance à l'écran (le seuil d'Excalidraw et de tldraw), le plafond des candidates, l'agrandissement de la vue. */
export const TOLERANCE_PX = 8, MAX_CANDIDATES = 400, ZONE_GROW = 0.5;
/** Le pas de la grille (unités du dessin) : celle que la toile affiche et sur laquelle l'aimant pose. */
export const GRID_STEP = 20;
/** Au-delà de ce dépassement (pixels d'écran), un repère déborde des objets qu'il aligne. */
export const LINE_OVER_PX = 14;

// ——— La couleur des repères ———

/** Les teintes nommées qu'on peut donner aux repères (préférence du navigateur) : celles dont le contraste sur le fond
 *  de la toile est d'au moins 3:1 dans les deux thèmes (un trait : WCAG 1.4.11), vérifié par un test sous Node sur les
 *  valeurs des jetons. L'orange et le vert clairs n'y tiennent pas sur le fond clair. Sans choix : le chartreuse. */
export const GUIDE_HUES: readonly HueName[] = HUES.filter((hue) => hue !== "orange" && hue !== "green");
export const isGuideHue = (value: unknown): value is HueName => typeof value === "string" && (GUIDE_HUES as readonly string[]).includes(value);
/** La valeur de `--guide` pour une teinte choisie (posée par le CSSOM sur la racine), `null` = le chartreuse des jetons. */
export const guideColor = (hue: HueName | null): string | null => (hue && isGuideHue(hue) ? "var(--hue-" + hue + ")" : null);
/** Le fond de la cote d'un écart égal pour une teinte choisie (`--guide-fill`) : son encre (`--hue-*-ink`), sur laquelle
 *  le texte de la cote (`--guide-ink`) tient 4,5:1 dans les deux thèmes (testé) ; `null` = la teinte par défaut. */
export const guideFill = (hue: HueName | null): string | null => (hue && isGuideHue(hue) ? "var(--hue-" + hue + "-ink)" : null);

// ——— Géométrie ———

const LO: Record<Axis, "x" | "y"> = { x: "x", y: "y" };
const SIZE: Record<Axis, "w" | "h"> = { x: "w", y: "h" };
const OTHER: Record<Axis, Axis> = { x: "y", y: "x" };
/** Un point d'une boîte sur un axe : k = 0 son début, 1 son centre, 2 sa fin. */
const at = (b: Box, axis: Axis, k: number): number => (axis === "x" ? b.x + (b.w * k) / 2 : b.y + (b.h * k) / 2);
const ext = (b: Box, axis: Axis): [number, number] => [b[LO[axis]], b[LO[axis]] + b[SIZE[axis]]];
// Les deux suivantes sont dans la boucle chaude (400 candidates par pas de glissé) : sans tableau ni objet.
const start = (b: Box, axis: Axis): number => (axis === "x" ? b.x : b.y);
const finish = (b: Box, axis: Axis): number => (axis === "x" ? b.x + b.w : b.y + b.h);
const overlap = (a: Box, b: Box, axis: Axis): number => Math.min(finish(a, axis), finish(b, axis)) - Math.max(start(a, axis), start(b, axis));
const RANK = { center: 0, edge: 1, space: 1 } as const;

/** La boîte qui englobe des boîtes (`null` sans boîte). */
export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Option { kind: "center" | "edge" | "space"; d: number; line?: number; gap?: number }

function alignOptions(m: Box, cands: Candidate[], axis: Axis, tol: number, ks: number[]): Option[] {
  const out: Option[] = [];
  for (const k of ks) {
    const mv = at(m, axis, k);
    for (const c of cands) {
      for (let ck = 0; ck <= 2; ck += 1) {
        if ((k === 1) !== (ck === 1)) continue; // centre ↔ centre, bord ↔ bord
        const line = at(c.box, axis, ck), d = line - mv;
        if (Math.abs(d) <= tol) out.push({ kind: k === 1 ? "center" : "edge", d, line });
      }
    }
  }
  return out;
}
/** Le voisin le plus proche d'une boîte, d'un côté (`dir`), parmi les boîtes espacées qui la chevauchent sur l'autre axe. */
function neighbor(b: Box, self: string, cands: Candidate[], axis: Axis, dir: -1 | 1, slack = 0): { c: Candidate; gap: number } | null {
  const o = OTHER[axis], b0 = start(b, axis), b1 = finish(b, axis);
  let best: Candidate | null = null, bestGap = Infinity;
  for (const c of cands) {
    if (!c.spaced || c.id === self || overlap(c.box, b, o) <= 0) continue;
    const gap = dir < 0 ? b0 - finish(c.box, axis) : start(c.box, axis) - b1;
    if (gap >= -slack && gap < bestGap) { best = c; bestGap = gap; }
  }
  return best ? { c: best, gap: bestGap } : null;
}
const MOVING = "\u0000moving";
function spaceOptions(m: Box, cands: Candidate[], axis: Axis, tol: number): Option[] {
  const out: Option[] = [], size = m[SIZE[axis]], m0 = ext(m, axis)[0];
  const L = neighbor(m, MOVING, cands, axis, -1, tol), R = neighbor(m, MOVING, cands, axis, 1, tol);
  const push = (target: number, gap: number): void => { const d = target - m0; if (gap > 0 && Math.abs(d) <= tol) out.push({ kind: "space", d, gap }); };
  if (L && R) { const g = (ext(R.c.box, axis)[0] - ext(L.c.box, axis)[1] - size) / 2; push(ext(L.c.box, axis)[1] + g, g); } // entre deux
  if (L) { const LL = neighbor(L.c.box, L.c.id, cands, axis, -1); if (LL) push(ext(L.c.box, axis)[1] + LL.gap, LL.gap); } // après une paire
  if (R) { const RR = neighbor(R.c.box, R.c.id, cands, axis, 1); if (RR) push(ext(R.c.box, axis)[0] - RR.gap - size, RR.gap); } // avant une paire
  return out;
}
/** La chaîne des écarts égaux autour de la boîte posée, des deux côtés : ce que la couche dessine. */
function spaceChain(m: Box, cands: Candidate[], axis: Axis, gap: number): { segs: [Box, Box][]; hits: string[] } {
  const segs: [Box, Box][] = [], hits: string[] = [];
  ([-1, 1] as const).forEach((dir) => {
    let cur = m, self = MOVING;
    for (let i = 0; i < 12; i += 1) {
      const nb = neighbor(cur, self, cands, axis, dir);
      if (!nb || Math.abs(nb.gap - gap) > 0.5) break;
      segs.push(dir < 0 ? [nb.c.box, cur] : [cur, nb.c.box]);
      hits.push(nb.c.id);
      cur = nb.c.box; self = nb.c.id;
    }
  });
  return { segs, hits };
}
const bestOf = (options: Option[]): Option | null => options.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind] || Math.abs(a.d) - Math.abs(b.d))[0] || null;
/** Ce qui se dessine pour un repère : la ligne, de l'objet le plus loin à l'autre, et les objets qu'elle touche. */
function alignLine(m: Box, cands: Candidate[], axis: Axis, kind: "center" | "edge", line: number): Line {
  const o = OTHER[axis], ks = kind === "center" ? [1] : [0, 2];
  const hit = cands.filter((c) => ks.some((k) => Math.abs(at(c.box, axis, k) - line) < 0.5));
  const boxes = [m].concat(hit.map((c) => c.box));
  return { axis, kind, at: line, from: Math.min(...boxes.map((b) => ext(b, o)[0])), to: Math.max(...boxes.map((b) => ext(b, o)[1])), boxes, hits: hit.map((c) => c.id) };
}

/** Une boîte glissée : la correction que les repères lui donnent, et ce qu'il faut dessiner (rien n'est arrondi ici). */
export function snapMove(m: Box, cands: Candidate[], tol: number): Snapped {
  const out: Snapped = { dx: 0, dy: 0, lines: [], gaps: [], took: { x: false, y: false } };
  const chosen: Partial<Record<Axis, Option>> = {};
  (["x", "y"] as const).forEach((axis) => {
    const opt = bestOf(alignOptions(m, cands, axis, tol, [0, 1, 2]).concat(spaceOptions(m, cands, axis, tol)));
    if (!opt) return;
    if (axis === "x") out.dx = opt.d; else out.dy = opt.d;
    out.took[axis] = true;
    chosen[axis] = opt;
  });
  const placed = { ...m, x: m.x + out.dx, y: m.y + out.dy };
  (["x", "y"] as const).forEach((axis) => {
    const opt = chosen[axis];
    if (!opt) return;
    if (opt.kind === "space") { const chain = spaceChain(placed, cands, axis, opt.gap as number); out.gaps.push({ axis, gap: opt.gap as number, segs: chain.segs, hits: chain.hits }); }
    else out.lines.push(alignLine(placed, cands, axis, opt.kind, opt.line as number));
  });
  return out;
}

/** Le bord tiré d'un redimensionnement : sur l'axe, 0 = le début (gauche, haut), 2 = la fin (droite, bas). */
export type Edge = [Axis, 0 | 2];
/** Les bords qu'une poignée tire (`n`, `se`, `w`…). */
export function edgesOf(handle: string): Edge[] {
  const out: Edge[] = [];
  if (handle.includes("e")) out.push(["x", 2]);
  if (handle.includes("w")) out.push(["x", 0]);
  if (handle.includes("s")) out.push(["y", 2]);
  if (handle.startsWith("n")) out.push(["y", 0]);
  return out;
}
export interface Placed { box: Box; lines: Line[]; gaps: Gaps[]; hits: string[]; took: { x: boolean; y: boolean } }
export interface PlaceOptions {
  /** Les repères actifs (préférence) ; `free` : Ctrl tenu, ni repère ni aimant. */
  guides: boolean; free: boolean;
  /** Le pas de l'aimant de la grille, `null` sans aimant. */
  grid: number | null;
  /** La tolérance, en unités du plan (8 px d'écran / zoom). */
  tol: number;
}
const snapTo = (v: number, step: number): number => Math.round(v / step) * step;
const hitsOf = (lines: Line[], gaps: Gaps[]): string[] => Array.from(new Set(lines.flatMap((l) => l.hits).concat(gaps.flatMap((g) => g.hits)))).sort();

/** Où poser une boîte glissée : les repères d'abord, puis l'aimant de la grille sur l'axe qu'ils n'ont pas pris, coin
 *  haut gauche entier. Ctrl tenu (`free`) : ni l'un ni l'autre. */
export function placeMove(raw: Box, cands: Candidate[], options: PlaceOptions): Placed {
  const g = !options.free && options.guides ? snapMove(raw, cands, options.tol) : { dx: 0, dy: 0, lines: [], gaps: [], took: { x: false, y: false } };
  let x = raw.x + g.dx, y = raw.y + g.dy;
  if (!options.free && options.grid) { if (!g.took.x) x = snapTo(x, options.grid); if (!g.took.y) y = snapTo(y, options.grid); }
  return { box: { ...raw, x: Math.round(x), y: Math.round(y) }, lines: g.lines, gaps: g.gaps, hits: hitsOf(g.lines, g.gaps), took: g.took };
}

/** Où poser le bord tiré d'un redimensionnement : sur les bords des autres boîtes, puis la grille sur l'axe que les
 *  repères n'ont pas pris ; jamais sous `min`. La boîte de départ (`start`) donne le côté qui ne bouge pas. */
export function placeResize(start: Box, raw: Box, edges: Edge[], cands: Candidate[], options: PlaceOptions & { min: number }): Placed {
  const out: Box = { ...raw }, lines: Line[] = [], took = { x: false, y: false };
  edges.forEach(([axis, k]) => {
    const lo = LO[axis], size = SIZE[axis];
    const opt = !options.free && options.guides ? bestOf(alignOptions(raw, cands, axis, options.tol, [k])) : null;
    let edge = at(raw, axis, k) + (opt ? opt.d : 0);
    if (opt) took[axis] = true;
    else if (!options.free && options.grid) edge = snapTo(edge, options.grid);
    edge = Math.round(edge);
    if (k === 2) { out[lo] = start[lo]; out[size] = Math.max(options.min, edge - start[lo]); }
    else { const end = start[lo] + start[size]; out[lo] = Math.min(edge, end - options.min); out[size] = end - out[lo]; }
  });
  edges.forEach(([axis, k]) => {
    if (!took[axis]) return;
    lines.push(alignLine(out, cands, axis, "edge", at(out, axis, k)));
  });
  return { box: out, lines, gaps: [], hits: hitsOf(lines, []), took };
}

// ——— Les candidates ———

/** La vue élargie (`grow` = 0,5 : moitié en plus, centrée), en unités du plan ; `view` = décalage et zoom de React Flow. */
export function viewZone(view: { x: number; y: number; zoom: number }, size: { width: number; height: number }, grow = ZONE_GROW): Box {
  const k = view.zoom || 1, w = size.width / k, h = size.height / k, x = -view.x / k, y = -view.y / k;
  return { x: x - (w * grow) / 2, y: y - (h * grow) / 2, w: w * (1 + grow), h: h * (1 + grow) };
}
const meets = (a: Box, b: Box): boolean => a.x + a.w >= b.x && a.x <= b.x + b.w && a.y + a.h >= b.y && a.y <= b.y + b.h;
/** Les candidates d'un geste : celles qui touchent la zone, les plus proches du centre de `near` d'abord (à égalité,
 *  par identité : le résultat ne dépend pas de l'ordre d'entrée), `max` au plus. */
export function pickCandidates(all: Candidate[], zone: Box, near: Box, max = MAX_CANDIDATES): Candidate[] {
  const cx = near.x + near.w / 2, cy = near.y + near.h / 2;
  const dist = (c: Candidate): number => Math.hypot(c.box.x + c.box.w / 2 - cx, c.box.y + c.box.h / 2 - cy);
  return all.filter((c) => meets(c.box, zone)).map((c) => ({ c, d: dist(c) }))
    .sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0)).slice(0, max).map((e) => e.c);
}

// ——— Le dessin ———

/** Les morceaux d'un repère qui restent visibles : il s'interrompt sur les boîtes qu'il traverse (un nom n'est jamais
 *  barré) et déborde de `over` aux deux bouts. Un repère de bord longe les boîtes qu'il aligne : elles ne le coupent pas. */
export function runs(line: Line, obstacles: Box[], over: number): [number, number][] {
  const axis = line.axis, o = OTHER[axis];
  const cuts = obstacles.filter((b) => { const [a0, a1] = ext(b, axis); return a0 < line.at - 0.5 && line.at + 0.5 < a1; }).map((b) => ext(b, o)).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [], end = line.to + over;
  let from = line.from - over;
  cuts.forEach(([c0, c1]) => { if (c1 <= from) return; if (c0 > from) out.push([from, Math.min(c0, end)]); from = Math.max(from, c1); });
  if (from < end) out.push([from, end]);
  return out.filter(([p, q]) => q - p > 0.5);
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Zone { left: number; top: number; right: number; bottom: number }
const area = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** La place de la pastille du geste (à l'écran) : dessous, dessus, à droite, à gauche de la boîte, la première qui ne
 *  couvre ni une boîte ni un repère, dans la zone ; sinon dessous. */
export function pillSpot(box: Rect, w: number, h: number, zone: Zone, obstacles: Rect[]): Rect {
  const spots = [[box.x + box.w / 2 - w / 2, box.y + box.h + 8], [box.x + box.w / 2 - w / 2, box.y - h - 8], [box.x + box.w + 10, box.y + box.h / 2 - h / 2], [box.x - w - 10, box.y + box.h / 2 - h / 2]]
    .map(([x, y]) => ({ x: Math.round(clampTo(x, zone.left, zone.right - w)), y: Math.round(clampTo(y, zone.top, zone.bottom - h)), w, h }));
  return spots.find((r) => !obstacles.some((o) => area(r, o) > 0)) || spots[0];
}
/** La pastille du geste se tient à `PILL_CLEAR` pixels au moins de tout repère (critique du 2026-10-15). */
export const PILL_CLEAR = 8;
/** Les bandes d'écran qu'une pastille évite : une par repère (`at` à l'écran), larges de deux fois le dégagement. */
export function lineBands(lines: { axis: Axis; at: number }[], clear = PILL_CLEAR): Rect[] {
  return lines.map((l) => (l.axis === "x" ? { x: l.at - clear, y: -1e5, w: 2 * clear, h: 2e5 } : { x: -1e5, y: l.at - clear, w: 2e5, h: 2 * clear }));
}

/** Les coins qu'un repère de bord marque d'une croix (plan) : chaque coin aligné des boîtes qu'il aligne, sauf ceux qui
 *  portent déjà une marque (`bare` : les poignées de la sélection, une épingle), à `tol` près ; un repère de centre n'en
 *  porte aucune. Trois symboles au même pixel ne se lisent plus (critique du 2026-10-15). */
export function crossPoints(line: Line, bare: { x: number; y: number }[], tol: number): { x: number; y: number }[] {
  if (line.kind !== "edge") return [];
  const vertical = line.axis === "x";
  return line.boxes.flatMap((b) => (vertical ? [b.y, b.y + b.h] : [b.x, b.x + b.w]).map((v) => (vertical ? { x: line.at, y: v } : { x: v, y: line.at })))
    .filter((p) => !bare.some((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol));
}
/** Les quatre coins d'une boîte. */
export const cornersOf = (b: Box): { x: number; y: number }[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }];

/** Un nom qui tient dans `width` pixels à la taille `size` (chasse fixe, 0,62 em par caractère), raccourci d'un « … ». */
export function fitName(name: string, width: number, size: number): string {
  const room = Math.floor(width / (size * 0.62));
  if (name.length <= room) return name;
  return room <= 1 ? name.slice(0, 1) : name.slice(0, room - 1) + "…";
}

export const guides = { TOLERANCE_PX, MAX_CANDIDATES, GRID_STEP, GUIDE_HUES, isGuideHue, guideColor, guideFill, union, snapMove, placeMove, placeResize, edgesOf, viewZone, pickCandidates, runs, pillSpot, fitName, PILL_CLEAR, lineBands, crossPoints, cornersOf };

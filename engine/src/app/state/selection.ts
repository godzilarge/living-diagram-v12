// La sélection mixte (lot 2 de docs/11), la partie pure : ce qui est sélectionné, par sorte (équipements, annotations,
// connecteurs, groupes), triée, avec un élément principal (le dernier ajouté) ; ce qu'un rectangle couvre ; l'ordre de
// lecture que Tab parcourt ; les opérations que Suppr envoie. Câbles, faisceaux, clusters et agrégats ne s'y mêlent
// pas : ils se sélectionnent seuls (ils ne s'éditent pas). Sans DOM ni React, testé sous Node (`LDApp.selecting`).
import type { Point } from "../../canvas/layout";
import type { Selection } from "../../canvas/types";
import type { Op } from "../../shell/apps";

/** Les sortes qu'une sélection mixte accepte. */
export type ItemKind = "node" | "annotation" | "connector" | "group";
export interface Item { kind: ItemKind; id: string }
/** Une sélection mixte : chaque liste triée, sans doublon. */
export interface Multi { hosts: string[]; annotations: string[]; connectors: string[]; groups: string[] }

const PART: Record<ItemKind, keyof Multi> = { node: "hosts", annotation: "annotations", connector: "connectors", group: "groups" };
const KINDS: ItemKind[] = ["node", "annotation", "connector", "group"];
const sorted = (values: Iterable<string>): string[] => Array.from(new Set(values)).sort();

export const empty = (): Multi => ({ hosts: [], annotations: [], connectors: [], groups: [] });
/** Une sélection depuis des éléments (dans n'importe quel ordre, doublons compris). */
export function multiOf(items: Item[]): Multi {
  const out = empty();
  KINDS.forEach((kind) => { out[PART[kind]] = sorted(items.filter((i) => i.kind === kind).map((i) => i.id)); });
  return out;
}
/** Les éléments, sorte par sorte (équipements, annotations, connecteurs, groupes), chacun trié. */
export const itemsOf = (m: Multi): Item[] => KINDS.flatMap((kind) => m[PART[kind]].map((id): Item => ({ kind, id })));
export const size = (m: Multi): number => m.hosts.length + m.annotations.length + m.connectors.length + m.groups.length;
export const has = (m: Multi, item: Item): boolean => m[PART[item.kind]].includes(item.id);
export const same = (a: Multi, b: Multi): boolean => KINDS.every((kind) => a[PART[kind]].join("\n") === b[PART[kind]].join("\n"));
export const sameItem = (a: Item | null, b: Item | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
export const union = (a: Multi, b: Multi): Multi => multiOf(itemsOf(a).concat(itemsOf(b)));
/** Ajoute l'élément s'il n'y est pas, le retire s'il y est (Maj + clic, Ctrl + clic). */
export const toggle = (m: Multi, item: Item): Multi => multiOf(has(m, item) ? itemsOf(m).filter((i) => !sameItem(i, item)) : itemsOf(m).concat(item));
/** Combien de chaque sorte. */
export const counts = (m: Multi): Record<ItemKind, number> => ({ node: m.hosts.length, annotation: m.annotations.length, connector: m.connectors.length, group: m.groups.length });
/** Les sortes présentes, dans l'ordre de `KINDS`. */
export const kindsOf = (m: Multi): ItemKind[] => KINDS.filter((kind) => m[PART[kind]].length > 0);
/** Le seul élément d'une sélection qui n'en a qu'un, sinon `null`. */
export const single = (m: Multi): Item | null => (size(m) === 1 ? itemsOf(m)[0] : null);

/** Une sélection simple de la toile vue comme élément (les quatre sortes seulement). */
export function itemOf(selection: Selection | null): Item | null {
  if (!selection) return null;
  return (KINDS as string[]).includes(selection.kind) ? { kind: selection.kind as ItemKind, id: selection.id } : null;
}
export const selectionOf = (item: Item): Selection => ({ kind: item.kind, id: item.id });

/** L'élément principal après un changement : un élément qui vient d'entrer (le dernier, dans l'ordre des éléments
 *  donnés), sinon l'ancien principal s'il reste, sinon le premier ; `null` pour une sélection vide. Il décide de ce que
 *  Tab prend pour point de départ et de ce que l'on centre. */
export function primaryOf(before: Multi, primary: Item | null, after: Multi, order: Item[] = itemsOf(after)): Item | null {
  if (!size(after)) return null;
  const entered = order.filter((item) => has(after, item) && !has(before, item));
  if (entered.length) return entered[entered.length - 1];
  if (primary && has(after, primary)) return primary;
  return itemsOf(after)[0];
}

/** Ce qu'un rectangle de sélection rend : glissé nu, il remplace ; avec Maj, il ajoute à la sélection d'avant. */
export const afterRectangle = (before: Multi, covered: Item[], add: boolean): Multi => multiOf((add ? itemsOf(before) : []).concat(covered));

// ——— Ce qu'un rectangle couvre ———
export interface Rect { x: number; y: number; w: number; h: number }
/** Ce que la toile sait de chaque élément sélectionnable : sa boîte (cartes, disques, annotations) ou son tracé
 *  (connecteurs : les points d'une polyligne). `locked` : pris par le clic, jamais par un rectangle. */
export type Shape = { item: Item; box: Rect; locked?: boolean } | { item: Item; line: Point[]; locked?: boolean };
/** Le rectangle entre deux points, quel que soit le sens du glissé. */
export const rectOf = (a: Point, b: Point): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const overlaps = (r: Rect, b: Rect): boolean => b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y;
const contains = (r: Rect, b: Rect): boolean => b.x >= r.x && b.x + b.w <= r.x + r.w && b.y >= r.y && b.y + b.h <= r.y + r.h;
// Deux segments se coupent-ils (bords compris) ?
function crosses(p: Point, q: Point, a: Point, b: Point): boolean {
  const side = (o: Point, s: Point, t: Point): number => Math.sign((s.x - o.x) * (t.y - o.y) - (s.y - o.y) * (t.x - o.x));
  const d1 = side(a, b, p), d2 = side(a, b, q), d3 = side(p, q, a), d4 = side(p, q, b);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  const on = (o: Point, s: Point, t: Point): boolean => Math.min(o.x, s.x) <= t.x && t.x <= Math.max(o.x, s.x) && Math.min(o.y, s.y) <= t.y && t.y <= Math.max(o.y, s.y);
  return (d1 === 0 && on(a, b, p)) || (d2 === 0 && on(a, b, q)) || (d3 === 0 && on(p, q, a)) || (d4 === 0 && on(p, q, b));
}
function lineTouches(r: Rect, line: Point[]): boolean {
  if (line.some((p) => inside(r, p))) return true;
  const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  return line.slice(1).some((q, i) => corners.some((c, k) => crosses(line[i], q, c, corners[(k + 1) % 4])));
}
/** Ce qu'un rectangle prend : en mode « touche », tout ce qu'il effleure ; en mode « englobe » (Ctrl tenu), seulement
 *  ce qu'il contient entièrement. Jamais un élément verrouillé. Dans l'ordre des formes données. */
export function covered(r: Rect, shapes: Shape[], mode: "touch" | "inside" = "touch"): Item[] {
  return shapes.filter((s) => !s.locked && ("box" in s
    ? (mode === "inside" ? contains(r, s.box) : overlaps(r, s.box))
    : (mode === "inside" ? s.line.every((p) => inside(r, p)) : lineTouches(r, s.line)))).map((s) => s.item);
}

// ——— Tab : l'ordre de lecture ———
/** L'ordre de lecture, du haut à gauche vers le bas à droite : par rangées (le coin haut de chaque élément arrondi à
 *  `band` unités du dessin), puis de gauche à droite, puis par sorte et identité (déterministe). */
export function readingOrder(entries: { item: Item; at: Point }[], band = 40): Item[] {
  const rank = (kind: ItemKind): number => KINDS.indexOf(kind);
  return entries.slice().sort((p, q) => Math.round(p.at.y / band) - Math.round(q.at.y / band) || p.at.x - q.at.x
    || rank(p.item.kind) - rank(q.item.kind) || (p.item.id < q.item.id ? -1 : p.item.id > q.item.id ? 1 : 0)).map((e) => e.item);
}
/** L'élément suivant (ou précédent) dans l'ordre, en boucle ; sans point de départ connu, le premier (ou le dernier). */
export function cycle(order: Item[], from: Item | null, direction: 1 | -1): Item | null {
  if (!order.length) return null;
  const at = from ? order.findIndex((item) => sameItem(item, from)) : -1;
  if (at < 0) return direction > 0 ? order[0] : order[order.length - 1];
  return order[(at + direction + order.length) % order.length];
}

// ——— Suppr ———
/** Les opérations qui suppriment ce qui se supprime (annotations, connecteurs, groupes), dans cet ordre ; un équipement
 *  vient de la donnée, il ne se supprime pas (D5 de docs/11 : la page le dit et propose de le masquer). */
export function deleteOps(m: Multi): Op[] {
  return ([] as Op[]).concat(
    m.annotations.map((id): Op => ({ op: "annotation_delete", id })),
    m.connectors.map((id): Op => ({ op: "connector_delete", id })),
    m.groups.map((id): Op => ({ op: "group_delete", id })));
}

export const selecting = { empty, multiOf, itemsOf, size, has, same, union, toggle, counts, kindsOf, single, itemOf, primaryOf, afterRectangle, rectOf, covered, readingOrder, cycle, deleteOps };

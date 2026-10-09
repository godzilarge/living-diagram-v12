// Annuler / rétablir (docs/10 §7), la partie pure : ce qu'une écriture de la couche d'intention a changé, clé par clé
// (l'épingle d'un équipement, sa couleur, la couleur d'un type, un groupe), avant et après ; et les opérations qui
// ramènent ces clés à l'un ou l'autre état. Annuler n'efface rien : c'est une nouvelle écriture, signée, au journal.
// Une clé modifiée par quelqu'un d'autre depuis (sa valeur n'est plus celle qu'on a laissée) est sautée, jamais
// écrasée. Les déplacements faits sans nom (locaux) ont leur entrée à part : des positions, rien à envoyer.
import type { Annotation, Connector, Group, Intent } from "../../canvas/types";
import type { Point } from "../../canvas/layout";
import type { Op } from "../../shell/apps";

const SEP = "\u0000";
type Kind = "pin" | "color" | "type" | "group" | "annotation" | "connector";
/** La valeur d'une clé dans un document : une position, une teinte, un groupe, une annotation ou un connecteur sans auteur ni date, ou `null` (rien). */
export type Value = Point | string | GroupValue | AnnotationValue | ConnectorValue | null;
export interface GroupValue { label: string; description: string; members: string[]; style: Group["style"] }
export type AnnotationValue = Pick<Annotation, "anchor" | "x" | "y" | "w" | "h" | "z" | "locked" | "leader" | "content" | "style">;
export type ConnectorValue = Pick<Connector, "start" | "end" | "heads" | "route" | "bend" | "label" | "z" | "locked" | "style">;
export interface Change { key: string; before: Value; after: Value }
export type Entry =
  | { kind: "intent"; label: string; changes: Change[] }
  | { kind: "local"; label: string; before: Map<string, Point>; after: Map<string, Point> };
export interface Plan { ops: Op[]; applied: Change[]; skipped: Change[]; created: string[] }

export const LIMIT = 100;
export const keyOf = (kind: Kind, id: string): string => kind + SEP + id;
const split = (key: string): [Kind, string] => { const at = key.indexOf(SEP); return [key.slice(0, at) as Kind, key.slice(at + 1)]; };

const groupValue = (group: Group): GroupValue => ({ label: group.label, description: group.description, members: group.members.slice(), style: group.style });
const annotationValue = (a: Annotation): AnnotationValue => ({ anchor: a.anchor, x: a.x, y: a.y, w: a.w, h: a.h, z: a.z, locked: a.locked, leader: a.leader, content: a.content, style: a.style });
const connectorValue = (c: Connector): ConnectorValue => ({ start: c.start, end: c.end, heads: c.heads, route: c.route, bend: c.bend, label: c.label, z: c.z, locked: c.locked, style: c.style });
export function valueOf(doc: Intent | null, key: string): Value {
  if (!doc) return null;
  const [kind, id] = split(key);
  if (kind === "pin") { const pin = doc.pins.find((p) => p.hostname === id); return pin ? { x: pin.x, y: pin.y } : null; }
  if (kind === "color") { const c = doc.device_colors.find((d) => d.hostname === id); return c ? c.hue : null; }
  if (kind === "type") { const c = (doc.type_colors as { type: string; hue: string }[]).find((t) => t.type === id); return c ? c.hue : null; }
  if (kind === "annotation") { const a = (doc.annotations || []).find((x) => x.id === id); return a ? annotationValue(a) : null; }
  if (kind === "connector") { const c = (doc.connectors || []).find((x) => x.id === id); return c ? connectorValue(c) : null; }
  const group = doc.groups.find((g) => g.id === id);
  return group ? groupValue(group) : null;
}

// Une écriture canonique (clés triées) : deux valeurs égales s'écrivent pareil, quel que soit l'ordre de leurs clés.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((k) => JSON.stringify(k) + ":" + canonical(record[k])).join(",") + "}";
}
export const same = (a: Value, b: Value): boolean => canonical(a) === canonical(b);

/** Les clés qu'une requête touche ; un groupe créé n'a d'identité qu'après la réponse (les nouveaux de `after`). */
export function keysOf(ops: Op[], before: Intent | null, after: Intent): string[] {
  const keys = new Set<string>();
  ops.forEach((op) => {
    if (op.op === "pin" || op.op === "unpin") keys.add(keyOf("pin", op.hostname));
    else if (op.op === "color" || op.op === "uncolor") keys.add(keyOf("color", op.hostname));
    else if (op.op === "color_type" || op.op === "uncolor_type") keys.add(keyOf("type", op.type));
    else if (op.op === "annotation_update" || op.op === "annotation_delete") keys.add(keyOf("annotation", op.id));
    else if (op.op === "connector_update" || op.op === "connector_delete") keys.add(keyOf("connector", op.id));
    else if (op.op !== "group_create" && op.op !== "annotation_create" && op.op !== "connector_create") keys.add(keyOf("group", op.id));
  });
  if (ops.some((op) => op.op === "group_create")) {
    const known = new Set((before ? before.groups : []).map((g) => g.id));
    after.groups.filter((g) => !known.has(g.id) && g.id.startsWith("g" + after.revision + "-")).forEach((g) => keys.add(keyOf("group", g.id)));
  }
  if (ops.some((op) => op.op === "annotation_create")) {
    const known = new Set((before && before.annotations ? before.annotations : []).map((a) => a.id));
    (after.annotations || []).filter((a) => !known.has(a.id) && a.id.startsWith("a" + after.revision + "-")).forEach((a) => keys.add(keyOf("annotation", a.id)));
  }
  if (ops.some((op) => op.op === "connector_create")) {
    const known = new Set((before && before.connectors ? before.connectors : []).map((c) => c.id));
    (after.connectors || []).filter((c) => !known.has(c.id) && c.id.startsWith("c" + after.revision + "-")).forEach((c) => keys.add(keyOf("connector", c.id)));
  }
  return Array.from(keys);
}

/** Ce qu'une requête acceptée a changé : une entrée de la pile, ou `null` si rien n'a changé. */
export function record(ops: Op[], before: Intent | null, after: Intent): Entry | null {
  const changes = keysOf(ops, before, after)
    .map((key): Change => ({ key, before: valueOf(before, key), after: valueOf(after, key) }))
    .filter((change) => !same(change.before, change.after));
  return changes.length ? { kind: "intent", label: labelOf(ops), changes } : null;
}

function opFor(key: string, current: Value, target: Value): Op {
  const [kind, id] = split(key);
  if (kind === "pin") return target ? { op: "pin", hostname: id, ...(target as Point) } : { op: "unpin", hostname: id };
  if (kind === "color") return target ? { op: "color", hostname: id, hue: target as string } : { op: "uncolor", hostname: id };
  if (kind === "type") return target ? { op: "color_type", type: id, hue: target as string } : { op: "uncolor_type", type: id };
  if (kind === "annotation") {
    if (!target) return { op: "annotation_delete", id };
    const a = target as AnnotationValue;
    return current ? { op: "annotation_update", id, ...a } : { op: "annotation_create", ...a };
  }
  if (kind === "connector") {
    if (!target) return { op: "connector_delete", id };
    const c = target as ConnectorValue;
    return current ? { op: "connector_update", id, ...c } : { op: "connector_create", ...c };
  }
  if (!target) return { op: "group_delete", id };
  const g = target as GroupValue;
  return current
    ? { op: "group_update", id, label: g.label, description: g.description, members: g.members, style: g.style }
    : { op: "group_create", label: g.label, description: g.description, members: g.members, style: g.style };
}

/** Les opérations qui ramènent les clés d'une entrée à leur état d'avant (`undo`) ou d'après (`redo`), sur le document
 *  courant ; une clé dont la valeur n'est plus celle qu'on attend est sautée. `created` : l'ancienne identité de chaque
 *  groupe recréé, dans l'ordre de ses `group_create` (le serveur lui en donnera une nouvelle). */
export function plan(doc: Intent | null, changes: Change[], direction: "undo" | "redo"): Plan {
  const out: Plan = { ops: [], applied: [], skipped: [], created: [] };
  changes.forEach((change) => {
    const from = direction === "undo" ? change.after : change.before, to = direction === "undo" ? change.before : change.after;
    const current = valueOf(doc, change.key);
    if (!same(current, from)) { out.skipped.push(change); return; }
    const op = opFor(change.key, current, to);
    if (op.op === "group_create" || op.op === "annotation_create" || op.op === "connector_create") out.created.push(split(change.key)[1]);
    out.ops.push(op);
    out.applied.push(change);
  });
  return out;
}

/** Les identités que le serveur a données aux groupes, annotations et connecteurs recréés : `g<révision>-<n>`,
 *  `a<révision>-<n>`, `c<révision>-<n>`, n dans l'ordre des créations de chaque sorte. */
export function createdIds(created: string[], doc: Intent): Map<string, string> {
  const counts: Record<string, number> = { g: 0, a: 0, c: 0 };
  return new Map(created.map((old) => { const prefix = old[0] === "a" ? "a" : old[0] === "c" ? "c" : "g"; counts[prefix] += 1; return [old, prefix + doc.revision + "-" + counts[prefix]]; }));
}

/** Une entrée dont les groupes recréés ont changé d'identité. */
export function remap(entry: Entry, ids: Map<string, string>): Entry {
  if (entry.kind !== "intent" || !ids.size) return entry;
  return { ...entry, changes: entry.changes.map((change) => {
    const [kind, id] = split(change.key);
    return (kind === "group" || kind === "annotation" || kind === "connector") && ids.has(id) ? { ...change, key: keyOf(kind, ids.get(id) as string) } : change;
  }) };
}

const who = (hosts: string[]): string => (hosts.length === 1 ? hosts[0] : hosts.length + " équipements");
/** Ce que la page dit d'une requête : « déplacement de 2 équipements », « couleur de sw-01 »… */
export function labelOf(ops: Op[]): string {
  const hosts = (kinds: string[]): string[] => Array.from(new Set(ops.flatMap((op) => (kinds.includes(op.op) && "hostname" in op ? [op.hostname] : []))));
  if (ops.every((op) => op.op === "pin")) return "déplacement de " + who(hosts(["pin"]));
  if (ops.every((op) => op.op === "unpin")) return "épingle retirée de " + who(hosts(["unpin"]));
  if (ops.every((op) => op.op === "color" || op.op === "uncolor")) return "couleur de " + who(hosts(["color", "uncolor"]));
  if (ops.every((op) => op.op === "color_type" || op.op === "uncolor_type")) return "couleur d'un type";
  const create = ops.find((op) => op.op === "group_create");
  if (create && create.op === "group_create") return "création du groupe " + create.label;
  if (ops.every((op) => op.op === "group_delete")) return "suppression d'un groupe";
  if (ops.every((op) => op.op.startsWith("group_"))) return "modification d'un groupe";
  if (ops.every((op) => op.op === "annotation_create")) return "création d'une annotation";
  if (ops.every((op) => op.op === "annotation_delete")) return "suppression d'une annotation";
  if (ops.every((op) => op.op.startsWith("annotation_"))) return "modification d'une annotation";
  if (ops.every((op) => op.op === "connector_create")) return "création d'un connecteur";
  if (ops.every((op) => op.op === "connector_delete")) return "suppression d'un connecteur";
  if (ops.every((op) => op.op.startsWith("connector_"))) return "modification d'un connecteur";
  return "modification";
}

/** La pile : `undo` (le plus récent à la fin), `redo` ; immuable, chaque geste rend une nouvelle pile. */
export interface Stack { undo: Entry[]; redo: Entry[] }
export const emptyStack = (): Stack => ({ undo: [], redo: [] });
/** Un geste nouveau : il entre dans `undo` (100 au plus), `redo` se vide. */
export const push = (stack: Stack, entry: Entry): Stack => ({ undo: stack.undo.concat(entry).slice(-LIMIT), redo: [] });
/** Les entrées locales ne valent que pour la toile qui les a faites : une autre run les oublie. */
export const dropLocal = (stack: Stack): Stack => ({ undo: stack.undo.filter((e) => e.kind !== "local"), redo: stack.redo.filter((e) => e.kind !== "local") });
export const labels = (stack: Stack): { undo: string | null; redo: string | null } => ({
  undo: stack.undo.length ? stack.undo[stack.undo.length - 1].label : null,
  redo: stack.redo.length ? stack.redo[stack.redo.length - 1].label : null,
});
/** Une entrée annulée (ou rétablie) passe de l'autre côté, réduite aux clés rejouées (`applied`, celles d'une entrée
 *  locale : toutes), ses groupes recréés sous leur nouvelle identité partout. */
export function moved(stack: Stack, direction: "undo" | "redo", ids: Map<string, string>, applied?: Change[], which?: Entry): Stack {
  const from = direction === "undo" ? stack.undo : stack.redo, to = direction === "undo" ? stack.redo : stack.undo;
  // L'entrée rejouée, par identité (un geste a pu s'empiler pendant la requête), sinon le haut de la pile.
  const top = which || from[from.length - 1];
  if (!top) return stack;
  const entry: Entry = top.kind === "intent" && applied ? { ...top, changes: applied } : top;
  const rest = from.filter((e) => e !== top).map((e) => remap(e, ids)), other = to.map((e) => remap(e, ids)).concat(remap(entry, ids));
  return direction === "undo" ? { undo: rest, redo: other } : { undo: other, redo: rest };
}
/** Une entrée dont rien n'a pu être rejoué (tout a changé depuis) : elle sort de la pile. */
export function discard(stack: Stack, direction: "undo" | "redo"): Stack {
  return direction === "undo" ? { ...stack, undo: stack.undo.slice(0, -1) } : { ...stack, redo: stack.redo.slice(0, -1) };
}

export const history = { keyOf, valueOf, same, keysOf, record, plan, createdIds, remap, labelOf, emptyStack, push, dropLocal, labels, moved, discard, LIMIT };

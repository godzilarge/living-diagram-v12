// One entry of the modifications log as a short sentence after its author's name: "moved 3 devices", "reset the
// colour of 2 devices", "created the group “Core Lyon”". Read from the entry's operations (counted by kind) and its
// subjects (the name of a group as it was then). A request that mixes kinds is said by its most frequent kind and the
// count of the others ("moved 3 devices and 1 other change", the v1's rule), "made N changes" only on a tie. Pure: it
// gives catalogue keys and their values, the page translates. The full sentences of the Log view come with brick 7.
import type { JournalEntry, JournalOp } from "../api/home";
import type { TextKey } from "../i18n";

export type Kind =
  | "moved" | "unpinned" | "colouredDevices" | "resetDevices" | "colouredTypes" | "resetTypes"
  | "groupCreated" | "groupRenamed" | "groupChanged" | "groupDeleted"
  | "annotationAdded" | "annotationChanged" | "annotationDeleted"
  | "connectorAdded" | "connectorChanged" | "connectorDeleted"
  | "mixed";

export const KEYS: Readonly<Record<Kind, TextKey>> = {
  moved: "home:journal.moved",
  unpinned: "home:journal.unpinned",
  colouredDevices: "home:journal.colouredDevices",
  resetDevices: "home:journal.resetDevices",
  colouredTypes: "home:journal.colouredTypes",
  resetTypes: "home:journal.resetTypes",
  groupCreated: "home:journal.groupCreated",
  groupRenamed: "home:journal.groupRenamed",
  groupChanged: "home:journal.groupChanged",
  groupDeleted: "home:journal.groupDeleted",
  annotationAdded: "home:journal.annotationAdded",
  annotationChanged: "home:journal.annotationChanged",
  annotationDeleted: "home:journal.annotationDeleted",
  connectorAdded: "home:journal.connectorAdded",
  connectorChanged: "home:journal.connectorChanged",
  connectorDeleted: "home:journal.connectorDeleted",
  mixed: "home:journal.mixed",
};

const BY_OP: Readonly<Record<string, Kind>> = {
  pin: "moved", unpin: "unpinned",
  color: "colouredDevices", uncolor: "resetDevices",
  color_type: "colouredTypes", uncolor_type: "resetTypes",
  group_create: "groupCreated", group_add: "groupChanged", group_remove: "groupChanged", group_delete: "groupDeleted",
  annotation_create: "annotationAdded", annotation_update: "annotationChanged", annotation_delete: "annotationDeleted",
  connector_create: "connectorAdded", connector_update: "connectorChanged", connector_delete: "connectorDeleted",
};
const GROUP_KINDS: ReadonlySet<Kind> = new Set(["groupCreated", "groupRenamed", "groupChanged", "groupDeleted"]);
/** The kinds that count the devices (or types) they touch, once each, rather than their operations. */
const TOUCH_KINDS: ReadonlySet<Kind> = new Set(["moved", "unpinned", "colouredDevices", "resetDevices", "colouredTypes", "resetTypes"]);

/** `more`: the operations of the request that the sentence does not say (another kind than the most frequent). */
export type Line = Readonly<{ key: TextKey; values: Readonly<{ count?: number; label?: string }>; more: number }>;

/** The kind of one operation; a group update that sets a name is a renaming. */
export function kindOf(op: JournalOp): Kind {
  if (op.op === "group_update") return typeof op.label === "string" && op.label.trim() ? "groupRenamed" : "groupChanged";
  return BY_OP[op.op] ?? "mixed";
}

/** The identity of what an operation touches: its `id`, or, for a creation, the one the server gave it (`created`
 *  lists the identities in the order of the creations of the request). */
function subjectId(entry: JournalEntry, index: number): string {
  const op = entry.ops[index];
  if (typeof op.id === "string" && op.id) return op.id;
  if (!op.op.endsWith("_create")) return "";
  const rank = entry.ops.slice(0, index).filter((o) => o.op.endsWith("_create")).length;
  return entry.created[rank] ?? "";
}

function groupLabel(entry: JournalEntry, index: number): string {
  const id = subjectId(entry, index);
  const groups = entry.subjects.filter((s) => s.kind === "group");
  const found = groups.find((s) => s.id === id) ?? (groups.length === 1 ? groups[0] : undefined);
  const named = found?.label.trim() ?? "";
  if (named) return named;
  const op = entry.ops[index];
  return typeof op.label === "string" ? op.label.trim() : "";
}

/** How many things an operation list touches: the devices (or types) it names once each, else the operations. */
function touched(ops: readonly JournalOp[]): number {
  const names = new Set(ops.map((op, i) => (typeof op.hostname === "string" ? op.hostname : typeof op.type === "string" ? `type:${op.type}` : `#${i}`)));
  return names.size;
}

const mixed = (entry: JournalEntry): Line => ({ key: KEYS.mixed, values: { count: Math.max(1, entry.ops.length) }, more: 0 });

/** The most frequent kind of a request's operations; null on a tie (or for no operation). */
export function majorityKind(ops: readonly JournalOp[]): Kind | null {
  const counts = new Map<Kind, number>();
  for (const op of ops) counts.set(kindOf(op), (counts.get(kindOf(op)) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return null;
  return ranked[0][0];
}

export function journalLine(entry: JournalEntry): Line {
  const kind = majorityKind(entry.ops);
  if (kind === null || kind === "mixed") return mixed(entry);
  const indexes = entry.ops.flatMap((op, index) => (kindOf(op) === kind ? [index] : []));
  const more = entry.ops.length - indexes.length;
  if (GROUP_KINDS.has(kind)) {
    const label = indexes.length === 1 ? groupLabel(entry, indexes[0]) : "";
    return label ? { key: KEYS[kind], values: { label }, more } : mixed(entry);
  }
  const ops = indexes.map((index) => entry.ops[index]);
  return { key: KEYS[kind], values: { count: TOUCH_KINDS.has(kind) ? touched(ops) : ops.length }, more };
}

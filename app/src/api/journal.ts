// What the Log view reads from the API: a page of the modifications log (`GET /api/intent/journal`), validated at the
// boundary. An entry is one accepted request (its declared author, date, revision, operations as received); its
// subjects (group, annotation, connector) carry the name they had at that revision, replayed by the server; its
// group (a session of positions, a repeated gesture) is computed by the server on the whole log. The facets are the
// values the server saw with their counts, in a fixed order. A malformed entry is dropped, a fact the API did not
// give is null, never guessed; a body that is not the contract's shape is refused whole. Shapes: backend
// `journal.py` (`JournalPage`, `JournalEntry`), `journal_groups.py`, OpenAPI `JournalPage`.
import { getJson } from "./http";
import type { Answer, Fetch } from "./http";

export const JOURNAL_ROUTE = "/api/intent/journal";

export type JournalCategory = "positions" | "colors" | "groups" | "annotations" | "connectors" | "other";
/** The action of an entry (`journal_index.py`): created, modified, deleted; a purge of the log counts as deleted. */
export type JournalAction = "created" | "modified" | "deleted";
export type SubjectKind = "group" | "annotation" | "connector";
/** A piece of the name of a connector without a label: a typed name, or the kind of an unnamed end (`free`). */
export type JournalNamePart = Readonly<{ text: string | null; unnamed: string | null }>;
export type JournalSubject = Readonly<{ id: string; kind: SubjectKind; label: string; form: string; unnamed: string | null; parts: readonly JournalNamePart[] | null }>;
export type JournalOp = Readonly<{ op: string } & Record<string, unknown>>;
/** The grouping of an entry, computed by the server on the whole log: a session of positions, or the same gesture
 *  repeated; `size` = its entries in the whole log (a filter may hide some). */
export type JournalGroup = Readonly<{ id: string; kind: "session" | "repeat"; size: number }>;
export type JournalEntry = Readonly<{
  infrastructure: string;
  revision: number;
  at: string;
  author: string;
  categories: readonly string[];
  actions: readonly string[];
  created: readonly string[];
  subjects: readonly JournalSubject[];
  ops: readonly JournalOp[];
  group: JournalGroup | null;
}>;
export type JournalFacet = Readonly<{ value: string; count: number }>;
export type JournalPage = Readonly<{
  entries: readonly JournalEntry[];
  total: number;
  /** The cursor of the next (older) page; null at the start of the log. */
  next: string | null;
  authors: readonly JournalFacet[];
  categories: readonly JournalFacet[];
  infrastructures: readonly JournalFacet[];
  actions: readonly JournalFacet[];
  /** The lines of the log the server skipped as unreadable. */
  unreadable: number;
  /** `start` asked (a link to an entry) but no entry of that revision: the page starts at the nearest. */
  start_missing: boolean;
}>;

export const CATEGORIES: readonly JournalCategory[] = ["positions", "colors", "groups", "annotations", "connectors", "other"];
export const ACTIONS: readonly JournalAction[] = ["created", "modified", "deleted"];
export const isCategory = (value: string): value is JournalCategory => (CATEGORIES as readonly string[]).includes(value);
export const isAction = (value: string): value is JournalAction => (ACTIONS as readonly string[]).includes(value);
const KINDS: readonly SubjectKind[] = ["group", "annotation", "connector"];
const isKind = (value: unknown): value is SubjectKind => typeof value === "string" && (KINDS as readonly string[]).includes(value);

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isText) : []);

function part(value: unknown): JournalNamePart | null {
  if (!isRecord(value)) return null;
  return { text: textOrNull(value.text), unnamed: textOrNull(value.unnamed) };
}

function subject(value: unknown): JournalSubject | null {
  if (!isRecord(value) || !isText(value.id) || !isKind(value.kind)) return null;
  const parts = Array.isArray(value.parts) ? value.parts.map(part).filter((p) => p !== null) : null;
  return {
    id: value.id,
    kind: value.kind,
    label: typeof value.label === "string" ? value.label : "",
    form: typeof value.form === "string" ? value.form : "",
    unnamed: textOrNull(value.unnamed),
    parts,
  };
}

function group(value: unknown): JournalGroup | null {
  if (!isRecord(value) || !isText(value.id) || !isCount(value.size)) return null;
  if (value.kind !== "session" && value.kind !== "repeat") return null;
  return { id: value.id, kind: value.kind, size: value.size };
}

/** One entry; null when it is not the contract's (no infrastructure, date, revision or operations). */
export function parseEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value) || !isText(value.infrastructure) || !isText(value.at) || typeof value.author !== "string") return null;
  if (!isCount(value.revision) || !Array.isArray(value.ops)) return null;
  const ops = value.ops.filter((op): op is JournalOp => isRecord(op) && isText(op.op));
  return {
    infrastructure: value.infrastructure,
    revision: value.revision,
    at: value.at,
    author: value.author,
    categories: texts(value.categories),
    actions: texts(value.actions),
    created: texts(value.created),
    subjects: Array.isArray(value.subjects) ? value.subjects.map(subject).filter((s) => s !== null) : [],
    ops,
    group: group(value.group),
  };
}

function facets(value: unknown): JournalFacet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && isText(item.value) && isCount(item.count) ? [{ value: item.value, count: item.count }] : []));
}

/** A page of the log; a body without its entries or its total is refused whole. */
export function parseJournalPage(body: unknown): JournalPage | null {
  if (!isRecord(body) || !Array.isArray(body.entries) || !isCount(body.total)) return null;
  return {
    entries: body.entries.map(parseEntry).filter((item) => item !== null),
    total: body.total,
    next: isText(body.next) ? body.next : null,
    authors: facets(body.authors),
    categories: facets(body.categories),
    infrastructures: facets(body.infrastructures),
    actions: facets(body.actions),
    unreadable: isCount(body.unreadable) ? body.unreadable : 0,
    start_missing: body.start_missing === true,
  };
}

/** A page of the log for the query's parameters (`state/journal.ts` writes them; `author` and `category` repeat). */
export const loadJournalPage = (token: string, params: readonly (readonly [string, string])[], fetchFn?: Fetch): Promise<Answer<JournalPage>> =>
  getJson(JOURNAL_ROUTE, params, token, parseJournalPage, fetchFn);

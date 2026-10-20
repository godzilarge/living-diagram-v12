// What a row of the Log says, from the pure layer (`state/journal.ts`, `state/journal-text.ts`): the sentence of an
// item (an entry, a fold of the same gesture, a session of positions), its tone, the objects it cites and what became
// of them, the objects whose history the detail offers. Pure, tested under Node; the words are `words.ts`.
import type { Model } from "@engine/canvas/types";
import type { JournalEntry, JournalItem } from "../state/journal";
import { isTrace, mergedOp, sessionHosts } from "../state/journal";
import { destroys, headline, majority, quotedName, sentenceOf, sessionSentence, subjectLabel } from "../state/journal-text";
import type { Piece, Ref, RefKind, Sentence } from "../state/journal-text";
import type { FeedTone } from "../ui";

/** The entry a row stands for (the most recent of a fold or a session) and its sentence. */
export function lineOf(item: JournalItem): Readonly<{ entry: JournalEntry; sentence: Sentence }> {
  if (item.kind === "entry") return { entry: item.entry, sentence: headline(item.entry) };
  const entry = item.entries[0];
  if (item.kind === "session") {
    const hosts = sessionHosts(item.entries);
    return { entry, sentence: sessionSentence(hosts.placed.length, hosts.unpinned.length) };
  }
  return { entry, sentence: { ...sentenceOf(entry, mergedOp(item.entries), 0), category: majority(entry) } };
}

/** Positions recede (most of a log), a deletion stands out. */
export const toneOf = (sentence: Sentence): FeedTone => (destroys(sentence) ? "destroy" : sentence.category === "positions" ? "quiet" : "neutral");

/** The oldest entry of an item (a fold's or a session's first request). */
export const oldestOf = (item: JournalItem): JournalEntry => (item.kind === "entry" ? item.entry : item.entries[item.entries.length - 1]);

/** Whether a cited object is still there: known for the infrastructure whose run is open only (elsewhere: true). */
export type Presence = (infrastructure: string, kind: RefKind, id: string) => boolean;
export function presenceOf(model: Model | null): Presence {
  return (infrastructure, kind, id) => {
    if (!model || infrastructure !== model.source.infrastructure) return true;
    if (kind === "node") return model.nodeByHost.has(id);
    if (kind === "group") return model.groupById.has(id);
    if (kind === "annotation") return model.annotationById.has(id);
    return model.connectorById.has(id);
  };
}

export const refsOf = (sentence: Sentence): Ref[] => sentence.pieces.filter((piece: Piece): piece is Ref => typeof piece !== "string");

/** The first object a sentence cites that is gone; none for a sentence that removes (it says so already). */
export function goneRef(sentence: Sentence, entry: JournalEntry, presence: Presence): Ref | null {
  if (destroys(sentence)) return null;
  return refsOf(sentence).find((ref) => !presence(entry.infrastructure, ref.ref, ref.id)) ?? null;
}

/** The target of a link to an entry: the row that holds the revision (never a purge trace), when the page has it. */
export function targetOf(items: readonly JournalItem[], rev: number | null, startMissing: boolean): JournalItem | null {
  if (rev === null || startMissing) return null;
  return items.find((item) => (item.kind === "entry" ? [item.entry] : item.entries).some((e) => e.revision === rev && !isTrace(e))) ?? null;
}

/** The objects of an entry whose history the detail offers: its subjects, then its devices when they are few. */
export const HISTORY_MAX = 4;
export type HistoryObject = Readonly<{ id: string; kind: RefKind; name: string | null }>;
export function objectsOf(entry: JournalEntry): HistoryObject[] {
  const subjects: HistoryObject[] = entry.subjects.map((s) => ({ id: s.id, kind: s.kind, name: subjectLabel(s) || null }));
  const hosts = [...new Set(entry.ops.map((op) => (typeof op.hostname === "string" ? op.hostname : "")).filter(Boolean))];
  const devices: HistoryObject[] = hosts.length <= HISTORY_MAX ? hosts.map((host) => ({ id: host, kind: "node", name: host })) : [];
  return [...subjects, ...devices].slice(0, HISTORY_MAX);
}

/** The name of the object whose history is read: the one the log knows, else the group's of the run (both quoted, as
 *  the sentences quote a named group or annotation), else itself. */
export function objectName(object: string, entries: readonly JournalEntry[], model: Model | null): string {
  const cited = entries.flatMap((e) => e.subjects).find((s) => s.id === object && subjectLabel(s));
  if (cited) return quotedName(cited.kind, subjectLabel(cited));
  const group = model?.groupById.get(object);
  return group && group.label ? quotedName("group", group.label) : object;
}

/** The words searched, as the server splits them. */
export const wordsOf = (q: string): string[] => q.trim().split(/\s+/).filter(Boolean);

// Annuler / rétablir (docs/10 §7), la partie qui agit : observe les écritures acceptées de cette page (épingles,
// couleurs, groupes) et en fait des entrées de la pile ; rejoue une entrée en envoyant ses opérations inverses par
// l'hôte d'intention, sous le nom de l'écrivain (le journal dit « qui, quand ») ; rend les déplacements locaux (sans
// nom) à leur place. Une clé modifiée par quelqu'un d'autre depuis est sautée et la page le dit. La pile vit dans le
// store (elle traverse les runs d'une infrastructure : l'intention est par infrastructure) ; ce contrôleur, un par run.
import type { Point } from "../../canvas/layout";
import type { Intent, Model } from "../../canvas/types";
import type { Op } from "../../shell/apps";
import type { IntentHost } from "../../shell/intent";
import type { AppWriter } from "../api/writers";
import { t } from "../../i18n";
import { absorb, createdIds, discard, labelText, moved, plan, push, record, relinkOps, whoOf } from "../state/history";
import type { Entry, Stack } from "../state/history";
import type { Toile } from "./toile";

/** `owner` : l'infrastructure à qui la pile appartient en ce moment (une écriture en vol d'une autre n'y entre pas). */
export interface StackHolder { get: () => Stack; set: (stack: Stack) => void; owner?: () => string }
export interface Undo {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** Un geste de déplacement fini (`onMoved` de la toile) : une entrée locale quand rien ne s'enregistre (sans nom). */
  onMoved: (before: Map<string, Point>, after: Map<string, Point>) => void;
  /** Les opérations `next`, envoyées après `first`, continuent son geste (un collage en deux requêtes, lot 3 de
   *  docs/11) : leur écriture acceptée rejoint l'entrée de `first` au lieu d'en faire une. À appeler avant l'envoi. */
  chain: (next: Op[], first: Op[]) => void;
  /** Défait ce que la requête de `first` a écrit (un collage dont la suite est refusée, lot 3) : ses opérations
   *  inverses, sans entrée d'annulation ; réussi, l'entrée de `first` sort de la pile ; refusé, elle reste (Ctrl+Z
   *  défait ce qui reste) et la raison est rendue. */
  revert: (first: Op[]) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export function createUndo(model: Model, writer: AppWriter | null, intents: IntentHost, toile: () => Toile, holder: StackHolder, note: (text: string) => void): Undo {
  let busy = false;
  let last: Intent | null = model.intent;
  const replayed = new WeakSet<Op>(); // les opérations d'une annulation ne font pas d'entrée à leur tour
  // Un geste en plusieurs requêtes : l'entrée qu'une requête a faite, par sa première opération ; et la requête qu'une
  // suivante continue, par leurs premières opérations.
  const made = new WeakMap<Op, Entry>(), joins = new WeakMap<Op, Op>();
  if (writer) {
    writer.observer = {
      before: () => last,
      after: (ops, before, intent) => {
        last = intent;
        if (ops.every((op) => replayed.has(op))) return;
        // une écriture qui revient après un changement d'infrastructure n'entre pas dans la pile de l'autre (revue, H1)
        if (holder.owner && holder.owner() !== model.source.infrastructure) return;
        const entry = record(ops, before, intent);
        if (!entry || !ops.length) return;
        const head = joins.get(ops[0]), target = head ? made.get(head) : undefined;
        if (!head || !target) { holder.set(push(holder.get(), entry)); made.set(ops[0], entry); return; }
        const joined = absorb(holder.get(), target, entry);
        holder.set(joined.stack);
        made.set(head, joined.entry);
      },
    };
  }
  const chain = (next: Op[], first: Op[]): void => { if (next.length && first.length) joins.set(next[0], first[0]); };
  async function revert(first: Op[]): Promise<{ ok: true } | { ok: false; message: string }> {
    const entry = first.length ? made.get(first[0]) : undefined;
    if (!entry || entry.kind !== "intent") return { ok: true }; // rien d'écrit, rien à défaire
    const p = plan(model.intent, entry.changes, "undo");
    if (!p.ops.length) return { ok: false, message: t("history.undoStale", { what: labelText(entry.label) }) };
    p.ops.forEach((op) => replayed.add(op));
    await intents.apply(p.ops, t("common:host.saving"));
    const outcome = writer ? writer.outcomeOf(p.ops[0]) : undefined;
    if (!outcome || !outcome.ok) return { ok: false, message: outcome && !outcome.ok ? outcome.message : t("shell:messages.apiDown") };
    const stack = holder.get();
    holder.set({ undo: stack.undo.filter((e) => e !== entry), redo: stack.redo });
    return { ok: true };
  }

  function onMoved(before: Map<string, Point>, after: Map<string, Point>): void {
    if (intents.canWrite()) return; // l'écriture acceptée fera son entrée
    holder.set(push(holder.get(), { kind: "local", label: { key: "movedLocal", who: whoOf(Array.from(after.keys())) }, before, after }));
  }

  async function step(direction: "undo" | "redo"): Promise<void> {
    if (busy) return;
    toile().flush(); // une rafale de flèches en attente devient une entrée avant d'être annulée
    const stack = holder.get();
    const entry = (direction === "undo" ? stack.undo : stack.redo).slice(-1)[0];
    if (!entry) return;
    const what = labelText(entry.label);
    const done = (detail: string): string => t(direction === "undo" ? "history.undone" : "history.redone", { what: what + detail });
    if (entry.kind === "local") {
      toile().restore(direction === "undo" ? entry.before : entry.after);
      holder.set(moved(stack, direction, new Map(), undefined, entry));
      note(done(""));
      return;
    }
    const p = plan(model.intent, entry.changes, direction);
    if (!p.ops.length) {
      holder.set(discard(stack, direction));
      note(p.withheld.length ? t("history.secretsWithheld", { what }) : t(direction === "undo" ? "history.undoStale" : "history.redoStale", { what }));
      return;
    }
    const skipped = (p.skipped.length ? " (" + t("history.skipped", { count: p.skipped.length }) + ")" : "") + (p.withheld.length ? " (" + t("history.secretsSkipped") + ")" : "");
    busy = true;
    p.ops.forEach((op) => replayed.add(op));
    try {
      const intent = await intents.apply(p.ops, done(skipped));
      if (intent) {
        // les identités recréées se lisent dans la réponse de cette requête, jamais dans un document lu depuis (revue, M2)
        const answer = writer ? writer.outcomeOf(p.ops[0]) : undefined;
        const ids = createdIds(p.created, answer && answer.ok ? answer.intent : intent);
        // ce qui tenait à un élément recréé (un connecteur à sa note, une note à son groupe) le reprend (lot 2 de docs/11)
        const relink = relinkOps(intent, ids);
        relink.forEach((op) => replayed.add(op));
        if (relink.length) await intents.apply(relink, done(skipped));
        holder.set(moved(holder.get(), direction, ids, p.applied, entry));
      }
    } finally { busy = false; }
  }

  return { undo: () => step("undo"), redo: () => step("redo"), onMoved, chain, revert };
}

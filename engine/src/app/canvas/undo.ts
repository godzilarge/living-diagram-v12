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
import { createdIds, discard, labelText, moved, plan, push, record, whoOf } from "../state/history";
import type { Stack } from "../state/history";
import type { Toile } from "./toile";

export interface StackHolder { get: () => Stack; set: (stack: Stack) => void }
export interface Undo {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /** Un geste de déplacement fini (`onMoved` de la toile) : une entrée locale quand rien ne s'enregistre (sans nom). */
  onMoved: (before: Map<string, Point>, after: Map<string, Point>) => void;
}

export function createUndo(model: Model, writer: AppWriter | null, intents: IntentHost, toile: () => Toile, holder: StackHolder, note: (text: string) => void): Undo {
  let busy = false;
  let last: Intent | null = model.intent;
  const replayed = new WeakSet<Op>(); // les opérations d'une annulation ne font pas d'entrée à leur tour
  if (writer) {
    writer.observer = {
      before: () => last,
      after: (ops, before, intent) => {
        last = intent;
        if (ops.every((op) => replayed.has(op))) return;
        const entry = record(ops, before, intent);
        if (entry) holder.set(push(holder.get(), entry));
      },
    };
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
      note(t(direction === "undo" ? "history.undoStale" : "history.redoStale", { what }));
      return;
    }
    const skipped = p.skipped.length ? " (" + t("history.skipped", { count: p.skipped.length }) + ")" : "";
    busy = true;
    p.ops.forEach((op) => replayed.add(op));
    try {
      const intent = await intents.apply(p.ops, done(skipped));
      if (intent) holder.set(moved(holder.get(), direction, createdIds(p.created, intent), p.applied, entry));
    } finally { busy = false; }
  }

  return { undo: () => step("undo"), redo: () => step("redo"), onMoved };
}

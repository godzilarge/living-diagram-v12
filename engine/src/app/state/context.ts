// Le menu contextuel (Orhan, 2026-10-09 : « tout ce qui est action rapide devrait être accessible via un clic
// droit »), la partie pure : ce qu'un clic droit propose selon ce qu'il vise (le fond, un équipement, un groupe, une
// annotation et sa cellule, un connecteur), ce qu'on peut écrire, et ce qui est sélectionné. Chaque entrée a un
// identifiant que le composant exécute ; rien ici ne touche la toile ni l'API. Testé sous Node.
import { isSingle, mergeAt } from "../../canvas/table";
import type { Range } from "../../canvas/table";
import type { Model } from "../../canvas/types";

export type ContextTarget =
  | { kind: "pane" }
  | { kind: "node"; id: string }
  | { kind: "group"; id: string }
  | { kind: "annotation"; id: string; cell?: [number, number]; range?: Range }
  | { kind: "connector"; id: string };
export interface MenuItem { id: string; label: string; danger?: boolean; checked?: boolean; sep?: boolean }
export interface MenuContext { editable: boolean; selectedHosts: string[]; hasSelection: boolean; pinned: (host: string) => boolean }

const sep = (): MenuItem => ({ id: "sep", label: "", sep: true });
const item = (id: string, label: string, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, ...extra });
/** Les entrées du menu pour une cible ; un sous-ensemble en lecture seule. */
export function menuItems(target: ContextTarget, model: Model, ctx: MenuContext): MenuItem[] {
  const out: MenuItem[] = [];
  const write = ctx.editable;
  if (target.kind === "pane") {
    if (write) out.push(item("insert:note", "insérer une note ici"), item("insert:rectangle", "insérer un rectangle ici"), item("insert:ellipse", "insérer une ellipse ici"), item("insert:connector", "insérer un connecteur ici"), item("insert:table", "insérer un tableau ici"), item("insert:image", "insérer une image…"), sep());
    out.push(item("fit", "cadrer tout"));
    if (ctx.hasSelection) out.push(item("clear", "vider la sélection"));
    return out;
  }
  if (target.kind === "node") {
    const multi = ctx.selectedHosts.length >= 2 && ctx.selectedHosts.includes(target.id);
    out.push(item("center", "centrer"), item("hide", multi ? "masquer la sélection" : "masquer"), item("isolate", multi ? "isoler la sélection" : "isoler"));
    if (write) {
      out.push(sep());
      if (multi) out.push(item("align:horizontal", "aligner horizontalement"), item("align:vertical", "aligner verticalement"), item("group", "grouper la sélection"));
      else out.push(item("note", "attacher une note"), item("connect", "tirer un connecteur"));
      if (ctx.pinned(target.id)) out.push(item("unpin", multi ? "retirer les épingles" : "retirer l'épingle"));
    }
    return out;
  }
  if (target.kind === "group") {
    out.push(item("center", "centrer"), item("members", "sélectionner les membres"), item("hide", "masquer les membres"), item("isolate", "isoler les membres"));
    if (write) out.push(sep(), item("note", "attacher une note"), item("connect", "tirer un connecteur"), sep(), item("delete", "supprimer le groupe", { danger: true }));
    return out;
  }
  if (target.kind === "connector") {
    const c = model.connectorById.get(target.id);
    if (!c) return out;
    out.push(item("center", "centrer"));
    if (!write) return out;
    const heads = c.heads.start + "/" + c.heads.end;
    out.push(sep(), item("reverse", "inverser le sens"),
      item("heads:none/arrow", "flèche à l'arrivée", { checked: heads === "none/arrow" }), item("heads:arrow/none", "flèche au départ", { checked: heads === "arrow/none" }),
      item("heads:arrow/arrow", "flèche aux deux bouts", { checked: heads === "arrow/arrow" }), item("heads:none/none", "ligne sans pointe", { checked: heads === "none/none" }),
      sep(), item("route:straight", "tracé droit", { checked: c.route === "straight" }), item("route:elbow", "tracé coudé", { checked: c.route === "elbow" }), item("route:curve", "tracé courbe", { checked: c.route === "curve" }));
    if (c.bend) out.push(item("straighten", "redresser"));
    if (c.start.kind !== "free" || c.end.kind !== "free") out.push(item("detach", "détacher les bouts"));
    out.push(sep(), item("lock", c.locked ? "déverrouiller" : "verrouiller"), item("plane", c.z === "back" ? "mettre dessus" : "mettre dessous"), sep(), item("delete", "supprimer", { danger: true }));
    return out;
  }
  const a = model.annotationById.get(target.id);
  if (!a) return out;
  if (write && a.content.kind === "table" && target.cell) {
    const [r, c] = target.cell, range = target.range || { r0: r, c0: c, r1: r, c1: c };
    const columns = a.content.rows[0] ? a.content.rows[0].length : 0, rows = a.content.rows.length;
    const m = mergeAt(a.content, r, c);
    // une plage qui est exactement une cellule fusionnée est une seule cellule visible : rien à fusionner
    const single = isSingle(range) || (!!m && m.row === range.r0 && m.col === range.c0 && m.row + m.rows - 1 === range.r1 && m.col + m.cols - 1 === range.c1);
    out.push(item("cell:edit", "modifier la cellule"));
    if (!single) out.push(item("cell:merge", "fusionner les cellules"));
    if (m) out.push(item("cell:split", "séparer la cellule"));
    out.push(sep(), item("row:above", "insérer une ligne au-dessus"), item("row:below", "insérer une ligne en dessous"));
    if (rows > 1) out.push(item("row:delete", "supprimer la ligne"));
    out.push(item("col:left", "insérer une colonne à gauche"), item("col:right", "insérer une colonne à droite"));
    if (columns > 1) out.push(item("col:delete", "supprimer la colonne"));
    out.push(item("header", "première ligne en en-tête", { checked: a.content.header }), sep());
  } else if (write && a.content.kind === "note") out.push(item("text", "modifier le texte"), sep());
  out.push(item("center", "centrer"));
  if (!write) return out;
  out.push(item("duplicate", "dupliquer"), item("lock", a.locked ? "déverrouiller" : "verrouiller"), item("plane", a.z === "back" ? "mettre dessus" : "mettre dessous"));
  if (a.anchor.kind !== "free") out.push(item("detach", "détacher"));
  out.push(item("connect", "tirer un connecteur"), sep(), item("delete", "supprimer", { danger: true }));
  return out;
}

export const context = { menuItems };

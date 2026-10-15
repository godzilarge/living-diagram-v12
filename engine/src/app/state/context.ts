// Le menu contextuel (Orhan, 2026-10-09 : « tout ce qui est action rapide devrait être accessible via un clic
// droit »), la partie pure : ce qu'un clic droit propose selon ce qu'il vise (le fond, un équipement, un groupe, une
// annotation et sa cellule, un connecteur), ce qu'on peut écrire, et ce qui est sélectionné. Chaque entrée a un
// identifiant que le composant exécute ; rien ici ne touche la toile ni l'API. Testé sous Node.
import { isSingle, mergeAt } from "../../canvas/table";
import type { Range } from "../../canvas/table";
import type { Model } from "../../canvas/types";
import { t } from "../../i18n";

export type ContextTarget =
  | { kind: "pane" }
  | { kind: "node"; id: string }
  | { kind: "group"; id: string }
  | { kind: "annotation"; id: string; cell?: [number, number]; range?: Range }
  | { kind: "connector"; id: string };
/** Une entrée ; `keys` : son raccourci écrit (« Ctrl+C »), `aria` : le même pour `aria-keyshortcuts` (« Control+C »). */
export interface MenuItem { id: string; label: string; danger?: boolean; checked?: boolean; sep?: boolean; keys?: string; aria?: string }
/** `items` : la sélection mixte, comptée (lot 3 : copier dit « le nom », « les noms » ou « la sélection ») ; `grid` :
 *  la cible fait partie d'une sélection d'au moins trois éléments qui se rangent (lot 8 : « mettre en grille »). */
export interface MenuContext { editable: boolean; selectedHosts: string[]; hasSelection: boolean; pinned: (host: string) => boolean; items?: number; grid?: boolean }

const sep = (): MenuItem => ({ id: "sep", label: "", sep: true });
/** Une entrée : son libellé est la clé `context.<key>` du catalogue, écrite dans la langue de la page à l'ouverture. */
const item = (id: string, key: string, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label: t(("shell:context." + key) as never), ...extra });
// Le presse-papiers (lot 3 de docs/11) : copier, couper, coller, dupliquer, avec leurs raccourcis écrits.
const SHORTCUT: Record<string, string> = { copy: "C", cut: "X", paste: "V", duplicate: "D" };
const clip = (id: "copy" | "cut" | "paste" | "duplicate", key: string): MenuItem => item("clip:" + id, key, { keys: t(("shell:context.keys." + id) as never), aria: "Control+" + SHORTCUT[id] });
/** Mettre la sélection en grille (lot 8 de docs/11) : sans aperçu (il recouvrirait les places), Ctrl+Z l'annule. */
const gridItem = (): MenuItem => item("grid", "grid", { keys: "Alt+G", aria: "Alt+G" });
/** Les entrées du menu pour une cible ; un sous-ensemble en lecture seule. */
export function menuItems(target: ContextTarget, model: Model, ctx: MenuContext): MenuItem[] {
  const out: MenuItem[] = [];
  const write = ctx.editable;
  if (target.kind === "pane") {
    if (write) out.push(clip("paste", "pasteHere"), sep(), item("insert:note", "insertNote"), item("insert:rectangle", "insertRectangle"), item("insert:ellipse", "insertEllipse"), item("insert:connector", "insertConnector"), item("insert:table", "insertTable"), item("insert:image", "insertImage"), sep());
    out.push(item("fit", "fit"));
    if (ctx.hasSelection) out.push(item("clear", "clear"));
    return out;
  }
  if (target.kind === "node") {
    const multi = ctx.selectedHosts.length >= 2 && ctx.selectedHosts.includes(target.id);
    const mixed = (ctx.items || 0) > ctx.selectedHosts.length && ctx.selectedHosts.includes(target.id);
    out.push(item("center", "center"), item("hide", multi ? "hideSelection" : "hide"), item("isolate", multi ? "isolateSelection" : "isolate"));
    out.push(sep(), clip("copy", mixed ? "copySelection" : multi ? "copyNames" : "copyName"));
    if (write) out.push(clip("paste", "pasteHere"));
    if (write) {
      out.push(sep());
      if (multi) out.push(item("align:horizontal", "alignH"), item("align:vertical", "alignV"), ...(ctx.grid ? [gridItem()] : []), item("group", "group"));
      else out.push(...(ctx.grid ? [gridItem()] : []), item("note", "note"), item("connect", "connect"));
      if (ctx.pinned(target.id)) out.push(item("unpin", multi ? "unpinMany" : "unpin"));
    }
    return out;
  }
  if (target.kind === "group") {
    out.push(item("center", "center"), item("members", "members"), item("hide", "hideMembers"), item("isolate", "isolateMembers"));
    if (write) out.push(sep(), clip("paste", "pasteHere"), sep(), item("note", "note"), item("connect", "connect"), sep(), item("delete", "deleteGroup", { danger: true }));
    return out;
  }
  if (target.kind === "connector") {
    const c = model.connectorById.get(target.id);
    if (!c) return out;
    out.push(item("center", "center"), sep(), clip("copy", "copy"));
    if (!write) return out;
    out.push(clip("cut", "cut"), clip("paste", "pasteHere"), clip("duplicate", "duplicate"));
    const heads = c.heads.start + "/" + c.heads.end;
    out.push(sep(), item("reverse", "reverse"),
      item("heads:none/arrow", "headEnd", { checked: heads === "none/arrow" }), item("heads:arrow/none", "headStart", { checked: heads === "arrow/none" }),
      item("heads:arrow/arrow", "headBoth", { checked: heads === "arrow/arrow" }), item("heads:none/none", "headNone", { checked: heads === "none/none" }),
      sep(), item("route:straight", "routeStraight", { checked: c.route === "straight" }), item("route:elbow", "routeElbow", { checked: c.route === "elbow" }), item("route:curve", "routeCurve", { checked: c.route === "curve" }));
    if (c.bend) out.push(item("straighten", "straighten"));
    if (c.start.kind !== "free" || c.end.kind !== "free") out.push(item("detach", "detachEnds"));
    out.push(sep(), item("lock", c.locked ? "unlock" : "lock"), item("plane", c.z === "back" ? "toFront" : "toBack"), sep(), item("delete", "delete", { danger: true }));
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
    out.push(item("cell:edit", "editCell"));
    if (!single) out.push(item("cell:merge", "merge"));
    if (m) out.push(item("cell:split", "split"));
    out.push(sep(), item("row:above", "rowAbove"), item("row:below", "rowBelow"));
    if (rows > 1) out.push(item("row:delete", "rowDelete"));
    out.push(item("col:left", "colLeft"), item("col:right", "colRight"));
    if (columns > 1) out.push(item("col:delete", "colDelete"));
    out.push(item("header", "header", { checked: a.content.header }), sep());
  } else if (write && a.content.kind === "note") out.push(item("text", "editText"), sep());
  out.push(item("center", "center"), sep(), clip("copy", "copy"));
  if (!write) return out;
  out.push(clip("cut", "cut"), clip("paste", "pasteHere"), clip("duplicate", "duplicate"), sep());
  if (ctx.grid) out.push(gridItem(), sep());
  out.push(item("lock", a.locked ? "unlock" : "lock"));
  // attachée, une annotation se dessine au-dessus de son ancre (React Flow : un enfant passe au-dessus de son parent) :
  // « mettre dessous » mentirait ; seul « mettre dessus » reste, pour un document qui dirait encore « dessous »
  if (a.anchor.kind === "free" || a.z === "back") out.push(item("plane", a.z === "back" ? "toFront" : "toBack"));
  if (a.anchor.kind !== "free") out.push(item("detach", "detach"));
  out.push(item("connect", "connect"), sep(), item("delete", "delete", { danger: true }));
  return out;
}

export const context = { menuItems };

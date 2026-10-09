// Le menu contextuel (Orhan, 2026-10-09 : « tout ce qui est action rapide devrait être accessible via un clic
// droit »). Flottant à l'endroit du clic, il propose ce que context.ts décide pour la cible (le fond, un équipement,
// un groupe, une annotation et sa cellule, un connecteur) et exécute l'entrée choisie par les commandes du store.
// Clavier : ↑↓ parcourent, Entrée choisit, Échap ferme ; un clic ailleurs, la molette ou un redimensionnement ferment.
import { useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { DEFAULT_LENGTH } from "../../canvas/connectors";
import { deleteColumn, deleteRow, insertColumn, insertRow, merge, split } from "../../canvas/table";
import { useModel, useStore } from "../state/store";
import { menuItems } from "../state/context";
import type { ContextTarget, MenuItem } from "../state/context";
import type { TableContent } from "../../contracts/intent";

const WIDTH = 240, ROW = 30, MARGIN = 8;

export function ContextMenu() {
  const { state, commands, handle } = useStore();
  const model = useModel();
  const ref = useRef<HTMLDivElement>(null);
  const menu = state.context;
  useEffect(() => {
    if (!menu) return;
    const close = (): void => commands.closeContext();
    const down = (event: PointerEvent): void => { const target = event.target as Element | null; if (!target || !ref.current || !ref.current.contains(target)) close(); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    const first = ref.current ? ref.current.querySelector<HTMLElement>("button") : null;
    if (first) first.focus();
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("wheel", close); window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
  }, [menu, commands]);
  if (!menu || !model || !handle) return null;
  const editable = handle.intents.canWrite();
  const items = menuItems(menu.target, model, { editable, selectedHosts: state.hosts, hasSelection: !!state.selection || state.hosts.length > 0, pinned: (host) => model.pinByHost.has(host) });
  if (!items.length) return null;
  // Le menu reste dans la fenêtre : il se décale à gauche ou au-dessus du clic quand la place manque.
  const rows = items.filter((i) => !i.sep).length, height = rows * ROW + items.filter((i) => i.sep).length * 9 + 12;
  const left = Math.max(MARGIN, Math.min(menu.at.x, window.innerWidth - WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(menu.at.y, window.innerHeight - height - MARGIN));
  const run = (item: MenuItem): void => { commands.closeContext(); execute(menu.target, item.id, menu.plan, commands, model); };
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const buttons = ref.current ? Array.from(ref.current.querySelectorAll<HTMLButtonElement>("button")) : [];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = buttons[(at + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]; if (next) next.focus(); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); commands.closeContext(); }
  };
  // La position vient du clic : posée par des variables CSS sur l'élément (le CSSOM, pas un style en ligne).
  const place = (el: HTMLDivElement | null): void => { if (el) { el.style.setProperty("--menu-x", left + "px"); el.style.setProperty("--menu-y", top + "px"); } };
  return (
    <div ref={(el) => { (ref as { current: HTMLDivElement | null }).current = el; place(el); }} className="context-menu glass" role="menu" aria-label="menu contextuel" onKeyDown={keys} onContextMenu={(event) => event.preventDefault()}>
      {items.map((item, i) => (item.sep ? <hr key={"s" + i} className="context-sep" />
        : <button key={item.id} type="button" role={item.checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={item.checked === undefined ? undefined : item.checked ? "true" : "false"}
          className={"context-item" + (item.danger ? " danger" : "") + (item.checked ? " checked" : "")} onClick={() => run(item)}>{item.label}</button>))}
    </div>
  );
}

type Commands = ReturnType<typeof useStore>["commands"];
type Model = NonNullable<ReturnType<typeof useModel>>;
// Ce qu'une entrée fait : les mêmes commandes que les fiches et la barre d'outils, jamais un chemin à part.
function execute(target: ContextTarget, id: string, plan: { x: number; y: number }, commands: Commands, model: Model): void {
  if (target.kind === "pane") {
    if (id === "fit") commands.fit();
    else if (id === "clear") commands.clearSelection();
    else if (id === "insert:image") commands.pickImage();
    else if (id.startsWith("insert:")) commands.insertAt(id.slice(7), plan);
    return;
  }
  if (target.kind === "node") {
    const hosts = (id === "hide" || id === "isolate" || id === "unpin") && commands.selectedHosts().includes(target.id) ? commands.selectedHosts() : [target.id];
    if (id === "center") commands.reveal({ kind: "node", id: target.id });
    else if (id === "hide") commands.hideHosts(hosts);
    else if (id === "isolate") commands.isolateHosts(hosts);
    else if (id === "unpin") commands.unpin(hosts);
    else if (id === "note") commands.annotationCreate({ kind: "note", text: "Note" }, { anchor: { kind: "device", ref: target.id }, x: 60, y: -120, leader: true });
    else if (id === "connect") commands.connectorCreate({ start: { kind: "device", ref: target.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
    else if (id === "group") commands.groupCreate("Groupe", commands.selectedHosts());
    else if (id.startsWith("align:")) commands.align(id.slice(6) as "horizontal" | "vertical");
    return;
  }
  if (target.kind === "group") {
    const group = model.groupById.get(target.id);
    const members = group ? group.members.filter((host) => model.nodeByHost.has(host)) : [];
    if (id === "center") commands.reveal({ kind: "group", id: target.id });
    else if (id === "members") commands.selectHosts(members);
    else if (id === "hide") commands.hideHosts(members);
    else if (id === "isolate") commands.isolateHosts(members);
    else if (id === "note") commands.annotationCreate({ kind: "note", text: "Note" }, { anchor: { kind: "group", ref: target.id }, x: 0, y: -100, leader: true });
    else if (id === "connect") commands.connectorCreate({ start: { kind: "group", ref: target.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
    else if (id === "delete") commands.groupDelete(target.id);
    return;
  }
  if (target.kind === "connector") {
    const c = model.connectorById.get(target.id);
    if (!c) return;
    if (id === "center") commands.reveal({ kind: "connector", id: c.id });
    else if (id === "reverse") commands.connectorUpdate(c.id, { start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });
    else if (id.startsWith("heads:")) { const [start, end] = id.slice(6).split("/") as ["none" | "arrow", "none" | "arrow"]; commands.connectorUpdate(c.id, { heads: { start, end } }); }
    else if (id.startsWith("route:")) commands.connectorUpdate(c.id, { route: id.slice(6) as "straight" | "elbow" | "curve" });
    else if (id === "straighten") commands.connectorUpdate(c.id, { bend: 0 });
    else if (id === "detach") commands.connectorDetach(c.id);
    else if (id === "lock") commands.connectorUpdate(c.id, { locked: !c.locked });
    else if (id === "plane") commands.connectorUpdate(c.id, { z: c.z === "back" ? "front" : "back" });
    else if (id === "delete") commands.connectorDelete(c.id);
    return;
  }
  const a = model.annotationById.get(target.id);
  if (!a) return;
  const tableOp = (next: (content: TableContent) => TableContent): void => { if (a.content.kind === "table") commands.tableUpdate(a.id, next(a.content)); };
  const cell = target.cell || [0, 0], range = target.range || { r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] };
  if (id === "cell:edit") commands.requestEdit(a.id, cell);
  else if (id === "cell:merge") tableOp((t) => merge(t, range));
  else if (id === "cell:split") tableOp((t) => split(t, cell[0], cell[1]));
  else if (id === "row:above") tableOp((t) => insertRow(t, range.r0));
  else if (id === "row:below") tableOp((t) => insertRow(t, range.r1 + 1));
  else if (id === "row:delete") tableOp((t) => deleteRow(t, cell[0]));
  else if (id === "col:left") tableOp((t) => insertColumn(t, range.c0));
  else if (id === "col:right") tableOp((t) => insertColumn(t, range.c1 + 1));
  else if (id === "col:delete") tableOp((t) => deleteColumn(t, cell[1]));
  else if (id === "header") tableOp((t) => ({ ...t, header: !t.header }));
  else if (id === "text") commands.requestEdit(a.id, null);
  else if (id === "center") commands.reveal({ kind: "annotation", id: a.id });
  else if (id === "duplicate") commands.annotationDuplicate(a.id);
  else if (id === "lock") commands.annotationUpdate(a.id, { locked: !a.locked });
  else if (id === "plane") commands.annotationUpdate(a.id, { z: a.z === "back" ? "front" : "back" });
  else if (id === "detach") commands.annotationDetach(a.id);
  else if (id === "connect") commands.connectorCreate({ start: { kind: "annotation", ref: a.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
  else if (id === "delete") commands.annotationDelete(a.id);
}

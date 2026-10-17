// What a button of a contextual bar, a choice in its volet, or an entry of the context menu does, through the edit
// commands (the same for every surface, never a path of its own): the v1's `execute` of its floating bar and of its
// context menu, kept as they were proven, against the v2's bars (`bars.ts`) and the v1's menu (`context.ts`).
import { DEFAULT_LENGTH } from "@engine/canvas/connectors";
import { columnsOf, deleteColumn, deleteRow, insertColumn, insertRow, MAX_COLUMNS, MAX_ROWS, merge, split } from "@engine/canvas/table";
import type { Model } from "@engine/canvas/types";
import type { TableContent } from "@engine/contracts/intent";
import type { Point } from "@engine/canvas/layout";
import type { ContextTarget } from "@engine/app/state/context";
import type { Toile } from "@engine/app/canvas/toile";
import { t as v1 } from "@engine/i18n";
import type { BarAlign, Target } from "@engine/app/state/floating";
import { nextHeads, nextTextAlign } from "./bars";
import type { EditCommands } from "./edit-commands";

export type BarRun = Readonly<{ commands: EditCommands; model: Model; toile: Toile; pickFile: () => void }>;

/** A note attached to a device or a group, drawn above it with its leader (the v1's offsets). */
const attachNote = (commands: EditCommands, kind: "device" | "group", ref: string): void =>
  commands.annotationCreate({ kind: "note", text: v1("shell:context.defaultNote") }, { anchor: { kind, ref }, x: kind === "device" ? 60 : 0, y: kind === "device" ? -120 : -100, leader: true });

function annotationRun(id: string, value: string | null, target: Extract<Target, { kind: "annotation" }>, run: BarRun): void {
  const { commands } = run;
  const a = target.a, s = a.style;
  const update = (patch: Parameters<EditCommands["annotationUpdate"]>[1]): void => commands.annotationUpdate(a.id, patch);
  const style = (patch: Partial<typeof s>): void => update({ style: patch });
  if (id === "hue" && value) style({ hue: value as typeof s.hue });
  else if (id === "text_size" && value) style({ text_size: Number(value) });
  else if (id === "bold") style({ text_weight: s.text_weight === "bold" ? "regular" : "bold" });
  else if (id === "text_align") style({ text_align: nextTextAlign(s.text_align) });
  else if (id === "fill_opacity" && value) style({ fill_opacity: Number(value) });
  else if (id === "stroke_style" && value) style({ stroke_style: value as typeof s.stroke_style });
  else if (id === "radius" && value) style({ radius: Number(value) });
  else if (id === "opacity" && value) style({ opacity: Number(value) });
  else if (id === "back" || id === "front") update({ z: id });
  else if (id === "lock") update({ locked: !a.locked });
  else if (id === "duplicate") commands.duplicate({ kind: "annotation", id: a.id });
  else if (id === "delete") commands.annotationDelete(a.id);
  else if (id === "edit_label") commands.requestEdit(a.id, null);
  else if (id === "replace") run.pickFile();
  else if (id === "text_style" && value?.startsWith("color:")) style({ text_color: value.slice(6) as typeof s.text_color });
  else if (id === "text_style" && value?.startsWith("font:")) style({ text_font: value.slice(5) as typeof s.text_font });
  else if (id === "text_style" && value?.startsWith("valign:")) style({ text_valign: value.slice(7) as typeof s.text_valign });
  else if (a.content.kind === "code") {
    const c = a.content;
    if (id === "code_language" && value) commands.codeSet([a.id], { language: value as typeof c.language });
    else if (id === "code_font" && value) commands.codeSet([a.id], { font: value as typeof c.font });
    else if (id === "code_highlight") commands.codeSet([a.id], { highlight: !c.highlight });
    else if (id === "code_numbers") commands.codeSet([a.id], { line_numbers: !c.line_numbers });
    else if (id === "code_fit") commands.codeFit([a.id]);
  } else if (a.content.kind === "table") {
    const c = a.content;
    if (id === "add_row" && c.rows.length < MAX_ROWS) commands.tableUpdate(a.id, insertRow(c, c.rows.length));
    else if (id === "add_column" && columnsOf(c) < MAX_COLUMNS) commands.tableUpdate(a.id, insertColumn(c, columnsOf(c)));
    else if (id === "header") commands.tableUpdate(a.id, { ...c, header: !c.header });
  }
}

function connectorRun(id: string, value: string | null, target: Extract<Target, { kind: "connector" }>, commands: EditCommands): void {
  const c = target.c;
  const update = (patch: Parameters<EditCommands["connectorUpdate"]>[1]): void => commands.connectorUpdate(c.id, patch);
  if (id === "heads") update({ heads: nextHeads(c) });
  else if (id === "route" && value) update({ route: value as typeof c.route });
  else if (id === "hue" && value) update({ style: { hue: value as typeof c.style.hue } });
  else if (id === "stroke_width" && value) update({ style: { stroke_width: Number(value) } });
  else if (id === "line_style" && value) update({ style: { stroke_style: value as typeof c.style.stroke_style } });
  else if (id === "reverse") update({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });
  else if (id === "lock") update({ locked: !c.locked });
  else if (id === "delete") commands.connectorDelete(c.id);
}

function groupRun(id: string, value: string | null, target: Extract<Target, { kind: "group" }>, run: BarRun): void {
  const { commands, model } = run;
  const g = target.g, present = g.members.filter((host) => model.nodeByHost.has(host));
  const style = (patch: Partial<typeof g.style>): void => commands.groupUpdate(g.id, { style: patch });
  if (id === "hue" && value) style({ hue: value as typeof g.style.hue });
  else if (id === "shape" && value) style({ shape: value as typeof g.style.shape });
  else if (id === "label_position" && value) style({ label_position: value as typeof g.style.label_position });
  else if (id === "select_members") commands.selectHosts(present);
  else if (id === "paint_members") commands.colorHosts(present, g.style.hue);
  else if (id === "delete") commands.groupDelete(g.id);
}

/** A button of the bar pressed (`value`: the choice made in its volet, the entry of its menu). */
export function runBar(id: string, value: string | null, target: Target, run: BarRun): void {
  const { commands, model, toile } = run;
  if (target.kind === "annotation") return annotationRun(id, value, target, run);
  if (target.kind === "connector") return connectorRun(id, value, target, commands);
  if (target.kind === "group") return groupRun(id, value, target, run);
  const hosts = target.kind === "device" ? [target.host] : target.multi.hosts;
  const devices = hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
  if (id === "group") {
    if (!value || value === "new") commands.groupCreate(v1("shell:context.defaultGroup"), devices);
    else commands.groupAdd(value, devices);
    return;
  }
  if (id === "hide") return commands.hideHosts(hosts);
  if (id === "isolate") return commands.isolateHosts(hosts);
  if (target.kind === "device") {
    const host = target.host;
    if (id === "hue") commands.color(host, value);
    else if (id === "pin") { if (model.pinByHost.has(host)) commands.unpin([host]); else commands.pinHere(host); }
    else if (id === "more" && value === "note") attachNote(commands, "device", host);
    else if (id === "more" && value === "connect") {
      const at = toile.state.positions.get(host) ?? { x: 0, y: 0 }, box = toile.boxes.get(host) ?? { w: 0, h: 0 };
      commands.connectorCreate({ start: { kind: "device", ref: host, side: "auto" }, end: { kind: "free", x: Math.round(at.x + box.w / 2 + DEFAULT_LENGTH), y: Math.round(at.y) } });
    } else if (id === "more" && value === "copy") commands.copyName(host);
    else if (id === "more" && value === "reset") commands.removeIntent(host);
    else if (id === "more" && value?.startsWith("remove:")) commands.groupRemove(value.slice(7), [host]);
    return;
  }
  const multi = target.multi;
  if (id === "align" && value) commands.align(value as BarAlign);
  else if (id === "grid") commands.grid();
  else if (id === "hue") commands.colorItems(multi, value);
  else if (id === "duplicate") commands.duplicate();
  else if (id === "delete") commands.deleteSelection();
  else if (id === "lock") {
    const flags = [...multi.annotations.map((x) => model.annotationById.get(x)), ...multi.connectors.map((x) => model.connectorById.get(x))].flatMap((x) => (x ? [x.locked] : []));
    commands.lockItems(multi.annotations, multi.connectors, !(flags.length > 0 && flags.every(Boolean)));
  }
}

/** An entry of the context menu chosen, for its target, at the plan point the right click aimed at; hide, isolate,
 *  the pin and a group act on the selection when the device aimed at belongs to it (the v1's rule). */
export function runMenu(target: ContextTarget, id: string, plan: Point, commands: EditCommands, model: Model, selectedHosts: readonly string[]): void {
  if (id === "grid") return commands.grid();
  if (id.startsWith("clip:")) {
    const what = target.kind === "node" || target.kind === "annotation" || target.kind === "connector" ? { kind: target.kind, id: target.id } : null;
    if (id === "clip:paste") commands.pasteFromMenu(plan);
    else if (id === "clip:pasteCode") commands.pasteCodeFromMenu(plan);
    else if (id === "clip:copy" || id === "clip:cut") commands.copyFromMenu(id === "clip:cut", what);
    else if (id === "clip:duplicate") commands.duplicate(what);
    return;
  }
  if (target.kind === "pane") {
    if (id === "fit") commands.fit();
    else if (id === "clear") commands.clearSelection();
    else if (id === "insert:image") commands.pickImage();
    else if (id.startsWith("insert:")) commands.insertAt(id.slice(7), plan);
    return;
  }
  if (id === "center") return void commands.reveal({ kind: target.kind, id: target.id });
  if (target.kind === "node") {
    const hosts = selectedHosts.includes(target.id) ? selectedHosts : [target.id];
    if (id === "hide") commands.hideHosts(hosts);
    else if (id === "isolate") commands.isolateHosts(hosts);
    else if (id === "unpin") commands.unpin(hosts);
    else if (id === "note") attachNote(commands, "device", target.id);
    else if (id === "connect") commands.connectorCreate({ start: { kind: "device", ref: target.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
    else if (id === "group") commands.groupCreate(v1("shell:context.defaultGroup"), hosts.length ? [...hosts] : [target.id]);
    // the v1's "align horizontally" is the same y (the centres' rule), "vertically" the same x
    else if (id.startsWith("align:")) commands.align(id.slice(6) === "horizontal" ? "middle" : "center");
    return;
  }
  if (target.kind === "group") {
    const group = model.groupById.get(target.id);
    const members = group ? group.members.filter((host) => model.nodeByHost.has(host)) : [];
    if (id === "members") commands.selectHosts(members);
    else if (id === "hide") commands.hideHosts(members);
    else if (id === "isolate") commands.isolateHosts(members);
    else if (id === "note") attachNote(commands, "group", target.id);
    else if (id === "connect") commands.connectorCreate({ start: { kind: "group", ref: target.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
    else if (id === "delete") commands.groupDelete(target.id);
    return;
  }
  if (target.kind === "connector") {
    const c = model.connectorById.get(target.id);
    if (!c) return;
    if (id === "reverse") commands.connectorUpdate(c.id, { start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });
    else if (id.startsWith("heads:")) { const [start, end] = id.slice(6).split("/") as ["none" | "arrow", "none" | "arrow"]; commands.connectorUpdate(c.id, { heads: { start, end } }); }
    else if (id.startsWith("route:")) commands.connectorUpdate(c.id, { route: id.slice(6) as typeof c.route });
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
  const cell = target.cell ?? [0, 0], range = target.range ?? { r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] };
  if (id === "cell:edit") commands.requestEdit(a.id, cell);
  else if (id === "cell:merge") tableOp((content) => merge(content, range));
  else if (id === "cell:split") tableOp((content) => split(content, cell[0], cell[1]));
  else if (id === "row:above") tableOp((content) => insertRow(content, range.r0));
  else if (id === "row:below") tableOp((content) => insertRow(content, range.r1 + 1));
  else if (id === "row:delete") tableOp((content) => deleteRow(content, cell[0]));
  else if (id === "col:left") tableOp((content) => insertColumn(content, range.c0));
  else if (id === "col:right") tableOp((content) => insertColumn(content, range.c1 + 1));
  else if (id === "col:delete") tableOp((content) => deleteColumn(content, cell[1]));
  else if (id === "header") tableOp((content) => ({ ...content, header: !content.header }));
  else if (id === "text") commands.requestEdit(a.id, null);
  else if (id === "lock") commands.annotationUpdate(a.id, { locked: !a.locked });
  else if (id === "plane") commands.annotationUpdate(a.id, { z: a.z === "back" ? "front" : "back" });
  else if (id === "detach") commands.annotationDetach(a.id);
  else if (id === "connect") commands.connectorCreate({ start: { kind: "annotation", ref: a.id, side: "auto" }, end: { kind: "free", x: Math.round(plan.x + DEFAULT_LENGTH), y: Math.round(plan.y) } });
  else if (id === "delete") commands.annotationDelete(a.id);
}

// What a bar button, a volet choice or a context-menu entry does, through fake edit commands: the identities a write
// names (a group by its own id), the text settings, the device's "more", the connector and table entries.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { build } from "@engine/canvas/model";
import { DEFAULT_STYLE } from "@engine/canvas/annotations";
import type { Intent, PageData } from "@engine/canvas/types";
import { targetOf } from "@engine/app/state/floating";
import { multiOf } from "@engine/app/state/selection";
import { runBar, runMenu } from "../src/state/bar-actions";
import type { EditCommands } from "../src/state/edit-commands";
import { parseSnapshot } from "../src/api/run";

const FIXTURES = new URL("../../contracts/fixtures/", import.meta.url);
const snapshot = parseSnapshot(JSON.parse(readFileSync(new URL("snapshot-minimal.json", FIXTURES), "utf8")));
if (!snapshot) throw new Error("the minimal snapshot fixture does not parse");
const [host, other] = snapshot.nodes.map((node) => node.hostname);
const at = "2026-10-16T10:00:00Z";
const intent = {
  intent_version: "1.6.0", infrastructure: snapshot.source.infrastructure, revision: 3, updated_at: at, pins: [], device_colors: [], type_colors: [],
  groups: [
    { id: "g1-1", label: "Core", description: "", members: [host], style: { hue: "blue", shape: "rectangle", radius: 16, fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24, label_position: "top_left", label_placement: "inside", label_size: 13, label_weight: "semibold", label_font: "sans", label_color: "hue" }, author: "o", at },
    { id: "g1-2", label: "Edge", description: "", members: [], style: { hue: "teal", shape: "rectangle", radius: 16, fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24, label_position: "top_left", label_placement: "inside", label_size: 13, label_weight: "semibold", label_font: "sans", label_color: "hue" }, author: "o", at },
  ],
  annotations: [
    { id: "a2-1", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 220, h: 80, z: "front", locked: false, leader: false, content: { kind: "note", text: "Hello" }, style: DEFAULT_STYLE.note, author: "o", at },
    { id: "a2-2", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 160, h: 52, z: "front", locked: false, leader: false, content: { kind: "table", header: false, rows: [["a", "b"], ["c", "d"]], merges: [] }, style: DEFAULT_STYLE.table, author: "o", at },
  ],
  connectors: [{ id: "c3-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "free", x: 100, y: 0 }, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, style: { hue: "slate", stroke_width: 2, stroke_style: "solid" }, author: "o", at }],
} as unknown as Intent;
const model = build({ snapshot, ingest: null, origin: "test", catalogue: {}, intent } as PageData);
const toile = { state: { positions: new Map([[host, { x: 10, y: 20 }]]) }, boxes: new Map([[host, { w: 200, h: 60 }]]) } as never;

function fakeCommands() {
  const calls: [string, unknown[]][] = [];
  const commands = new Proxy({} as EditCommands, { get: (_, name: string) => (...args: unknown[]) => { calls.push([name, args]); return true; } });
  return { commands, calls, run: { commands, model, toile, pickFile: () => calls.push(["pickFile", []]) } };
}
const device = targetOf(model, { kind: "node", id: host }, multiOf([{ kind: "node", id: host }]));
const note = targetOf(model, { kind: "annotation", id: "a2-1" }, multiOf([{ kind: "annotation", id: "a2-1" }]));
const table = targetOf(model, { kind: "annotation", id: "a2-2" }, multiOf([{ kind: "annotation", id: "a2-2" }]));
const connector = targetOf(model, { kind: "connector", id: "c3-1" }, multiOf([{ kind: "connector", id: "c3-1" }]));
if (!device || !note || !table || !connector) throw new Error("no target");

describe("the bar actions", () => {
  it("adds a device to a group by the group's own id, creates a group, removes a device from one", () => {
    const { calls, run } = fakeCommands();
    runBar("group", "g1-2", device, run);
    expect(calls).toEqual([["groupAdd", ["g1-2", [host]]]]);
    runBar("group", "new", device, run);
    expect(calls[1][0]).toBe("groupCreate");
    runBar("more", "remove:g1-1", device, run);
    expect(calls[2]).toEqual(["groupRemove", ["g1-1", [host]]]);
  });

  it("runs the device's buttons: hue, pin, hide, isolate, the more menu", () => {
    const { calls, run } = fakeCommands();
    runBar("hue", "amber", device, run);
    runBar("hue", null, device, run);
    runBar("pin", null, device, run);
    runBar("hide", null, device, run);
    runBar("isolate", null, device, run);
    runBar("more", "copy", device, run);
    runBar("more", "reset", device, run);
    runBar("more", "connect", device, run);
    expect(calls.map(([name]) => name)).toEqual(["color", "color", "pinHere", "hideHosts", "isolateHosts", "copyName", "removeIntent", "connectorCreate"]);
    expect(calls[0][1]).toEqual([host, "amber"]);
    expect(calls[1][1]).toEqual([host, null]);
    const [fields] = calls[7][1] as [{ start: unknown; end: { x: number; y: number } }];
    expect(fields.start).toEqual({ kind: "device", ref: host, side: "auto" });
    expect(fields.end).toEqual({ kind: "free", x: 10 + 100 + 160, y: 20 });
  });

  it("writes a note's text settings: size, bold, alignment, colour, font, vertical alignment, the layers", () => {
    const { calls, run } = fakeCommands();
    runBar("text_size", "20", note, run);
    runBar("bold", null, note, run);
    runBar("text_align", null, note, run);
    runBar("text_style", "color:hue", note, run);
    runBar("text_style", "font:mono", note, run);
    runBar("text_style", "valign:middle", note, run);
    runBar("back", null, note, run);
    expect(calls.map(([, args]) => args[1])).toEqual([
      { style: { text_size: 20 } }, { style: { text_weight: "bold" } }, { style: { text_align: "center" } },
      { style: { text_color: "hue" } }, { style: { text_font: "mono" } }, { style: { text_valign: "middle" } }, { z: "back" },
    ]);
    expect(calls.every(([name, args]) => name === "annotationUpdate" && args[0] === "a2-1")).toBe(true);
  });

  it("grows a table, cycles a connector's arrowheads, reverses it", () => {
    const { calls, run } = fakeCommands();
    runBar("add_row", null, table, run);
    runBar("header", null, table, run);
    runBar("heads", null, connector, run);
    runBar("reverse", null, connector, run);
    expect(calls[0][0]).toBe("tableUpdate");
    expect((calls[0][1][1] as { rows: unknown[] }).rows).toHaveLength(3);
    expect((calls[1][1][1] as { header: boolean }).header).toBe(true);
    expect(calls[2]).toEqual(["connectorUpdate", ["c3-1", { heads: { start: "arrow", end: "none" } }]]);
    expect((calls[3][1][1] as { heads: unknown }).heads).toEqual({ start: "arrow", end: "none" });
  });

  it("runs the context menu: the pane inserts, a device acts on the selection it belongs to, a table cell edits", () => {
    const { commands, calls } = fakeCommands();
    const plan = { x: 40, y: 60 };
    runMenu({ kind: "pane" }, "insert:note", plan, commands, model, []);
    runMenu({ kind: "pane" }, "insert:image", plan, commands, model, []);
    runMenu({ kind: "node", id: host }, "hide", plan, commands, model, [host, other]);
    runMenu({ kind: "node", id: host }, "center", plan, commands, model, []);
    runMenu({ kind: "annotation", id: "a2-2", cell: [1, 0] }, "cell:edit", plan, commands, model, []);
    runMenu({ kind: "connector", id: "c3-1" }, "route:elbow", plan, commands, model, []);
    expect(calls).toEqual([
      ["insertAt", ["note", plan]], ["pickImage", []], ["hideHosts", [[host, other]]], ["reveal", [{ kind: "node", id: host }]],
      ["requestEdit", ["a2-2", [1, 0]]], ["connectorUpdate", ["c3-1", { route: "elbow" }]],
    ]);
    vi.restoreAllMocks();
  });
});

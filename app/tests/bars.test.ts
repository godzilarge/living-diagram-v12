// What a contextual bar shows: the mockup's device bar and note bar, the v1's for the rest, on a synthetic model
// with an intent (a pinned device, an attached note, a free shape, a connector, a group).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import { DEFAULT_STYLE } from "@engine/canvas/annotations";
import type { Intent, PageData } from "@engine/canvas/types";
import { targetOf } from "@engine/app/state/floating";
import { empty, multiOf } from "@engine/app/state/selection";
import type { Translate } from "../src/i18n";
import { barLabel, entriesOf, nextHeads, nextTextAlign } from "../src/state/bars";
import type { BarButton } from "../src/state/bars";
import { parseSnapshot } from "../src/api/run";

const FIXTURES = new URL("../../contracts/fixtures/", import.meta.url);
const snapshot = parseSnapshot(JSON.parse(readFileSync(new URL("snapshot-minimal.json", FIXTURES), "utf8")));
if (!snapshot) throw new Error("the minimal snapshot fixture does not parse");
const hosts = snapshot.nodes.map((node) => node.hostname);
const [host, other] = hosts;
const at = "2026-10-16T10:00:00Z";
const intent: Intent = {
  intent_version: "1.6.0", infrastructure: snapshot.source.infrastructure, revision: 3, updated_at: at,
  pins: [{ hostname: host, x: 0, y: 0, author: "o", at }],
  device_colors: [{ hostname: host, hue: "amber", author: "o", at }],
  type_colors: [],
  groups: [{ id: "g1-1", label: "Core", description: "", members: [host, other], style: { hue: "blue", shape: "rectangle", radius: 16, fill_opacity: 8, stroke_width: 2, stroke_style: "dashed", padding: 24, label_position: "top_left", label_placement: "inside", label_size: 13, label_weight: "semibold", label_font: "sans", label_color: "hue" }, author: "o", at }],
  annotations: [
    { id: "a2-1", anchor: { kind: "device", ref: host }, x: 60, y: -120, w: 220, h: 80, z: "front", locked: false, leader: true, content: { kind: "note", text: "Hello" }, style: DEFAULT_STYLE.note, author: "o", at },
    { id: "a2-2", anchor: { kind: "free", ref: null }, x: 300, y: 300, w: 200, h: 120, z: "back", locked: true, leader: false, content: { kind: "shape", shape: "rectangle", label: "" }, style: DEFAULT_STYLE.shape, author: "o", at },
  ],
  connectors: [{ id: "c3-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "free", x: 100, y: 0 }, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, style: { hue: "slate", stroke_width: 2, stroke_style: "solid" }, author: "o", at }],
} as unknown as Intent;
const data: PageData = { snapshot, ingest: null, origin: "test", catalogue: {}, intent };
const model = build(data);
// the key itself as the text: the words are the catalogues' business (guarded elsewhere)
const t: Translate = (key, values) => (values && "value" in values ? `${key}=${String(values.value)}` : key);
const ids = (entries: ReturnType<typeof entriesOf>) => entries.map((e) => e.id);
const find = (entries: ReturnType<typeof entriesOf>, id: string): BarButton => entries.find((e) => e.id === id) as BarButton;

describe("the contextual bars", () => {
  it("gives a device the mockup's bar: hue | pin, lock | group, align | hide, isolate | more", () => {
    const target = targetOf(model, { kind: "node", id: host }, multiOf([{ kind: "node", id: host }]));
    if (!target) throw new Error("no target for a device");
    const entries = entriesOf(t, model, target);
    expect(ids(entries)).toEqual(["hue", "sep", "pin", "lock", "sep", "group", "align", "sep", "hide", "isolate", "sep", "more"]);
    const hue = find(entries, "hue");
    expect(hue.swatch).toBe("amber");
    expect(hue.volet).toEqual({ kind: "hues", value: "amber", inherited: "amber", allowDefault: true });
    expect(find(entries, "pin").pressed).toBe(true);
    expect(find(entries, "lock").disabled).toBe(true);
    expect(find(entries, "align").disabled).toBe(true);
    // the group already holds this device: the menu offers a new group only, as an action
    expect(find(entries, "group").volet).toBeUndefined();
    const more = find(entries, "more").volet;
    // the group's own id in the menu (a write names the group, never the row), "remove from" for each group it is in
    expect(more?.kind === "menu" && more.items.map((i) => ("id" in i ? i.id : i.kind))).toEqual(["note", "connect", "copy", "remove:g1-1", "reset"]);
    expect(barLabel(t, target)).toBe("edit:bar.label");
  });

  it("gives a note the mockup's bar, italic, underline and the title position disabled, the layers disabled when attached", () => {
    const target = targetOf(model, { kind: "annotation", id: "a2-1" }, multiOf([{ kind: "annotation", id: "a2-1" }]));
    if (!target) throw new Error("no target for a note");
    const entries = entriesOf(t, model, target);
    expect(ids(entries)).toEqual(["text_size", "sep", "bold", "italic", "underline", "sep", "text_align", "hue", "text_style", "title_position", "sep", "back", "front", "sep", "lock", "duplicate", "delete"]);
    expect(find(entries, "text_size").value).toBe(String(DEFAULT_STYLE.note.text_size));
    const sizes = find(entries, "text_size").volet;
    // the mockup's list says the bare numbers; the note's own size joins them when it is not one of the six
    expect(sizes?.kind === "list" && sizes.options.map((o) => o.label)).toEqual(["12", "13", "14", "16", "20", "24", "32"]);
    expect(find(entries, "text_size").label).toBe("edit:bar.textSizeOf=edit:bar.px=13");
    // the text's own settings: colour, font, vertical alignment, the current ones checked
    const text = find(entries, "text_style").volet;
    const checked = text?.kind === "menu" ? text.items.flatMap((i) => ("id" in i && i.checked ? [i.id] : [])) : [];
    expect(checked).toEqual(["color:ink", "font:sans", "valign:top"]);
    for (const id of ["italic", "underline", "title_position", "back", "front"]) expect(find(entries, id).disabled, id).toBe(true);
    expect(find(entries, "delete").danger).toBe(true);
  });

  it("gives a free shape its fills, border and corners, and its layers", () => {
    const target = targetOf(model, { kind: "annotation", id: "a2-2" }, multiOf([{ kind: "annotation", id: "a2-2" }]));
    if (!target) throw new Error("no target for a shape");
    const entries = entriesOf(t, model, target);
    expect(ids(entries)).toEqual(["hue", "fill_opacity", "stroke_style", "radius", "sep", "edit_label", "sep", "back", "front", "sep", "lock", "duplicate", "delete"]);
    expect(find(entries, "back").pressed).toBe(true);
    expect(find(entries, "back").disabled).toBeUndefined();
    expect(find(entries, "lock").pressed).toBe(true);
  });

  it("gives a connector, a group and a multiple selection their bars", () => {
    const connector = targetOf(model, { kind: "connector", id: "c3-1" }, multiOf([{ kind: "connector", id: "c3-1" }]));
    const group = targetOf(model, { kind: "group", id: "g1-1" }, multiOf([{ kind: "group", id: "g1-1" }]));
    if (!connector || !group) throw new Error("no target");
    expect(ids(entriesOf(t, model, connector))).toEqual(["heads", "route", "sep", "hue", "stroke_width", "line_style", "sep", "reverse", "lock", "sep", "delete"]);
    expect(ids(entriesOf(t, model, group))).toEqual(["hue", "shape", "label_position", "sep", "select_members", "paint_members", "sep", "delete"]);
    // the group menu of a device outside every group: its own id, never a prefixed one
    const lone = entriesOf(t, model, targetOf(model, { kind: "node", id: other }, multiOf([{ kind: "node", id: other }])) as NonNullable<ReturnType<typeof targetOf>>);
    expect(find(lone, "group").volet).toBeUndefined(); // the only group holds it already
    const multi = targetOf(model, null, multiOf([{ kind: "node", id: host }, { kind: "node", id: other }, { kind: "annotation", id: "a2-1" }]));
    if (!multi) throw new Error("no target for a selection");
    const entries = entriesOf(t, model, multi);
    expect(ids(entries)).toEqual(["hue", "sep", "group", "align", "sep", "hide", "isolate", "sep", "duplicate", "delete", "lock"]);
    const align = find(entries, "align").volet;
    expect(align?.kind === "align" && align.grid).toBe(true);
    expect(align?.kind === "align" && align.modes).toContain("distribute-vertical");
    expect(barLabel(t, multi)).toBe("edit:bar.label");
    expect(targetOf(model, { kind: "link", id: "x" }, empty())).toBeNull();
  });

  it("cycles the arrowheads and the text alignment", () => {
    expect(nextHeads({ heads: { start: "none", end: "none" } })).toEqual({ start: "none", end: "arrow" });
    expect(nextHeads({ heads: { start: "arrow", end: "arrow" } })).toEqual({ start: "none", end: "none" });
    expect(nextTextAlign("left")).toBe("center");
    expect(nextTextAlign("right")).toBe("left");
  });
});

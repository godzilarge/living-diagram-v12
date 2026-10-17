// What a contextual bar shows for the selected element (DESIGN.md, Contextual bars; the approved mockup's device
// bar and note bar, the same grammar for the shape, table, image, code block, connector, group and a multiple
// selection, whose functions come from the v1): the buttons from left to right, each with its words (the tooltip),
// its icon, its state (pressed, disabled with a reason), and what it opens (a volet of hues, a list of values, the
// align grid, a menu). A button says what it does; `edit-commands.ts` does it. Nothing here touches the DOM or the
// API. Pure, tested under Node. The target comes from the v1's `targetOf` (an annotation, a connector, a group, a
// device of the run, or several elements; never a cable, a bundle, a cluster: they come from the data).
import { HUES, hueLabel, hueOfNode } from "@engine/canvas/hues";
import { CODE, CODE_FONTS, CODE_SIZES, fitHeight, lineCount } from "@engine/app/code/geometry";
import { LANGUAGE_LABEL, detectLanguage } from "@engine/app/code/languages";
import { POSITIONS, STYLE_LABEL } from "@engine/canvas/groups";
import { movableCount, multiHues } from "@engine/app/state/floating";
import type { BarAlign, Target } from "@engine/app/state/floating";
import type { Annotation, Connector, Group, Model } from "@engine/canvas/types";
import type { Multi } from "@engine/app/state/selection";
import type { Translate } from "../i18n";

export type { Target };

export type BarIcon =
  | "pin" | "unpin" | "lock" | "unlock" | "group" | "align" | "hide" | "isolate" | "more"
  | "textSize" | "bold" | "italic" | "underline" | "alignLeft" | "alignCenter" | "alignRight" | "textColor" | "titlePosition"
  | "textStyle" | "back" | "front" | "duplicate" | "delete" | "editLabel" | "fill" | "border" | "corners" | "addRow" | "addColumn" | "header"
  | "replace" | "opacity" | "heads" | "route" | "width" | "lineStyle" | "reverse" | "shape" | "labelPosition" | "selectMembers" | "paint"
  | "codeLanguage" | "codeFont" | "highlight" | "lineNumbers" | "fitHeight";

export type Choice = Readonly<{ value: string; label: string }>;
/** A row of a menu volet: an action, a choice (`checked` says which), or a heading over the rows under it. */
export type MenuEntry = Readonly<{ id: string; label: string; checked?: boolean }> | Readonly<{ kind: "heading"; label: string }>;
export type Volet =
  /** The twelve hues of the contract; `value` the one posed (null: inherited or mixed), `inherited` the one in force. */
  | Readonly<{ kind: "hues"; value: string | null; inherited: string | null; allowDefault: boolean }>
  /** A list of values, the current one checked. */
  | Readonly<{ kind: "list"; title: string; value: string; options: readonly Choice[] }>
  /** Align and distribute: the modes offered (distribute from three elements), snap to a grid from three. */
  | Readonly<{ kind: "align"; count: number; modes: readonly BarAlign[]; grid: boolean }>
  | Readonly<{ kind: "menu"; title: string; items: readonly MenuEntry[] }>
  | Readonly<{ kind: "codeLanguage"; value: string; text: string }>
  | Readonly<{ kind: "codeFont"; value: string }>;

export type BarButton = Readonly<{
  id: string;
  label: string;
  icon: BarIcon | null;
  /** A hue swatch on the face instead of an icon (the hue button). */
  swatch?: string;
  /** A value written on the face (the text size). */
  value?: string;
  shortcut?: readonly string[];
  /** The same keys for `aria-keyshortcuts` ("Control+D", "Delete"). */
  aria?: string;
  pressed?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  volet?: Volet;
}>;
export type BarEntry = BarButton | Readonly<{ id: "sep" }>;
const SEP: BarEntry = { id: "sep" };

/** The text sizes of a note (the mockup's volet). */
export const TEXT_SIZES: readonly number[] = [12, 14, 16, 20, 24, 32];
export const FILLS: readonly number[] = [0, 25, 50, 100];
export const RADII: readonly number[] = [0, 6, 12, 24];
export const OPACITIES: readonly number[] = [25, 50, 75, 100];
export const WIDTHS: readonly number[] = [1, 2, 3, 4];
export const ALIGN_MODES: readonly BarAlign[] = ["left", "center", "right", "top", "middle", "bottom"];
export const DISTRIBUTE_MODES: readonly BarAlign[] = ["distribute-horizontal", "distribute-vertical"];
/** Snap to a grid and distribute need three elements (two are already a row). */
export const GRID_MIN = 3;
const HEAD_CYCLE = ["none/none", "none/arrow", "arrow/none", "arrow/arrow"] as const;
const HEAD_WORD: Readonly<Record<string, "none" | "end" | "start" | "both">> = { "none/none": "none", "none/arrow": "end", "arrow/none": "start", "arrow/arrow": "both" };
const ALIGN_CYCLE = ["left", "center", "right"] as const;

const button = (id: string, label: string, icon: BarIcon | null, extra: Partial<BarButton> = {}): BarButton => ({ id, label, icon, ...extra });
/** The written keys (the page's words) and their `aria-keyshortcuts` (the standard's names). */
const ARIA_DELETE = "Delete", ARIA_ENTER = "Enter";
const keys = (shortcut: readonly string[], aria: string): Partial<BarButton> => ({ shortcut, aria });
const list = (title: string, value: string | number, options: readonly Choice[]): Volet => ({ kind: "list", title, value: String(value), options });

/** The hue button: its face is the hue in force, its words say it ("Hue: amber", "Hue: mixed"). */
function hueButton(t: Translate, labelKey: "edit:bar.hueOf", shown: readonly string[], volet: Extract<Volet, { kind: "hues" }>): BarButton {
  const word = shown.length === 1 ? hueLabel(shown[0]) : t("edit:bar.hueMixed");
  return button("hue", t(labelKey, { value: word }), null, { swatch: shown[0] ?? "slate", volet });
}
const lockButton = (t: Translate, locked: boolean): BarButton => button("lock", t(locked ? "edit:bar.unlock" : "edit:bar.lock"), locked ? "lock" : "unlock", { pressed: locked });
const duplicateButton = (t: Translate): BarButton => button("duplicate", t("edit:bar.duplicate"), "duplicate", keys([t("ui:keys.ctrl"), "D"], "Control+D"));
const deleteButton = (t: Translate, label = t("edit:bar.delete")): BarButton => button("delete", label, "delete", { ...keys([t("edit:keys.delete")], ARIA_DELETE), danger: true });
/** Behind and in front, the rail on the current layer; an attached annotation is drawn above its anchor (React Flow:
 *  a child stays above its parent), so "in front" is its only true layer. */
function planeButtons(t: Translate, z: "back" | "front", attached: boolean): BarButton[] {
  const held = attached ? { disabled: true, disabledReason: t("edit:bar.frontAttached") } : {};
  return [button("back", t("edit:bar.back"), "back", { pressed: z === "back", ...held }), button("front", t("edit:bar.front"), "front", { pressed: z === "front", ...held })];
}
const px = (t: Translate, value: number): string => t("edit:bar.px", { value });
const percent = (t: Translate, value: number): string => t("edit:bar.percent", { value });

/** The text's own settings of a note (the v1 inspector's: colour in ink or in the hue, font, vertical alignment), as one
 *  menu of three choices; the bar's words say the three values. */
function textStyleButton(t: Translate, s: Annotation["style"]): BarButton {
  const colour = (value: string): string => t(value === "hue" ? "edit:volet.textHue" : "edit:volet.textInk");
  const font = (value: string): string => t(value === "mono" ? "edit:volet.fontMono" : "edit:volet.fontSans");
  const valign = (value: string): string => t(`edit:volet.valigns.${value as "top" | "middle" | "bottom"}`);
  const items: MenuEntry[] = [
    { kind: "heading", label: t("edit:volet.textColor") },
    ...["ink", "hue"].map((value) => ({ id: `color:${value}`, label: colour(value), checked: s.text_color === value })),
    { kind: "heading", label: t("edit:volet.textFont") },
    ...["sans", "mono"].map((value) => ({ id: `font:${value}`, label: font(value), checked: s.text_font === value })),
    { kind: "heading", label: t("edit:volet.textValign") },
    ...["top", "middle", "bottom"].map((value) => ({ id: `valign:${value}`, label: valign(value), checked: s.text_valign === value })),
  ];
  const words = [colour(s.text_color), font(s.text_font), valign(s.text_valign)].join(t("edit:volet.join"));
  return button("text_style", t("edit:bar.textStyle", { value: words }), "textStyle", { volet: { kind: "menu", title: t("edit:bar.textStyleTitle"), items } });
}

/** The note bar of the approved mockup: size | bold, italic, underline | alignment, colour, title position | behind,
 *  in front | lock, duplicate, delete. Italic, underline and the title position wait for their lot (rich text). */
function noteEntries(t: Translate, a: Annotation): BarEntry[] {
  const s = a.style;
  const align = (ALIGN_CYCLE as readonly string[]).includes(s.text_align) ? (s.text_align as (typeof ALIGN_CYCLE)[number]) : "left";
  const sizes = TEXT_SIZES.includes(s.text_size) ? TEXT_SIZES : [...TEXT_SIZES, s.text_size].sort((x, y) => x - y);
  return [
    button("text_size", t("edit:bar.textSizeOf", { value: px(t, s.text_size) }), null, { value: String(s.text_size), volet: list(t("edit:volet.sizes"), s.text_size, sizes.map((size) => ({ value: String(size), label: String(size) }))) }),
    SEP,
    button("bold", t("edit:bar.bold"), "bold", { pressed: s.text_weight === "bold", ...keys([t("ui:keys.ctrl"), "B"], "Control+B") }),
    button("italic", t("edit:bar.italic"), "italic", { disabled: true, disabledReason: t("edit:bar.italicSoon") }),
    button("underline", t("edit:bar.underline"), "underline", { disabled: true, disabledReason: t("edit:bar.underlineSoon") }),
    SEP,
    button("text_align", t("edit:bar.textAlign", { value: t(`edit:bar.textAligns.${align}`) }), align === "center" ? "alignCenter" : align === "right" ? "alignRight" : "alignLeft"),
    hueButton(t, "edit:bar.hueOf", [s.hue], { kind: "hues", value: s.hue, inherited: null, allowDefault: false }),
    textStyleButton(t, s),
    button("title_position", t("edit:bar.titlePosition"), "titlePosition", { disabled: true, disabledReason: t("edit:bar.titlePositionSoon") }),
    SEP,
    ...planeButtons(t, a.z, a.anchor.kind !== "free"),
    SEP,
    lockButton(t, a.locked),
    duplicateButton(t),
    deleteButton(t),
  ];
}

function shapeEntries(t: Translate, a: Annotation, shape: "rectangle" | "ellipse"): BarEntry[] {
  const s = a.style;
  const fillWord = (f: number): string => (f === 0 ? t("edit:bar.fillNone") : f === 100 ? t("edit:bar.fillFull") : percent(t, f));
  const corners = shape === "ellipse" ? [] : [button("radius", t("edit:bar.corners", { value: s.radius ? px(t, s.radius) : t("edit:bar.square") }), "corners",
    { volet: list(t("edit:volet.corners"), s.radius, RADII.map((r) => ({ value: String(r), label: r ? px(t, r) : t("edit:bar.square") }))) })];
  return [
    hueButton(t, "edit:bar.hueOf", [s.hue], { kind: "hues", value: s.hue, inherited: null, allowDefault: false }),
    button("fill_opacity", t("edit:bar.fill", { value: fillWord(s.fill_opacity) }), "fill", { volet: list(t("edit:volet.fill"), s.fill_opacity, FILLS.map((f) => ({ value: String(f), label: fillWord(f) }))) }),
    button("stroke_style", t("edit:bar.border", { value: t(`edit:bar.strokes.${s.stroke_style}`) }), "border", { volet: list(t("edit:volet.border"), s.stroke_style, ["solid", "dashed", "dotted", "none"].map((v) => ({ value: v, label: t(`edit:bar.strokes.${v as "solid"}`) }))) }),
    ...corners,
    SEP,
    button("edit_label", t("edit:bar.editLabel"), "editLabel", keys([t("edit:keys.enter")], ARIA_ENTER)),
    SEP,
    ...planeButtons(t, a.z, a.anchor.kind !== "free"),
    SEP,
    lockButton(t, a.locked),
    duplicateButton(t),
    deleteButton(t),
  ];
}

function tableEntries(t: Translate, a: Annotation, header: boolean): BarEntry[] {
  return [
    button("add_row", t("edit:bar.addRow"), "addRow"),
    button("add_column", t("edit:bar.addColumn"), "addColumn"),
    button("header", t("edit:bar.header"), "header", { pressed: header }),
    SEP,
    hueButton(t, "edit:bar.hueOf", [a.style.hue], { kind: "hues", value: a.style.hue, inherited: null, allowDefault: false }),
    SEP,
    ...planeButtons(t, a.z, a.anchor.kind !== "free"),
    SEP,
    lockButton(t, a.locked),
    deleteButton(t),
  ];
}

function imageEntries(t: Translate, a: Annotation): BarEntry[] {
  return [
    button("replace", t("edit:bar.replace"), "replace"),
    button("opacity", t("edit:bar.opacity", { value: percent(t, a.style.opacity) }), "opacity", { volet: list(t("edit:volet.opacity"), a.style.opacity, OPACITIES.map((o) => ({ value: String(o), label: percent(t, o) }))) }),
    SEP,
    ...planeButtons(t, a.z, a.anchor.kind !== "free"),
    SEP,
    lockButton(t, a.locked),
    deleteButton(t),
  ];
}

function codeEntries(t: Translate, a: Annotation, c: Extract<Annotation["content"], { kind: "code" }>): BarEntry[] {
  const found = detectLanguage(c.text);
  const hint = found.sure && found.id !== c.language && found.id !== "plain";
  const language = LANGUAGE_LABEL[c.language] || c.language;
  const font = CODE_FONTS.find((f) => f.id === c.font);
  const total = lineCount(c.text);
  const fitted = a.h === fitHeight(total, a.style.text_size);
  return [
    hueButton(t, "edit:bar.hueOf", [a.style.hue], { kind: "hues", value: a.style.hue, inherited: null, allowDefault: false }),
    SEP,
    button("code_language", hint ? t("edit:bar.codeLanguageHint", { value: language, detected: LANGUAGE_LABEL[found.id] }) : t("edit:bar.codeLanguage", { value: language }), "codeLanguage", { value: language, volet: { kind: "codeLanguage", value: c.language, text: c.text } }),
    button("code_font", t("edit:bar.codeFont", { value: font ? font.family : c.font }), "codeFont", { value: font ? font.short : c.font, volet: { kind: "codeFont", value: c.font } }),
    ...(c.language === "plain" ? [] : [button("code_highlight", t(c.highlight ? "edit:bar.highlightOn" : "edit:bar.highlightOff"), "highlight", { pressed: c.highlight })]),
    button("code_numbers", t(c.line_numbers ? "edit:bar.numbersOn" : "edit:bar.numbersOff"), "lineNumbers", { pressed: c.line_numbers }),
    ...(fitted ? [] : [button("code_fit", total > CODE.FIT_MAX ? t("edit:bar.fitHeightMax", { max: CODE.FIT_MAX }) : t("edit:bar.fitHeight"), "fitHeight")]),
    button("text_size", t("edit:bar.codeSize", { value: px(t, a.style.text_size) }), null, { value: String(a.style.text_size), volet: list(t("edit:volet.sizes"), a.style.text_size, CODE_SIZES.map((size) => ({ value: String(size), label: String(size) }))) }),
    SEP,
    ...planeButtons(t, a.z, a.anchor.kind !== "free"),
    SEP,
    lockButton(t, a.locked),
    duplicateButton(t),
    deleteButton(t),
  ];
}

function annotationEntries(t: Translate, a: Annotation): BarEntry[] {
  const c = a.content;
  if (c.kind === "note") return noteEntries(t, a);
  if (c.kind === "shape") return shapeEntries(t, a, c.shape);
  if (c.kind === "table") return tableEntries(t, a, c.header);
  if (c.kind === "image") return imageEntries(t, a);
  return codeEntries(t, a, c);
}

/** The connector: arrowheads (a cycle of four), route | hue, thickness, line style | reverse, lock | delete. */
function connectorEntries(t: Translate, c: Connector): BarEntry[] {
  const heads = HEAD_WORD[`${c.heads.start}/${c.heads.end}`] ?? "none";
  const s = c.style;
  return [
    button("heads", t(`edit:bar.heads.${heads}`), "heads"),
    button("route", t("edit:bar.route", { value: t(`edit:bar.routes.${c.route}`) }), "route", { volet: list(t("edit:volet.route"), c.route, ["straight", "elbow", "curve"].map((v) => ({ value: v, label: t(`edit:bar.routes.${v as "straight"}`) }))) }),
    SEP,
    hueButton(t, "edit:bar.hueOf", [s.hue], { kind: "hues", value: s.hue, inherited: null, allowDefault: false }),
    button("stroke_width", t("edit:bar.width", { value: px(t, s.stroke_width) }), "width", { volet: list(t("edit:volet.width"), s.stroke_width, WIDTHS.map((w) => ({ value: String(w), label: px(t, w) }))) }),
    button("line_style", t("edit:bar.lineStyle", { value: t(`edit:bar.strokes.${s.stroke_style}`) }), "lineStyle", { volet: list(t("edit:volet.lineStyle"), s.stroke_style, ["solid", "dashed", "dotted"].map((v) => ({ value: v, label: t(`edit:bar.strokes.${v as "solid"}`) }))) }),
    SEP,
    button("reverse", t("edit:bar.reverse"), "reverse"),
    lockButton(t, c.locked),
    SEP,
    deleteButton(t),
  ];
}

/** The group: hue, shape, label position | select the members, apply the hue to them | delete. */
function groupEntries(t: Translate, model: Model, g: Group): BarEntry[] {
  const s = g.style;
  const present = g.members.some((host) => model.nodeByHost.has(host));
  return [
    hueButton(t, "edit:bar.hueOf", [s.hue], { kind: "hues", value: s.hue, inherited: null, allowDefault: false }),
    button("shape", t("edit:bar.shape", { value: t(`edit:bar.shapes.${s.shape}`) }), "shape", { volet: list(t("edit:volet.shape"), s.shape, ["rectangle", "ellipse"].map((v) => ({ value: v, label: t(`edit:bar.shapes.${v as "rectangle"}`) }))) }),
    button("label_position", t("edit:bar.labelPosition", { value: STYLE_LABEL[s.label_position] ?? s.label_position }), "labelPosition", { volet: list(t("edit:volet.labelPosition"), s.label_position, POSITIONS.map((p) => ({ value: p, label: STYLE_LABEL[p] ?? p }))) }),
    SEP,
    ...(present ? [button("select_members", t("edit:bar.selectMembers"), "selectMembers"), button("paint_members", t("edit:bar.paintMembers"), "paint"), SEP] : []),
    deleteButton(t, t("edit:bar.deleteGroup")),
  ];
}

const groupsOf = (model: Model, exclude: readonly string[] = []): { id: string; label: string }[] =>
  [...model.groupById.values()].filter((g) => !exclude.includes(g.id)).sort((a, b) => a.label.localeCompare(b.label)).map((g) => ({ id: g.id, label: g.label }));

/** The group button: an action when the run has no other group, else a menu (new group, add to…). */
function groupButton(t: Translate, model: Model, hosts: readonly string[], exclude: readonly string[]): BarButton {
  const others = groupsOf(model, exclude);
  const fresh = hosts.length > 1 ? t("edit:bar.groupNewOf", { count: hosts.length }) : t("edit:bar.groupNew");
  if (!others.length) return button("group", t("edit:bar.group"), "group", keys(["G"], "G"));
  const items: MenuEntry[] = [{ id: "new", label: fresh }, ...others.map((g) => ({ id: g.id, label: t("edit:bar.groupAddTo", { name: g.label }) }))];
  // (the entries carry the group's own id: a write names the group, never a row)
  return button("group", t("edit:bar.group"), "group", { ...keys(["G"], "G"), volet: { kind: "menu", title: t("edit:bar.group"), items } });
}

/** The align button: a volet from two movable elements, else disabled with the reason. */
function alignButton(t: Translate, count: number): BarButton {
  if (count < 2) return button("align", t("edit:bar.align"), "align", { disabled: true, disabledReason: t("edit:bar.alignNeeds") });
  const modes = count >= GRID_MIN ? [...ALIGN_MODES, ...DISTRIBUTE_MODES] : ALIGN_MODES;
  return button("align", t("edit:bar.align"), "align", { volet: { kind: "align", count, modes, grid: count >= GRID_MIN } });
}

/** The device bar of the approved mockup: hue | pin, lock | group, align | hide, isolate | more. */
function deviceEntries(t: Translate, model: Model, host: string): BarEntry[] {
  const node = model.nodeByHost.get(host);
  const own = model.colorByHost.get(host);
  const effective = node ? hueOfNode(model, node) : "slate";
  const pinned = model.pinByHost.has(host);
  const groups = model.groupsByHost.get(host) ?? [];
  const mine = groups.map((g) => g.id);
  const more: MenuEntry[] = [
    { id: "note", label: t("edit:bar.moreNote") },
    { id: "connect", label: t("edit:bar.moreConnect") },
    { id: "copy", label: t("edit:bar.moreCopy") },
    ...groups.map((g) => ({ id: `remove:${g.id}`, label: t("edit:bar.moreRemoveFrom", { name: g.label }) })),
    ...(pinned || own ? [{ id: "reset", label: t("edit:bar.moreReset") }] : []),
  ];
  return [
    hueButton(t, "edit:bar.hueOf", [effective], { kind: "hues", value: own ? own.hue : null, inherited: effective, allowDefault: true }),
    SEP,
    button("pin", t(pinned ? "edit:bar.unpin" : "edit:bar.pin"), pinned ? "unpin" : "pin", { pressed: pinned, ...keys(["P"], "P") }),
    button("lock", t("edit:bar.lock"), "lock", { disabled: true, disabledReason: t("edit:bar.lockSoon") }),
    SEP,
    groupButton(t, model, [host], mine),
    alignButton(t, 1),
    SEP,
    button("hide", t("edit:bar.hide"), "hide", keys(["H"], "H")),
    button("isolate", t("edit:bar.isolate"), "isolate"),
    SEP,
    button("more", t("edit:bar.more"), "more", { volet: { kind: "menu", title: t("edit:bar.more"), items: more } }),
  ];
}

/** Several elements: hue | group, align | hide, isolate (devices) | duplicate, delete, lock (annotations, connectors). */
function multiEntries(t: Translate, model: Model, multi: Multi): BarEntry[] {
  const out: BarEntry[] = [];
  const devices = multi.hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
  const hues = multiHues(model, multi, devices);
  if (hues) out.push(hueButton(t, "edit:bar.hueOf", hues.effective.slice(0, 2), { kind: "hues", value: hues.value, inherited: hues.inherited, allowDefault: hues.devicesOnly }), SEP);
  if (devices.length) out.push(groupButton(t, model, devices, []));
  out.push(alignButton(t, movableCount(model, multi).count));
  const editables = multi.annotations.length + multi.connectors.length;
  if (multi.hosts.length) out.push(SEP, button("hide", t("edit:bar.hideSelection"), "hide", keys(["H"], "H")), button("isolate", t("edit:bar.isolateSelection"), "isolate"));
  if (editables + multi.groups.length) {
    const flags = [...multi.annotations.map((id) => model.annotationById.get(id)), ...multi.connectors.map((id) => model.connectorById.get(id))].flatMap((x) => (x ? [x.locked] : []));
    const locked = flags.length > 0 && flags.every(Boolean);
    out.push(SEP);
    if (editables) out.push(duplicateButton(t));
    out.push(deleteButton(t, multi.hosts.length ? t("edit:bar.deleteKeepDevices") : undefined));
    if (editables) out.push(lockButton(t, locked));
  }
  return out;
}

/** The buttons of the bar for a target, left to right; `sep` is a hairline. */
export function entriesOf(t: Translate, model: Model, target: Target): BarEntry[] {
  switch (target.kind) {
    case "annotation": return annotationEntries(t, target.a);
    case "connector": return connectorEntries(t, target.c);
    case "group": return groupEntries(t, model, target.g);
    case "device": return deviceEntries(t, model, target.host);
    default: return multiEntries(t, model, target.multi);
  }
}

/** The bar's accessible name: "Quick actions: note", "Quick actions: 3 items". */
export function barLabel(t: Translate, target: Target): string {
  const count = target.kind === "multi" ? target.multi.hosts.length + target.multi.annotations.length + target.multi.connectors.length + target.multi.groups.length : 0;
  const what = target.kind === "multi" ? t("edit:bar.items", { count })
    : target.kind === "annotation" ? t(`edit:bar.kinds.${target.a.content.kind}`) : target.kind === "device" ? target.host : t(`edit:bar.kinds.${target.kind}`);
  return t("edit:bar.label", { what });
}

/** The arrowheads that follow a connector's (the cycle of the heads button). */
export function nextHeads(c: Pick<Connector, "heads">): Connector["heads"] {
  const at = HEAD_CYCLE.indexOf(`${c.heads.start}/${c.heads.end}` as (typeof HEAD_CYCLE)[number]);
  const [start, end] = HEAD_CYCLE[(at + 1) % HEAD_CYCLE.length].split("/") as ["none" | "arrow", "none" | "arrow"];
  return { start, end };
}

/** The text alignment that follows a note's (the cycle of the alignment button). */
export const nextTextAlign = (align: string): "left" | "center" | "right" =>
  ALIGN_CYCLE[(Math.max(0, ALIGN_CYCLE.indexOf(align as (typeof ALIGN_CYCLE)[number])) + 1) % ALIGN_CYCLE.length];

/** The hues a volet offers, in the contract's order. */
export const HUE_CHOICES: readonly string[] = HUES;

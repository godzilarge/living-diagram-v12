// The edit commands against a fake canvas handle: what the palette inserts and where, what hide and isolate write in
// the view, what "remove the intent" sends, how the v1 factories' notes reach the page.
import { describe, expect, it, vi } from "vitest";
import type { Op } from "@engine/shell/apps";
import { DEFAULT_VIEW } from "../src/state/address";
import { initialState } from "../src/state/diagram";
import type { Action, DiagramState } from "../src/state/diagram";
import { makeEditCommands } from "../src/state/edit-commands";
import type { EditHandle, Note } from "../src/state/edit-commands";

function fakeHandle(options: { pinned?: string[]; coloured?: string[]; author?: string } = {}) {
  const written: { ops: Op[]; done: string }[] = [];
  const model = {
    source: { infrastructure: "demo", collector_run_id: "r1" },
    pinByHost: new Map((options.pinned ?? []).map((h) => [h, {}])),
    colorByHost: new Map((options.coloured ?? []).map((h) => [h, { hue: "amber" }])),
    nodeByHost: new Map([["sw-01", { hostname: "sw-01", kind: "card" }]]),
    annotationById: new Map(), connectorById: new Map(), groupById: new Map(), intent: { revision: 1 },
  };
  const selected: unknown[] = [];
  const toile = {
    model, state: { multi: { hosts: ["sw-01"], annotations: [], connectors: [], groups: [] }, selection: null, positions: new Map() },
    viewCenter: () => ({ x: 333, y: 207 }), flush: () => undefined, select: (s: unknown) => selected.push(s), pointer: null,
  };
  const writer = { author: options.author ?? "o", locked: false };
  const intents = {
    canWrite: () => !!writer.author,
    apply: (ops: Op[], done: string) => { written.push({ ops, done }); return Promise.resolve(null); },
    onAnnotation: (ops: Op[], done: string) => { written.push({ ops, done }); return Promise.resolve(null); },
    onConnector: (ops: Op[], done: string) => { written.push({ ops, done }); return Promise.resolve(null); },
    onGroup: (ops: Op[], done: string) => { written.push({ ops, done }); return Promise.resolve(null); },
    onColor: vi.fn(), onColors: vi.fn(), unpin: vi.fn(), onPin: vi.fn(),
  };
  const handle = { toile, intents, writer, undo: { undo: vi.fn(), redo: vi.fn() }, placements: {}, placer: null, area: () => ({ width: 0, height: 0 }) } as unknown as EditHandle;
  return { handle, written, selected, intents };
}

function harness(editing = true, fake = fakeHandle()) {
  let state: DiagramState = { ...initialState("present", { infrastructure: "demo", runId: "r1", from: "" }, DEFAULT_VIEW), editing };
  const actions: Action[] = [];
  const notes: (Note | null)[] = [];
  const views: Partial<typeof DEFAULT_VIEW>[] = [];
  const commands = makeEditCommands({
    dispatch: (action) => { actions.push(action); if (action.type === "tool") state = { ...state, tool: action.tool }; },
    current: () => state,
    session: () => ({ token: "t", infrastructure: "demo" }),
    handle: () => fake.handle,
    setView: (patch) => { views.push(patch); state = { ...state, view: { ...state.view, ...patch } }; },
    note: (note) => notes.push(note),
  });
  return { commands, actions, notes, views, fake };
}

describe("the edit commands", () => {
  it("inserts a note from the palette at the centre of the view, snapped to the plan grid", () => {
    const { commands, fake } = harness();
    commands.usePalette("note");
    expect(fake.written).toHaveLength(1);
    const op = fake.written[0].ops[0] as Extract<Op, { op: "annotation_create" }>;
    expect(op.op).toBe("annotation_create");
    expect(op.content).toEqual({ kind: "note", text: expect.any(String) });
    // centre (333, 207) less the v1's offset (100, 40), on the 20-unit grid
    expect([op.x, op.y]).toEqual([240, 160]);
  });

  it("arms the connector tool and says how to use it; the select tool puts it away", () => {
    const { commands, actions, notes } = harness();
    commands.usePalette("connector");
    expect(actions).toContainEqual({ type: "tool", tool: "connector" });
    expect(notes[0]?.text).toMatch(/connect/i); // the v1 catalogues, in whichever language the page speaks
    commands.usePalette("select");
    expect(actions.at(-1)).toEqual({ type: "tool", tool: null });
    expect(notes.at(-1)).toBeNull();
  });

  it("groups the selected devices from the palette, and says why nothing is written without a name", () => {
    const named = harness();
    named.commands.usePalette("group");
    expect(named.fake.written[0].ops[0]).toMatchObject({ op: "group_create", members: ["sw-01"] });
    const anonymous = harness(true, fakeHandle({ author: "" }));
    anonymous.commands.usePalette("note");
    expect(anonymous.fake.written).toHaveLength(0);
    expect(anonymous.notes[0]?.text).toMatch(/name|nom/i);
    expect(anonymous.commands.canWrite()).toBe(false);
  });

  it("hides and isolates through the view's rules, letting the selection go", () => {
    const { commands, views, fake } = harness();
    commands.hideHosts(["b", "a"]);
    expect(views[0]).toEqual({ hide: ["^(a|b)$"] });
    expect(fake.selected).toEqual([null]);
    commands.isolateHosts(["a"]);
    expect(views[1]).toEqual({ only: "^(a)$" });
  });

  it("removes a device's pin and hue in one write, only what it has", () => {
    const both = harness(true, fakeHandle({ pinned: ["sw-01"], coloured: ["sw-01"] }));
    both.commands.removeIntent("sw-01");
    expect(both.fake.written[0].ops).toEqual([{ op: "unpin", hostname: "sw-01" }, { op: "uncolor", hostname: "sw-01" }]);
    const none = harness();
    none.commands.removeIntent("sw-01");
    expect(none.fake.written).toHaveLength(0);
  });

  it("asks an in-place edit of a note, never of a locked one, never of a device", () => {
    const fake = fakeHandle();
    const toile = fake.handle.toile as unknown as { state: { selection: unknown }; model: { annotationById: Map<string, unknown> } };
    toile.model.annotationById.set("a1", { locked: false, content: { kind: "note", text: "x" } });
    toile.state.selection = { kind: "annotation", id: "a1" };
    const { commands, actions } = harness(true, fake);
    expect(commands.editSelection()).toBe(true);
    expect(actions.at(-1)).toMatchObject({ type: "editRequest", request: { id: "a1", cell: null } });
    toile.model.annotationById.set("a1", { locked: true, content: { kind: "note", text: "x" } });
    expect(commands.editSelection()).toBe(false);
    toile.state.selection = { kind: "node", id: "sw-01" };
    expect(commands.editSelection()).toBe(false);
  });
});

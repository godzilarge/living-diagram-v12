import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "@engine/canvas/model";
import type { Model, PageData } from "@engine/canvas/types";
import { parseSnapshot, parseIntent } from "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app/src/api/run";
import { detailOf, parse, search, segmentsOf } from "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app/src/state/search";
const F = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/app/e2e/fixtures/diagram/";
const read = (n: string) => JSON.parse(readFileSync(F + n, "utf8"));
const snapshot = parseSnapshot(read("snapshot-demo-0119.json"))!;
const intent = parseIntent(read("intent.json"))!;
const model = build({ snapshot, ingest: null, origin: "t", catalogue: {}, intent } as PageData);
const src = (m: Model | null) => ({ model: m, infrastructures: [], current: "", actions: [] });

describe("sondes revue recherche", () => {
  it("S1 segmentsOf: an empty first match stops the marking of later real matches", () => {
    console.log("S1", JSON.stringify(segmentsOf("dc01-core-01", parse("o*").terms)));
    console.log("S1b", JSON.stringify(segmentsOf("dc01-core-01", parse("x?core").terms)));
  });
  it("S2 port: with an abbreviation finds the port but marks nothing in its name", () => {
    const r = search(src(model), "port:eth1/1");
    console.log("S2 found", r.ports.length, r.ports[0]?.name);
    console.log("S2 segs", JSON.stringify(segmentsOf(`${r.ports[0]?.name} of x`, r.terms)));
    console.log("S2c hostname:", JSON.stringify(segmentsOf("dc01-core-01", parse("hostname:core").terms)));
  });
  it("S3 detailOf on a port the model no longer holds: not null", () => {
    const hit = search(src(model), "dc01-core-01 eth1/1").ports[0];
    const empty = { ...model, interfaces: [], nodeByHost: new Map(), linksByIface: new Map() } as unknown as Model;
    let d: unknown; try { d = detailOf(empty, hit); } catch (e) { d = "throws " + (e as Error).message; }
    console.log("S3", JSON.stringify(d));
    const gone = { ...hit, name: "Ethernet9/99" };
    console.log("S3b", JSON.stringify(detailOf(model, gone)));
  });
  it("S4 a field without a value lists everything", () => {
    console.log("S4 port:", search(src(model), "port:").ports.length, "of", model.interfaces.length);
    console.log("S4 type:", search(src(model), "type:").devices.length);
    console.log("S4 e", search(src(model), "e").total);
  });
  it("S5 explicit term drops groups and notes", () => {
    console.log("S5", search(src(model), "desc:contact").notes.length, search(src(model), "contact").notes.length);
  });
});

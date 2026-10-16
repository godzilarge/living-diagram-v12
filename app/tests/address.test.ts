// The address is the view state: the run in the search, the view and the selection in the hash, round trip; the v1's
// keys (backend/tests/js/app.test.js) so a link opens in both.
import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, formatHash, formatSearch, parseHash, parseSearch, routeOf, sameView } from "../src/state/address";

describe("the address", () => {
  it("carries the run in the search: infrastructure, run, compared run", () => {
    expect(parseSearch("?infrastructure=infra%20lab&run_id=r2&from=r1")).toEqual({ infrastructure: "infra lab", runId: "r2", from: "r1" });
    expect(parseSearch("")).toEqual({ infrastructure: "", runId: "", from: "" });
    expect(formatSearch({ infrastructure: "infra lab", runId: "r2", from: "r1" })).toBe("?infrastructure=infra+lab&run_id=r2&from=r1");
    expect(formatSearch({ infrastructure: "", runId: "r2", from: "" })).toBe("");
    expect(formatSearch({ infrastructure: "x", runId: "", from: "" })).toBe("?infrastructure=x");
  });

  it("opens the diagram when an infrastructure is named, the home otherwise", () => {
    expect(routeOf("?infrastructure=demo-dc&run_id=r1")).toBe("diagram");
    expect(routeOf("")).toBe("home");
    expect(routeOf("?recent=12")).toBe("home");
  });

  it("carries the view and the selection in the hash, round trip, the default view unwritten", () => {
    const view = { ...DEFAULT_VIEW, mode: "control" as const, showStubs: true, showPorts: true, showSpeeds: true, showBeams: true, showPins: false, showNotes: false, showOper: true, showDiff: false, hide: ["fw-", "^(a|b)$"], only: "core", hiddenStatuses: ["documented_only"] };
    const selection = { kind: "link", token: JSON.stringify(["a", "e1", "b", "e2"]) };
    const hash = formatHash(view, selection);
    expect(hash).toMatch(/^#mode=control&stubs=1&ports=1&speeds=1&beams=1&pins=0&notes=0&oper=1&diff=0&hide=fw-&hide=%5E\(a%7Cb\)%24&only=core&mask=documented_only&link=/);
    expect(parseHash(hash)).toEqual({ view, selection });
    expect(parseHash("")).toEqual({ view: DEFAULT_VIEW, selection: null });
    expect(formatHash(DEFAULT_VIEW, null)).toBe("");
    expect(formatHash({ ...DEFAULT_VIEW, mode: "control" }, null)).toBe("#mode=control");
    expect(parseHash("#mode=admin").view.mode).toBe("diagram");
    expect(parseHash("#annotation=a3-1").selection).toEqual({ kind: "annotation", token: "a3-1" });
    expect(parseHash("#node=a&link=b").selection).toEqual({ kind: "node", token: "a" });
    expect(parseHash("#mask=documented_only,bogus").view.hiddenStatuses).toEqual(["documented_only"]);
    expect(parseHash("#hide=%E0%A4%A&stubs=1").view.showStubs).toBe(true); // an unreadable entry is skipped, the rest is read
    expect(Object.isFrozen(parseHash("#stubs=1").view)).toBe(true);
  });

  it("compares two views by what the address would say of them", () => {
    expect(sameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, hide: [] })).toBe(true);
    expect(sameView(DEFAULT_VIEW, { ...DEFAULT_VIEW, showPorts: true })).toBe(false);
  });
});

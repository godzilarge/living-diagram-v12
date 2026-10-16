// The panel's words: every check code of the contract has its sentence in both catalogues and the page's list of
// codes matches them (never a code shown); an unknown code falls back to the server's meaning, else to "other
// checks"; the formats of a speed, a duration, a last change; the detail line of an alert; the severity counts; the
// words of a changed value; the words the filter must match.
import { describe, expect, it } from "vitest";
import { i18n, resources, setLanguage } from "../src/i18n";
import type { TextKey, Translate } from "../src/i18n";
import type { AlertGroup, InterfaceRow } from "../src/state/panel";
import { alertRefsWords, alertWords, changeValueWords, CODES, durationWords, lastChangeWords, severityWords, shownWords, speedWords } from "../src/panel/words";

const t: Translate = (key: TextKey, values?: Record<string, string | number>) => i18n.t(key, values ?? {}) as string;
const CODE = /\b[a-z]+(?:_[a-z]+){2,}\b/;
const group = (code: string, count = 1, severity: AlertGroup["severity"] = "warning"): AlertGroup => ({ code, severity, tone: "warning", count, refs: [] });

describe("the panel's words", () => {
  it("has a sentence for every check code of the contract, in both languages, and knows exactly those codes", () => {
    const bases = (checks: Record<string, string>) => new Set(Object.keys(checks).map((key) => key.replace(/_(one|many|other)$/, "")));
    expect([...bases(resources.en.panel.checks)].sort()).toEqual([...CODES].sort());
    expect([...bases(resources.fr.panel.checks)].sort()).toEqual([...CODES].sort());
    setLanguage("en");
    for (const code of CODES) {
      const one = alertWords(t, group(code, 1), {});
      const many = alertWords(t, group(code, 3), {});
      expect(one.match(CODE), code).toBeNull();
      expect(many.match(CODE), code).toBeNull();
      expect(one.length).toBeGreaterThan(5);
    }
    setLanguage("fr");
    expect(alertWords(t, group("link_down", 2), {})).toBe("2 câbles coupés aux deux bouts");
    setLanguage("en");
  });

  it("says an unknown code with the server's meaning, else as other checks; never the code", () => {
    expect(alertWords(t, group("brand_new_rule_x"), { brand_new_rule_x: { meaning: "a meaning from the server", rule: "" } })).toBe("a meaning from the server");
    expect(alertWords(t, group("brand_new_rule_x", 2), {})).toBe("2 other checks");
    expect(alertWords(t, group("brand_new_rule_x", 1), {})).toBe("1 other check");
  });

  it("names what an alert concerns: short ports, whole aggregates, a cable by its two ends, devices", () => {
    const refs = [
      { kind: "port" as const, hostname: "h", name: "TenGigabitEthernet1/1/1", remote: null },
      { kind: "aggregate" as const, hostname: "h", name: "port-channel101", remote: null },
      { kind: "cable" as const, hostname: "h", name: "Ethernet1/1", remote: { hostname: "o", port: "GigabitEthernet0/1" } },
      { kind: "device" as const, hostname: "peer", name: "", remote: null },
      { kind: "port" as const, hostname: "other", name: "Ethernet1/2", remote: null },
    ];
    expect(alertRefsWords(t, refs, "h")).toBe("Te1/1/1; port-channel101; Eth1/1 to o Gi0/1; peer; other Eth1/2");
    expect(alertRefsWords(t, [], "h")).toBeNull();
  });

  it("formats speeds, durations, ages and counts", () => {
    expect(speedWords(t, 10000)).toBe("10 G");
    expect(speedWords(t, 2500)).toBe("2.5 G");
    expect(speedWords(t, 100)).toBe("100 M");
    expect(speedWords(t, null)).toBeNull();
    expect(durationWords(t, 86_400 * 12 + 3600 * 4 + 60)).toBe("12 d 4 h");
    expect(durationWords(t, 3600 * 3 + 60 * 20)).toBe("3 h 20 min");
    expect(durationWords(t, 45 * 60)).toBe("45 min");
    expect(durationWords(t, 30)).toBe("30 s");
    expect(durationWords(t, null)).toBeNull();
    expect(lastChangeWords(t, "never")).toBe("never");
    expect(lastChangeWords(t, 6 * 86_400)).toBe("6 days ago");
    expect(lastChangeWords(t, 90)).toBe("1 minute ago");
    expect(lastChangeWords(t, null)).toBeNull();
    expect(severityWords(t, { error: 1, warning: 2, info: 0 })).toBe("1 error, 2 warnings");
    expect(severityWords(t, { error: 0, warning: 0, info: 0 })).toBeNull();
  });

  it("says a changed value in words: a collection, a state, a mode, a list of objects, an object, nothing", () => {
    expect(changeValueWords(t, "collection", "success")).toBe("Succeeded");
    expect(changeValueWords(t, "oper_status", "down")).toBe("Down");
    expect(changeValueWords(t, "admin_status", "down")).toBe("Shut down");
    expect(changeValueWords(t, "switchport_mode", "trunk")).toBe("Trunk");
    expect(changeValueWords(t, "duplex", "half")).toBe("half");
    expect(changeValueWords(t, "status", "observed_only")).toBe("observed only");
    expect(changeValueWords(t, "degraded", true)).toBe("yes");
    expect(changeValueWords(t, "members", [{ a: 1 }, { a: 2 }])).toBe("2 items");
    expect(changeValueWords(t, "virtual_contexts", ["root", "vsys1"])).toBe("root, vsys1");
    expect(changeValueWords(t, "stack", { member_count: 3, members: [] })).toBe("3 members");
    expect(changeValueWords(t, "evidence", { a: 1 })).toBe("changed");
    expect(changeValueWords(t, "site", null)).toBe("—");
    expect(changeValueWords(t, "site", [])).toBe("—");
    expect(changeValueWords(t, "os_version", "17.9.4a")).toBe("17.9.4a");
  });

  it("gives the filter the words the table shows", () => {
    const row: InterfaceRow = {
      id: "Ethernet1/1", name: "Ethernet1/1", type: "svi", cabled: false, aggregate: null, state: "up", tone: "ok", reason: null, speedMbps: 1000, duplex: "full", media: null,
      mode: { kind: "trunk", allowed: [{ first: 10, last: 20 }], native: 99 }, addresses: [], vrf: null, mac: null, lastChange: "never", neighbours: [], description: null,
      parsed: null, parent: null, context: null, roles: ["mlag_peer_link"],
    };
    const words = shownWords(t, row);
    for (const word of ["Up", "full", "Trunk 10-20", "native 99", "never", "SVI", "peer link"]) expect(words).toContain(word);
  });
});

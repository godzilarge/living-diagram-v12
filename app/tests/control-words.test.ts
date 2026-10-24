// The Check view's words: every check code of the contract has its absolute sentence in both catalogues and its rule,
// exactly those codes (`codes.py` and `RULE_OF` held together); an unknown code is "N other checks", never a failure;
// a target's name, a combination of sources, the coverage's words, the delivery's facts and their plurals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { i18n, resources, setLanguage } from "../src/i18n";
import type { TextKey, Translate } from "../src/i18n";
import { CODES } from "../src/panel/words";
import { KNOWN_CODES, RULE_OF } from "../src/state/control";
import type { Delivery, Target } from "../src/state/control";
import { deliveryFacts, familyWords, targetWords, topicSaid, verdictWords } from "../src/control/words";

const t: Translate = (key: TextKey, values?: Record<string, string | number>) => i18n.t(key, values ?? {}) as string;
const CODE = /\b[a-z]+(?:_[a-z]+){2,}\b/;
process.env.TZ = "UTC";

/** The codes of the contract's catalogue and their rule, read from `codes.py` (R0…R5, or the input contract). */
function contractCodes(): Map<string, string> {
  const source = readFileSync(new URL("../../contracts/src/ld_contracts/snapshot/codes.py", import.meta.url), "utf8");
  const values = new Map([...source.matchAll(/^\s{4}([A-Z_]+) = "([a-z_]+)"$/gm)].map((m) => [m[1], m[2]]));
  const rules = new Map<string, string>();
  for (const m of source.matchAll(/CheckCode\.([A-Z_]+): _(b1|bundle)\(\s*"([^"]+)"/g)) rules.set(values.get(m[1]) as string, m[2] === "bundle" ? "contract" : m[3]);
  return rules;
}
const FAMILY_OF_RULE: Readonly<Record<string, string>> = { R0: "neighbors", R1: "remotePorts", R2: "descriptions", R3: "cables", R4: "aggregates", R5: "states", contract: "contract" };

describe("the Check view's words", () => {
  it("knows exactly the codes of the contract, each with its rule, and the panel's list agrees", () => {
    const contract = contractCodes();
    expect(contract.size).toBe(40);
    expect([...KNOWN_CODES].sort()).toEqual([...contract.keys()].sort());
    expect([...KNOWN_CODES].sort()).toEqual([...CODES].sort());
    for (const [code, rule] of contract) expect(RULE_OF[code as keyof typeof RULE_OF], code).toBe(FAMILY_OF_RULE[rule]);
  });

  it("has an absolute sentence for every code in both languages, never the code, with the plurals of each", () => {
    const bases = (codes: Record<string, string>) => new Set(Object.keys(codes).map((key) => key.replace(/_(one|many|other)$/, "")));
    const expected = [...KNOWN_CODES, "other"].sort();
    expect([...bases(resources.en.control.codes)].sort()).toEqual(expected);
    expect([...bases(resources.fr.control.codes)].sort()).toEqual(expected);
    for (const language of ["en", "fr"] as const) {
      setLanguage(language);
      for (const code of KNOWN_CODES) {
        for (const count of [1, 3]) {
          const sentence = verdictWords(t, { code, count });
          expect(sentence.match(CODE), `${language} ${code}`).toBeNull();
          expect(sentence.startsWith(String(count)), `${language} ${code} says its count first`).toBe(true);
        }
      }
      for (const family of new Set(Object.values(RULE_OF))) expect(familyWords(t, family).length).toBeGreaterThan(3);
    }
    setLanguage("fr");
    expect(verdictWords(t, { code: "ha_member_down", count: 1 })).toBe("1 membre de grappe hors service");
    expect(verdictWords(t, { code: "aggregate_below_min_links", count: 2 })).toBe("2 agrégats sans assez de membres actifs");
    expect(familyWords(t, "aggregates")).toBe("Agrégats, MLAG et HA");
    expect(familyWords(t, "contract")).toBe("Contrat d'entrée");
    expect(verdictWords(t, { code: "interface_member_unknown", count: 2 })).toBe("2 membres listés par une interface agrégat mais absents des interfaces");
    setLanguage("en");
  });

  it("says an unknown code as other checks, never a failure", () => {
    expect(verdictWords(t, { code: "a_brand_new_code", count: 1 })).toBe("1 other check");
    expect(verdictWords(t, { code: "a_brand_new_code", count: 4 })).toBe("4 other checks");
    expect(familyWords(t, "other")).toBe("Another rule");
    expect(familyWords(t, "neighbors")).toBe("Neighbours");
  });

  it("names a target: a device, a short port, a whole aggregate, a cable by its two ends, a cluster's members", () => {
    const base = { key: "k", hostname: "dc01-core-01", name: "", remote: null, members: [], selection: null } satisfies Partial<Target>;
    expect(targetWords(t, { ...base, kind: "node" })).toBe("dc01-core-01");
    expect(targetWords(t, { ...base, kind: "interface", name: "Ethernet1/1" })).toBe("dc01-core-01 · Eth1/1");
    expect(targetWords(t, { ...base, kind: "aggregate", name: "port-channel101" })).toBe("dc01-core-01 · port-channel101");
    expect(targetWords(t, { ...base, kind: "link", name: "Ethernet1/1", remote: { hostname: "dc01-acc-01", name: "TenGigabitEthernet1/1/1" } })).toBe("dc01-core-01 · Eth1/1 to dc01-acc-01 · Te1/1/1");
    expect(targetWords(t, { ...base, kind: "cluster", members: ["fw-01", "fw-02"] })).toBe("fw-01, fw-02");
    expect(targetWords(t, { ...base, kind: "neighbor", hostname: "SEP93BB92C0AD60" })).toBe("SEP93BB92C0AD60");
    expect(targetWords(t, { ...base, kind: "pair", name: "Po10", remote: { hostname: "dc01-core-02", name: "Po10" } })).toBe("dc01-core-01 · Po10 and dc01-core-02 · Po10");
    expect(targetWords(t, { ...base, kind: "finding", name: "Ethernet1/9" })).toBe("dc01-core-01 · Ethernet1/9");
    expect(targetWords(t, { ...base, kind: "finding" })).toBe("dc01-core-01");
    setLanguage("fr");
    expect(targetWords(t, { ...base, kind: "link", name: "Ethernet1/1", remote: { hostname: "o", name: "x1" } })).toBe("dc01-core-01 · Eth1/1 vers o · x1");
    expect(topicSaid(t, "lldp", "absent")).toBe("LLDP : non demandé");
    setLanguage("en");
    expect(topicSaid(t, "cdp", "failed")).toBe("CDP: failed");
  });

  it("says the delivery's facts, leaving out what the data does not say, with the plurals of each language", () => {
    const full: Delivery = { runStart: "2026-01-19T02:00:00Z", exporter: "ld-export 1.4.2", contract: "1.0.0", storedAt: "2026-01-19T02:14:00Z", scope: 30, answered: 28, findings: 4, residual: 0, applied: 12, unread: 2, unresolved: 34 };
    const said = (facts: ReturnType<typeof deliveryFacts>) => facts.map((fact) => [fact.label, fact.value]);
    expect(said(deliveryFacts(t, full))).toEqual([
      ["Exporter", "ld-export 1.4.2"], ["Contract", "RunBundle 1.0.0"], ["Received", "19 Jan 2026, 02:14"], ["Devices", "30 in scope, 28 answered"],
      ["Findings", "4 from the input contract"], ["Normalizations", "no residual, 12 by B1"], ["Unread", "2 descriptions"], ["Unresolved", "34 neighbours"],
    ]);
    const bare = deliveryFacts(t, { ...full, storedAt: null, findings: null, residual: 1, applied: 0, unread: 0, unresolved: 1 });
    expect(bare.map((fact) => fact.label)).toEqual(["Exporter", "Contract", "Devices", "Normalizations", "Unread", "Unresolved"]);
    expect(said(bare).slice(3)).toEqual([["Normalizations", "1 residual, none by B1"], ["Unread", "none"], ["Unresolved", "1 neighbour"]]);
    setLanguage("fr");
    expect(said(deliveryFacts(t, full))).toEqual([
      ["Exportateur", "ld-export 1.4.2"], ["Contrat", "RunBundle 1.0.0"], ["Reçu le", "19 janv. 2026, 02:14"], ["Équipements", "30 en périmètre, 28 ont répondu"],
      ["Constats", "4 du contrat d'entrée"], ["Normalisations", "aucune résiduelle, 12 par B1"], ["Non lues", "2 descriptions"], ["Non résolus", "34 voisins"],
    ]);
    expect(said(deliveryFacts(t, { ...full, scope: 1, answered: 1, findings: 0 })).slice(3, 5)).toEqual([["Équipements", "1 en périmètre, 1 a répondu"], ["Constats", "aucun"]]);
    setLanguage("en");
  });
});

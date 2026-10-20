// The words of the hidden devices' menu, one row per rule, in both languages: an exact rule's names (one, two or
// three, else the first two and the others counted), an expression with its count or none, the isolation; the unknown
// neighbours' row, the gesture it offers.
import { afterEach, describe, expect, it } from "vitest";
import { i18n, setLanguage } from "../src/i18n";
import type { Translate } from "../src/i18n";
import { hiddenRuleWords, stubsRowWords } from "../src/edit/hidden-words";
import type { HiddenRule } from "../src/state/hidden";

const t: Translate = (key, values) => i18n.t(key, values ?? {}) as string;
const exact = (...named: string[]): HiddenRule => ({ rule: `^(${named.join("|")})$`, kind: "hide", named, hosts: named });
const expression = (rule: string, count: number, kind: HiddenRule["kind"] = "hide"): HiddenRule =>
  ({ rule, kind, named: null, hosts: Array.from({ length: count }, (_, at) => `h${at}`) });

afterEach(() => setLanguage("en"));

describe("hidden rule words", () => {
  it("says an exact rule's names as written, the others counted past three", () => {
    expect(hiddenRuleWords(t, exact("dc01-Core-01"))).toBe("dc01-Core-01");
    expect(hiddenRuleWords(t, exact("a", "b", "c"))).toBe("a, b, c");
    expect(hiddenRuleWords(t, exact("a", "b", "c", "d"))).toBe("a, b and 2 others");
    expect(hiddenRuleWords(t, exact("a", "b", "c"))).not.toContain("other");
  });

  it("says an expression as written with the devices it keeps out, or none", () => {
    expect(hiddenRuleWords(t, expression("ADMIN", 50))).toBe("ADMIN · 50 devices");
    expect(hiddenRuleWords(t, expression("<b>&", 1))).toBe("<b>& · 1 device");
    expect(hiddenRuleWords(t, expression("fw-", 0))).toBe("fw- · no device");
  });

  it("says the isolation and what it hides", () => {
    expect(hiddenRuleWords(t, expression("core", 12, "only"))).toBe("Isolated: core · 12 hidden");
    expect(hiddenRuleWords(t, { ...exact("a", "b", "c", "d", "e"), kind: "only" })).toBe("Isolated: a, b and 3 others · 5 hidden");
  });

  it("speaks French", () => {
    setLanguage("fr");
    expect(hiddenRuleWords(t, exact("a", "b", "c", "d"))).toBe("a, b et 2 autres");
    expect(hiddenRuleWords(t, expression("ADMIN", 1))).toBe("ADMIN · 1 équipement");
    expect(hiddenRuleWords(t, expression("ADMIN", 1200))).toBe("ADMIN · 1 200 équipements");
    expect(hiddenRuleWords(t, expression("fw-", 0))).toBe("fw- · aucun équipement");
    expect(hiddenRuleWords(t, expression("core", 12, "only"))).toBe("Isolé : core · 12 masqués");
  });

  it("offers to show the unknown neighbours the view leaves out, to hide them once drawn", () => {
    expect(stubsRowWords(t, 5, false)).toBe("Show the 5 unknown neighbours");
    expect(stubsRowWords(t, 5, true)).toBe("Hide the 5 unknown neighbours");
    expect(stubsRowWords(t, 1, false)).toBe("Show the unknown neighbour");
    expect(stubsRowWords(t, 1, true)).toBe("Hide the unknown neighbour");
    expect(stubsRowWords(t, 1200, false)).toBe("Show the 1,200 unknown neighbours");
    setLanguage("fr");
    expect(stubsRowWords(t, 5, false)).toBe("Afficher les 5 voisins inconnus");
    expect(stubsRowWords(t, 5, true)).toBe("Masquer les 5 voisins inconnus");
    expect(stubsRowWords(t, 1, false)).toBe("Afficher le voisin inconnu");
    expect(stubsRowWords(t, 1, true)).toBe("Masquer le voisin inconnu");
  });
});

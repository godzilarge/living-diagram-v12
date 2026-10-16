// The catalogues hold together: the same keys in both languages, the same variables, the plurals of each language.
import { describe, expect, it } from "vitest";
import { detectLanguage, i18n, resources, setLanguage } from "../src/i18n";

type Tree = { [key: string]: string | Tree };
const SUFFIX = /_(zero|one|two|few|many|other)$/;

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out.set(prefix + key, value);
    else for (const [k, v] of leaves(value, `${prefix}${key}.`)) out.set(k, v);
  }
  return out;
}
const variables = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const bases = (keys: Iterable<string>) => new Set([...keys].map((key) => key.replace(SUFFIX, "")));

describe("catalogues", () => {
  for (const ns of Object.keys(resources.en) as (keyof typeof resources.en)[]) {
    const en = leaves(resources.en[ns] as Tree);
    const fr = leaves(resources.fr[ns] as Tree);

    it(`${ns}: the same keys and variables in both languages`, () => {
      expect([...bases(fr.keys())].sort()).toEqual([...bases(en.keys())].sort());
      const vars = (map: Map<string, string>, base: string) => [...map].filter(([k]) => k.replace(SUFFIX, "") === base).flatMap(([, v]) => variables(v));
      for (const base of bases(en.keys())) expect(new Set(vars(fr, base)), base).toEqual(new Set(vars(en, base)));
    });

    it(`${ns}: a count carries the plurals of each language`, () => {
      const forms = { en: new Intl.PluralRules("en").resolvedOptions().pluralCategories, fr: new Intl.PluralRules("fr").resolvedOptions().pluralCategories };
      for (const [language, map] of [["en", en], ["fr", fr]] as const)
        for (const [key, value] of map)
          if (value.includes("{{count}}")) {
            const base = key.replace(SUFFIX, "");
            for (const form of forms[language].filter((f) => f !== "zero" && f !== "two" && f !== "few")) expect(map.has(`${base}_${form}`), `${language} ${base}_${form}`).toBe(true);
          }
    });
  }

  it("follows the browser's language, else English, and switches at once", () => {
    expect(detectLanguage(["fr-CA", "en"])).toBe("fr");
    expect(detectLanguage(["de-DE"])).toBe("en");
    setLanguage("fr");
    expect(i18n.t("shell:settings")).toBe("Réglages");
    expect(i18n.t("primitives:panel.ports", { count: 2 })).toBe("2 ports");
    setLanguage("en");
    expect(i18n.t("primitives:bars.changes", { count: 1 })).toBe("1 change");
  });
});

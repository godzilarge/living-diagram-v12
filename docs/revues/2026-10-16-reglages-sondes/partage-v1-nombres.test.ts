// TEMPORARY probe of the brick-5 review; deleted after the review.
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, mergePrefs } from "../src/prefs";
import { parsePrefs as v1Parse, defaultPrefs as v1Defaults } from "@engine/app/state/prefs";
import { i18n, setLanguage } from "../src/i18n";

describe("review probes", () => {
  it("the v1 reads what the v2 writes when only the language was chosen", () => {
    const written = mergePrefs(null, { ...DEFAULT_PREFS, language: "fr" });
    const v1 = v1Parse(written);
    expect(JSON.stringify({ written, v1Defaults: v1Defaults(), v1Reads: { theme: v1.theme, grid: v1.grid, minimap: v1.minimap, language: v1.language } })).toBe("SHOW");
  });
  it("numbers in the catalogues", () => {
    setLanguage("fr");
    const fr = [i18n.t("panel:interfaces.ports", { count: 21000 }), i18n.t("diagram:context.parts.interfaces", { count: 1200 }), i18n.t("home:runs.devices", { count: 1500 })];
    setLanguage("en");
    const en = [i18n.t("panel:interfaces.ports", { count: 21000 }), i18n.t("diagram:context.parts.interfaces", { count: 1200 }), i18n.t("home:runs.devices", { count: 1500 })];
    expect(JSON.stringify({ fr, en })).toBe("SHOW");
    expect(true).toBe(true);
  });
});

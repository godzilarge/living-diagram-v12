// Sonde : la v1 (`/`) et la v2 (`/next/`) partagent `ld-prefs` (même origine). La langue s'y écrit sous deux clés
// (`language` en v1, `lang` en v2) et une écriture de la v1 efface l'accent et la langue de la v2.
import { mergePrefs, parsePrefs } from "../../../app/src/prefs";
import { parsePrefs as parseV1 } from "../../../engine/src/app/state/prefs";

it("la langue choisie dans la v1 n'est pas lue par la v2, et inversement", () => {
  const v1Stored = JSON.stringify({ ...parseV1(null), language: "fr" });
  expect(parsePrefs(v1Stored).language).toBeNull(); // la v2 ignore le français choisi en v1
  const v2Stored = mergePrefs(null, { theme: "dark", accent: "cobalt", language: "fr" });
  expect(parseV1(v2Stored).language).toBeNull(); // la v1 ignore le français choisi en v2
});

it("une écriture de la v1 (writePrefs = JSON.stringify(prefs v1)) efface l'accent de la v2", () => {
  const v2Stored = mergePrefs(null, { theme: "light", accent: "ink", language: "fr" });
  const v1Written = JSON.stringify(parseV1(v2Stored)); // ce que writePrefs de la v1 écrit après un geste
  expect(parsePrefs(v1Written).accent).toBe("cobalt"); // l'encre choisie est perdue
});

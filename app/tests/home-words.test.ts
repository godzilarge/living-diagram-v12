// The home's sentences from its state, in both languages: why a widget is empty (refused, outside the contract, no
// answer), a status with its date or its unreachable devices, who answered, the compared cell's three empty states,
// a feed entry around its author (unknown when blank), the foot of unreadable archive entries.
import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../src/api/home";
import { i18n, setLanguage } from "../src/i18n";
import type { Translate } from "../src/i18n";
import { loadOf } from "../src/state/useHome";
import { byAuthorWords, comparedWords, DASH, failedWords, PENDING, runDevicesWords, statusWords, unreadableWords } from "../src/home/words";

const NOW = Date.parse("2026-01-19T19:30:00Z");
const t: Translate = (key, values) => i18n.t(key, values ?? {}) as string;
const inLanguage = <T,>(language: "en" | "fr", read: () => T): T => {
  setLanguage(language);
  try {
    return read();
  } finally {
    setLanguage("en");
  }
};
const entry = (author: string): JournalEntry => ({
  infrastructure: "demo-dc", revision: 1, at: "2026-01-19T17:00:00Z", author,
  categories: [], actions: [], created: [], subjects: [], ops: [{ op: "pin", hostname: "a" }, { op: "pin", hostname: "b" }], group: null,
});

describe("home words", () => {
  it("never says the API is down when it answered outside its contract", () => {
    expect(loadOf({ kind: "invalid" })).toEqual({ kind: "failed", cause: "invalid" });
    expect(loadOf({ kind: "unreachable" })).toEqual({ kind: "failed", cause: "unreachable" });
    expect(loadOf({ kind: "failed", status: 500 })).toEqual({ kind: "failed", cause: 500 });
    expect(failedWords(t, { kind: "failed", cause: "invalid" })).toBe("The API answered outside its contract. Reload the page; if it persists, check the version of the service.");
    expect(inLanguage("fr", () => failedWords(t, { kind: "failed", cause: "invalid" }))).toMatch(/^L'API a répondu hors de son contrat/);
    expect(failedWords(t, { kind: "failed", cause: "unreachable" })).toMatch(/^The API does not answer/);
    expect(failedWords(t, { kind: "failed", cause: 503 })).toMatch(/error 503/);
  });

  it("says a failure after the last good collection with its date, a partial one with its unreachable devices", () => {
    expect(statusWords(t, { key: "failedOn", tone: "error", date: "2026-01-19T12:00:00Z" }, NOW)).toBe("Failed on 19 Jan");
    expect(inLanguage("fr", () => statusWords(t, { key: "failedOn", tone: "error", date: "2026-01-19T12:00:00Z" }, NOW))).toBe("Échouée le 19 janv.");
    expect(statusWords(t, { key: "partial", tone: "warning", unreachable: 3 }, NOW)).toBe("Partial, 3 unreachable");
    expect(inLanguage("fr", () => statusWords(t, { key: "partial", tone: "warning", unreachable: 1 }, NOW))).toBe("Partielle, 1 sans réponse");
    expect(statusWords(t, { key: "partial", tone: "warning" }, NOW)).toBe("Partial");
  });

  it("says who answered out of the scope, else the scope", () => {
    expect(runDevicesWords(t, { devices: 30, answered: 28 })).toBe("28 of 30 answered");
    expect(inLanguage("fr", () => runDevicesWords(t, { devices: 30, answered: 28 }))).toBe("28 sur 30 ont répondu");
    expect(inLanguage("fr", () => runDevicesWords(t, { devices: 1, answered: 1 }))).toBe("1 sur 1 a répondu");
    expect(runDevicesWords(t, { devices: null, answered: 4 })).toBe("4 answered");
    expect(runDevicesWords(t, { devices: 30, answered: null })).toBe("30 devices");
    expect(inLanguage("fr", () => runDevicesWords(t, { devices: 1, answered: null }))).toBe("1 équipement");
    expect(runDevicesWords(t, { devices: null, answered: null })).toBe(DASH);
  });

  it("tells apart no previous collection, a diff being read and a diff unavailable", () => {
    expect(comparedWords(t, { kind: "none" }, NOW)).toBe(DASH);
    expect(comparedWords(t, { kind: "pending" }, NOW)).toBe(PENDING);
    expect(comparedWords(t, { kind: "failed" }, NOW)).toBe("unavailable");
    expect(inLanguage("fr", () => comparedWords(t, { kind: "failed" }, NOW))).toBe("indisponible");
    expect(comparedWords(t, { kind: "done", total: 0, since: "2026-01-12T02:00:00Z" }, NOW)).toBe("no change");
    expect(comparedWords(t, { kind: "done", total: 20, since: "2026-01-12T12:00:00Z" }, NOW)).toBe("20 changes since 12 Jan");
  });

  it("puts the author where the catalogue says, unknown when left blank", () => {
    expect(byAuthorWords(t, entry("orhan"))).toEqual({ before: "", author: "orhan", after: " placed 2 devices" });
    expect(byAuthorWords(t, entry("  "))).toEqual({ before: "", author: "unknown", after: " placed 2 devices" });
    expect(inLanguage("fr", () => byAuthorWords(t, entry("")))).toEqual({ before: "", author: "inconnu", after: " a placé 2 équipements" });
  });

  it("counts the archive entries it could not read at the foot of a widget", () => {
    expect(unreadableWords(t, { kind: "ok", data: { unreadable: 0 } })).toBeUndefined();
    expect(unreadableWords(t, { kind: "loading" })).toBeUndefined();
    expect(unreadableWords(t, { kind: "ok", data: { unreadable: 1 } })).toBe("1 archive entry could not be read");
    expect(unreadableWords(t, { kind: "ok", data: { unreadable: 3 } })).toBe("3 archive entries could not be read");
    expect(inLanguage("fr", () => unreadableWords(t, { kind: "ok", data: { unreadable: 3 } }))).toBe("3 entrées d'archive illisibles");
    expect(inLanguage("fr", () => unreadableWords(t, { kind: "ok", data: { unreadable: 1 } }))).toBe("1 entrée d'archive illisible");
  });
});

// One journal entry as a sentence, in both languages, with its plurals.
import { describe, expect, it } from "vitest";
import type { JournalEntry, JournalOp } from "../src/api/home";
import { i18n, setLanguage } from "../src/i18n";
import { journalLine, kindOf } from "../src/state/journal-line";

const entry = (ops: JournalOp[], extra: Partial<JournalEntry> = {}): JournalEntry => ({
  infrastructure: "demo-dc", revision: 4, at: "2026-01-19T17:00:00Z", author: "orhan",
  categories: [], actions: [], created: [], subjects: [], ops, ...extra,
});
const say = (e: JournalEntry, language: "en" | "fr") => {
  setLanguage(language);
  const line = journalLine(e);
  const phrase = i18n.t(line.key, line.values);
  return line.more ? i18n.t("home:journal.andMore", { phrase, count: line.more }) : phrase;
};
const pin = (hostname: string): JournalOp => ({ op: "pin", hostname, x: 0, y: 0 });

describe("journal line", () => {
  it("counts the devices moved, once each", () => {
    const e = entry([pin("a"), pin("b"), pin("c"), pin("a")]);
    expect(say(e, "en")).toBe("moved 3 devices");
    expect(say(e, "fr")).toBe("a déplacé 3 équipements");
    expect(say(entry([pin("a")]), "en")).toBe("moved 1 device");
    expect(say(entry([pin("a")]), "fr")).toBe("a déplacé 1 équipement");
  });

  it("colours devices or types, never both under one word", () => {
    expect(say(entry([{ op: "color", hostname: "a", hue: "red" }, { op: "color", hostname: "b", hue: "blue" }]), "en")).toBe("coloured 2 devices");
    expect(say(entry([{ op: "color_type", type: "firewall", hue: "red" }]), "fr")).toBe("a coloré 1 type");
    expect(say(entry([{ op: "color_type", type: "firewall", hue: "red" }, { op: "color", hostname: "a", hue: "red" }]), "en")).toBe("made 2 changes");
  });

  it("never says the opposite of the fact: unpinned, the colour given back", () => {
    const unpin = (hostname: string): JournalOp => ({ op: "unpin", hostname });
    expect(say(entry([unpin("a"), unpin("b")]), "en")).toBe("unpinned 2 devices");
    expect(say(entry([unpin("a")]), "fr")).toBe("a désépinglé 1 équipement");
    expect(say(entry([unpin("a"), unpin("b")]), "fr")).toBe("a désépinglé 2 équipements");
    const uncolor = (hostname: string): JournalOp => ({ op: "uncolor", hostname });
    expect(say(entry([uncolor("a"), uncolor("b")]), "en")).toBe("reset the colour of 2 devices");
    expect(say(entry([uncolor("a")]), "fr")).toBe("a rendu 1 équipement à sa couleur");
    expect(say(entry([uncolor("a"), uncolor("b")]), "fr")).toBe("a rendu 2 équipements à leur couleur");
    const untype = (type: string): JournalOp => ({ op: "uncolor_type", type });
    expect(say(entry([untype("firewall"), untype("switch")]), "en")).toBe("reset the colour of 2 types");
    expect(say(entry([untype("firewall")]), "en")).toBe("reset the colour of 1 type");
    expect(say(entry([untype("firewall"), untype("switch")]), "fr")).toBe("a rendu 2 types à leur couleur");
    expect(say(entry([{ op: "color", hostname: "a", hue: "red" }, uncolor("b")]), "en")).toBe("made 2 changes");
  });

  it("says a mixed request by its most frequent kind and counts the others (the v1's rule), a tie by its total", () => {
    const e = entry([pin("a"), pin("b"), { op: "unpin", hostname: "c" }, pin("a")]);
    expect(say(e, "en")).toBe("moved 2 devices and 1 other change");
    expect(say(e, "fr")).toBe("a déplacé 2 équipements et 1 autre modification");
    expect(say(entry([pin("a"), pin("b"), pin("c"), note(), note()]), "en")).toBe("moved 3 devices and 2 other changes");
    expect(say(entry([pin("a"), pin("b"), pin("c"), note(), note()]), "fr")).toBe("a déplacé 3 équipements et 2 autres modifications");
    const group = { op: "group_create", label: "Edge", members: ["a"] };
    expect(say(entry([note(), note(), group]), "en")).toBe("added 2 annotations and 1 other change");
    expect(say(entry([group, pin("a"), pin("b")]), "en")).toBe("moved 2 devices and 1 other change");
  });

  it("names a group by its label as the server replayed it", () => {
    const created = entry([{ op: "group_create", label: "Core", members: ["a"] }], { created: ["g4-1"], subjects: [{ id: "g4-1", kind: "group", label: "Cœur Lyon" }] });
    expect(say(created, "fr")).toBe("a créé le groupe « Cœur Lyon »");
    expect(say(created, "en")).toBe("created the group “Cœur Lyon”");
    const renamed = entry([{ op: "group_update", id: "g1-1", label: "Accès RDC" }], { subjects: [{ id: "g1-1", kind: "group", label: "Accès RDC" }] });
    expect(say(renamed, "fr")).toBe("a renommé le groupe « Accès RDC »");
    const changed = entry([{ op: "group_add", id: "g1-1", members: ["x"] }], { subjects: [{ id: "g1-1", kind: "group", label: "Edge" }] });
    expect(say(changed, "en")).toBe("changed the group “Edge”");
    const deleted = entry([{ op: "group_delete", id: "g1-1" }], { subjects: [{ id: "g1-1", kind: "group", label: "Edge" }] });
    expect(say(deleted, "en")).toBe("deleted the group “Edge”");
  });

  it("falls back to the operation's own label, then to a count of changes", () => {
    expect(say(entry([{ op: "group_create", label: "Edge", members: ["a"] }]), "en")).toBe("created the group “Edge”");
    expect(say(entry([{ op: "group_delete", id: "g9" }]), "en")).toBe("made a change");
    expect(say(entry([{ op: "group_delete", id: "g9" }, { op: "group_delete", id: "g8" }]), "fr")).toBe("a fait 2 modifications");
  });

  it("says annotations and connectors added, changed, deleted, one or many", () => {
    const note = { op: "annotation_create", content: { kind: "note", text: "x" } };
    expect(say(entry([note]), "en")).toBe("added an annotation");
    expect(say(entry([note, note]), "fr")).toBe("a ajouté 2 annotations");
    expect(say(entry([{ op: "annotation_update", id: "a1" }]), "fr")).toBe("a modifié une annotation");
    expect(say(entry([{ op: "annotation_delete", id: "a1" }]), "en")).toBe("deleted an annotation");
    expect(say(entry([{ op: "connector_create" }]), "fr")).toBe("a ajouté un connecteur");
    expect(say(entry([{ op: "connector_update", id: "c1" }, { op: "connector_update", id: "c2" }]), "en")).toBe("changed 2 connectors");
    expect(say(entry([{ op: "connector_delete", id: "c1" }]), "en")).toBe("deleted a connector");
  });

  it("says how many changes a mixed or unknown request made", () => {
    expect(say(entry([pin("a"), note()]), "en")).toBe("made 2 changes");
    expect(say(entry([{ op: "journal_prune", removed: 4 }]), "fr")).toBe("a fait une modification");
    expect(kindOf({ op: "group_update", id: "g", label: "  " })).toBe("groupChanged");
    setLanguage("en");
  });
});

function note(): JournalOp {
  return { op: "annotation_create", content: { kind: "note", text: "x" } };
}

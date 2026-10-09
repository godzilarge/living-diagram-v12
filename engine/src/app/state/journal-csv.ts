// L'export du journal en CSV (2026-10-10, demande d'Orhan) : une ligne par entrée telle que le serveur l'a servie (jamais
// repliée), dans l'ordre du fil. Pour un tableur français : séparateur « ; », marque d'ordre des octets UTF-8, fins de
// ligne CRLF. Une cellule qui commencerait par = + - @ (une formule pour le tableur : injection CSV) est précédée d'une
// apostrophe ; les guillemets sont doublés. Les opérations reçues sont jointes en JSON (clés nulles retirées), pour qu'un
// auditeur ait la source à côté de la phrase. Pur : testé sous Node.
import { CATEGORY_LABEL } from "./journal";
import type { JournalEntry } from "./journal";
import { headline, textOf } from "./journal-text";

export const CSV_HEADER = ["date (UTC)", "infrastructure", "révision", "auteur", "catégorie", "modification", "objets", "opérations (JSON)"];

/** Une cellule : entre guillemets si besoin, désamorcée si un tableur la lirait comme une formule. */
export function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\r\n]/.test(text) || text !== text.trim() ? '"' + text.replace(/"/g, '""') + '"' : text;
}

const withoutNulls = (key: string, value: unknown): unknown => (value === null ? undefined : value);

export function rowOf(entry: JournalEntry): string[] {
  const sentence = headline(entry);
  const phrase = textOf(sentence).replace(/^a /, "");
  const objects = entry.subjects.map((s) => (s.label && s.label !== s.id ? s.label + " (" + s.id + ")" : s.id));
  const hosts = Array.from(new Set(entry.ops.map((op) => (typeof op.hostname === "string" ? op.hostname : "")).filter(Boolean)));
  return [entry.at, entry.infrastructure, String(entry.revision), entry.author, CATEGORY_LABEL[sentence.category], phrase,
    objects.concat(hosts).join(", "), JSON.stringify(entry.ops, withoutNulls)];
}

export function csvOf(entries: JournalEntry[]): string {
  const lines = [CSV_HEADER].concat(entries.map(rowOf)).map((row) => row.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Le nom du fichier : l'infrastructure (ou « toutes »), puis la date locale à la minute. */
export function csvName(scope: string, now: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  const stamp = now.getFullYear() + two(now.getMonth() + 1) + two(now.getDate()) + "-" + two(now.getHours()) + two(now.getMinutes());
  return "journal-" + (scope.replace(/[^A-Za-z0-9._-]+/g, "_") || "toutes") + "-" + stamp + ".csv";
}

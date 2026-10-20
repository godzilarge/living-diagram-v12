// The log's CSV export (the v1's `journal-csv.ts`, moved with brick 7): one line per entry as the server served it
// (never folded), in the feed's order. For a French spreadsheet: `;` separator, UTF-8 byte order mark, CRLF line
// ends; for an English one, `,`; headers and sentences in the page's language. A cell that would start with
// = + - @ (a formula for the spreadsheet: CSV injection) gets an apostrophe first; quotes are doubled. The received
// operations are joined as JSON (null keys dropped), so that an auditor has the source next to the sentence. Pure.
import type { JournalEntry } from "../api/journal";
import { i18n, text } from "../i18n";
import type { TextKey } from "../i18n";
import { auxiliary, headline, subjectLabel, textOf } from "./journal-text";

const COLUMNS = ["date", "infrastructure", "revision", "author", "category", "change", "objects", "ops"] as const;
const tx = (key: string, values?: Record<string, string | number>): string => text(`journal:${key}` as TextKey, values);
export const csvHeader = (): string[] => COLUMNS.map((c) => tx(`csv.${c}`));
/** The separator of the language's spreadsheet: `;` in French (the comma is decimal there), `,` in English. */
export const separator = (): string => (i18n.language === "en" ? "," : ";");

/** A cell: quoted when needed, defused when a spreadsheet would read it as a formula. */
export function cell(value: string | number, sep = ";"): string {
  let out = String(value);
  if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  return /["\r\n]/.test(out) || out.includes(sep) || out !== out.trim() ? `"${out.replace(/"/g, '""')}"` : out;
}

/** The date as the column says it, in UTC ("Z"), whatever offset a line was written with; a date that does not read
 *  stays as written. */
const utcOf = (at: string): string => (Number.isNaN(Date.parse(at)) ? at : new Date(at).toISOString().replace(/\.000Z$/, "Z"));

const withoutNulls = (_key: string, value: unknown): unknown => (value === null ? undefined : value);

export function rowOf(entry: JournalEntry): string[] {
  const sentence = headline(entry);
  const aux = auxiliary(), said = textOf(sentence);
  const phrase = sentence.verb && aux && said.startsWith(aux) ? said.slice(aux.length) : said;
  const objects = entry.subjects.map((s) => (subjectLabel(s) && s.label !== s.id ? `${subjectLabel(s)} (${s.id})` : s.id));
  const hosts = [...new Set(entry.ops.map((op) => (typeof op.hostname === "string" ? op.hostname : "")).filter(Boolean))];
  return [utcOf(entry.at), entry.infrastructure, String(entry.revision), entry.author, tx(`category.${sentence.category}`), phrase, [...objects, ...hosts].join(", "), JSON.stringify(entry.ops, withoutNulls)];
}

export function csvOf(entries: readonly JournalEntry[]): string {
  const sep = separator();
  const lines = [csvHeader(), ...entries.map(rowOf)].map((row) => row.map((value) => cell(value, sep)).join(sep));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The file's name, in the page's language (`journal-…` / `log-…`): the infrastructure (empty = all), then the
 *  local date to the minute. */
export function csvName(scope: string, now: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  return `${tx("csv.file")}-${scope.replace(/[^A-Za-z0-9._-]+/g, "_") || tx("csv.all")}-${stamp}.csv`;
}

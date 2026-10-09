// Le journal des modifications (2026-10-09) : ce que `GET /api/intent/journal` rend, ses filtres (dans l'adresse), le
// temps (jour, heure locale, fuseau) et les suites repliées. Une entrée = une requête acceptée (auteur déclaré, date,
// révision, opérations telles que reçues) ; ses sujets (groupe, annotation, connecteur) portent le nom connu à cette
// révision, rejoué par le serveur. Les phrases : `journal-text.ts`. Pur, testé sous Node ; les formes de l'API sont
// écrites à la main, comme celles du placement (backend `journal.py`, OpenAPI `JournalPage`).
import { categoryOf, changedFields, count, detailGroups, factsOf, firstRef, headline, hiddenHit, majority, marks, sentenceOf, textOf, visibleMatch } from "./journal-text";

export type JournalCategory = "positions" | "colors" | "groups" | "annotations" | "connectors" | "other";
export interface JournalSubject { id: string; kind: "group" | "annotation" | "connector"; label: string; form: string }
export interface JournalOp { op: string; [key: string]: unknown }
export interface JournalEntry { infrastructure: string; revision: number; at: string; author: string; categories: JournalCategory[]; created: string[]; subjects: JournalSubject[]; ops: JournalOp[] }
export interface JournalFacet { value: string; count: number }
export interface JournalPage { entries: JournalEntry[]; total: number; next: string | null; authors: JournalFacet[]; categories: JournalFacet[]; infrastructures: JournalFacet[]; unreadable: number }

export const CATEGORIES: JournalCategory[] = ["positions", "colors", "groups", "annotations", "connectors", "other"];
export const CATEGORY_LABEL: Record<JournalCategory, string> = { positions: "Positions", colors: "Couleurs", groups: "Groupes", annotations: "Annotations", connectors: "Connecteurs", other: "Autres" };
export type Period = "all" | "24h" | "7d" | "30d";
export const PERIODS: Period[] = ["24h", "7d", "30d", "all"];
export const PERIOD_LABEL: Record<Period, string> = { "24h": "24 h", "7d": "7 jours", "30d": "30 jours", all: "tout" };
const PERIOD_MS: Record<Exclude<Period, "all">, number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };

/** Les filtres de la vue Journal, portés par l'adresse. `infrastructure` : `""` = celle qu'on regarde, `"*"` = toutes,
 *  un nom = celle-là. */
export interface JournalFilters { q: string; authors: string[]; categories: JournalCategory[]; infrastructure: string; period: Period }
export const defaultFilters = (): JournalFilters => ({ q: "", authors: [], categories: [], infrastructure: "", period: "all" });
export const isCategory = (value: string): value is JournalCategory => (CATEGORIES as string[]).includes(value);
export const isPeriod = (value: string): value is Period => (PERIODS as string[]).includes(value);
export const filtered = (f: JournalFilters): boolean => !!(f.q.trim() || f.authors.length || f.categories.length || f.period !== "all");

/** Les paramètres de la requête (répétables : `author`, `category`) ; `current` = l'infrastructure qu'on regarde. */
export function queryOf(f: JournalFilters, current: string, now: number, before?: string | null, limit?: number): [string, string][] {
  const out: [string, string][] = [];
  const infra = f.infrastructure === "*" ? "" : f.infrastructure || current;
  if (infra) out.push(["infrastructure", infra]);
  f.authors.forEach((a) => out.push(["author", a]));
  f.categories.forEach((c) => out.push(["category", c]));
  if (f.q.trim()) out.push(["q", f.q.trim()]);
  if (f.period !== "all") out.push(["since", new Date(now - PERIOD_MS[f.period]).toISOString().replace(/\.\d{3}Z$/, "Z")]);
  if (before) out.push(["before", before]);
  if (limit) out.push(["limit", String(limit)]);
  return out;
}

// ---- l'adresse : `#mode=journal&jq=…&jau=…&jcat=a,b&jinfra=*&jp=7d` (écrite en mode Journal seulement)
export function parseFilters(pairs: [string, string][]): JournalFilters {
  const f = defaultFilters();
  for (const [key, value] of pairs) {
    if (key === "jq") f.q = value;
    else if (key === "jau" && value.trim() && !f.authors.includes(value)) f.authors = f.authors.concat(value);
    else if (key === "jcat") f.categories = value.split(",").filter(isCategory);
    else if (key === "jinfra") f.infrastructure = value;
    else if (key === "jp" && isPeriod(value)) f.period = value;
  }
  return f;
}
export function formatFilters(f: JournalFilters): string[] {
  const parts: string[] = [];
  if (f.q) parts.push("jq=" + encodeURIComponent(f.q));
  f.authors.forEach((a) => parts.push("jau=" + encodeURIComponent(a)));
  if (f.categories.length) parts.push("jcat=" + f.categories.join(","));
  if (f.infrastructure) parts.push("jinfra=" + encodeURIComponent(f.infrastructure));
  if (f.period !== "all") parts.push("jp=" + f.period);
  return parts;
}


// ---- le temps
const DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayKey = (d: Date): string => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
/** Le jour d'une date, en heure locale : « aujourd'hui », « hier », sinon la date en toutes lettres. */
export function dayLabel(at: string, now: number): string {
  const d = new Date(at), today = new Date(now), yesterday = new Date(now - 864e5);
  if (dayKey(d) === dayKey(today)) return "aujourd'hui";
  if (dayKey(d) === dayKey(yesterday)) return "hier";
  return DAY.format(d);
}
export const timeLabel = (at: string): string => TIME.format(new Date(at));
/** Le fuseau des heures affichées (un audit doit le savoir) : « UTC+2 », « UTC+5:30 », « UTC ». */
export function zoneLabel(now: number): string {
  const minutes = -new Date(now).getTimezoneOffset();
  if (!minutes) return "UTC";
  const abs = Math.abs(minutes), h = Math.floor(abs / 60), m = abs % 60;
  return "UTC" + (minutes > 0 ? "+" : "−") + h + (m ? ":" + String(m).padStart(2, "0") : "");
}
/** L'ordre du journal : la plus récente d'abord (date, infrastructure, révision), comme le serveur. */
export function newer(a: JournalEntry, b: JournalEntry): boolean {
  const ta = Date.parse(a.at), tb = Date.parse(b.at);
  if (ta !== tb) return ta > tb;
  if (a.infrastructure !== b.infrastructure) return a.infrastructure > b.infrastructure;
  return a.revision > b.revision;
}
/** L'identité d'une entrée : infrastructure, révision et date (une trace de purge porte la révision courante : seule la
 *  date la distingue de l'entrée de même révision ; revue de la purge, M3). */
export const keyOf = (e: JournalEntry): string => e.infrastructure + "\u0000" + e.revision + "\u0000" + e.at;

// ---- les suites repliées : un même geste répété (huit fois « a modifié le tableau : style » en une minute) se lit en
// une ligne « ×8 » qui se déplie ; seules les entrées d'une seule opération se replient, une rafale l'est déjà.
export type JournalItem =
  | { kind: "entry"; key: string; entry: JournalEntry }
  | { kind: "fold"; key: string; entries: JournalEntry[] };
export const FOLD_WINDOW = 10 * 60 * 1000; // ms : deux gestes plus espacés ne se replient pas
const target = (op: JournalOp): string => String(op.hostname ?? op.id ?? op.type ?? "");
function sameGesture(a: JournalEntry, b: JournalEntry): boolean {
  if (a.ops.length !== 1 || b.ops.length !== 1) return false;
  const x = a.ops[0], y = b.ops[0];
  return a.author === b.author && a.infrastructure === b.infrastructure && x.op === y.op && target(x) === target(y) && !!target(x)
    && !x.op.endsWith("_create") && !x.op.endsWith("_delete") && Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= FOLD_WINDOW
    && dayKey(new Date(a.at)) === dayKey(new Date(b.at));
}
/** Les entrées, avec les suites d'un même geste repliées (dans l'ordre reçu, la plus récente d'abord). */
export function fold(entries: JournalEntry[]): JournalItem[] {
  const out: JournalItem[] = [];
  let run: JournalEntry[] = [];
  const close = (): void => {
    if (run.length > 1) out.push({ kind: "fold", key: "f" + keyOf(run[0]), entries: run });
    else if (run.length === 1) out.push({ kind: "entry", key: keyOf(run[0]), entry: run[0] });
    run = [];
  };
  for (const entry of entries) {
    if (run.length && !sameGesture(run[run.length - 1], entry)) close();
    run = run.concat(entry);
  }
  close();
  return out;
}
/** L'opération d'une suite repliée : la plus récente, avec tout ce que les autres ont aussi changé (« style, position »). */
export function mergedOp(entries: JournalEntry[]): JournalOp {
  const merged: JournalOp = { ...entries[0].ops[0] };
  for (const e of entries.slice(1)) for (const [k, v] of Object.entries(e.ops[0])) if (merged[k] === null || merged[k] === undefined) merged[k] = v;
  return merged;
}
export const firstEntry = (item: JournalItem): JournalEntry => (item.kind === "entry" ? item.entry : item.entries[0]);
export const entriesOf = (item: JournalItem): JournalEntry[] => (item.kind === "entry" ? [item.entry] : item.entries);
/** Les éléments par jour (heure locale), dans l'ordre reçu. */
export function byDay(items: JournalItem[], now: number): { day: string; items: JournalItem[] }[] {
  const out: { day: string; key: string; items: JournalItem[] }[] = [];
  for (const item of items) {
    const at = firstEntry(item).at, key = dayKey(new Date(at)), last = out[out.length - 1];
    if (last && last.key === key) last.items.push(item);
    else out.push({ day: dayLabel(at, now), key, items: [item] });
  }
  return out.map(({ day, items: list }) => ({ day, items: list }));
}

export type { DetailGroup, Fact, Piece, RefKind, Sentence } from "./journal-text";
export const journal = {
  CATEGORIES, CATEGORY_LABEL, PERIODS, defaultFilters, queryOf, parseFilters, formatFilters, filtered, changedFields, sentenceOf, headline, majority,
  detailGroups, factsOf, marks, visibleMatch, hiddenHit, firstRef, textOf, count, dayLabel, zoneLabel, newer, fold, mergedOp, byDay, categoryOf,
};

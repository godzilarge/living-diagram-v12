// Le journal des modifications (2026-10-09) : ce que `GET /api/intent/journal` rend, ses filtres (dans l'adresse), le
// temps (jour, heure locale, fuseau) et les suites repliées. Une entrée = une requête acceptée (auteur déclaré, date,
// révision, opérations telles que reçues) ; ses sujets (groupe, annotation, connecteur) portent le nom connu à cette
// révision, rejoué par le serveur. Les phrases : `journal-text.ts`. Pur, testé sous Node ; les formes de l'API sont
// écrites à la main, comme celles du placement (backend `journal.py`, OpenAPI `JournalPage`).
import { categoryOf, changedFields, count, destroys, detailGroups, factsOf, firstRef, headline, hiddenHit, majority, marks, sentenceOf, textOf, visibleMatch } from "./journal-text";

export type JournalCategory = "positions" | "colors" | "groups" | "annotations" | "connectors" | "other";
/** L'action d'une entrée (`journal_index.py`) : créé, modifié, supprimé ; une purge du journal compte comme supprimé. */
export type JournalAction = "created" | "modified" | "deleted";
export interface JournalSubject { id: string; kind: "group" | "annotation" | "connector"; label: string; form: string }
export interface JournalOp { op: string; [key: string]: unknown }
/** Le regroupement d'une entrée, calculé par le serveur sur le journal entier (`journal_groups.py`) : une session de
 *  positions, ou la répétition d'un même geste ; `size` = ses entrées dans le journal entier (un filtre en cache). */
export interface JournalGroup { id: string; kind: "session" | "repeat"; size: number }
export interface JournalEntry { infrastructure: string; revision: number; at: string; author: string; categories: JournalCategory[]; actions?: JournalAction[]; created: string[]; subjects: JournalSubject[]; ops: JournalOp[]; group?: JournalGroup | null }
export interface JournalFacet { value: string; count: number }
export interface JournalPage {
  entries: JournalEntry[]; total: number; next: string | null; authors: JournalFacet[]; categories: JournalFacet[]; infrastructures: JournalFacet[];
  actions?: JournalFacet[]; unreadable: number;
  /** `start` demandé (le lien vers une entrée) mais aucune entrée de cette révision : la page part de la plus proche. */
  start_missing?: boolean;
}

export const CATEGORIES: JournalCategory[] = ["positions", "colors", "groups", "annotations", "connectors", "other"];
export const CATEGORY_LABEL: Record<JournalCategory, string> = { positions: "Positions", colors: "Couleurs", groups: "Groupes", annotations: "Annotations", connectors: "Connecteurs", other: "Autres" };
export const ACTIONS: JournalAction[] = ["created", "modified", "deleted"];
export const ACTION_LABEL: Record<JournalAction, string> = { created: "Créé", modified: "Modifié", deleted: "Supprimé" };
/** La période : relative à maintenant, ou une plage de jours (`range`, bornes `from` et `to` incluses, en heure locale :
 *  « qui a supprimé quoi entre le 1er et le 15 septembre », revue Impeccable du 2026-10-10). */
export type Period = "all" | "24h" | "7d" | "30d" | "range";
export const PERIODS: Period[] = ["24h", "7d", "30d", "all"];
export const PERIOD_LABEL: Record<Period, string> = { "24h": "24 h", "7d": "7 jours", "30d": "30 jours", all: "Tout", range: "Plage" };
const PERIOD_MS: Record<"24h" | "7d" | "30d", number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Un jour `AAAA-MM-JJ` lu en heure locale (minuit) ; `null` s'il ne se lit pas. */
export function localDay(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
const iso = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const RANGE_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const RANGE_YEAR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
/** La plage en mots courts, pour le bouton : « 1 sept. – 15 sept. », « depuis le 1 sept. », « jusqu'au 15 sept. ». */
export function rangeLabel(from: string, to: string, now: number): string {
  const a = localDay(from), b = localDay(to), year = new Date(now).getFullYear();
  const fmt = (d: Date): string => (d.getFullYear() === year ? RANGE_DAY : RANGE_YEAR).format(d);
  if (a && b) return a.getTime() === b.getTime() ? fmt(a) : fmt(a) + " – " + fmt(b);
  if (a) return "depuis le " + fmt(a);
  if (b) return "jusqu'au " + fmt(b);
  return PERIOD_LABEL.range;
}

/** Les filtres de la vue Journal, portés par l'adresse. `infrastructure` : `""` = celle qu'on regarde, `"*"` = toutes,
 *  un nom = celle-là. `object` : l'historique d'un objet (hostname ou identité `g…`, `a…`, `c…`). `rev` : le lien vers une
 *  entrée, la page commence à cette révision (ce n'est pas un filtre : les plus récentes sont à un clic). */
export interface JournalFilters {
  q: string; authors: string[]; categories: JournalCategory[]; actions: JournalAction[]; infrastructure: string; period: Period; from: string; to: string;
  object: string; rev: number | null;
}
export const defaultFilters = (): JournalFilters => ({ q: "", authors: [], categories: [], actions: [], infrastructure: "", period: "all", from: "", to: "", object: "", rev: null });
export const isAction = (value: string): value is JournalAction => (ACTIONS as string[]).includes(value);
export const isCategory = (value: string): value is JournalCategory => (CATEGORIES as string[]).includes(value);
export const isPeriod = (value: string): value is Period => value === "range" || (PERIODS as string[]).includes(value);
export const filtered = (f: JournalFilters): boolean => !!(f.q.trim() || f.authors.length || f.categories.length || f.actions.length || f.object || f.period !== "all");

/** Les paramètres de la requête (répétables : `author`, `category`) ; `current` = l'infrastructure qu'on regarde. */
export function queryOf(f: JournalFilters, current: string, now: number, before?: string | null, limit?: number): [string, string][] {
  const out: [string, string][] = [];
  const infra = f.infrastructure === "*" ? "" : f.infrastructure || current;
  if (infra) out.push(["infrastructure", infra]);
  f.authors.forEach((a) => out.push(["author", a]));
  f.categories.forEach((c) => out.push(["category", c]));
  f.actions.forEach((a) => out.push(["action", a]));
  if (f.object && infra) out.push(["object", f.object]);
  if (f.q.trim()) out.push(["q", f.q.trim()]);
  if (f.period === "range") {
    const from = localDay(f.from), to = localDay(f.to);
    if (from) out.push(["since", iso(from)]);
    if (to) out.push(["until", iso(new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1))]); // le jour `to` compris
  } else if (f.period !== "all") out.push(["since", iso(new Date(now - PERIOD_MS[f.period]))]);
  if (before) out.push(["before", before]);
  else if (f.rev !== null && infra) out.push(["start", String(f.rev)]); // une révision n'est unique que dans son infrastructure
  if (limit) out.push(["limit", String(limit)]);
  return out;
}

// ---- l'adresse : `#mode=journal&jq=…&jau=…&jcat=a,b&jact=deleted&jobj=…&jinfra=*&jp=7d` (ou
// `jp=range&jfrom=AAAA-MM-JJ&jto=…`), `jrev=986` pour un lien vers une entrée ; écrite en mode Journal seulement
export function parseFilters(pairs: [string, string][]): JournalFilters {
  const f = defaultFilters();
  for (const [key, value] of pairs) {
    if (key === "jq") f.q = value;
    else if (key === "jau" && value.trim() && !f.authors.includes(value)) f.authors = f.authors.concat(value);
    else if (key === "jcat") f.categories = value.split(",").filter(isCategory);
    else if (key === "jact") f.actions = value.split(",").filter(isAction);
    else if (key === "jobj" && value.trim()) f.object = value;
    else if (key === "jrev" && /^\d{1,9}$/.test(value)) f.rev = Number(value);
    else if (key === "jinfra") f.infrastructure = value;
    else if (key === "jp" && isPeriod(value)) f.period = value;
    else if (key === "jfrom" && localDay(value)) f.from = value;
    else if (key === "jto" && localDay(value)) f.to = value;
  }
  // « toutes » : ni historique d'objet ni lien (une identité, une révision ne sont uniques que dans leur infrastructure)
  if (f.infrastructure === "*") { f.object = ""; f.rev = null; }
  if (f.period !== "range" || (!f.from && !f.to)) { f.period = f.period === "range" ? "all" : f.period; f.from = ""; f.to = ""; }
  return f;
}
export function formatFilters(f: JournalFilters): string[] {
  const parts: string[] = [];
  if (f.q) parts.push("jq=" + encodeURIComponent(f.q));
  f.authors.forEach((a) => parts.push("jau=" + encodeURIComponent(a)));
  if (f.categories.length) parts.push("jcat=" + f.categories.join(","));
  if (f.actions.length) parts.push("jact=" + f.actions.join(","));
  if (f.object) parts.push("jobj=" + encodeURIComponent(f.object));
  if (f.infrastructure) parts.push("jinfra=" + encodeURIComponent(f.infrastructure));
  if (f.period !== "all") parts.push("jp=" + f.period);
  if (f.period === "range" && f.from) parts.push("jfrom=" + f.from);
  if (f.period === "range" && f.to) parts.push("jto=" + f.to);
  if (f.rev !== null) parts.push("jrev=" + f.rev);
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
/** Le lien vers une entrée : l'application ouverte sur son infrastructure, le Journal commençant à sa révision. `base`
 *  = l'adresse de l'application sans requête ni fragment (`origin + pathname` : elle peut vivre sous un sous-chemin). */
export function entryLink(base: string, entry: JournalEntry): string {
  const infra = encodeURIComponent(entry.infrastructure);
  return base + "?infrastructure=" + infra + "#mode=journal&jinfra=" + infra + "&jrev=" + entry.revision;
}
/** Une trace de purge (`ld journal prune`) : jamais la cible d'un lien. */
export const isTrace = (e: JournalEntry): boolean => e.ops.some((op) => op.op === "journal_prune");
/** L'identité d'une entrée : infrastructure, révision et date (une trace de purge porte la révision courante : seule la
 *  date la distingue de l'entrée de même révision ; revue de la purge, M3). */
export const keyOf = (e: JournalEntry): string => e.infrastructure + "\u0000" + e.revision + "\u0000" + e.at;

// ---- les regroupements : une session de positions (« a placé 48 équipements, 312 requêtes »), ou un même geste répété
// (huit fois « a modifié le tableau : style » en une minute, « ×8 »). Le serveur les calcule sur le journal entier de
// l'infrastructure (`journal_groups.py`) : calculés ici sur la liste filtrée, ils changeaient avec le filtre (revue
// Impeccable du 2026-10-10). La page replie les entrées voisines d'un même regroupement ; un filtre peut en cacher une
// partie, jamais en fusionner deux.
export type JournalItem =
  | { kind: "entry"; key: string; entry: JournalEntry }
  | { kind: "fold"; key: string; entries: JournalEntry[]; size: number }
  | { kind: "session"; key: string; entries: JournalEntry[]; size: number };
const groupKey = (e: JournalEntry): string | null => (e.group ? e.infrastructure + "\u0000" + e.group.id : null);
/** Les entrées, celles d'un même regroupement repliées quand elles se suivent (dans l'ordre reçu, la plus récente
 *  d'abord). */
export function fold(entries: JournalEntry[]): JournalItem[] {
  const out: JournalItem[] = [];
  let run: JournalEntry[] = [];
  const close = (): void => {
    const group = run.length ? run[0].group : null;
    if (run.length > 1 && group) out.push({ kind: group.kind === "session" ? "session" : "fold", key: (group.kind === "session" ? "s" : "f") + keyOf(run[0]), entries: run, size: group.size });
    else run.forEach((entry) => out.push({ kind: "entry", key: keyOf(entry), entry }));
    run = [];
  };
  for (const entry of entries) {
    const key = groupKey(entry);
    if (run.length && (!key || key !== groupKey(run[0]))) close();
    run = run.concat(entry);
    if (!key) close();
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
/** Les équipements qu'une session a placés ou désépinglés, sans doublon, dans l'ordre de la plus récente. */
export function sessionHosts(entries: JournalEntry[]): { placed: string[]; unpinned: string[] } {
  const placed = new Set<string>(), unpinned = new Set<string>();
  for (const e of entries) for (const op of e.ops) {
    const host = typeof op.hostname === "string" ? op.hostname : "";
    if (host) (op.op === "unpin" ? unpinned : placed).add(host);
  }
  return { placed: Array.from(placed), unpinned: Array.from(unpinned) };
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
  sessionHosts, rangeLabel, localDay, destroys, entryLink, isTrace, ACTIONS, ACTION_LABEL,
};

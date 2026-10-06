// Les widgets HTML de la page autour de la toile : pastilles, liste de définitions, tableau. Construits avec la
// fabrique de canvas/dom.ts, donc jamais de HTML écrit depuis une donnée.
import { clear, h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import { DIFF_LABEL, SOURCE_LABEL, STATUS_LABEL } from "../canvas/format";

export const pill = (kind: string, value: string, label?: string): HTMLSpanElement =>
  h("span", { class: "pill " + kind + "-" + value }, label === undefined ? value : label);
export const sourcePill = (source: string): HTMLSpanElement => pill("source", source, SOURCE_LABEL[source] || source);
export const statusPill = (status: string): HTMLSpanElement => pill("status", status, STATUS_LABEL[status] || status);
export const severityPill = (severity: string): HTMLSpanElement => pill("severity", severity);
export const diffPill = (kind: string): HTMLSpanElement => pill("diff", kind, DIFF_LABEL[kind] || kind);

export type Row = [string, unknown] | null | undefined | false;
export function definition(rows: Row[]): HTMLDListElement {
  const kept = rows.filter((row): row is [string, unknown] => !!row && row[1] !== null && row[1] !== undefined && row[1] !== "");
  return h("dl", { class: "kv" }, kept.map(([label, value]) => [h("dt", {}, label), h("dd", {}, typeof value === "object" ? (value as Child) : String(value))]));
}

export interface TableRow { cells: Child[]; onclick?: (() => void) | null }
export function table(headers: string[], rows: TableRow[], options?: { empty?: string }): HTMLDivElement {
  const head = h("tr", {}, headers.map((label) => h("th", {}, label)));
  const body = rows.map((row) => {
    const line = h("tr", { class: row.onclick ? "clickable" : null, onclick: row.onclick || null, tabindex: row.onclick ? 0 : null },
      row.cells.map((cell) => h("td", {}, cell)));
    const onclick = row.onclick;
    if (onclick) line.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") onclick(); });
    return line;
  });
  const empty = rows.length ? null : h("tr", {}, h("td", { colspan: headers.length, class: "empty" }, (options && options.empty) || "rien à signaler"));
  return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body, empty)));
}

// Une action qui demande confirmation, dans la page (elle n'a pas de boîte de dialogue) : le bouton devient
// « confirmer : … » et « annuler ». `count` s'écrit entre parenthèses ; `title` est l'infobulle du premier bouton.
export function confirmable(label: string, run: () => void, options: { count?: number; title?: string } = {}): HTMLElement {
  const suffix = options.count === undefined ? "" : " (" + options.count + ")";
  const holder = h("span", { class: "confirm-row" });
  const ask = (): void => {
    clear(holder).appendChild(h("button", { type: "button", onclick: () => { clear(holder).appendChild(first()); run(); } }, "confirmer : " + label + suffix));
    holder.appendChild(h("button", { type: "button", class: "linklike", onclick: () => { clear(holder).appendChild(first()); } }, "annuler"));
  };
  const first = (): HTMLElement => h("button", { type: "button", title: options.title || null, onclick: ask }, label + suffix);
  holder.appendChild(first());
  return holder;
}

export const widgets = { pill, sourcePill, statusPill, severityPill, diffPill, definition, table, confirmable };

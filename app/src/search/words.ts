// The search palette's words on the values of `state/search.ts`: a result's name and its detail on the row, the kind
// line of the detail column, a device's local ports folded ("Eth1/49, 1/50"), what the list says without a row, the
// total, and the actions the diagram page offers with their words (matched as names). Every sentence comes from the
// catalogue, values interpolated; identifiers (hostnames, ports, descriptions, group labels) stay as the data says.
import type { ModelNode } from "@engine/canvas/types";
import type { Translate } from "../i18n";
import type { RunEntry } from "../api/run";
import { haModeWords, kindWords } from "../panel/words";
import type { ActionSource, Hit, Results, Scope } from "../state/search";
import { dayMonth } from "../state/time";

export const scopeWords = (t: Translate, scope: Scope): string => t(`search:scopes.${scope}`);

/** Two names or more: "a and b", "a, b and c". */
export function hostsWords(t: Translate, hosts: readonly string[]): string {
  if (hosts.length < 2) return hosts.join("");
  return t("search:detail.pair", { a: hosts.slice(0, -1).join(t("search:detail.join")), b: hosts[hosts.length - 1] });
}

/** The name a row shows (its matched parts are found in this text): a port with its device, a cluster by its name
 *  or its members, an action by its words. */
export function rowName(t: Translate, hit: Hit): string {
  switch (hit.kind) {
    case "device": return hit.hostname;
    case "port": return t("search:row.port", { port: hit.name, host: hit.hostname });
    case "group": return hit.label;
    case "cluster": return hit.name ?? t("search:row.clusterOf", { hosts: hostsWords(t, hit.hosts) });
    case "note": return hit.title || hit.text;
    case "infrastructure": return hit.name;
    case "action": return hit.id === "hideMatches" ? t("search:actions.hideMatches", { count: hit.count ?? 0 }) : hit.words;
  }
}

/** A device hit as the panel's words read a node. */
export const nodeOf = (hit: Extract<Hit, { kind: "device" }>): Pick<ModelNode, "kind" | "type"> => ({ kind: hit.nodeKind, type: hit.type });

/** The detail on the right of a row, in label size: a device's kind and site, a port's neighbour or description, a
 *  group's members, a cluster's mode, a note's kind, an infrastructure's state or size; null when there is none. */
export function rowDetail(t: Translate, hit: Hit): string | null {
  switch (hit.kind) {
    case "device": {
      const kind = kindWords(t, nodeOf(hit));
      if (hit.removed) return t("search:row.removed", { kind });
      return hit.site ? t("search:row.kindSite", { kind, site: hit.site }) : kind;
    }
    case "port": return hit.neighbour ? t("search:row.towards", { host: hit.neighbour }) : hit.description;
    case "group": return t("search:row.members", { count: hit.members });
    case "cluster": return haModeWords(t, hit.mode);
    case "note": return t(hit.noteKind === "code" ? "search:row.code" : "search:row.note");
    case "infrastructure":
      if (hit.current) return t("search:row.current");
      return hit.devices === null ? null : t("search:row.devices", { count: hit.devices });
    case "action": return null;
  }
}

/** "Switch, Cisco, site dc01": a device's kind with its vendor and site when they are known. */
export function deviceSubWords(t: Translate, node: Pick<ModelNode, "kind" | "type" | "vendor" | "site">): string {
  const kind = kindWords(t, node);
  if (node.vendor && node.site) return t("search:detail.kindVendorSite", { kind, vendor: node.vendor, site: node.site });
  if (node.vendor) return t("search:detail.kindVendor", { kind, vendor: node.vendor });
  if (node.site) return t("search:detail.kindSite", { kind, site: node.site });
  return kind;
}

/** A device's local ports toward one neighbour, folded: "Eth1/49, 1/50" (the letters said once when they repeat). */
export function foldPorts(t: Translate, ports: readonly string[]): string {
  const letters = (port: string): string => /^[A-Za-z-]*/.exec(port)?.[0] ?? "";
  const first = letters(ports[0] ?? "");
  return ports.map((port, index) => (index > 0 && first && letters(port) === first ? port.slice(first.length) : port)).join(t("search:detail.join"));
}

/** What the list says when it shows no row: what one can search (nothing typed), an unreadable expression, nothing
 *  found (in every kind, or in the tab chosen); null when it has rows. */
export function messageWords(t: Translate, results: Results, scope: Scope, count: number, home: boolean): Readonly<{ text: string; hint: string | null }> | null {
  if (results.error) return { text: t("search:unreadable"), hint: t("search:unreadableHint") };
  if (results.empty) return { text: t(home ? "search:emptyHome" : "search:empty"), hint: null };
  if (count > 0) return null;
  return { text: scope === "all" ? t("search:nothing") : t(`search:nothingIn.${scope}`), hint: null };
}

/** The foot's total: every result found, whatever the tab; nothing before a word is typed. */
export const totalWords = (t: Translate, results: Results): string | null =>
  results.empty || results.error ? null : t("search:results", { count: results.total });

export type ActionContext = Readonly<{
  /** The selected element's name, when there is one ("centre the view on…"). */
  selected: string | null;
  grid: boolean;
  minimap: boolean;
  /** Edit mode on: the action leaves it. Left out (the home): no edit action, no hiding. */
  editing?: boolean;
  /** How many devices the view hides: "show the hidden devices" when some are. */
  hidden?: number;
  /** The archived runs, oldest first, and the one shown. */
  runs: readonly RunEntry[];
  current: string;
  /** The runs "compare with" offers (`compareChoices`). */
  compare: readonly RunEntry[];
  now: number;
}>;

/** The actions the diagram page offers, with the words the palette matches and shows. */
export function actionSources(t: Translate, context: ActionContext): readonly ActionSource[] {
  const locale = t("ui:locale");
  const date = (run: RunEntry): string => dayMonth(run.run_start, locale, context.now) || run.run_id;
  const fixed: ActionSource[] = [
    { id: "fit", words: t("diagram:controls.fit") },
    ...(context.selected ? [{ id: "center" as const, words: t("search:actions.center", { name: context.selected }) }] : []),
    { id: "zoomReset", words: t("diagram:controls.zoomReset") },
    { id: "grid", words: t(context.grid ? "search:actions.gridHide" : "search:actions.gridShow") },
    { id: "minimap", words: t(context.minimap ? "search:actions.minimapHide" : "search:actions.minimapShow") },
    ...(context.editing === undefined ? [] : [{ id: "edit" as const, words: t(context.editing ? "edit:mode.actionLeave" : "edit:mode.action") }]),
    // the query's own action (its words come with the count, `rowName`), offered on the diagram page only
    ...(context.editing === undefined ? [] : [{ id: "hideMatches" as const, words: "" }]),
    ...(context.hidden ? [{ id: "showHidden" as const, words: t("search:actions.showHidden", { count: context.hidden }) }] : []),
  ];
  const open = [...context.runs].reverse().filter((run) => run.run_id !== context.current).map((run): ActionSource => ({ id: "openRun", runId: run.run_id, words: t("search:actions.openRun", { date: date(run) }) }));
  const compare = context.compare.map((run): ActionSource => ({ id: "compareRun", runId: run.run_id, words: t("search:actions.compareRun", { date: date(run) }) }));
  return [...fixed, ...open, ...compare];
}

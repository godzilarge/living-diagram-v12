// The devices the view hides, by the rule that hides them, and how a rule is lifted. Hiding is a view rule (`hide=`,
// repeatable: an exact rule `^(a|b)$` written by H on a selection, or an expression written from the search, "ADMIN"
// for every hostname that contains it) and isolating another (`only=`), both in the address (ViewState); the canvas
// applies them with the engine's `keepByRules`. The edit palette lists the rules as gestures, one row each, with the
// devices of the run it keeps out; choosing a row lifts that rule as a whole (fifty devices hidden by one expression
// come back together), "show all" lifts every rule.
import type { ModelLink, ModelNode } from "@engine/canvas/types";
import { exactRule, keepByRules, matches, parseRule } from "@engine/canvas/query";
import type { ViewState } from "./address";

export type HiddenRule = Readonly<{
  /** The rule as the address carries it. */
  rule: string;
  kind: "hide" | "only";
  /** The hostnames an exact rule names (null for an expression). */
  named: readonly string[] | null;
  /** The devices of the run this rule keeps out, in the run's order (ghosts aside). */
  hosts: readonly string[];
}>;

const EXACT = /^\^\((.*)\)\$$/;
const unescape = (text: string): string => text.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");

/** The hostnames an exact rule names, in its order; null for any other rule. */
export function exactHosts(rule: string): readonly string[] | null {
  const found = EXACT.exec(rule.trim());
  if (!found) return null;
  const hosts = found[1].split("|").map(unescape);
  return hosts.length && hosts.every(Boolean) && exactRule(hosts) === rule.trim() ? hosts : null;
}

const parsed = (view: ViewState) => ({ hide: view.hide.map(parseRule), only: view.only ? parseRule(view.only) : null });

/** The devices of the run (ghosts aside) the rules keep out, in the run's order. */
export function hiddenOf(nodes: readonly ModelNode[], links: readonly ModelLink[], view: ViewState): readonly string[] {
  if (!view.hide.length && !view.only) return [];
  const rules = parsed(view);
  const kept = new Set(keepByRules([...nodes], [...links], rules.hide, rules.only).map((node) => node.hostname));
  return nodes.filter((node) => !node.ghost && !kept.has(node.hostname)).map((node) => node.hostname);
}

/** The rules of the view, in the address's order, the isolation last, each with the devices it keeps out. */
export function hiddenRules(nodes: readonly ModelNode[], links: readonly ModelLink[], view: ViewState): readonly HiddenRule[] {
  const rows: HiddenRule[] = view.hide.map((rule) => {
    const match = parseRule(rule);
    return { rule, kind: "hide", named: exactHosts(rule), hosts: nodes.filter((node) => !node.ghost && matches(match, node)).map((node) => node.hostname) };
  });
  if (view.only) {
    // the isolation keeps out what the hide rules left: the hidden devices no hide rule names
    const byHide = new Set(rows.flatMap((row) => row.hosts));
    rows.push({ rule: view.only, kind: "only", named: exactHosts(view.only), hosts: hiddenOf(nodes, links, view).filter((host) => !byHide.has(host)) });
  }
  return rows;
}

/** The view without this rule (a hide rule, or the isolation when it is the one). The same view when it has no such rule. */
export function dropping(view: ViewState, rule: string): ViewState {
  if (view.only === rule) return { ...view, only: "" };
  return view.hide.includes(rule) ? { ...view, hide: view.hide.filter((text) => text !== rule) } : view;
}

/** The view with every rule lifted. */
export const showingAll = (view: ViewState): ViewState => (view.hide.length || view.only ? { ...view, hide: [], only: "" } : view);

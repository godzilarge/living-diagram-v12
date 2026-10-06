// Les règles de recherche et de masquage : `[champ:]regex`, un ou plusieurs termes séparés par des espaces (tous
// doivent correspondre), insensibles à la casse, non ancrés (`adm` trouve `sw-adm-01`). Une règle illisible garde son
// texte et porte son erreur : elle ne correspond à rien, et la page le dit. Module pur : ni DOM, ni état.
import type { ModelLink, ModelNode } from "./types";

export const FIELDS = ["hostname", "type", "site", "vendor", "model", "os", "serial", "kind", "collection"] as const;
export type Field = (typeof FIELDS)[number];
export interface Term { field: Field; pattern: string; regex: RegExp }
export interface Rule { text: string; terms: Term[]; error: string | null }

const isField = (name: string): name is Field => (FIELDS as readonly string[]).includes(name);

// Ce qu'un champ vaut pour un équipement, en texte ; une valeur non lue (`null`) est le texte vide.
export function valueOf(node: ModelNode, field: Field): string {
  switch (field) {
    case "hostname": return node.hostname;
    case "type": return node.type || "";
    case "site": return node.site || "";
    case "vendor": return node.vendor || "";
    case "model": return node.model || "";
    case "os": return [node.os_name, node.os_version].filter(Boolean).join(" ");
    case "serial": return node.serial_number || "";
    case "kind": return node.kind;
    default: return node.collection || "";
  }
}

function term(word: string): Term {
  const cut = word.indexOf(":");
  const prefix = cut > 0 ? word.slice(0, cut) : "";
  const field: Field = isField(prefix) ? prefix : "hostname";
  const pattern = isField(prefix) ? word.slice(cut + 1) : word;
  return { field, pattern, regex: new RegExp(pattern, "i") };
}

// Lit une règle. Le texte vide est une règle sans terme (elle ne correspond à rien, sans erreur) ; une regex
// illisible rend une règle sans terme avec le message du moteur.
export function parseRule(text: string): Rule {
  const words = text.trim().split(/\s+/).filter(Boolean);
  try {
    return { text, terms: words.map(term), error: null };
  } catch (error) {
    return { text, terms: [], error: (error as Error).message };
  }
}

export const matches = (rule: Rule, node: ModelNode): boolean => rule.terms.length > 0 && rule.terms.every((t) => t.regex.test(valueOf(node, t.field)));

// La règle qui désigne exactement ces équipements, et eux seuls (une sélection à la main devient une règle).
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const exactRule = (hostnames: string[]): string => "^(" + hostnames.slice().sort().map(escape).join("|") + ")$";

/** Ce que les règles laissent : d'abord sans les équipements qu'une règle de masquage désigne, puis, si une règle
 * d'isolement est posée, seulement ceux qu'elle désigne et leurs voisins directs par les câbles donnés. Un équipement
 * masqué n'est jamais un voisin : masquer gagne sur isoler. */
export function keepByRules(nodes: ModelNode[], links: ModelLink[], hide: Rule[], only: Rule | null): ModelNode[] {
  const kept = nodes.filter((node) => !hide.some((rule) => matches(rule, node)));
  if (!only) return kept;
  const core = new Set(kept.filter((node) => matches(only, node)).map((node) => node.hostname));
  const near = new Set(core);
  links.forEach((link) => {
    if (core.has(link.a.hostname)) near.add(link.b.hostname);
    if (core.has(link.b.hostname)) near.add(link.a.hostname);
  });
  return kept.filter((node) => near.has(node.hostname));
}

export const query = { FIELDS, parseRule, matches, exactRule, keepByRules, valueOf };

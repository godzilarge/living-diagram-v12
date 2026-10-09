// La recherche de l'application (Orhan, 2026-10-07 : « un élément central, visible en tout temps, un boost »), la
// partie pure : ce qu'un texte trouve dans la run affichée. Des équipements (les champs de query.ts), des ports (nom,
// description), des groupes et des clusters HA (nom). Un mot par terme, tous doivent correspondre, insensibles à la
// casse, non ancrés ; `champ:regex` vise un champ. Sans champ, un mot vise le nom d'un équipement, le nom ou la
// description d'un port, le nom d'un groupe : « sw-core-01 eth1/1 » trouve ce port. Chercher n'est pas filtrer :
// les résultats s'éclairent, rien ne disparaît (masquer et isoler restent des actions).
import { clusterLabel } from "../../canvas/geometry";
import { ifaceKey } from "../../canvas/model";
import { FIELDS, valueOf } from "../../canvas/query";
import type { Field } from "../../canvas/query";
import type { Model, ModelNode, Selection } from "../../canvas/types";
import type { SnapshotInterface } from "../../contracts/snapshot";

/** Les champs qu'on peut viser : ceux d'un équipement, plus le nom et la description d'un port. */
export const SEARCH_FIELDS: readonly string[] = [...FIELDS, "port", "desc"];
type SearchField = Field | "port" | "desc";
interface Term { field: SearchField; regex: RegExp; explicit: boolean }

export type HitKind = "device" | "port" | "group";
export interface Hit {
  kind: HitKind; key: string; title: string; detail: string;
  /** Ce qu'ouvrir le résultat montre ; un port qui a un seul câble ouvre ce câble, sinon son équipement. */
  selection: Selection;
  /** Les équipements que le résultat éclaire sur la toile. */
  hosts: string[];
  removed: boolean;
}
export interface Results {
  text: string; error: string | null; empty: boolean;
  devices: Hit[]; ports: Hit[]; groups: Hit[];
  /** Les équipements que la toile éclaire : les équipements trouvés s'il y en a ; sinon les propriétaires des ports et
   *  les membres des groupes (« dc02 core » éclaire les deux cœurs, pas les cent ports dont la description les cite). */
  hosts: string[];
  /** Les équipements trouvés comme tels : sélectionner, masquer, isoler s'appliquent à eux. */
  deviceHosts: string[];
  /** Le texte est une règle d'équipements pure (query.ts) : masquer / isoler peuvent la garder telle quelle. */
  deviceRule: boolean;
}

function parse(text: string): { terms: Term[]; error: string | null } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  try {
    return { error: null, terms: words.map((word) => {
      const cut = word.indexOf(":"), prefix = cut > 0 ? word.slice(0, cut) : "";
      const explicit = SEARCH_FIELDS.includes(prefix);
      return { field: (explicit ? prefix : "hostname") as SearchField, regex: new RegExp(explicit ? word.slice(cut + 1) : word, "i"), explicit };
    }) };
  } catch (error) {
    return { terms: [], error: (error as Error).message };
  }
}

const isDeviceField = (field: SearchField): field is Field => field !== "port" && field !== "desc";
const deviceHit = (node: ModelNode): Hit => ({
  kind: "device", key: "d:" + node.hostname, title: node.hostname, removed: !!node.ghost, hosts: [node.hostname], selection: { kind: "node", id: node.hostname },
  detail: [node.type, node.site, node.model].filter(Boolean).join(" · ") || node.kind,
});

function devices(model: Model, terms: Term[]): Hit[] {
  if (!terms.every((t) => isDeviceField(t.field))) return [];
  return model.nodes.concat(model.ghostNodes).filter((node) => terms.every((t) => t.regex.test(valueOf(node, t.field as Field)))).map(deviceHit);
}

/** Un nom de port et ses abréviations (« Ethernet1/1 » → « Et1/1 », « Eth1/1 »… ; « port-channel10 » → « Po10 ») : on
 *  tape le nom court, l'équipement a écrit le long. Sans table par constructeur : toutes les coupes du préfixe. */
export function portNames(name: string): string {
  const parts = /^([A-Za-z][A-Za-z-]*)(.*)$/.exec(name);
  if (!parts) return name;
  const letters = parts[1].replace(/-/g, ""), rest = parts[2];
  const short: string[] = [];
  for (let k = 2; k < letters.length; k += 1) short.push(letters.slice(0, k) + rest);
  return [name].concat(short).join(" ");
}

// Un port : chaque terme correspond (un mot sans champ peut viser son équipement, son nom ou sa description), et l'un
// d'eux au moins parle du port lui-même ; sinon « type:firewall » listerait tous les ports de tous les firewalls.
// Les ports trouvés par leur nom d'abord, puis ceux que seule leur description désigne.
// Les noms et abréviations des ports d'un modèle, calculés une fois par run (21 000 interfaces à la jauge).
const namesByModel = new WeakMap<Model, string[]>();
function portNamesOf(model: Model): string[] {
  let names = namesByModel.get(model);
  if (!names) { names = model.interfaces.map((itf) => portNames(itf.name)); namesByModel.set(model, names); }
  return names;
}

function ports(model: Model, terms: Term[]): Hit[] {
  if (!terms.some((t) => !isDeviceField(t.field) || !t.explicit)) return [];
  const named: Hit[] = [], described: Hit[] = [];
  const allNames = portNamesOf(model);
  model.interfaces.forEach((itf: SnapshotInterface, at: number) => {
    const node = model.nodeByHost.get(itf.hostname);
    if (!node) return;
    const desc = itf.description || "", names = allNames[at];
    let aboutPort = false, byName = false;
    const ok = terms.every((t) => {
      if (t.field === "port") { aboutPort = true; byName = true; return t.regex.test(names); }
      if (t.field === "desc") { aboutPort = true; return t.regex.test(desc); }
      if (!t.explicit) {
        const named = t.regex.test(names), own = named || t.regex.test(desc);
        if (own) aboutPort = true;
        if (named) byName = true;
        return own || t.regex.test(itf.hostname);
      }
      return t.regex.test(valueOf(node, t.field as Field));
    });
    if (!ok || !aboutPort) return;
    const links = model.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || [];
    (byName ? named : described).push({ kind: "port", key: "p:" + itf.hostname + "\u0000" + itf.name, title: itf.hostname + " · " + itf.name, detail: desc || itf.type, removed: false,
      hosts: [itf.hostname], selection: links.length === 1 ? { kind: "link", id: links[0].id } : { kind: "node", id: itf.hostname } });
  });
  return named.concat(described);
}

function groups(model: Model, terms: Term[]): Hit[] {
  if (!terms.every((t) => !t.explicit)) return [];
  const test = (text: string): boolean => terms.every((t) => t.regex.test(text));
  const own: Hit[] = Array.from(model.groupById.values()).filter((g) => test(g.label + " " + g.description))
    .map((g) => ({ kind: "group", key: "g:" + g.id, title: g.label, detail: "groupe · " + g.members.length + " membres", removed: false, hosts: g.members.slice(), selection: { kind: "group", id: g.id } }));
  const ha: Hit[] = model.clusters.filter((c) => test(clusterLabel(c)))
    .map((c) => ({ kind: "group", key: "c:" + c.id, title: c.raw.cluster_name || c.hosts.join(" + "), detail: "cluster HA · " + c.raw.mode, removed: false, hosts: c.hosts.slice(), selection: { kind: "cluster", id: c.id } }));
  return own.concat(ha);
}

export function search(model: Model, text: string): Results {
  const { terms, error } = parse(text);
  const found = { devices: terms.length ? devices(model, terms) : [], ports: terms.length ? ports(model, terms) : [], groups: terms.length ? groups(model, terms) : [] };
  const all = found.devices.concat(found.ports, found.groups);
  const deviceHosts = found.devices.filter((h) => !h.removed).map((h) => h.hosts[0]);
  const lit = found.devices.length ? found.devices : all;
  return { text, error, empty: !terms.length, ...found, hosts: Array.from(new Set(lit.flatMap((h) => h.hosts))).sort(), deviceHosts,
    deviceRule: terms.length > 0 && terms.every((t) => isDeviceField(t.field)) };
}

// La recherche et la toile lisent le même texte à chaque frappe : un seul calcul (revue Impeccable du 2026-10-07).
let last: { model: Model; text: string; results: Results } | null = null;
export function searchCached(model: Model, text: string): Results {
  if (!last || last.model !== model || last.text !== text) last = { model, text, results: search(model, text) };
  return last.results;
}

/** Les champs que le dernier mot commence à écrire (« ty » → `type:`), tous quand on n'a rien écrit. */
export function suggest(text: string): string[] {
  const last = text.endsWith(" ") || !text ? "" : text.trim().split(/\s+/).pop() || "";
  if (last.includes(":")) return [];
  return SEARCH_FIELDS.filter((field) => field !== "hostname" && field.startsWith(last.toLowerCase())).map((field) => field + ":");
}
/** Le texte où le dernier mot devient le champ choisi. */
export function complete(text: string, field: string): string {
  const head = text.endsWith(" ") || !text ? text : text.replace(/\S+$/, "");
  return head + field;
}

export const searching = { search, searchCached, suggest, complete, portNames, SEARCH_FIELDS };

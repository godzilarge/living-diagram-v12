// La table LLDP / CDP d'un équipement telle qu'il l'annonce (vue Diagramme, 2026-10-09 : « cliquer sur un nœud va
// m'afficher uniquement des informations provenant des équipements : … cdp + lldp s'il y a »). Rien à ajouter au
// snapshot : chaque observation est une évidence d'un câble dont l'équipement est le témoin, avec ce qu'il a annoncé,
// brut (`remote_raw`). Une ligne par (port local, voisin annoncé, port annoncé), les protocoles réunis ; dans l'ordre
// des interfaces de l'équipement, puis par voisin. Pur, sans DOM.
import { ifaceKey } from "./model";
import type { Model } from "./types";

export interface NeighborRow {
  /** Le port local, canonique. */
  port: string;
  /** Ce que le voisin a annoncé de lui-même : nom (ou MAC, ou IP) et port, bruts. */
  neighbor: string;
  neighborPort: string | null;
  /** `lldp`, `cdp`, triés. */
  sources: string[];
  /** L'équipement que B1 en a fait (device, externe ou voisin inconnu) : pour ouvrir sa fiche, jamais pour le lire ici. */
  resolved: string;
}

const OBSERVED = new Set(["lldp", "cdp"]);
const SEP = "\u0000";

export function neighborsOf(model: Model, hostname: string): NeighborRow[] {
  const rows = new Map<string, NeighborRow>();
  (model.linksByNode.get(hostname) || []).forEach((link) => {
    if (link.ghost) return;
    link.raw.evidence.forEach((e) => {
      if (e.witness.hostname !== hostname || !OBSERVED.has(e.source) || e.witness.interface === null) return;
      const key = e.witness.interface + SEP + e.remote_raw.name + SEP + (e.remote_raw.port === null ? "" : e.remote_raw.port);
      const row = rows.get(key);
      if (row) { if (!row.sources.includes(e.source)) rows.set(key, { ...row, sources: row.sources.concat(e.source).sort() }); return; }
      rows.set(key, { port: e.witness.interface, neighbor: e.remote_raw.name, neighborPort: e.remote_raw.port, sources: [e.source], resolved: e.remote_resolved.hostname });
    });
  });
  const rank = new Map((model.ifacesByNode.get(hostname) || []).map((itf, i) => [ifaceKey(hostname, itf.name), i]));
  const at = (port: string): number => { const r = rank.get(ifaceKey(hostname, port)); return r === undefined ? Number.MAX_SAFE_INTEGER : r; };
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return Array.from(rows.values()).sort((x, y) => at(x.port) - at(y.port) || cmp(x.port, y.port) || cmp(x.neighbor, y.neighbor) || cmp(x.neighborPort || "", y.neighborPort || ""));
}

export const neighbors = { neighborsOf };

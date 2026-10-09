// Le parcours des défauts (revue Impeccable du 2026-10-07, lot 3) : un compte de la barre (erreurs, avertissements,
// changements) devient la liste des équipements qu'il concerne, que ↑↓ parcourt une fiche après l'autre. Pur, testé
// sous Node : les équipements (jamais les voisins inconnus) qui portent au moins un contrôle de cette sévérité, ou que
// le diff touche (l'équipement lui-même, un câble à un de ses bouts, une interface, un agrégat, son cluster HA) ; le
// plus touché d'abord, puis par nom.
import type { Model } from "../../canvas/types";

export type WalkKind = "error" | "warning" | "diff";
export interface Walk { kind: WalkKind; hosts: string[]; index: number }

const WORDS: Record<WalkKind, [string, string]> = { error: ["en erreur", "en erreur"], warning: ["en avertissement", "en avertissement"], diff: ["changé", "changés"] };
/** « 1 équipement changé », « 4 équipements en erreur », « aucun équipement changé ». */
export const walkLabel = (kind: WalkKind, n: number): string =>
  (n ? n + (n > 1 ? " équipements " : " équipement ") : "aucun équipement ") + WORDS[kind][n > 1 ? 1 : 0];

export function walkHosts(model: Model, kind: WalkKind): string[] {
  const weight = new Map<string, number>();
  const add = (host: string): void => {
    const node = model.nodeByHost.get(host);
    if (node && node.kind !== "stub") weight.set(host, (weight.get(host) || 0) + 1);
  };
  if (kind === "diff") {
    if (!model.diff) return [];
    model.nodes.concat(model.ghostNodes).forEach((node) => { if (node.ghost || model.changeOf("node", node.hostname)) add(node.hostname); });
    model.links.concat(model.ghostLinks).forEach((link) => {
      if (link.ghost || model.changeOf("link", link.id)) { add(link.a.hostname); if (link.b.hostname !== link.a.hostname) add(link.b.hostname); }
    });
    // ce qui change sur un équipement sans changer son nœud ni ses câbles : une interface, un agrégat, son cluster HA
    const d = model.diff;
    d.interfaces.added.concat(d.interfaces.removed).forEach((i) => add(i.hostname));
    d.aggregates.added.concat(d.aggregates.removed).forEach((a) => add(a.hostname));
    d.interfaces.changed.concat(d.aggregates.changed).forEach((c) => { if (c.ref.kind === "interface" || c.ref.kind === "aggregate") add(c.ref.hostname); });
    d.ha_clusters.added.concat(d.ha_clusters.removed).forEach((c) => c.members.forEach((m) => add(m.hostname)));
    d.ha_clusters.changed.forEach((c) => { if (c.ref.kind === "cluster") c.ref.members.forEach((host) => add(host)); });
  } else {
    model.checksByNode.forEach((checks, host) => checks.forEach((check) => { if (check.severity === kind) add(host); }));
  }
  return Array.from(weight).sort(([a, wa], [b, wb]) => wb - wa || (a < b ? -1 : a > b ? 1 : 0)).map(([host]) => host);
}

/** Le pas suivant ou précédent, en boucle. */
export const stepWalk = (walk: Walk, direction: -1 | 1): Walk =>
  ({ ...walk, index: (walk.index + direction + walk.hosts.length) % walk.hosts.length });

export const walking = { walkHosts, stepWalk, walkLabel };

// Les deux commandes que la barre contextuelle (lot 4 de docs/11) ajoute, et que les fiches portent aussi (la barre
// n'a rien que l'inspecteur n'a pas) : épingler un équipement à sa place, verrouiller ou déverrouiller d'un coup les
// annotations et connecteurs d'une sélection. Par l'hôte d'intention : sous le nom, au journal, dans la pile
// d'annulation (une écriture, une entrée). Le reste de la barre réutilise les commandes existantes du store.
import { t } from "../../i18n";
import type { Op } from "../../shell/apps";
import { hueLabel } from "../../canvas/hues";
import type { Multi } from "./selection";
import type { CanvasHandle } from "./store";

export interface FloatingCommands {
  /** Épingle un équipement là où il est dessiné (la même épingle qu'un glissé, sans le glisser). */
  pinHere: (host: string) => void;
  /** Verrouille (ou déverrouille) les annotations et connecteurs désignés, en une écriture. */
  lockItems: (annotations: string[], connectors: string[], locked: boolean) => void;
  /** Une teinte pour toute une sélection (équipements, annotations, connecteurs, groupes), en une écriture ; des
   *  équipements seuls gardent leur chemin (`onColors`, « défaut » compris). */
  colorItems: (multi: Multi, hue: string | null) => void;
}

export function floatingCommands(deps: { handle: () => CanvasHandle | null }): FloatingCommands {
  return {
    pinHere: (host) => {
      const h = deps.handle();
      const at = h ? h.toile.state.positions.get(host) : undefined;
      if (h && at) h.intents.onPin(host, { x: Math.round(at.x), y: Math.round(at.y) });
    },
    lockItems: (annotations, connectors, locked) => {
      const h = deps.handle();
      if (!h) return;
      const model = h.toile.model;
      const ops: Op[] = ([] as Op[]).concat(
        annotations.filter((id) => { const a = model.annotationById.get(id); return !!a && a.locked !== locked; }).map((id): Op => ({ op: "annotation_update", id, locked })),
        connectors.filter((id) => { const c = model.connectorById.get(id); return !!c && c.locked !== locked; }).map((id): Op => ({ op: "connector_update", id, locked })));
      if (!ops.length) return;
      const done = t(locked ? "shell:fbar.lockedItems" : "shell:fbar.unlockedItems", { count: ops.length, author: h.writer.author });
      void h.intents.apply(ops, done); // la ligne d'état le dit (l'hôte), Ctrl+Z le défait
    },
    colorItems: (multi, hue) => {
      const h = deps.handle();
      if (!h) return;
      const model = h.toile.model;
      const hosts = multi.hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
      if (multi.annotations.length + multi.connectors.length + multi.groups.length === 0) { h.intents.onColors(hosts, hue); return; }
      if (!hue) return; // « défaut » n'existe que pour des équipements seuls
      const style = { hue } as never;
      const ops: Op[] = ([] as Op[]).concat(
        hosts.map((hostname): Op => ({ op: "color", hostname, hue })),
        multi.annotations.filter((id) => model.annotationById.has(id)).map((id): Op => ({ op: "annotation_update", id, style })),
        multi.connectors.filter((id) => model.connectorById.has(id)).map((id): Op => ({ op: "connector_update", id, style })),
        multi.groups.filter((id) => model.groupById.has(id)).map((id): Op => ({ op: "group_update", id, style })));
      if (!ops.length) return;
      void h.intents.apply(ops, t("shell:fbar.huedItems", { count: ops.length, hue: hueLabel(hue), author: h.writer.author }));
    },
  };
}

// Ce que le presse-papiers (lot 3 de docs/11) lit de la toile : la charge de la sélection (annotations et connecteurs
// dessinés, avec leur boîte et leurs bouts dans le plan ; équipements de la run), et ce qui existe ici pour un collage
// (équipements, groupes, annotations, et le point de référence d'une ancre dessinée). Sans DOM ni React ; partagé par
// les commandes (state/clipboard-commands.ts) et le fantôme d'Alt + glissé (clone.tsx).
import { frameOf } from "../../canvas/groups";
import type { Point } from "../../canvas/layout";
import { payloadOf } from "../state/clipboard";
import type { Payload, Target } from "../state/clipboard";
import type { Item } from "../state/selection";
import type { Toile } from "./toile";

/** La charge de ce que la toile a de sélectionné (ou de `items`) ; un fantôme du diff n'est pas un équipement de la run. */
export function payloadFromToile(toile: Toile, items?: Item[]): Payload {
  const of = (kind: string): string[] => (items || []).filter((i) => i.kind === kind).map((i) => i.id);
  const m = items ? { hosts: of("node"), annotations: of("annotation"), connectors: of("connector") } : toile.state.multi;
  const model = toile.model;
  const annotations = m.annotations.flatMap((id) => { const a = model.annotationById.get(id), frame = toile.frames.get(id); return a && frame ? [{ a, frame }] : []; });
  const connectors = m.connectors.flatMap((id) => { const c = model.connectorById.get(id), e = toile.ends.get(id); return c && e ? [{ c, a: e.a, b: e.b }] : []; });
  const hosts = m.hosts.filter((host) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; });
  return payloadOf({ infrastructure: model.source.infrastructure, annotations, connectors, hosts });
}

/** Ce qui existe dans la run montrée (la destination d'un collage) ; le point de référence d'une ancre : le centre de
 *  la carte d'un équipement, le coin haut gauche du cadre d'un groupe (calculé comme Flow.tsx le dessine). */
export function targetOf(toile: Toile): Target {
  const model = toile.model;
  const anchorAt = (kind: "device" | "group", ref: string): Point | null => {
    if (kind === "device") { const at = toile.state.positions.get(ref); return at ? { x: at.x, y: at.y } : null; }
    const group = model.groupById.get(ref);
    if (!group) return null;
    const shown = toile.scene().shown;
    const present = group.members.filter((host) => shown.has(host) && toile.state.positions.has(host));
    const frame = frameOf(present.map((host) => toile.state.positions.get(host) as Point), present.map((host) => toile.boxes.get(host) || { w: 0, h: 0 }), group.style);
    return frame ? { x: frame.x, y: frame.y } : null;
  };
  return {
    infrastructure: model.source.infrastructure,
    hasHost: (name) => { const node = model.nodeByHost.get(name); return !!node && !node.ghost; },
    hasGroup: (id) => model.groupById.has(id), hasAnnotation: (id) => model.annotationById.has(id),
    anchorAt,
  };
}

/** Les groupes parmi des éléments (ils ne se copient pas : la page le dit). */
export const groupsIn = (items: Item[]): number => items.filter((i) => i.kind === "group").length;

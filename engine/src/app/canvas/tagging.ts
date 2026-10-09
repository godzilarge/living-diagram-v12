// Les demandes de place des pastilles de câble (canvas/tags.ts) pour une version de la toile : vitesses d'abord (au
// milieu de leurs câbles), puis étiquettes de faisceau (une MLAG près de l'équipement double-attaché). Toutes sont
// placées, montrées ou non : une pastille ne bouge pas quand un clic en révèle une autre ou qu'une couche s'allume.
import type { Box } from "../../canvas/card";
import { beamBand } from "../../canvas/geometry";
import type { Point } from "../../canvas/layout";
import { beamPillText } from "../../canvas/pill";
import type { SpeedGroup } from "../../canvas/speed";
import { MIDDLE, NEAR_P, NEAR_Q, placeTags } from "../../canvas/tags";
import type { Rect, TagRequest, TagSlot } from "../../canvas/tags";
import type { Beam } from "../../canvas/types";
import { pillSvgWidth } from "./pill";

export const speedTagId = (group: SpeedGroup): string => "speed:" + group.key;
export const beamTagId = (beam: Beam): string => "beam:" + beam.id;

/** Le côté où se lit une MLAG : près du bout qui n'est pas dans le domaine (l'équipement double-attaché). */
function beamPrefer(beam: Beam): readonly number[] {
  if (beam.peerLink || !beam.mlags.length) return MIDDLE;
  const inDomain = (host: string): boolean => beam.mlags.some((d) => d.members.some((agg) => agg.hostname === host));
  const a = inDomain(beam.a.hostname), b = inDomain(beam.b.hostname);
  return a && !b ? NEAR_Q : b && !a ? NEAR_P : MIDDLE;
}

export function placeCableTags(groups: readonly SpeedGroup[], beams: readonly Beam[], at: (host: string) => Point | undefined,
  boxes: ReadonlyMap<string, Box>, more: readonly Rect[] = []): Map<string, TagSlot> {
  const obstacles: Rect[] = more.slice();
  boxes.forEach((box, host) => { const c = at(host); if (c) obstacles.push({ x: c.x - box.w / 2, y: c.y - box.h / 2, w: box.w, h: box.h }); });
  const requests: TagRequest[] = [];
  groups.forEach((g) => {
    const first = g.links[0], p = at(first.a.hostname), q = at(first.b.hostname);
    const dot = g.worst === "error" || (g.worst === "warning" && g.tone !== "warning");
    if (p && q) requests.push({ id: speedTagId(g), p, q, offset: g.offset, w: pillSvgWidth(g.text, dot ? "dot" : null), prefer: [g.t, ...MIDDLE.filter((t) => t !== g.t)] });
  });
  beams.forEach((beam) => {
    const p = at(beam.a.hostname), q = at(beam.b.hostname);
    if (p && q) requests.push({ id: beamTagId(beam), p, q, offset: beamBand(beam).offset, w: pillSvgWidth(beamPillText(beam)), prefer: beamPrefer(beam) });
  });
  return placeTags(requests, obstacles);
}

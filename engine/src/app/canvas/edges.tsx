// Les arêtes de la toile React Flow : un câble (tracé courbe de l'éventail, coloré par statut, halo du diff, halo du
// heartbeat, point de sévérité, noms des ports hors des cartes), la bande d'un faisceau d'agrégat sous ses câbles,
// l'étiquette du faisceau et la vitesse d'un groupe de câbles, arêtes à part dessinées après les câbles pour rester
// lisibles (pastilles, pill.tsx). La géométrie
// est celle de `/view` (geometry.ts) ; les bouts sont les centres des cartes, que React Flow donne.
import type { Edge, EdgeProps } from "@xyflow/react";
import { reach } from "../../canvas/card";
import type { Box } from "../../canvas/card";
import { chord, curve } from "../../canvas/geometry";
import { PILL_H, beamPillText } from "../../canvas/pill";
import type { SpeedGroup } from "../../canvas/speed";
import { tagCenter } from "../../canvas/tags";
import type { TagSlot } from "../../canvas/tags";
import type { BeamBand } from "../../canvas/geometry";
import type { Beam, ModelLink } from "../../canvas/types";
import { PillSvg, pillSvgWidth } from "./pill";

export interface CableData extends Record<string, unknown> { link: ModelLink; boxA: Box; boxB: Box; change: string | null; classes: string }
export interface BeamData extends Record<string, unknown> { beam: Beam; band: BeamBand; slot: TagSlot; classes: string }
export type CableEdgeType = Edge<CableData, "cable">;
export type BeamEdgeType = Edge<BeamData, "beam" | "beamLabel">;
export interface SpeedData extends Record<string, unknown> { group: SpeedGroup; slot: TagSlot; classes: string }
export type SpeedEdgeType = Edge<SpeedData, "speed">;

export function CableEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<CableEdgeType>) {
  if (!data) return null;
  const { link, boxA, boxB } = data;
  const p = { x: sourceX, y: sourceY }, q = { x: targetX, y: targetY };
  const clear: [number, number] = [reach(boxA, q.x - p.x, q.y - p.y), reach(boxB, q.x - p.x, q.y - p.y)];
  const shape = curve(p, q, link, clear);
  const mark = link.worst === "error" || link.worst === "warning";
  return (
    <g className={data.classes} data-link={link.index}>
      {data.change ? <path className="diff-halo" d={shape.path} /> : null}
      {link.heartbeat ? <path className="link-halo" d={shape.path} /> : null}
      <path className="link-line" d={shape.path} />
      <path className="link-hit react-flow__edge-interaction" d={shape.path} />
      {mark ? <circle className={"link-mark severity-" + link.worst} cx={shape.mid.x} cy={shape.mid.y} r={4.5} /> : null}
      {[link.a.interface, link.b.interface].map((name, i) => (
        <text key={i} className="port-label" x={shape.ends[i].x} y={shape.ends[i].y} textAnchor={shape.anchor || "middle"}>{name}</text>
      ))}
    </g>
  );
}

// La bande suit l'axe de ses propres câbles (décalé de l'axe de la paire quand un autre faisceau la partage).
export function BeamEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<BeamEdgeType>) {
  if (!data) return null;
  const axis = chord({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.band.offset);
  return (
    <g className={"beam " + data.classes} data-beam={data.beam.index}>
      <path className="beam-band" d={axis.path} strokeWidth={data.band.band} />
      <path className="beam-hit react-flow__edge-interaction" d={axis.path} strokeWidth={data.band.hit} />
    </g>
  );
}

// L'étiquette d'un faisceau, en pastille horizontale (PO10, MLAG 104, PEER-LINK ; pill.ts) : cachée au repos, montrée
// par la couche « port-channels et vPC » ou quand un clic révèle le faisceau (reveal.ts). Elle se pose sur sa courbe, à
// la place que tags.ts lui a trouvée (ni sur une carte, ni sur une autre pastille) ; pendant un glissé, elle suit.
export function BeamLabelEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<BeamEdgeType>) {
  if (!data) return null;
  const text = beamPillText(data.beam);
  const w = pillSvgWidth(text);
  const at = tagCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, data.band.offset, w, data.slot);
  const x = at.x - w / 2, y = at.y - PILL_H / 2;
  return (
    <g className={"beam-tag " + data.classes} data-beam={data.beam.index}>
      <rect className="beam-label-hit react-flow__edge-interaction" x={x} y={y} width={w} height={PILL_H} rx={PILL_H / 2} />
      <PillSvg x={x} y={y} text={text} tone={data.beam.degraded ? "warning" : "structure"} />
    </g>
  );
}

// La vitesse d'un groupe de câbles (speed.ts) : une pastille horizontale sur leur courbe (place : tags.ts), le point de gravité
// des câbles dedans. Montrée par la couche « vitesses », ou quand un câble du groupe est sélectionné ou éclairé.
export function SpeedEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<SpeedEdgeType>) {
  if (!data) return null;
  const g = data.group;
  const dot = g.worst === "error" || (g.worst === "warning" && g.tone !== "warning") ? g.worst : null;
  const w = pillSvgWidth(g.text, dot ? "dot" : null);
  const at = tagCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, g.offset, w, data.slot);
  return (
    <g className={"speed-pill " + data.classes}>
      <PillSvg x={at.x - w / 2} y={at.y - PILL_H / 2} text={g.text} tone={g.tone} dot={dot} dashed={g.dashed} />
    </g>
  );
}

export const edgeTypes = { cable: CableEdge, beam: BeamEdge, beamLabel: BeamLabelEdge, speed: SpeedEdge };

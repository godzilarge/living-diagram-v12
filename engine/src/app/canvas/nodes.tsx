// Les nœuds de la toile React Flow : la carte d'un équipement (card.ts, forme large : rail de couleur du type, icône
// de type pleine en trois couches (icons.ts), nom en capitales ; point de gravité, stack et rôle HA en pastilles sur le bord haut, chips.tsx), le disque d'un voisin inconnu, le
// cadre d'un cluster HA. Dessinés en SVG dans le nœud, aux dimensions du plan : la taille mesurée par React Flow est
// celle que la toile a calculée, les positions restent déterministes. Mêmes classes que `/view` (canvas.css les
// stylise), jamais de style en ligne. Une poignée invisible au centre : les câbles vont de centre à centre, sous les
// cartes.
import { Handle, Position } from "@xyflow/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { AnnotationContext, EditRequest } from "./annotation";
import { InlineInput } from "./inline";
import type { Node, NodeProps } from "@xyflow/react";
import { STUB_R } from "../../canvas/card";
import type { CardPlan } from "../../canvas/card";
import { WEIGHT_VALUE } from "../../canvas/groups";
import type { LabelSlot } from "../../canvas/groups";
import { PIN, glyph } from "../../canvas/icons";
import type { GroupStyle } from "../../canvas/types";
import type { StackMember } from "../../contracts/snapshot";
import { Chips, StackList } from "./chips";
import type { HaChip } from "./chips";

export interface CardData extends Record<string, unknown> {
  hostname: string; name: string; type: string | null; hue: string; plan: CardPlan; ha: HaChip | null; members: StackMember[] | null;
  severity: string | null; change: string | null; classes: string; label: string; editable: boolean;
}
export interface StubData extends Record<string, unknown> { hostname: string; name: string; change: string | null; classes: string; label: string; editable: boolean }
export interface ClusterData extends Record<string, unknown> { id: string; w: number; h: number; label: string; classes: string }
/** Le cadre d'un groupe (docs/10 §5) : sa boîte calculée, son style, l'ancre de l'étiquette, le motif de la bordure. */
export interface FrameData extends Record<string, unknown> { id: string; label: string; w: number; h: number; style: GroupStyle; slot: LabelSlot; dash: string | null; present: number; classes: string; editable: boolean }
export type CardNodeType = Node<CardData, "card">;
export type StubNodeType = Node<StubData, "stub">;
export type ClusterNodeType = Node<ClusterData, "cluster">;
export type FrameNodeType = Node<FrameData, "frame">;

/** Le nœud React Flow d'un voisin inconnu : deux carreaux de grille (20) autour de son disque, pour qu'un coin aimanté
 *  mette son centre sur la grille, comme une carte (largeur multiple de 40, hauteur 80). Lot 5 de docs/11. */
export const STUB_SLOT = { w: 40, h: 40 } as const;

const Ports = () => (
  <>
    <Handle type="target" position={Position.Top} className="port" isConnectable={false} />
    <Handle type="source" position={Position.Top} className="port" isConnectable={false} />
  </>
);

/** L'icône de type en trois couches : silhouette (couleur du type), bandeau du bas, symbole en réserve. */
export function TypeGlyph({ type, x, y, scale, lod }: { type: string | null; x: number; y: number; scale: number; lod?: "base" | "far" }) {
  const g = glyph(type);
  return (
    <g className={lod ? "node-icon lod-" + lod : "node-icon"} transform={`translate(${x},${y}) scale(${scale})`}>
      <path className="icon-body" d={g.body} /><path className="icon-shade" d={g.shade} /><path className="icon-mark" d={g.mark} />
    </g>
  );
}

export function CardNode({ data }: NodeProps<CardNodeType>) {
  const p = data.plan;
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((was) => !was), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      {/* le nom accessible est sur le nœud React Flow (`ariaLabel`) ; ici, seule la chip de stack parle (un bouton) */}
      <svg className={"node " + data.classes} width={p.w} height={p.h} viewBox={`${-p.w / 2} ${-p.h / 2} ${p.w} ${p.h}`} overflow="visible" data-node={data.hostname}>
        {data.change && data.change !== "removed" ? <rect className="node-ring" x={-p.w / 2 - 4} y={-p.h / 2 - 4} width={p.w + 8} height={p.h + 8} rx={p.rx + 4} /> : null}
        <rect className="node-shape" x={-p.w / 2} y={-p.h / 2} width={p.w} height={p.h} rx={p.rx} />
        <path className="node-rail" d={p.rail} />
        {/* trois niveaux de détail dans la même boîte (card.ts), un seul montré selon le zoom (canvas.css) */}
        <g aria-hidden="true">
          <TypeGlyph type={data.type} x={p.icon.x} y={p.icon.y} scale={p.icon.scale} lod="base" />
          {p.far.icon ? <TypeGlyph type={data.type} x={p.far.icon.x} y={p.far.icon.y} scale={p.far.icon.scale} lod="far" /> : null}
        </g>
        <text className="node-label lod-base" x={p.label.x} y={p.label.y} textAnchor={p.label.anchor} aria-hidden="true">{data.name}</text>
        <text className="node-label lod-far" x={p.far.label.x} y={p.far.label.y} textAnchor={p.far.label.anchor} aria-hidden="true">{p.far.text}</text>
        <text className="node-label lod-tiny" x={p.tiny.label.x} y={p.tiny.label.y} textAnchor={p.tiny.label.anchor} aria-hidden="true">{p.tiny.text}</text>
        <path className="node-pin" d={PIN} transform={`translate(${-p.w / 2 - 9},${-p.h / 2 - 9})`} />
        <Chips plan={p} ha={data.ha} count={data.members ? data.members.length : 0} severity={data.severity} open={open} onToggle={toggle} />
      </svg>
      {open && data.members ? <StackList hostname={data.hostname} members={data.members} onClose={close} /> : null}
      <Ports />
    </>
  );
}

export function StubNode({ data }: NodeProps<StubNodeType>) {
  const w = STUB_SLOT.w, h = STUB_SLOT.h;
  return (
    <>
      <svg className={"node " + data.classes} width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} overflow="visible" aria-hidden="true" data-node={data.hostname}>
        {data.change && data.change !== "removed" ? <circle className="node-ring" r={STUB_R + 4} /> : null}
        <circle className="node-shape" r={STUB_R} />
        <text className="node-label" y={STUB_R + 14} textAnchor="middle">{data.name}</text>
        <path className="node-pin" d={PIN} transform={`translate(${-STUB_R - 9},${-STUB_R - 9})`} />
      </svg>
      <Ports />
    </>
  );
}

export function ClusterNode({ data }: NodeProps<ClusterNodeType>) {
  return (
    <svg className={"cluster " + data.classes} width={data.w} height={data.h} viewBox={`0 0 ${data.w} ${data.h}`} overflow="visible" aria-hidden="true" data-cluster={data.id}>
      <rect className="cluster-hull" x={0} y={0} width={data.w} height={data.h} rx={14} />
      <text className="cluster-label" x={14} y={20}>{data.label}</text>
    </svg>
  );
}

// Le cadre : rectangle aux coins `radius` ou ellipse, rempli et bordé à la teinte du groupe (classe `hue-*`, attributs de
// présentation pour les valeurs libres : opacité, épaisseur, motif, taille du texte ; jamais un style en ligne). Un
// double-clic (ou F2, Entrée sur le groupe sélectionné) édite son nom en place, à la place de l'étiquette (lot 2 de docs/11).
const NAME_W = 220, NAME_H = 28;
// Le champ du nom, posé là où l'étiquette s'écrit (même ancre, même ligne de base approchée).
function nameBox(slot: FrameData["slot"]): { x: number; y: number } {
  const x = slot.anchor === "middle" ? slot.x - NAME_W / 2 : slot.anchor === "end" ? slot.x - NAME_W : slot.x;
  const y = slot.baseline === "hanging" ? slot.y - 4 : slot.baseline === "middle" ? slot.y - NAME_H / 2 : slot.y - NAME_H + 4;
  return { x, y };
}
export function FrameNode({ data }: NodeProps<FrameNodeType>) {
  const s = data.style;
  const actions = useContext(AnnotationContext), request = useContext(EditRequest);
  const [editing, setEditing] = useState(false);
  const handled = useRef(0); // une demande d'édition ne s'ouvre qu'une fois (le cadre redessiné ne la rejoue pas)
  useEffect(() => {
    if (!request || request.kind !== "group" || request.id !== data.id || !data.editable || request.at === handled.current) return;
    handled.current = request.at;
    setEditing(true);
  }, [request, data.id, data.editable]);
  useEffect(() => { actions.hold("edit:group:" + data.id, editing); return () => actions.hold("edit:group:" + data.id, false); }, [actions, data.id, editing]);
  const done = useCallback((text: string | null): void => {
    setEditing(false);
    const next = text === null ? "" : text.trim();
    if (next && next !== data.label) actions.groupLabel(data.id, next); // un nom vide ne s'écrit pas (1 à 80 caractères)
  }, [actions, data.id, data.label]);
  const stroke = s.stroke_style === "none" ? 0 : s.stroke_width;
  const labelClass = "frame-label" + (s.label_font === "mono" ? " font-mono" : "") + (s.label_color === "ink" ? " label-ink" : "");
  return (
    <svg className={"frame hue-" + s.hue + " " + data.classes} width={data.w} height={data.h} viewBox={`0 0 ${data.w} ${data.h}`} overflow="visible" aria-hidden={editing ? undefined : "true"} data-group={data.id}
      onDoubleClick={(event) => { if (data.editable) { event.stopPropagation(); setEditing(true); } }}>
      {s.shape === "ellipse"
        ? <ellipse className="frame-shape" cx={data.w / 2} cy={data.h / 2} rx={data.w / 2} ry={data.h / 2} fillOpacity={s.fill_opacity / 100} strokeWidth={stroke} strokeDasharray={data.dash || undefined} strokeLinecap="round" />
        : <rect className="frame-shape" x={0} y={0} width={data.w} height={data.h} rx={s.radius} fillOpacity={s.fill_opacity / 100} strokeWidth={stroke} strokeDasharray={data.dash || undefined} strokeLinecap="round" />}
      {editing ? null : <text className={labelClass} x={data.slot.x} y={data.slot.y} textAnchor={data.slot.anchor} dominantBaseline={data.slot.baseline} fontSize={s.label_size} fontWeight={WEIGHT_VALUE[s.label_weight] || 600}>{data.label}</text>}
      {s.shape === "ellipse"
        ? <ellipse className="hover-ring" cx={data.w / 2} cy={data.h / 2} rx={data.w / 2} ry={data.h / 2} />
        : <rect className="hover-ring" x={0} y={0} width={data.w} height={data.h} rx={s.radius} />}
      {editing ? <InlineInput at={nameBox(data.slot)} width={NAME_W} height={NAME_H} initial={data.label} max={80} label={t("shell:canvas.groupName")} onDone={done} /> : null}
    </svg>
  );
}

export const nodeTypes = { card: CardNode, stub: StubNode, cluster: ClusterNode, frame: FrameNode };

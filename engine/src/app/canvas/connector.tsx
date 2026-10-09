// Le nœud React Flow d'un connecteur (docs/10 §6, Intent 1.4.0 ; ancres 1.5.0 ; Orhan, 2026-10-09 : « si je ne peux
// pas contrôler pleinement leur position et leur forme, elles ne sont pas utiles », puis « pas facilement
// manipulables »). Une ligne ou une flèche entre deux bouts, chacun libre ou attaché à un équipement, un groupe ou une
// annotation, sur une ancre (le milieu d'un côté) ou sur le contour. Le nœud ne se glisse pas comme une carte : il
// lit la place vivante de ses bouts dans React Flow (une carte glissée l'entraîne pendant le geste). Survolé ou
// sélectionné, trois poignées à taille d'écran constante : les deux bouts (glisser un bout montre les ancres de
// l'élément survolé et s'y accroche ; relâché ailleurs, il est libre) et la courbure au milieu (glisser un tracé droit
// le courbe). Un double-clic édite l'étiquette en place.
import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { WEIGHT_VALUE, dashArray } from "../../canvas/groups";
import { arrowHead, bendFrom, headSize, pathOf, summary } from "../../canvas/connectors";
import type { EndPlace, Shape } from "../../canvas/connectors";
import type { Point } from "../../canvas/layout";
import { textWidth } from "../../canvas/card";
import type { Connector } from "../../canvas/types";
import { AnchorDots, useUnzoom } from "./anchors";
import { AnnotationContext } from "./annotation";
import type { CardData } from "./nodes";
import type { EndKind, Pick } from "./snap";

export interface ConnectorData extends Record<string, unknown> {
  c: Connector; places: { start: EndPlace; end: EndPlace }; origin: Point; editable: boolean; classes: string; label: string;
}
export type ConnectorNodeType = Node<ConnectorData, "connector">;
const HANDLE_R = 7, HIT = 16;
type EndName = "start" | "end";

/** Le contour d'un nœud attachable, lu sur ses données : carte (coins), disque, annotation (forme), cadre (style). */
export function shapeOf(node: { type?: string; data: Record<string, unknown> }): Shape {
  const data = node.data;
  if (node.type === "card") return { kind: "rect", rx: (data.plan as CardData["plan"]).rx };
  if (node.type === "stub") return { kind: "ellipse" };
  if (node.type === "annotation") {
    const a = data.a as { content: { kind: string; shape?: string }; style: { radius: number } };
    return a.content.kind === "shape" && a.content.shape === "ellipse" ? { kind: "ellipse" } : { kind: "rect", rx: a.style.radius };
  }
  const style = data.style as { shape: string; radius: number } | undefined;
  return style && style.shape === "ellipse" ? { kind: "ellipse" } : { kind: "rect", rx: style ? style.radius : 0 };
}
// La place vivante d'un bout attaché : la boîte de son nœud React Flow (position absolue, taille mesurée ou calculée),
// son contour et son ancre ; sans nœud (pas encore dessiné), celle que la toile a calculée.
function livePlace(end: Connector["start"], fallback: EndPlace, lookup: ReturnType<ReturnType<typeof useStoreApi>["getState"]>["nodeLookup"]): EndPlace {
  if (end.kind === "free") return fallback;
  const id = end.kind === "device" ? end.ref : end.kind === "group" ? "group:" + end.ref : "annotation:" + end.ref;
  const node = lookup.get(id);
  if (!node) return fallback;
  const at = node.internals.positionAbsolute;
  const data = node.data as Record<string, unknown>;
  const plan = data.plan as CardData["plan"] | undefined, frame = data.frame as { w: number; h: number } | undefined;
  const w = plan ? plan.w : frame ? frame.w : typeof data.w === "number" ? data.w : node.measured?.width || 0;
  const h = plan ? plan.h : frame ? frame.h : typeof data.h === "number" ? data.h : node.measured?.height || 0;
  return { kind: "box", frame: { x: at.x, y: at.y, w, h }, shape: shapeOf(node), side: end.side };
}

/** Le champ de l'étiquette en place : Entrée ou quitter enregistre, Échap abandonne. */
function LabelEditor({ at, initial, onDone }: { at: Point; initial: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onDone(null); }
    else if (event.key === "Enter") { event.preventDefault(); onDone((event.target as HTMLInputElement).value); }
  };
  return (
    <foreignObject x={at.x - 80} y={at.y - 12} width={160} height={24} className="cell-editor-slot">
      <input ref={ref} className="cell-editor nodrag nopan nowheel" defaultValue={initial} maxLength={80} aria-label="étiquette du connecteur" spellCheck={false}
        onKeyDown={keys} onBlur={(event) => onDone(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} />
    </foreignObject>
  );
}

/** Le tracé d'un connecteur dans un `svg` : trait, pointes, étiquette ; partagé avec le brouillon d'un connecteur qu'on tire. */
export function Stroke({ d, a, b, dirA, dirB, heads, style, label, mid }: { d: string; a: Point; b: Point; dirA: Point; dirB: Point; heads: Connector["heads"]; style: Connector["style"]; label: string; mid: Point }) {
  const s = style;
  const dash = dashArray({ stroke_style: s.stroke_style, stroke_width: s.stroke_width }) || undefined;
  const size = headSize(s);
  const textClass = "annotation-text" + (s.text_font === "mono" ? " font-mono" : "") + (s.text_color === "ink" ? " text-ink" : "");
  const labelW = label ? textWidth(label, s.text_size) + 10 : 0;
  return (
    <>
      <path className="connector-line" d={d} strokeWidth={s.stroke_width} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
      {heads.start === "arrow" ? <polygon className="connector-head" points={arrowHead(a, dirA, size)} /> : null}
      {heads.end === "arrow" ? <polygon className="connector-head" points={arrowHead(b, dirB, size)} /> : null}
      {label ? (
        <g className="connector-label">
          <rect className="connector-label-box" x={mid.x - labelW / 2} y={mid.y - s.text_size * 0.75 - 3} width={labelW} height={s.text_size * 1.5 + 4} rx={4} />
          <text className={textClass} x={mid.x} y={mid.y + s.text_size * 0.36} textAnchor="middle" fontSize={s.text_size} fontWeight={WEIGHT_VALUE[s.text_weight] || 600}>{label}</text>
        </g>
      ) : null}
    </>
  );
}

export function ConnectorNode({ data, selected }: NodeProps<ConnectorNodeType>) {
  const { c, origin, editable } = data;
  const rf = useReactFlow();
  const store = useStoreApi();
  useStore((s) => s.nodes); // se redessine quand un nœud bouge : les bouts attachés suivent pendant un glissé
  const k = useUnzoom();
  const actions = useContext(AnnotationContext);
  const [live, setLive] = useState<{ start?: EndPlace; end?: EndPlace; bend?: number; route?: string; pick?: Pick } | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setLive(null); }, [c]);
  const lookup = store.getState().nodeLookup;
  const start = live && live.start ? live.start : livePlace(c.start, data.places.start, lookup);
  const end = live && live.end ? live.end : livePlace(c.end, data.places.end, lookup);
  const route = live && live.route ? live.route : c.route;
  const bend = live && live.bend !== undefined ? live.bend : c.bend;
  const path = pathOf(start, end, route, bend);
  const rel = useCallback((p: Point): Point => ({ x: p.x - origin.x, y: p.y - origin.y }), [origin.x, origin.y]);
  const canEdit = editable && !c.locked;
  const s = c.style;
  const a = rel(path.a), b = rel(path.b), mid = rel(path.mid);
  const d = path.d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => (Number(x) - origin.x).toFixed(1) + "," + (Number(y) - origin.y).toFixed(1));
  // L'autre bout du connecteur ne peut pas prendre celui qu'on glisse (`connector_same_ends`).
  const other = useCallback((which: EndName) => { const o = which === "start" ? c.end : c.start; return (kind: EndKind, ref: string): boolean => o.kind !== "free" && o.kind === kind && o.ref === ref; }, [c]);

  // Les poignées : un bout glissé suit le pointeur et s'accroche à ce qu'il survole ; relâché, la page écrit.
  const drag = useRef<{ what: EndName | "bend" | "body"; sx: number; sy: number; from: Point; startAt?: Point; endAt?: Point } | null>(null);
  const planAt = (event: ReactPointerEvent): Point => rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
  const down = useCallback((what: EndName | "bend" | "body") => (event: ReactPointerEvent<SVGElement>): void => {
    if (!canEdit) return;
    if (what === "body" && !selected) return; // le premier clic sélectionne (React Flow) ; ensuite, glisser déplace
    if (what === "body" && c.start.kind !== "free" && c.end.kind !== "free") return;
    event.stopPropagation(); event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    const from = planAt(event);
    drag.current = { what, sx: event.clientX, sy: event.clientY, from, startAt: c.start.kind === "free" ? { x: c.start.x, y: c.start.y } : undefined, endAt: c.end.kind === "free" ? { x: c.end.x, y: c.end.y } : undefined };
  }, [canEdit, selected, c]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = useCallback((event: ReactPointerEvent<SVGElement>): void => {
    const g = drag.current;
    if (!g) return;
    const at = planAt(event);
    if (g.what === "start" || g.what === "end") { const pick = actions.pick(at, other(g.what)); setLive({ [g.what]: pick.place, pick }); }
    else if (g.what === "bend") { const r = c.route === "straight" ? "curve" : c.route; setLive({ route: r, bend: bendFrom(path.chord.a, path.chord.b, r, at) }); }
    else {
      const dx = at.x - g.from.x, dy = at.y - g.from.y;
      setLive({ start: g.startAt ? { kind: "point", at: { x: g.startAt.x + dx, y: g.startAt.y + dy } } : undefined, end: g.endAt ? { kind: "point", at: { x: g.endAt.x + dx, y: g.endAt.y + dy } } : undefined });
    }
  }, [c.route, path.chord, actions, other]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = useCallback((event: ReactPointerEvent<SVGElement>): void => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    const at = planAt(event);
    setLive(null);
    if (g.what === "start" || g.what === "end") {
      if (Math.hypot(event.clientX - g.sx, event.clientY - g.sy) < 3) return;
      actions.connector(c.id, { [g.what]: actions.pick(at, other(g.what)).end });
    } else if (g.what === "bend") {
      const r = c.route === "straight" ? "curve" : c.route;
      actions.connector(c.id, { route: r as Connector["route"], bend: Math.max(-2000, Math.min(2000, bendFrom(path.chord.a, path.chord.b, r, at))) });
    } else {
      const dx = Math.round(at.x - g.from.x), dy = Math.round(at.y - g.from.y);
      if (!dx && !dy) return;
      actions.connector(c.id, {
        ...(g.startAt ? { start: { kind: "free" as const, x: g.startAt.x + dx, y: g.startAt.y + dy } } : {}),
        ...(g.endAt ? { end: { kind: "free" as const, x: g.endAt.x + dx, y: g.endAt.y + dy } } : {}),
      });
    }
  }, [actions, c, path.chord, other]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneLabel = useCallback((text: string | null): void => { setEditing(false); if (text !== null && text.trim() !== c.label) actions.connector(c.id, { label: text.trim().slice(0, 80) }); }, [actions, c]);
  const classes = `connector hue-${s.hue} plane-${c.z}${c.locked ? " locked" : ""}${live ? " live" : ""} ${data.classes}`;
  const pick = live ? live.pick : undefined;
  return (
    <svg className={classes} width={1} height={1} overflow="visible" opacity={s.opacity / 100} data-connector={c.id}
      onDoubleClick={(event) => { if (canEdit) { event.stopPropagation(); setEditing(true); } }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); actions.menu({ kind: "connector", id: c.id }, event); }}>
      <path className="connector-hit nodrag nopan" d={d} strokeWidth={HIT * k} onPointerDown={down("body")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <Stroke d={d} a={a} b={b} dirA={path.dirA} dirB={path.dirB} heads={c.heads} style={s} label={editing ? "" : c.label} mid={mid} />
      {pick && pick.target ? <AnchorDots anchors={pick.anchors} snapped={pick.snapped} rel={rel} k={k} /> : null}
      {canEdit && !editing ? (
        <g className={"connector-handles" + (selected ? " shown" : "")}>
          {path.bendable ? <circle className="connector-handle bend nodrag nopan" cx={mid.x} cy={mid.y} r={(HANDLE_R - 1) * k} onPointerDown={down("bend")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /> : null}
          <circle className={"connector-handle end nodrag nopan" + (c.start.kind === "free" ? "" : " attached")} cx={a.x} cy={a.y} r={HANDLE_R * k} onPointerDown={down("start")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          <circle className={"connector-handle end nodrag nopan" + (c.end.kind === "free" ? "" : " attached")} cx={b.x} cy={b.y} r={HANDLE_R * k} onPointerDown={down("end")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        </g>
      ) : null}
      {editing ? <LabelEditor at={mid} initial={c.label} onDone={doneLabel} /> : null}
      <title>{summary(c)}</title>
    </svg>
  );
}

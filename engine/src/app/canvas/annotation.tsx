// Le nœud React Flow d'une annotation (docs/10 §6) : une note, une forme, un tableau ou une image, dessinée en SVG aux
// dimensions de sa boîte, aux attributs de présentation pour les valeurs libres (jamais un style en ligne). Attachée,
// elle est un nœud enfant de sa carte ou de son cadre : React Flow la déplace avec eux. Sélectionnée et éditable, huit
// poignées la redimensionnent (Maj garde le rapport) ; un double-clic sur une note ouvre son texte en place, un
// tableau s'édite cellule par cellule (table.tsx) ; le clic droit ouvre le menu contextuel.
import { useReactFlow } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { dashArray, layoutText } from "../../canvas/annotations";
import type { Frame, Segment } from "../../canvas/annotations";
import { WEIGHT_VALUE } from "../../canvas/groups";
import type { Point } from "../../canvas/layout";
import type { Range } from "../../canvas/table";
import type { Annotation } from "../../canvas/types";
import type { TableContent } from "../../contracts/intent";
import type { ConnectorPatch } from "../../shell/apps";
import type { ContextTarget } from "../state/context";
import type { End } from "../../canvas/connectors";
import { Anchors } from "./anchors";
import { useAsset } from "./assets";
import type { EndKind, Pick } from "./snap";
import { TableBody } from "./table";
import type { Cell } from "./table";

export interface AnnotationData extends Record<string, unknown> {
  a: Annotation; frame: Frame; leader: Segment | null; editable: boolean; classes: string; label: string;
}
export type AnnotationNodeType = Node<AnnotationData, "annotation">;
/** Ce que la toile sait faire d'une annotation ou d'un connecteur : la page écrit par l'API. */
export interface AnnotationActions {
  resize: (id: string, frame: Frame) => void;
  edit: (id: string, text: string) => void;
  /** Le contenu d'un tableau remplacé (cellule, ligne, colonne, fusion, largeurs). */
  content: (id: string, content: TableContent) => void;
  /** Le menu contextuel, pour une cible, à l'endroit de l'événement. */
  menu: (target: ContextTarget, event: ReactMouseEvent) => void;
  /** Un connecteur modifié (bouts, tracé, courbure, étiquette). */
  connector: (id: string, patch: ConnectorPatch) => void;
  /** Ce qu'un bout de connecteur glissé en un point du plan devient (snap.ts) : une ancre à portée, l'élément dessous,
   *  ou libre ; `exclude` écarte l'autre bout du même connecteur. */
  pick: (at: Point, exclude?: (kind: EndKind, ref: string) => boolean) => Pick;
  /** Tirer un connecteur depuis une ancre : le départ, puis le bout d'arrivée qui suit le pointeur, puis la relâche (créé). */
  drawStart: (start: End, at: Point) => void;
  drawMove: (at: Point) => void;
  drawEnd: (at: Point) => void;
}
const freePick = (at: Point): Pick => ({ end: { kind: "free", x: at.x, y: at.y }, place: { kind: "point", at }, target: null, anchors: [], snapped: null });
export const AnnotationContext = createContext<AnnotationActions>({ resize: () => undefined, edit: () => undefined, content: () => undefined, menu: () => undefined, connector: () => undefined, pick: freePick, drawStart: () => undefined, drawMove: () => undefined, drawEnd: () => undefined });
/** Les gestes d'édition en place qu'une commande (menu) peut demander au nœud : éditer telle cellule, tel texte. */
export const EditRequest = createContext<{ id: string; cell: Cell | null; at: number } | null>(null);

const HANDLE = 8, MIN = 20, MAX = 4000;
type Corner = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Corner[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const handleAt = (c: Corner, f: Frame): { x: number; y: number } => ({
  x: c.includes("w") ? 0 : c.includes("e") ? f.w : f.w / 2,
  y: c.includes("n") ? 0 : c.includes("s") ? f.h : f.h / 2,
});
/** La boîte après un glissé de poignée de (dx, dy) en unités du plan ; Maj garde le rapport ; jamais sous 20. */
export function resized(start: Frame, corner: Corner, dx: number, dy: number, keepRatio: boolean): Frame {
  let { x, y, w, h } = start;
  if (corner.includes("e")) w = start.w + dx;
  if (corner.includes("s")) h = start.h + dy;
  if (corner.includes("w")) { w = start.w - dx; x = start.x + dx; }
  if (corner.includes("n")) { h = start.h - dy; y = start.y + dy; }
  if (keepRatio && corner.length === 2) { const k = Math.max(w / start.w, h / start.h); w = start.w * k; h = start.h * k; if (corner.includes("w")) x = start.x + start.w - w; if (corner.includes("n")) y = start.y + start.h - h; }
  w = Math.min(MAX, Math.max(MIN, Math.round(w))); h = Math.min(MAX, Math.max(MIN, Math.round(h)));
  if (corner.includes("w")) x = start.x + start.w - w;
  if (corner.includes("n")) y = start.y + start.h - h;
  return { x: Math.round(x), y: Math.round(y), w, h };
}

function Handles({ frame, onResize }: { frame: Frame; onResize: (next: Frame, done: boolean) => void }) {
  const rf = useReactFlow();
  const drag = useRef<{ corner: Corner; start: Frame; sx: number; sy: number } | null>(null);
  const down = useCallback((corner: Corner) => (event: ReactPointerEvent<SVGRectElement>): void => {
    event.stopPropagation(); event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { corner, start: frame, sx: event.clientX, sy: event.clientY };
  }, [frame]);
  const move = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current;
    if (!d) return;
    const k = rf.getZoom() || 1;
    onResize(resized(d.start, d.corner, (event.clientX - d.sx) / k, (event.clientY - d.sy) / k, event.shiftKey), false);
  }, [rf, onResize]);
  const up = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const k = rf.getZoom() || 1;
    onResize(resized(d.start, d.corner, (event.clientX - d.sx) / k, (event.clientY - d.sy) / k, event.shiftKey), true);
  }, [rf, onResize]);
  return (
    <g className="annotation-handles">
      {HANDLES.map((corner) => { const p = handleAt(corner, frame); return <rect key={corner} className={"annotation-handle nodrag nopan handle-" + corner} x={p.x - HANDLE / 2} y={p.y - HANDLE / 2} width={HANDLE} height={HANDLE} onPointerDown={down(corner)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />; })}
    </g>
  );
}

function Leader({ seg, frame }: { seg: Segment; frame: Frame }) {
  const x1 = seg.x1 - frame.x, y1 = seg.y1 - frame.y, x2 = seg.x2 - frame.x, y2 = seg.y2 - frame.y;
  const angle = Math.atan2(y2 - y1, x2 - x1), size = 9;
  const p = (a: number): string => `${(x2 - size * Math.cos(angle + a)).toFixed(1)},${(y2 - size * Math.sin(angle + a)).toFixed(1)}`;
  return <g className="annotation-leader"><line x1={x1} y1={y1} x2={x2} y2={y2} /><polygon className="annotation-arrow" points={`${x2},${y2} ${p(0.45)} ${p(-0.45)}`} /></g>;
}

function Body({ a, frame }: { a: Annotation; frame: Frame }) {
  const s = a.style, c = a.content;
  const stroke = s.stroke_style === "none" ? 0 : s.stroke_width;
  const dash = dashArray(s) || undefined;
  const textClass = "annotation-text" + (s.text_font === "mono" ? " font-mono" : "") + (s.text_color === "ink" ? " text-ink" : "");
  const weight = WEIGHT_VALUE[s.text_weight] || 450;
  const text = (content: string, pad?: number) => {
    const laid = layoutText(content, frame, s, pad);
    return <text className={textClass} fontSize={s.text_size} fontWeight={weight} textAnchor={laid.anchor}>{laid.lines.map((l, i) => <tspan key={i} x={l.x} y={l.y}>{l.text}</tspan>)}</text>;
  };
  const box = c.kind === "shape" && c.shape === "ellipse"
    ? <ellipse className="annotation-shape" cx={frame.w / 2} cy={frame.h / 2} rx={frame.w / 2} ry={frame.h / 2} fillOpacity={s.fill_opacity / 100} strokeWidth={stroke} strokeDasharray={dash} />
    : <rect className="annotation-shape" x={0} y={0} width={frame.w} height={frame.h} rx={s.radius} fillOpacity={s.fill_opacity / 100} strokeWidth={stroke} strokeDasharray={dash} />;
  if (c.kind === "note") return <>{box}{text(c.text)}</>;
  if (c.kind === "shape") return <>{box}{c.label ? text(c.label) : null}</>;
  return <>{box}<Picture a={a} frame={frame} /></>;
}

function Picture({ a, frame }: { a: Annotation; frame: Frame }) {
  const c = a.content;
  const url = useAsset(c.kind === "image" ? c.asset : null);
  if (c.kind !== "image") return null;
  if (!url) return <text className="annotation-text text-ink annotation-alt" x={frame.w / 2} y={frame.h / 2} textAnchor="middle" fontSize={12}>{url === null ? "image…" : c.alt || "image"}</text>;
  return <image href={url} x={0} y={0} width={frame.w} height={frame.h} preserveAspectRatio="xMidYMid meet" />;
}

/** L'éditeur de texte en place d'une note : un champ HTML par-dessus le nœud ; Ctrl+Entrée ou quitter enregistre, Échap abandonne. */
function NoteEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDone(null); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onDone((event.target as HTMLTextAreaElement).value); }
    event.stopPropagation();
  };
  return <textarea ref={ref} className="note-editor nodrag nopan nowheel" defaultValue={initial} maxLength={2000} aria-label="texte de la note" spellCheck={false}
    onKeyDown={keys} onBlur={(event) => onDone(event.target.value)} onPointerDown={(event) => event.stopPropagation()} />;
}

export function AnnotationNode({ data, selected }: NodeProps<AnnotationNodeType>) {
  const { a, editable } = data;
  const actions = useContext(AnnotationContext);
  const request = useContext(EditRequest);
  const [live, setLive] = useState<Frame | null>(null); // la boîte pendant un redimensionnement
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<Range | null>(null);
  const [cell, setCell] = useState<Cell | null>(null);
  useEffect(() => { setLive(null); }, [data.frame]);
  useEffect(() => { if (!selected) { setPick(null); setCell(null); } }, [selected]);
  // une commande du menu demande l'édition en place : telle cellule du tableau, ou le texte de la note
  useEffect(() => {
    if (!request || request.id !== a.id) return;
    if (request.cell && a.content.kind === "table") { setPick({ r0: request.cell[0], c0: request.cell[1], r1: request.cell[0], c1: request.cell[1] }); setCell(request.cell); }
    else if (a.content.kind === "note") setEditing(true);
  }, [request, a]);
  const frame = live || data.frame;
  const onResize = useCallback((next: Frame, done: boolean): void => { if (done) { setLive(null); actions.resize(a.id, next); } else setLive(next); }, [a.id, actions]);
  const canEdit = editable && !a.locked;
  const dbl = useCallback((): void => { if (canEdit && a.content.kind === "note") setEditing(true); }, [canEdit, a.content.kind]);
  const done = useCallback((text: string | null): void => { setEditing(false); if (text !== null && a.content.kind === "note" && text.trim() && text !== a.content.text) actions.edit(a.id, text); }, [a, actions]);
  const menu = useCallback((event: ReactMouseEvent): void => { event.preventDefault(); event.stopPropagation(); actions.menu({ kind: "annotation", id: a.id }, event); }, [actions, a.id]);
  const cellMenu = useCallback((target: { cell: Cell; range: Range }, event: ReactMouseEvent): void => { event.preventDefault(); event.stopPropagation(); actions.menu({ kind: "annotation", id: a.id, ...target }, event); }, [actions, a.id]);
  const classes = `annotation kind-${a.content.kind} hue-${a.style.hue} plane-${a.z}${a.locked ? " locked" : ""}${a.anchor.kind !== "free" ? " anchored" : ""} ${data.classes}`;
  return (
    <>
      <svg className={classes} width={frame.w} height={frame.h} viewBox={`0 0 ${frame.w} ${frame.h}`} overflow="visible" opacity={a.style.opacity / 100} data-annotation={a.id} onDoubleClick={dbl} onContextMenu={menu}>
        {data.leader && !live ? <Leader seg={data.leader} frame={frame} /> : null}
        {a.content.kind === "table"
          ? <TableBody a={a} content={a.content} frame={frame} active={!!selected} editable={canEdit} onContent={(content) => actions.content(a.id, content)} onMenu={cellMenu} pick={pick} onPick={setPick} editing={cell} onEdit={setCell} />
          : <Body a={a} frame={frame} />}
        {selected && canEdit && !editing && !cell ? <Handles frame={frame} onResize={onResize} /> : null}
        {editable && !editing && !cell && !live ? <Anchors frame={{ x: 0, y: 0, w: frame.w, h: frame.h }} kind="annotation" id={a.id} /> : null}
      </svg>
      {editing && a.content.kind === "note" ? <NoteEditor initial={a.content.text} onDone={done} /> : null}
    </>
  );
}

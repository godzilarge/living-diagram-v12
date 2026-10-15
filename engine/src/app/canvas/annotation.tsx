// Le nœud React Flow d'une annotation (docs/10 §6) : une note, une forme, un tableau ou une image, dessinée en SVG aux
// dimensions de sa boîte, aux attributs de présentation pour les valeurs libres (jamais un style en ligne). Attachée,
// elle est un nœud enfant de sa carte ou de son cadre : React Flow la déplace avec eux. Sélectionnée et éditable, huit
// poignées à taille d'écran constante la redimensionnent (handles.ts : quatre coins, quatre barres de côté ; Maj garde
// le rapport, Alt part du centre), une pastille dit la taille pendant le geste, « X, Y » pendant un glissé ; un
// double-clic (ou F2, Entrée) sur une note ouvre son texte en place, sur une forme son étiquette (lot 2 de docs/11), un
// tableau s'édite cellule par cellule (table.tsx) ; le clic droit
// ouvre le menu contextuel. Survolée quand on peut écrire, un liseré d'accent (lot 1 de docs/11).
import { t } from "../../i18n";
import { useReactFlow, useStore } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { dashArray, KIND_LABEL, layoutText } from "../../canvas/annotations";
import type { Frame, Segment } from "../../canvas/annotations";
import { WEIGHT_VALUE } from "../../canvas/groups";
import type { Point } from "../../canvas/layout";
import type { Range } from "../../canvas/table";
import type { Annotation } from "../../canvas/types";
import type { TableContent } from "../../contracts/intent";
import type { ConnectorPatch } from "../../shell/apps";
import type { ContextTarget } from "../state/context";
import { PillSvg } from "./pill";
import { positionPill, resized, sizePill, handleShapes } from "./handles";
import type { HandleId, PillPlace } from "./handles";
import { useAsset } from "./assets";
import type { EndKind, Pick } from "./snap";
import { TableBody } from "./table";
import { InlineInput, useFinish } from "./inline";
import type { Cell } from "./table";
import { CodeBody, CodeView, codeLabel, useCode } from "./code";
import { CodeEditor } from "./code-edit";
import { codeView } from "../code/view";
import { CODE, boundedBox, minHeight } from "../code/geometry";
import type { CodeOutcome } from "../state/code-commands";

export interface AnnotationData extends Record<string, unknown> {
  a: Annotation; frame: Frame; leader: Segment | null; editable: boolean; classes: string; label: string;
  /** Dans une sélection de plusieurs éléments : pas de poignées (on ne redimensionne qu'une boîte à la fois). */
  multi?: boolean;
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
  /** Ce que vise le bout d'un connecteur qu'on glisse (ses marques se dessinent par-dessus la toile), `null` à la relâche. */
  aim: (pick: Pick | null) => void;
  /** Un geste en cours (redimensionnement, bout glissé, édition en place) : la bulle se tait tant qu'il dure. */
  hold: (reason: string, on: boolean) => void;
  /** Le nom d'un groupe édité sur son cadre (lot 2 de docs/11). */
  groupLabel: (id: string, label: string) => void;
}
const freePick = (at: Point): Pick => ({ end: { kind: "free", x: at.x, y: at.y }, place: { kind: "point", at }, target: null, anchors: [], snapped: null });
export const AnnotationContext = createContext<AnnotationActions>({ resize: () => undefined, edit: () => undefined, content: () => undefined, menu: () => undefined, connector: () => undefined, pick: freePick, aim: () => undefined, hold: () => undefined, groupLabel: () => undefined });
/** Les gestes d'édition en place qu'une commande (menu, F2, Entrée) peut demander au nœud : éditer telle cellule, tel
 *  texte ; `kind` = « group » : le nom d'un groupe sur son cadre. */
export type EditAsk = { id: string; cell: Cell | null; at: number; kind?: "annotation" | "group" };
export const EditRequest = createContext<EditAsk | null>(null);
// Une demande ne s'ouvre qu'une fois, même si son nœud est démonté puis remonté : la toile ne monte que ce qui se voit
// (lot 13 de docs/11) et un nœud remonté rejouait la dernière demande (vu sur un cadre de groupe au panoramique).
const claimed = new WeakSet<EditAsk>();
/** Vrai la première fois qu'un nœud prend cette demande ; ensuite, plus personne ne la rejoue. */
export function claim(request: EditAsk): boolean { if (claimed.has(request)) return false; claimed.add(request); return true; }

/** Le zoom courant (les poignées et les pastilles gardent leur taille d'écran). */
const useZoom = (): number => useStore((st) => st.transform[2]);

/** Une pastille à taille d'écran, posée dans les coordonnées de la boîte (handles.ts). */
function GesturePill({ place }: { place: PillPlace }) {
  return <g className="gesture-pill" transform={`translate(${place.x} ${place.y}) scale(${place.scale})`}><PillSvg x={0} y={0} text={place.text} tone="muted" /></g>;
}

/** Les huit poignées (handles.ts) : un glissé redimensionne la boîte en direct, la relâche écrit ; la poignée saisie
 *  porte la pastille « L × H ». */
function Handles({ frame, onResize }: { frame: Frame; onResize: (next: Frame, done: boolean, handle: HandleId) => void }) {
  const rf = useReactFlow();
  const zoom = useZoom();
  const drag = useRef<{ id: HandleId; start: Frame; sx: number; sy: number } | null>(null);
  const [grabbed, setGrabbed] = useState<HandleId | null>(null);
  const next = (event: ReactPointerEvent): Frame | null => {
    const d = drag.current;
    if (!d) return null;
    const k = rf.getZoom() || 1;
    return resized(d.start, d.id, (event.clientX - d.sx) / k, (event.clientY - d.sy) / k, { ratio: event.shiftKey, center: event.altKey });
  };
  const down = useCallback((id: HandleId) => (event: ReactPointerEvent<SVGRectElement>): void => {
    if (event.button !== 0) return; // un clic droit ouvre le menu, il ne glisse ni n'écrit rien (audit, M4)
    event.stopPropagation(); event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { id, start: frame, sx: event.clientX, sy: event.clientY };
    setGrabbed(id);
  }, [frame]);
  const move = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const box = next(event);
    if (box && drag.current) onResize(box, false, drag.current.id);
  }, [rf, onResize]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const box = next(event), d = drag.current;
    drag.current = null;
    setGrabbed(null);
    if (box && d) onResize(box, true, d.id);
  }, [rf, onResize]); // eslint-disable-line react-hooks/exhaustive-deps
  const shapes = handleShapes(frame, zoom);
  return (
    <g className={"annotation-handles" + (grabbed ? " resizing" : "")}>
      {shapes.map((h) => (
        <g key={h.id} className={"annotation-handle-slot handle-" + h.id}>
          <rect className="annotation-handle-hit nodrag nopan" x={h.hit.x} y={h.hit.y} width={h.hit.w} height={h.hit.h} onPointerDown={down(h.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          <rect className={"annotation-handle handle-" + h.kind} x={h.box.x} y={h.box.y} width={h.box.w} height={h.box.h} rx={h.kind === "bar" ? Math.min(h.box.w, h.box.h) / 2 : 1.5 / zoom} />
        </g>
      ))}
      {grabbed ? <GesturePill place={sizePill(frame, grabbed, zoom)} /> : null}
    </g>
  );
}

function Leader({ seg, frame }: { seg: Segment; frame: Frame }) {
  const x1 = seg.x1 - frame.x, y1 = seg.y1 - frame.y, x2 = seg.x2 - frame.x, y2 = seg.y2 - frame.y;
  const angle = Math.atan2(y2 - y1, x2 - x1), size = 9;
  const p = (a: number): string => `${(x2 - size * Math.cos(angle + a)).toFixed(1)},${(y2 - size * Math.sin(angle + a)).toFixed(1)}`;
  return <g className="annotation-leader"><line x1={x1} y1={y1} x2={x2} y2={y2} /><polygon className="annotation-arrow" points={`${x2},${y2} ${p(0.45)} ${p(-0.45)}`} /></g>;
}

/** Le dessin d'une annotation (forme, texte, image), aux dimensions de sa boîte ; aussi celui du fantôme d'un Alt +
 *  glissé (clone.tsx). */
export function Body({ a, frame, editing = false }: { a: Annotation; frame: Frame; editing?: boolean }) {
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
  if (c.kind === "code") return <CodeBody a={a} c={c} w={frame.w} h={frame.h} first={0} idSuffix="-ghost" />;
  if (c.kind === "note") return <>{box}{text(c.text)}</>;
  if (c.kind === "shape") return <>{box}{c.label && !editing ? text(c.label) : null}</>;
  return <>{box}<Picture a={a} frame={frame} /></>;
}

function Picture({ a, frame }: { a: Annotation; frame: Frame }) {
  const c = a.content;
  const url = useAsset(c.kind === "image" ? c.asset : null);
  if (c.kind !== "image") return null;
  if (!url) return <text className="annotation-text text-ink annotation-alt" x={frame.w / 2} y={frame.h / 2} textAnchor="middle" fontSize={12}>{url === null ? t("shell:canvas.imageLoading") : c.alt || KIND_LABEL.image}</text>;
  return <image href={url} x={0} y={0} width={frame.w} height={frame.h} preserveAspectRatio="xMidYMid meet" />;
}

/** L'éditeur de texte en place d'une note : un champ HTML par-dessus le nœud ; Ctrl+Entrée ou quitter enregistre, Échap abandonne. */
function NoteEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { finish, track } = useFinish(onDone, initial);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finish((event.target as HTMLTextAreaElement).value); }
    event.stopPropagation();
  };
  return <textarea ref={ref} className="note-editor nodrag nopan nowheel" defaultValue={initial} maxLength={2000} aria-label={t("shell:canvas.noteText")} spellCheck={false}
    onKeyDown={keys} onChange={track} onBlur={(event) => finish(event.target.value)} onPointerDown={(event) => event.stopPropagation()} />;
}

export function AnnotationNode({ data, selected, dragging, positionAbsoluteX, positionAbsoluteY }: NodeProps<AnnotationNodeType>) {
  const { a, editable } = data;
  const rf = useReactFlow(); // le zoom se lit au rendu d'un glissé (chaque pas redessine le nœud) : aucun abonnement par nœud
  const actions = useContext(AnnotationContext);
  const request = useContext(EditRequest);
  const [live, setLive] = useState<Frame | null>(null); // la boîte pendant un redimensionnement
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<Range | null>(null);
  const [cell, setCell] = useState<Cell | null>(null);
  useEffect(() => { setLive(null); }, [data.frame]);
  // désélectionnée (Échap, clic ailleurs) en plein redimensionnement : les poignées partent, la boîte d'avant revient, rien ne s'écrit
  useEffect(() => { if (!selected) { setPick(null); setCell(null); setLive(null); } }, [selected]);
  // une commande (menu, F2, Entrée) demande l'édition en place : telle cellule du tableau, le texte de la note,
  // l'étiquette de la forme ; une seule fois par demande (l'annotation modifiée ne la rejoue pas)
  useEffect(() => {
    if (!request || request.id !== a.id || request.kind === "group" || !claim(request)) return;
    if (request.cell && a.content.kind === "table") { setPick({ r0: request.cell[0], c0: request.cell[1], r1: request.cell[0], c1: request.cell[1] }); setCell(request.cell); }
    else if (a.content.kind === "note" || a.content.kind === "shape" || a.content.kind === "code") setEditing(true);
  }, [request, a]);
  const frame = live || data.frame;
  // Pendant un geste ou une édition en place, la bulle se tait (lot 1 de docs/11).
  const editingNow = editing || !!cell;
  useEffect(() => { actions.hold("edit:" + a.id, editingNow); return () => actions.hold("edit:" + a.id, false); }, [actions, a.id, editingNow]);
  useEffect(() => { actions.hold("resize:" + a.id, !!live); return () => actions.hold("resize:" + a.id, false); }, [actions, a.id, live]);
  // Un redimensionnement par le haut ou la gauche (ou depuis le centre) déplace la boîte : le dessin suit, décalé
  // depuis la place du nœud, jusqu'à ce que l'écriture la pose.
  const shift = live ? { x: live.x - data.frame.x, y: live.y - data.frame.y } : null;
  // Glissée : la place qui sera écrite (celle de la fiche : relative à l'ancre d'une annotation attachée).
  const moved = dragging ? positionPill(a.x + Math.round(positionAbsoluteX - data.frame.x), a.y + Math.round(positionAbsoluteY - data.frame.y), rf.getZoom()) : null;
  // Relâché : la page écrit, sauf si rien n'a bougé (un clic sur une poignée n'écrit rien).
  const onResize = useCallback((raw: Frame, done: boolean): void => {
    // un bloc de code : jamais sous trois lignes ni sous 240 de large ; posé sur la grille de 20 à la relâche (lot 16)
    const bounded = a.content.kind === "code" ? { ...raw, ...boundedBox(raw.w, raw.h, a.style.text_size) } : raw;
    const g = (v: number): number => Math.round(v / CODE.GRID) * CODE.GRID;
    const next = a.content.kind === "code" && done ? { x: g(bounded.x), y: g(bounded.y), w: Math.max(CODE.MIN_W, g(bounded.w)), h: Math.max(minHeight(a.style.text_size), g(bounded.h)) } : bounded;
    if (!done) { setLive(next); return; }
    setLive(null);
    const was = data.frame;
    if (next.x !== was.x || next.y !== was.y || next.w !== was.w || next.h !== was.h) actions.resize(a.id, next);
  }, [a, data.frame, actions]);
  const canEdit = editable && !a.locked;
  const code = useCode();
  const dbl = useCallback((): void => {
    if (canEdit && (a.content.kind === "note" || a.content.kind === "shape" || a.content.kind === "code")) setEditing(true);
    else if (editable && a.locked && a.content.kind === "code" && code.commands) code.commands.codeSay(t("shell:code.locked"));
  }, [canEdit, editable, a.locked, a.content.kind, code]);
  // un bloc de code écrit : le texte vu (valeurs retirées ou gardées) part par les commandes du store (lot 16)
  const codeDone = useCallback((text: string | null, outcome: CodeOutcome, removed: number): void => {
    setEditing(false);
    if (text === null || !code.commands) return;
    code.commands.codeSave(a.id, text, outcome, removed);
  }, [a.id, code]);
  const done = useCallback((text: string | null): void => {
    setEditing(false);
    if (text === null) return;
    if (a.content.kind === "note" && text.trim() && text !== a.content.text) actions.edit(a.id, text);
    if (a.content.kind === "shape" && text.trim() !== a.content.label) actions.edit(a.id, text.trim()); // une étiquette vide est admise
  }, [a, actions]);
  const menu = useCallback((event: ReactMouseEvent): void => { event.preventDefault(); event.stopPropagation(); actions.menu({ kind: "annotation", id: a.id }, event); }, [actions, a.id]);
  const cellMenu = useCallback((target: { cell: Cell; range: Range }, event: ReactMouseEvent): void => { event.preventDefault(); event.stopPropagation(); actions.menu({ kind: "annotation", id: a.id, ...target }, event); }, [actions, a.id]);
  const classes = `annotation kind-${a.content.kind} hue-${a.style.hue} plane-${a.z}${a.locked ? " locked" : ""}${a.anchor.kind !== "free" ? " anchored" : ""}${editing && a.content.kind === "code" ? " code-editing" : ""} ${data.classes}`;
  return (
    <>
      <svg className={classes} width={frame.w} height={frame.h} viewBox={`0 0 ${frame.w} ${frame.h}`} overflow="visible" data-annotation={a.id} onDoubleClick={dbl} onContextMenu={menu}>
        <g transform={shift && (shift.x || shift.y) ? `translate(${shift.x} ${shift.y})` : undefined}>
          <g opacity={a.style.opacity / 100}>
            {data.leader && !live ? <Leader seg={data.leader} frame={frame} /> : null}
            {a.content.kind === "table"
              ? <TableBody a={a} content={a.content} frame={frame} active={!!selected} editable={canEdit} onContent={(content) => actions.content(a.id, content)} onMenu={cellMenu} pick={pick} onPick={setPick} editing={cell} onEdit={setCell} />
              : a.content.kind === "code" ? <CodeView a={a} c={a.content} w={frame.w} h={frame.h} active={!!selected && !data.multi} editing={editing} />
                : <Body a={a} frame={frame} editing={editing} />}
          </g>
          {a.content.kind === "shape" && a.content.shape === "ellipse"
            ? <ellipse className="hover-ring" cx={frame.w / 2} cy={frame.h / 2} rx={frame.w / 2} ry={frame.h / 2} />
            : <rect className="hover-ring" x={0} y={0} width={frame.w} height={frame.h} rx={a.style.radius} />}
          {selected && canEdit && !editingNow && !data.multi ? <Handles frame={frame} onResize={onResize} /> : null}
          {moved ? <GesturePill place={moved} /> : null}
          {editing && a.content.kind === "shape" ? <InlineInput at={{ x: 6, y: Math.max(0, frame.h / 2 - 13) }} width={Math.max(60, frame.w - 12)} height={26} initial={a.content.label} max={80} label={t("shell:canvas.shapeLabel")} onDone={done} /> : null}
        </g>
      </svg>
      {editing && a.content.kind === "note" ? <NoteEditor initial={a.content.text} onDone={done} /> : null}
      {editing && a.content.kind === "code" ? <CodeEditor w={frame.w} h={frame.h} size={a.style.text_size} font={a.content.font} numbers={a.content.line_numbers} initial={a.content.text}
        first={codeView.first(a.id)} label={t("shell:code.editorLabel", { name: codeLabel(a.content) })} infrastructure={code.infrastructure} onDone={codeDone} /> : null}
    </>
  );
}

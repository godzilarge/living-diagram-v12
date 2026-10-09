// Le tableau d'une annotation sur la toile (docs/10 §6 ; Orhan, 2026-10-09 : « pas possible de modifier le texte dans le
// canevas, pas de redimensionnement des colonnes et des lignes, pas de fusion »). Dessiné en SVG dans le nœud de
// l'annotation (table.ts fait la géométrie) : une cellule se choisit d'un clic (Maj étend la plage), s'édite d'un
// double-clic en place (un champ dans un `foreignObject`, aux coordonnées de la cellule : jamais un style en ligne),
// les frontières des colonnes et des lignes se glissent, le clic droit ouvre le menu contextuel avec la cellule ou la
// plage visée. Chaque geste rend un contenu neuf que la page envoie en entier (une écriture, Ctrl+Z la défait).
import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { fitCell } from "../../canvas/annotations";
import type { Frame } from "../../canvas/annotations";
import { WEIGHT_VALUE } from "../../canvas/groups";
import { MAX_CELL, cellAt, cells, grid, isSingle, mergeAt, rangeOf, resizeColumn, resizeRow } from "../../canvas/table";
import type { Grid, Range } from "../../canvas/table";
import type { Annotation } from "../../canvas/types";
import type { TableContent } from "../../contracts/intent";

export type Cell = [number, number];
/** Ce qu'un clic droit sur une cellule dit au menu : la cellule, et la plage choisie si elle la contient. */
export interface CellTarget { cell: Cell; range: Range }
export interface TableBodyProps {
  a: Annotation; content: TableContent; frame: Frame; active: boolean; editable: boolean;
  onContent: (content: TableContent) => void;
  onMenu: (target: CellTarget, event: ReactMouseEvent) => void;
  /** La cellule choisie et sa plage, tenues par le nœud (le menu contextuel les lit). */
  pick: Range | null; onPick: (range: Range | null) => void;
  editing: Cell | null; onEdit: (cell: Cell | null) => void;
}
const BAR = 6; // la largeur d'une frontière glissable, de part et d'autre
const PAD = 6;

/** Le champ d'une cellule éditée en place : Entrée ou quitter enregistre, Tab passe à la cellule suivante, Échap abandonne. */
function CellEditor({ box, initial, onDone }: { box: { x: number; y: number; w: number; h: number }; initial: string; onDone: (text: string | null, next: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onDone(null, false); }
    else if (event.key === "Enter") { event.preventDefault(); onDone((event.target as HTMLInputElement).value, false); }
    else if (event.key === "Tab") { event.preventDefault(); onDone((event.target as HTMLInputElement).value, true); }
  };
  return (
    <foreignObject x={box.x} y={box.y} width={Math.max(20, box.w)} height={Math.max(16, box.h)} className="cell-editor-slot">
      <input ref={ref} className="cell-editor nodrag nopan nowheel" defaultValue={initial} maxLength={MAX_CELL} aria-label="texte de la cellule" spellCheck={false}
        onKeyDown={keys} onBlur={(event) => onDone(event.target.value, false)} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} />
    </foreignObject>
  );
}

export function TableBody({ a, content, frame, active, editable, onContent, onMenu, pick, onPick, editing, onEdit }: TableBodyProps) {
  const rf = useReactFlow();
  const s = a.style;
  const [live, setLive] = useState<TableContent | null>(null); // le contenu pendant un glissé de frontière
  useEffect(() => { setLive(null); }, [content]);
  const shown = live || content;
  const g: Grid = grid(shown, frame);
  const boxes = cells(shown, g);
  const drag = useRef<{ axis: "x" | "y"; index: number; sx: number; sy: number; start: Grid } | null>(null);
  const barDown = useCallback((axis: "x" | "y", index: number) => (event: ReactPointerEvent<SVGRectElement>): void => {
    event.stopPropagation(); event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { axis, index, sx: event.clientX, sy: event.clientY, start: grid(content, frame) };
  }, [content, frame]);
  const barMove = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current;
    if (!d) return;
    const k = rf.getZoom() || 1;
    const next = d.axis === "x" ? resizeColumn(content, d.start, d.index, (event.clientX - d.sx) / k) : resizeRow(content, d.start, d.index, (event.clientY - d.sy) / k);
    setLive(next);
  }, [rf, content]);
  const barUp = useCallback((event: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const k = rf.getZoom() || 1;
    const next = d.axis === "x" ? resizeColumn(content, d.start, d.index, (event.clientX - d.sx) / k) : resizeRow(content, d.start, d.index, (event.clientY - d.sy) / k);
    setLive(null);
    if (next !== content) onContent(next);
  }, [rf, content, onContent]);
  const cellOf = (event: ReactMouseEvent): Cell | null => {
    const svg = (event.currentTarget as Element).closest("svg");
    if (!svg) return null;
    const at = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const origin = rf.screenToFlowPosition({ x: svg.getBoundingClientRect().left, y: svg.getBoundingClientRect().top });
    return cellAt(content, grid(content, frame), at.x - origin.x, at.y - origin.y);
  };
  const click = (event: ReactMouseEvent): void => {
    if (!active || !editable) return;
    const cell = cellOf(event);
    if (!cell) return;
    event.stopPropagation();
    const from: Cell = pick && event.shiftKey ? [pick.r0, pick.c0] : cell;
    onPick(rangeOf(content, from, cell));
  };
  const dbl = (event: ReactMouseEvent): void => {
    if (!editable) return;
    const cell = cellOf(event);
    if (!cell) return;
    event.stopPropagation();
    onPick(rangeOf(content, cell, cell));
    onEdit(cell);
  };
  const context = (event: ReactMouseEvent): void => {
    const cell = cellOf(event);
    if (!cell) return;
    const inside = pick && cell[0] >= pick.r0 && cell[0] <= pick.r1 && cell[1] >= pick.c0 && cell[1] <= pick.c1;
    const range = inside && pick ? pick : rangeOf(content, cell, cell);
    if (!inside) onPick(range);
    onMenu({ cell, range }, event);
  };
  const done = (text: string | null, next: boolean): void => {
    const cell = editing;
    onEdit(null);
    if (!cell) return;
    if (text !== null && text !== content.rows[cell[0]][cell[1]]) {
      const rows = content.rows.map((row, i) => (i === cell[0] ? row.map((v, j) => (j === cell[1] ? text : v)) : row));
      onContent({ ...content, rows: rows as TableContent["rows"] });
    }
    if (next) { // Tab : la cellule visible suivante, ligne par ligne
      const order = cells(content, grid(content, frame));
      const at = order.findIndex((b) => b.r === cell[0] && b.c === cell[1]);
      const after = order[(at + 1) % order.length];
      onPick(rangeOf(content, [after.r, after.c], [after.r, after.c]));
      setTimeout(() => onEdit([after.r, after.c]), 0);
    }
  };
  const textClass = "annotation-text" + (s.text_font === "mono" ? " font-mono" : "") + (s.text_color === "ink" ? " text-ink" : "");
  const weight = WEIGHT_VALUE[s.text_weight] || 450;
  const anchor = s.text_align === "right" ? "end" : s.text_align === "center" ? "middle" : "start";
  const stroke = s.stroke_style === "none" ? 0 : s.stroke_width;
  const picked = pick ? { x: g.xs[pick.c0], y: g.ys[pick.r0], w: g.xs[pick.c1 + 1] - g.xs[pick.c0], h: g.ys[pick.r1 + 1] - g.ys[pick.r0] } : null;
  const editBox = editing ? boxes.find((b) => b.r === editing[0] && b.c === editing[1]) : undefined;
  return (
    <g className="table-body" onClick={click} onDoubleClick={dbl} onContextMenu={context}>
      <rect className="annotation-shape" x={0} y={0} width={frame.w} height={frame.h} rx={s.radius} fillOpacity={s.fill_opacity / 100} strokeWidth={stroke} />
      {content.header ? <rect className="annotation-head" x={0} y={0} width={frame.w} height={g.ys[1]} rx={s.radius} /> : null}
      {boxes.map((b) => <rect key={b.r + ":" + b.c} className="table-cell" x={b.x} y={b.y} width={b.w} height={b.h} data-cell={b.r + ":" + b.c} />)}
      <text className={textClass} fontSize={s.text_size} fontWeight={weight} textAnchor={anchor}>
        {boxes.map((b) => {
          const x = s.text_align === "right" ? b.x + b.w - PAD : s.text_align === "center" ? b.x + b.w / 2 : b.x + PAD;
          const y = b.y + Math.min(b.h / 2 + s.text_size * 0.36, b.h - 3);
          const text = fitCell(b.text, Math.max(4, b.w - 2 * PAD), s);
          return text ? <tspan key={b.r + ":" + b.c} x={x} y={y} fontWeight={content.header && b.r === 0 ? 650 : weight}>{text}</tspan> : null;
        })}
      </text>
      {active && editable && picked && !isSingle(pick as Range) ? <rect className="table-pick" x={picked.x} y={picked.y} width={picked.w} height={picked.h} /> : null}
      {active && editable && picked && isSingle(pick as Range) ? <rect className="table-pick single" x={picked.x} y={picked.y} width={picked.w} height={picked.h} /> : null}
      {active && editable ? g.xs.slice(1, -1).map((x, i) => <rect key={"vx" + i} className="table-bar col nodrag nopan" x={x - BAR / 2} y={0} width={BAR} height={frame.h} onPointerDown={barDown("x", i + 1)} onPointerMove={barMove} onPointerUp={barUp} onPointerCancel={barUp} />) : null}
      {active && editable ? g.ys.slice(1, -1).map((y, i) => <rect key={"vy" + i} className="table-bar row nodrag nopan" x={0} y={y - BAR / 2} width={frame.w} height={BAR} onPointerDown={barDown("y", i + 1)} onPointerMove={barMove} onPointerUp={barUp} onPointerCancel={barUp} />) : null}
      {editing && editBox ? <CellEditor box={editBox} initial={editBox.text} onDone={done} /> : null}
    </g>
  );
}
/** La fusion sous une cellule, pour le menu (« séparer la cellule »). */
export const mergedAt = (content: TableContent, cell: Cell): boolean => !!mergeAt(content, cell[0], cell[1]);

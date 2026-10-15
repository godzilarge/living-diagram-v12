// La couche des repères d'alignement (lot 8 de docs/11) : ce que guides.ts décide, dessiné par-dessus la toile en
// coordonnées d'écran (comme la bulle), net au demi-pixel. Rendu repris du prototype validé le 2026-10-14
// (`bac-a-sable/lot-8/`) : un trait plein de 1 px interrompu sur les boîtes qu'il traverse, une croix à chaque
// coin aligné d'un repère de bord, la cote d'un écart égal dans une capsule entre deux butées, quatre équerres autour
// de la boîte d'une sélection glissée, la pastille du geste à la première place libre, et l'aperçu de « mettre en
// grille » (chaque place à venir avec le nom de ce qui ira là). Un état à part (`GuideStore`) : un pas de glissé ne
// redessine qu'elle, jamais la toile ; elle ne s'abonne à la vue que lorsqu'elle a quelque chose à montrer. Les objets
// alignés repassent à pleine opacité (classe `guide-hit` posée sur leur nœud, que React ne réécrit pas).
import { useStore as useFlowStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { LINE_OVER_PX, crossPoints, fitName, lineBands, pillSpot, runs } from "./guides";
import type { Box, Gaps, Line, Rect, Zone } from "./guides";
import { CHROME, CHROME_MARGIN } from "./chrome";

/** Ce que la couche montre : les repères et écarts d'un geste, les boîtes qui coupent les repères, la boîte englobante
 *  d'une sélection glissée, la pastille du geste, ou l'aperçu d'une grille. */
export interface GuideView {
  lines: Line[]; gaps: Gaps[]; hits: string[]; obstacles: Box[];
  union: Box | null;
  /** La pastille : la boîte qu'elle accompagne, son texte (« X, Y ») ; `free` : Ctrl tenu, « libre ». Texte vide : « libre » seul. */
  pill: { box: Box; text: string; free: boolean } | null;
  preview: { key: string; name: string; box: Box }[] | null;
  /** Les coins (plan) qui portent déjà une marque : pas de croix dessus (les poignées de la sélection, une épingle). */
  bare: { x: number; y: number }[];
}
export const EMPTY_GUIDES: GuideView = { lines: [], gaps: [], hits: [], obstacles: [], union: null, pill: null, preview: null, bare: [] };
/** Le magasin des repères, pour les nœuds de la toile (la pastille « X, Y » d'une annotation glissée s'en écarte). */
export const GuideContext = createContext<GuideStore | null>(null);
export interface GuideStore { get: () => GuideView; set: (patch: Partial<GuideView>) => void; clear: () => void; subscribe: (listener: () => void) => () => void }
export function createGuideStore(): GuideStore {
  let current = EMPTY_GUIDES;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((listener) => listener());
  return {
    get: () => current,
    set: (patch) => { current = { ...current, ...patch }; emit(); },
    clear: () => { if (current === EMPTY_GUIDES) return; current = EMPTY_GUIDES; emit(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
const shown = (v: GuideView): boolean => !!(v.lines.length || v.gaps.length || v.union || v.pill || v.preview);

/** Une marque en coin (croix), l'épaisseur d'une cote, sa hauteur, la largeur d'un chiffre (JetBrains Mono 600 11). */
const MARK = 3.5, NUM_H = 16, CHAR_W = 6.82, PILL_H = 20, NAME_SIZE = 11;
/** À cette distance d'écran d'une poignée ou d'une épingle, un coin ne porte pas de croix. */
const BARE_PX = 6;
const crisp = (v: number): number => Math.round(v) + 0.5;
const NO_VIEW: [number, number, number] = [0, 0, 1];

function GuideLine({ line, obstacles, bare, s }: { line: Line; obstacles: Box[]; bare: { x: number; y: number }[]; s: Screen }) {
  const vertical = line.axis === "x", c = crisp(vertical ? s.x(line.at) : s.y(line.at));
  const parts = runs(line, obstacles, LINE_OVER_PX / s.k).map(([p, q]) => {
    const a = Math.round(vertical ? s.y(p) : s.x(p)), b = Math.round(vertical ? s.y(q) : s.x(q));
    return vertical ? `M${c} ${a}V${b}` : `M${a} ${c}H${b}`;
  });
  // un repère de bord porte une croix à chaque coin qu'il aligne, sauf sur une poignée ou une épingle ; un repère de
  // centre s'arrête au bord des objets
  const marks = crossPoints(line, bare, BARE_PX / s.k).map((p) => {
    const [x, y] = vertical ? [c, s.y(p.y)] : [s.x(p.x), c];
    return `M${x - MARK} ${y - MARK}L${x + MARK} ${y + MARK}M${x - MARK} ${y + MARK}L${x + MARK} ${y - MARK}`;
  });
  return (
    <g data-guide={line.kind}>
      <path className="guide-line" d={parts.join("")} />
      {marks.length ? <path className="guide-mark" d={marks.join("")} /> : null}
    </g>
  );
}

function NumberPill({ text, cx, cy }: { text: string; cx: number; cy: number }) {
  const w = text.length * CHAR_W + 10;
  return <g className="guide-num" transform={`translate(${Math.round(cx - w / 2)} ${Math.round(cy - NUM_H / 2)})`}><rect width={w} height={NUM_H} rx={NUM_H / 2} /><text x={5} y={12}>{text}</text></g>;
}

function GuideGaps({ gaps, s }: { gaps: Gaps; s: Screen }) {
  const horizontal = gaps.axis === "x", text = String(Math.round(gaps.gap));
  return (
    <g data-guide="space">
      {gaps.segs.map(([a, b], i) => {
        // le segment court à mi-hauteur de ce que les deux objets ont en commun
        const mid = horizontal ? (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 : (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
        const p0 = horizontal ? a.x + a.w : a.y + a.h, p1 = horizontal ? b.x : b.y;
        const c = crisp(horizontal ? s.y(mid) : s.x(mid)), s0 = Math.round(horizontal ? s.x(p0) : s.y(p0)), s1 = Math.round(horizontal ? s.x(p1) : s.y(p1));
        const d = horizontal ? `M${s0} ${c}H${s1}M${s0 + 0.5} ${c - 5}V${c + 5}M${s1 - 0.5} ${c - 5}V${c + 5}` : `M${c} ${s0}V${s1}M${c - 5} ${s0 + 0.5}H${c + 5}M${c - 5} ${s1 - 0.5}H${c + 5}`;
        const pw = text.length * CHAR_W + 10, fits = Math.abs(s1 - s0) >= (horizontal ? pw : NUM_H) + 8;
        // un écart trop étroit pour sa cote : la cote sort, au-dessus du segment (à gauche s'il est vertical)
        return (
          <g key={i}>
            <path className="guide-gap" d={d} />
            {horizontal ? <NumberPill text={text} cx={(s0 + s1) / 2} cy={fits ? c : c - 18} /> : <NumberPill text={text} cx={fits ? c : c - pw / 2 - 10} cy={(s0 + s1) / 2} />}
          </g>
        );
      })}
    </g>
  );
}

function GesturePill({ pill, s, zone, obstacles, lines }: { pill: NonNullable<GuideView["pill"]>; s: Screen; zone: Zone; obstacles: Box[]; lines: Line[] }) {
  const free = t("shell:canvas.guideFree");
  const w = Math.round(pill.text.length * CHAR_W + (pill.free ? free.length * 6.4 + (pill.text ? 8 : 0) : 0) + 16);
  const box = s.rect(pill.box);
  const avoid: Rect[] = obstacles.map(s.rect).filter((r) => !(Math.abs(r.x - box.x) < 1 && Math.abs(r.y - box.y) < 1))
    .concat(lineBands(lines.map((l) => ({ axis: l.axis, at: l.axis === "x" ? s.x(l.at) : s.y(l.at) }))));
  const spot = pillSpot(box, w, PILL_H, zone, avoid);
  return (
    <g className="guide-pill" transform={`translate(${spot.x} ${spot.y})`}>
      <rect x={0.5} y={0.5} width={w - 1} height={PILL_H - 1} rx={PILL_H / 2} />
      <text x={8} y={14}>{pill.text}{pill.free ? <tspan className="free" dx={pill.text ? 8 : 0}>{free}</tspan> : null}</text>
    </g>
  );
}

interface Screen { k: number; x: (v: number) => number; y: (v: number) => number; rect: (b: Box) => Rect }
const screenOf = ([tx, ty, k]: [number, number, number]): Screen => ({
  k, x: (v) => tx + v * k, y: (v) => ty + v * k, rect: (b) => ({ x: tx + b.x * k, y: ty + b.y * k, w: b.w * k, h: b.h * k }),
});

/** La couche. `zone` : là où la pastille peut se poser (la toile moins la barre du haut et la bande). */
export function GuideLayer({ store }: { store: GuideStore }) {
  // Une image au plus par image d'écran : le geste met l'état à jour à chaque pas, la couche le lit à la prochaine image
  // (une mise à jour synchrone, `useSyncExternalStore`, forçait React à rendre la toile de React Flow dans le même pas :
  // une image de plus de 100 ms de temps en temps au début d'un glissé, à 500 équipements).
  const [view, setView] = useState<GuideView>(store.get);
  useEffect(() => {
    let frame = 0;
    const unsubscribe = store.subscribe(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; setView(store.get()); });
    });
    return () => { unsubscribe(); if (frame) cancelAnimationFrame(frame); };
  }, [store]);
  const on = shown(view);
  // la vue ne compte que quand il y a quelque chose à montrer : sans repère, un panoramique ne redessine rien ici
  const transform = useFlowStore(useCallback((s: ReactFlowState) => (on ? s.transform : NO_VIEW), [on]));
  const ref = useRef<SVGSVGElement>(null);
  const lit = useRef<Element[]>([]);
  // les objets alignés repassent à pleine opacité ; l'aperçu d'une grille efface la sélection dessous
  useLayoutEffect(() => {
    const host = ref.current ? ref.current.parentElement : null;
    lit.current.forEach((el) => el.classList.remove("guide-hit"));
    lit.current = [];
    if (!host) return;
    host.classList.toggle("previewing", !!view.preview);
    view.hits.forEach((id) => {
      const el = host.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      if (el) { el.classList.add("guide-hit"); lit.current.push(el); }
    });
  }, [view.hits, view.preview]);
  useEffect(() => () => { lit.current.forEach((el) => el.classList.remove("guide-hit")); }, []);
  const s = screenOf(transform as [number, number, number]);
  // la fenêtre, pas la boîte de la couche : lire une boîte forcerait une mise en page à chaque pas du glissé (la toile
  // couvre la fenêtre ; la pastille reste sous la barre du haut et au-dessus de la bande)
  const width = typeof window === "undefined" ? 1200 : window.innerWidth, height = typeof window === "undefined" ? 800 : window.innerHeight;
  const m = CHROME_MARGIN, zone: Zone = { left: m, top: CHROME.top + m, right: width - m, bottom: height - CHROME.bottom - m };
  const union = view.union ? s.rect(view.union) : null;
  return (
    <svg ref={ref} className="guide-layer" aria-hidden="true" data-guides={on ? "on" : "off"}>
      {view.preview ? view.preview.map((p) => {
        const r = s.rect(p.box);
        return (
          <g key={p.key} className="grid-place" data-place={p.key}>
            <rect className="grid-ghost" x={crisp(r.x)} y={crisp(r.y)} width={Math.max(1, Math.round(r.w) - 1)} height={Math.max(1, Math.round(r.h) - 1)} rx={Math.max(3, 12 * s.k)} />
            <text className="grid-ghost-name" x={Math.round(r.x + 12)} y={Math.round(r.y + r.h / 2 + 4)}>{fitName(p.name.toUpperCase(), r.w - 20, NAME_SIZE)}</text>
          </g>
        );
      }) : null}
      {union ? (() => {
        const x0 = crisp(union.x - 4), y0 = crisp(union.y - 4), x1 = crisp(union.x + union.w + 3), y1 = crisp(union.y + union.h + 3), k = 12;
        return <path className="guide-union" d={`M${x0} ${y0 + k}V${y0}H${x0 + k}M${x1 - k} ${y0}H${x1}V${y0 + k}M${x1} ${y1 - k}V${y1}H${x1 - k}M${x0 + k} ${y1}H${x0}V${y1 - k}`} />;
      })() : null}
      {view.lines.map((line, i) => <GuideLine key={"l" + i} line={line} obstacles={view.obstacles} bare={view.bare} s={s} />)}
      {view.gaps.map((g, i) => <GuideGaps key={"g" + i} gaps={g} s={s} />)}
      {view.pill ? <GesturePill pill={view.pill} s={s} zone={zone} obstacles={view.obstacles} lines={view.lines} /> : null}
    </svg>
  );
}

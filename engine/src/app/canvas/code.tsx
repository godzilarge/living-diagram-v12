// Le dessin d'un bloc de code sur la toile (lot 16 de docs/11), dans le SVG de son annotation : une carte de la même
// famille que celles des équipements (un rail de sa teinte à gauche), un en-tête (titre, ou le nombre de lignes ; la
// pastille du langage, l'alerte des valeurs sensibles, copier), la gouttière des numéros, une ligne SVG `<text>` par
// ligne visible et un `<tspan class="tk-…">` par jeton (la couleur vient de la feuille de style, jamais d'un style
// écrit depuis une donnée ; aucun HTML : textContent par React). Le code défile dans la boîte : la barre de défilement
// (fine, visible au survol ou sur le bloc sélectionné : le pouce se glisse, la piste pagine), la molette sur le bloc
// sélectionné seul (ailleurs elle zoome la toile, Ctrl + molette toujours ; en butée, rien ne passe à la toile),
// Page préc. / Page suiv. / Origine / Fin. La première ligne montrée est un état de vue (code/view.ts).
import { Check, Copy, ShieldAlert } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { t } from "../../i18n";
import type { Annotation } from "../../canvas/types";
import type { CodeContent } from "../../contracts/intent";
import { CODE, baseline, baselineOffset, footer, keyScroll, layout, lineCount, rowX, scrollbar, secretBoxes, thumbDrag, trackClick, wheelLines } from "../code/geometry";
import type { CodeLayout } from "../code/geometry";
import { LANGUAGE_LABEL, LANGUAGE_SHORT } from "../code/languages";
import { measuredBaseline, onFontsLoaded } from "../code/probe";
import { findSecrets, withSecrets } from "../code/secrets";
import { clipLine, linesOf, rowSegments } from "../code/tokens";
import type { Line } from "../code/tokens";
import { codeView } from "../code/view";
import { typing } from "./keys";
import type { Commands } from "../state/store";

/** Ce que la toile demande à la page pour un bloc de code : les commandes du store et le nom de l'infrastructure
 *  (l'avertissement dit qui lira le texte). Posé par `Canvas` autour de la toile. */
export interface CodeActions { commands: Commands | null; infrastructure: string }
export const CodeContext = createContext<CodeActions>({ commands: null, infrastructure: "" });

const PILL_CH = 6.82; // la chasse des pastilles de l'application (JetBrains Mono 600 11, capitales)
const TITLE_CH = 7.1; // l'estimation d'un caractère du titre (Inter 600 13)

/** La première ligne montrée d'un bloc : un abonnement à l'état de vue, seul ce bloc se redessine quand il défile. */
export function useFirst(id: string): number {
  return useSyncExternalStore(codeView.subscribe, () => codeView.first(id), () => codeView.first(id));
}
export const useCopied = (): string | null => useSyncExternalStore(codeView.subscribe, codeView.copied, codeView.copied);

// Les valeurs sensibles d'un texte, comptées une fois par texte (un bloc qui défile ne les recompte pas).
const secretCache = new Map<string, ReturnType<typeof findSecrets>>();
export function secretsIn(text: string): ReturnType<typeof findSecrets> {
  let found = secretCache.get(text);
  if (!found) { found = findSecrets(text); if (secretCache.size > 200) secretCache.clear(); secretCache.set(text, found); }
  return found;
}

/** La géométrie d'un bloc (taille du code, police, numéros, retour à la ligne), pour une boîte et une première rangée. */
export const layoutOf = (a: Annotation, c: CodeContent, w: number, h: number, first: number): CodeLayout =>
  layout({ w, h, size: a.style.text_size, font: c.font, numbers: c.line_numbers, text: c.text, wrap: c.wrap }, first);

// Les polices finissent de se charger : la ligne de base mesurée change (probe.ts), les blocs se redessinent.
let fontsVersion = 0;
const fontListeners = new Set<() => void>();
const subscribeFonts = (listener: () => void): (() => void) => {
  if (!fontListeners.size) onFontsLoaded(() => { fontsVersion += 1; fontListeners.forEach((l) => l()); });
  fontListeners.add(listener);
  return () => { fontListeners.delete(listener); };
};
/** Le décalage de la ligne de base dans une rangée : mesuré dans la page (celui de l'écriture), sinon calculé. */
export function useBaseline(font: string, size: number, lh: number): number {
  useSyncExternalStore(subscribeFonts, () => fontsVersion, () => fontsVersion);
  return measuredBaseline(font, size, lh) ?? baselineOffset(size, lh, font);
}

/** Une rangée montrée : ses morceaux colorés, coupés à la rangée (retour à la ligne) ou au bord avec un repère. */
function RowText({ l, segs, i, offset, colored }: { l: CodeLayout; segs: Line; i: number; offset: number; colored: boolean }) {
  const row = l.rows[l.first + i];
  const { segs: kept, clipped } = l.wrap ? { segs: rowSegments(segs, row.from, row.to), clipped: false } : clipLine(segs, l.cols);
  return (
    <text x={rowX(l, row)} y={baseline(i, l.lh, offset)} xmlSpace="preserve" data-line={row.line} data-from={row.from}>
      {kept.map((s, k) => <tspan key={k} className={s.c && (colored || s.c === "masked" || s.c === "secret") ? "tk-" + s.c : undefined}>{s.t}</tspan>)}
      {clipped ? <tspan className="tk-clip">›</tspan> : null}
    </text>
  );
}

function Pill({ text, right, cy, off }: { text: string; right: number; cy: number; off: boolean }) {
  const w = Math.round(text.length * PILL_CH + 14);
  return <g className={"code-pill" + (off ? " off" : "")} transform={`translate(${right - w} ${cy - 10})`}><rect width={w} height={20} rx={10} /><text x={w / 2} y={14} textAnchor="middle">{text}</text></g>;
}

/** Le dessin, aux dimensions de la boîte ; `editing` : les lignes laissent la place au champ d'écriture. */
export function CodeBody({ a, c, w, h, first, editing = false, idSuffix = "", onCopy }: { a: Annotation; c: CodeContent; w: number; h: number; first: number; editing?: boolean; idSuffix?: string; onCopy?: () => void }) {
  const l = layoutOf(a, c, w, h, first), size = a.style.text_size, radius = Math.min(a.style.radius, 24);
  const copied = useCopied() === a.id;
  const secrets = secretsIn(c.text);
  const all = withSecrets(linesOf(a.id + idSuffix, c.text, c.language, c.highlight), secrets);
  const shown = l.rows.slice(l.first, l.first + l.visible);
  const offset = useBaseline(c.font, size, l.lh);
  const clip = "code-clip-" + a.id + idSuffix, cy = CODE.HEAD / 2;
  const copyX = w - 8 - 24;
  const pill = (LANGUAGE_SHORT[c.language] || c.language).toUpperCase();
  const pillRight = onCopy ? copyX - 6 : w - 10;
  const warnRight = pillRight - Math.round(pill.length * PILL_CH + 14) - 6;
  const titleRight = secrets.length ? warnRight - 22 : warnRight;
  const room = Math.max(1, Math.floor((titleRight - CODE.RAIL - 14 - 8) / TITLE_CH));
  const title = c.title.length > room ? c.title.slice(0, Math.max(1, room - 1)) + "…" : c.title;
  const bar = scrollbar(l), foot = footer(l), colored = c.highlight && c.language !== "plain";
  return (
    <g className={"code-block cf-" + c.font + (colored ? " hl" : " plain")}>
      <defs><clipPath id={clip}><rect width={w} height={h} rx={radius} /></clipPath></defs>
      <rect className="code-body" width={w} height={h} rx={radius} />
      <g clipPath={`url(#${clip})`}>
        <rect className="code-head" width={w} height={CODE.HEAD} />
        <rect className="code-rail" width={CODE.RAIL} height={h} />
        <line className="code-rule" x1={CODE.RAIL} x2={w} y1={CODE.HEAD + 0.5} y2={CODE.HEAD + 0.5} />
        {c.line_numbers ? <rect className="code-gutter" x={CODE.RAIL} y={CODE.HEAD + 1} width={l.gutter} height={Math.max(0, h - CODE.HEAD - 1 - l.foot)} /> : null}
        {foot ? <line className="code-rule" x1={CODE.RAIL} x2={w} y1={h - l.foot + 0.5} y2={h - l.foot + 0.5} /> : null}
      </g>
      {c.title
        ? <text className="code-title" x={CODE.RAIL + 12} y={cy + 4.5}>{title}</text>
        : <text className="code-count" x={CODE.RAIL + 12} y={cy + 4}>{t("shell:code.lines", { count: l.lines })}</text>}
      <Pill text={pill} right={pillRight} cy={cy} off={!colored} />
      {secrets.length ? (
        // le bouclier : au survol, la bulle rappelle chaque valeur gardée et qui la lit (secret-tip.ts ; Flow la montre)
        <g className="code-shield" data-shield="">
          <rect className="code-hit" x={warnRight - 20} y={cy - 12} width={24} height={24} rx={6} />
          <ShieldAlert className="code-icon code-warn" x={warnRight - 16} y={cy - 8} width={16} height={16} aria-hidden="true" />
        </g>
      ) : null}
      {onCopy ? (
        // copier, à la souris ; au clavier et au lecteur d'écran, celui de la fiche (le nœud porte déjà le focus et le
        // nom du bloc : un bouton non focalisable dedans n'était qu'un rôle sans chemin, audit du 2026-10-15)
        <g className="code-copy nodrag nopan" aria-hidden="true" transform={`translate(${copyX} ${cy - 12})`}
          onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onCopy(); }}>
          <rect width={24} height={24} rx={6} />
          {copied ? <Check className="code-icon" x={5} y={5} width={14} height={14} aria-hidden="true" /> : <Copy className="code-icon" x={5} y={5} width={14} height={14} aria-hidden="true" />}
        </g>
      ) : null}
      {c.line_numbers && !editing ? (
        <g className="code-nums" fontSize={size}>
          {shown.map((row, i) => (row.cont ? null : <text key={i} x={CODE.RAIL + l.gutter - CODE.GUTTER} y={baseline(i, l.lh, offset)} textAnchor="end">{String(row.line + 1)}</text>))}
        </g>
      ) : null}
      {editing || !secrets.length ? null : <SecretHits secrets={secrets} l={l} />}
      {editing ? null : (
        <g className="code-text" fontSize={size}>
          {shown.map((row, i) => <RowText key={l.first + i} l={l} segs={all[row.line] || []} i={i} offset={offset} colored={colored} />)}
        </g>
      )}
      {bar && !editing ? <ScrollBar id={a.id} l={l} bar={bar} /> : null}
      {foot && !editing ? (
        <>
          <text className="code-foot-hint" x={w - 14} y={h - l.foot / 2 + 4} textAnchor="end">{t("shell:code.foot", { from: foot.from, to: foot.to, total: foot.total })}</text>
          {foot.from > 1 || foot.below > 0 ? <text className="code-foot-more" x={CODE.RAIL + 12} y={h - l.foot / 2 + 4}>{foot.below > 0 ? t("shell:code.below", { count: foot.below }) : t("shell:code.end")}</text> : null}
        </>
      ) : null}
    </g>
  );
}

/** Sous chaque valeur sensible gardée et visible, une zone de survol (le texte du code ne prend pas le pointeur) :
 *  la bulle dit sa nature et qui la lit (secret-tip.ts), jamais la valeur ; le clic passe au bloc. Une valeur coupée
 *  par le retour à la ligne a une zone par rangée. */
function SecretHits({ secrets, l }: { secrets: ReturnType<typeof findSecrets>; l: CodeLayout }) {
  return (
    <g className="code-secrets">
      {secretBoxes(secrets, l).map((b, k) => <rect key={k} className="code-hit" data-secret={b.index} x={b.x} y={b.y} width={b.w} height={b.h} />)}
    </g>
  );
}

/** La barre de défilement : la piste pagine, le pouce se glisse (capture du pointeur, rien ne part à React Flow). */
function ScrollBar({ id, l, bar }: { id: string; l: CodeLayout; bar: NonNullable<ReturnType<typeof scrollbar>> }) {
  const rf = useReactFlow();
  const drag = useRef<{ y: number; from: number } | null>(null);
  const down = (event: ReactPointerEvent<SVGRectElement>, thumb: boolean): void => {
    if (event.button !== 0) return;
    event.stopPropagation(); event.preventDefault();
    if (!thumb) {
      const box = (event.currentTarget.ownerSVGElement || event.currentTarget).getBoundingClientRect(), k = rf.getZoom() || 1;
      codeView.setFirst(id, trackClick(l, (event.clientY - box.top) / k));
      return;
    }
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, from: l.first };
  };
  const move = (event: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current;
    if (d) codeView.setFirst(id, thumbDrag(l, d.from, event.clientY - d.y, rf.getZoom() || 1));
  };
  const up = (): void => { drag.current = null; };
  return (
    <g className="code-scroll nodrag nopan">
      <rect className="code-track" x={bar.x} y={bar.trackY} width={CODE.SCROLL} height={bar.trackH} onPointerDown={(event) => down(event, false)} />
      <rect className="code-thumb" x={bar.x + 2} y={bar.thumbY} width={8} height={bar.thumbH} rx={4} onPointerDown={(event) => down(event, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    </g>
  );
}

/** Le bloc sélectionné seul fait défiler son code : à la molette sur lui (en butée, rien ne passe à la toile ; Ctrl +
 *  molette est pris plus haut, il zoome toujours) et à Page préc. / Page suiv. / Origine / Fin hors d'un champ. */
function useCodeScrolling(ref: RefObject<SVGGElement | null>, a: Annotation, c: CodeContent, active: boolean): void {
  const rf = useReactFlow();
  const acc = useRef(0);
  const latest = useRef({ a, c });
  latest.current = { a, c };
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return undefined;
    const now = (): CodeLayout => { const { a: ann, c: content } = latest.current; return layoutOf(ann, content, ann.w, ann.h, codeView.first(ann.id)); };
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return;
      const l = now();
      if (!l.scrolls) return; // tout tient : la molette garde son rôle sur la toile
      event.preventDefault(); event.stopPropagation();
      const step = wheelLines(acc.current, event.deltaY, event.deltaMode, l.lh, rf.getZoom() || 1, Math.max(1, l.visible - 1));
      acc.current = step.acc;
      if (step.lines) codeView.setFirst(latest.current.a.id, Math.min(l.maxFirst, Math.max(0, l.first + step.lines)));
    };
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // hors d'un champ, et hors de la fiche (elle défile d'elle-même), d'un volet ou d'une barre d'outils (la barre
      // contextuelle parcourt ses boutons par Origine / Fin : revue du lot 16, B1) : la page de la toile
      if (typing(target)) return;
      if (target && target.closest && target.closest(".panel, .fvolet, .fbar, .band, .search, .journal, [role=dialog], [role=menu], [role=toolbar]")) return;
      const l = now();
      if (!l.scrolls) return; // tout tient : la touche garde son rôle ailleurs
      const next = keyScroll(l, event.key);
      if (next === null) return;
      event.preventDefault(); event.stopPropagation();
      codeView.setFirst(latest.current.a.id, next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, true);
    return () => { el.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey, true); };
  }, [ref, active, rf]);
}

/** Un bloc de la toile : son dessin à sa ligne lue, le défilement quand il est sélectionné seul, copier ; l'icône
 *  « copié » revient à « copier » 1,2 s après (la minuterie vit ici, dans la page). */
export function CodeView({ a, c, w, h, active, editing }: { a: Annotation; c: CodeContent; w: number; h: number; active: boolean; editing: boolean }) {
  const ref = useRef<SVGGElement>(null);
  const first = useFirst(a.id), copied = useCopied() === a.id;
  const { commands } = useCode();
  useCodeScrolling(ref, a, c, active && !editing);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => codeView.setCopied(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return <g ref={ref} className={active ? "code-active" : undefined}><CodeBody a={a} c={c} w={w} h={h} first={first} editing={editing} onCopy={commands ? () => commands.codeCopy(a.id) : undefined} /></g>;
}

/** Le nom accessible d'un bloc : « bloc de code Python, optiques.py, 15 lignes ». */
export const codeLabel = (c: CodeContent): string => t("shell:code.blockLabel", { language: LANGUAGE_LABEL[c.language] || c.language, title: c.title ? ", " + c.title : "", count: lineCount(c.text) });

export const useCode = (): CodeActions => useContext(CodeContext);

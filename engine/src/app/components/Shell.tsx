// La coquille : la toile pleine, et tout le reste qui flotte, montré quand il sert. Le clavier de la page : `/` ou
// Ctrl+K donnent le focus à la recherche, Échap ferme ce qui est ouvert, puis finit un parcours, puis vide la sélection ; Ctrl+Z annule, Ctrl+Y (ou
// Ctrl+Maj+Z) rétablit ; les flèches déplacent la sélection d'un carreau de grille, de cinq avec Maj ; Ctrl+V colle
// une image (annotation image) ou un texte (note) sur la toile.
import { useEffect } from "react";
import { describe } from "../../shell/inspect";
import { GRID } from "../canvas/Flow";
import { useModel, useStore } from "../state/store";
import { Canvas } from "./Canvas";
import { Connect } from "./Connect";
import { ContextMenu } from "./ContextMenu";
import { Controls } from "./Controls";
import { Panel } from "./Panel";
import { Search } from "./Search";
import { Timeline } from "./Timeline";
import { Toast } from "./Toast";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { TypePalette } from "./TypePalette";
import { WalkBar } from "./WalkBar";

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && !!el.tagName && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
};
/** Le pas des flèches : un carreau de grille, cinq avec Maj. */
export const NUDGE_STEP = GRID, NUDGE_FAST = GRID * 5;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Les flèches appartiennent à la bande des runs quand elle a le focus, et à aucun dialogue ouvert.
const elsewhere = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return typing(target) || (!!el && typeof el.closest === "function" && !!el.closest(".band, .menu, .sheet, .palette, [role=dialog]"));
};

export function Shell() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const ready = state.run.kind === "ready";
  const loading = state.run.kind === "loading";
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing(event.target))) {
        event.preventDefault();
        if (ready) dispatch({ type: "palette", open: true });
        return;
      }
      if (event.key !== "Escape") return;
      if (state.context) commands.closeContext();
      else if (state.palette.open) dispatch({ type: "palette", open: false });
      else if (state.colorsOpen) dispatch({ type: "colors", open: false });
      else if (state.menuOpen) dispatch({ type: "menu", open: false });
      else if (state.connectOpen && ready) dispatch({ type: "connect", open: false });
      else if (state.walk && !typing(event.target)) commands.endWalk();
      else if (!typing(event.target)) commands.clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.palette.open, state.colorsOpen, state.menuOpen, state.connectOpen, state.walk, state.context, ready, dispatch, commands]);
  // Coller (Orhan, 2026-10-09 : « coller une image depuis le presse-papiers ») : hors d'un champ, une image du
  // presse-papiers devient une annotation image, un texte une note ; dans un champ, le collage reste au champ.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      if (!ready || typing(event.target) || !event.clipboardData) return;
      if (commands.paste(event.clipboardData)) event.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ready, commands]);
  // Annuler, rétablir, déplacer au clavier : à la capture, avant React Flow (qui déplacerait aussi le nœud focalisé).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!ready || typing(event.target)) return;
      const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && (key === "y" || (key === "z" && event.shiftKey))) { event.preventDefault(); commands.redo(); return; }
      if (mod && !event.altKey && key === "z") { event.preventDefault(); commands.undo(); return; }
      const arrow = ARROWS[event.key];
      if (!arrow || mod || event.altKey || elsewhere(event.target) || state.palette.open || state.menuOpen || state.connectOpen || state.colorsOpen) return;
      // pendant un parcours, ↑↓ vont d'un équipement à l'autre (← → déplacent toujours la sélection)
      if (state.walk && arrow[0] === 0) { event.preventDefault(); event.stopPropagation(); commands.stepWalk(arrow[1] as -1 | 1); return; }
      const step = event.shiftKey ? NUDGE_FAST : NUDGE_STEP;
      if (commands.nudge(arrow[0] * step, arrow[1] * step)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ready, state.palette.open, state.menuOpen, state.connectOpen, state.colorsOpen, state.walk, commands]);
  // Le thème : une préférence du navigateur, posée sur la racine (tokens.css la lit).
  useEffect(() => {
    document.documentElement.dataset.theme = state.prefs.theme;
  }, [state.prefs.theme]);
  const showConnect = state.connectOpen || (!ready && !loading);
  // L'ordre du DOM est celui du clavier : la barre, la recherche, les outils, la fiche, la bande, les réglages, puis la
  // toile (revue Impeccable du 2026-10-07 : Tab parcourait 154 câbles avant la barre). L'empilement, lui, tient aux
  // z-index. La bande reste pendant un chargement : le focus y demeure d'une run à l'autre.
  return (
    <div className={ready ? "app ready" : "app"} tabIndex={-1}>
      <TopBar />
      {ready ? <Search /> : null}
      {ready ? <Toolbar /> : null}
      {ready ? <WalkBar /> : null}
      {ready ? <Panel /> : null}
      {(ready || loading) && state.runs ? <Timeline /> : null}
      {ready ? <Controls /> : null}
      <div className="stage"><Canvas /></div>
      {loading ? <div className="loading-line" aria-hidden="true" /> : null}
      {ready && state.colorsOpen ? <TypePalette /> : null}
      {ready && state.context ? <ContextMenu /> : null}
      <Toast />
      {showConnect ? <Connect /> : null}
      <p id="live" className="sr-only" aria-live="polite">{model ? describe(model, state.selection) : ""}</p>
    </div>
  );
}

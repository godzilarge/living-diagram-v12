// La coquille : la toile pleine, et tout le reste qui flotte, montré quand il sert. Le clavier de la page : `/` ou
// Ctrl+K donnent le focus à la recherche, C arme ou range l'outil connecteur (lot 1 de docs/11), Échap ferme ce qui est
// ouvert, puis range l'outil, puis finit un parcours, puis vide la sélection ; Ctrl+Z annule, Ctrl+Y (ou
// Ctrl+Maj+Z) rétablit ; les flèches déplacent la sélection d'un carreau de grille, de cinq avec Maj ; Ctrl+V colle
// une image (annotation image) ou un texte (note) sur la toile. Lot 2 de docs/11 : Ctrl+A sélectionne tout ce qui est
// visible ; Suppr ou Retour arrière supprime annotations, connecteurs et groupes de la sélection (un équipement se
// masque, la ligne d'état le propose) ; F2 ou Entrée ouvre l'édition en place (note, forme, nom d'un groupe) ; Tab et
// Maj+Tab passent d'un élément à l'autre dans l'ordre de lecture, le focus suit, quand une sélection existe et que le
// focus est sur la toile (Échap la vide : Tab rend alors la main à la page). Lot 3 : Ctrl+C / Ctrl+X copient (coupent)
// la sélection, Ctrl+V colle une copie de Living Diagram au pointeur (sinon à côté de l'original), Ctrl+D duplique
// (state/clipboard-commands.ts) ; dans un champ, ou avec du texte sélectionné dans la page, le navigateur garde la main.
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { applyLanguage, t } from "../../i18n";
import { describe } from "../state/describe";
import { GRID } from "../canvas/Flow";
import { useEditable, useModel, useStore } from "../state/store";
import { Canvas } from "./Canvas";
import { Connect } from "./Connect";
import { ContextMenu } from "./ContextMenu";
import { Controls } from "./Controls";
import { Journal } from "./Journal";
import { Panel } from "./Panel";
import { Search } from "./Search";
import { Timeline } from "./Timeline";
import { Toast } from "./Toast";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { TypePalette } from "./TypePalette";
import { WalkBar } from "./WalkBar";
import { applyGuideColor } from "../state/prefs";

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && !!el.tagName && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
};
/** Le pas des flèches : un carreau de grille, cinq avec Maj. */
export const NUDGE_STEP = GRID, NUDGE_FAST = GRID * 5;
/** Les images attendues au plus pour qu'un élément choisi par Tab hors champ arrive dans le DOM (la vue va à lui). */
const FOCUS_TRIES = 30;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Les flèches appartiennent à la bande des runs quand elle a le focus, à la barre contextuelle et à ses volets (lot 4),
// et à aucun dialogue ouvert.
const elsewhere = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return typing(target) || (!!el && typeof el.closest === "function" && !!el.closest(".band, .menu, .sheet, .palette, [role=dialog], .fbar, .fvolet"));
};
/** Le focus est-il sur la toile, ou sur la page elle-même (rien d'autre de focalisé) ? Tab et Entrée n'y sont à la
 *  toile que là : sur un bouton de la barre, ils gardent leur sens. */
const onCanvas = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return true;
  return el === document.body || el.classList.contains("app") || (!!el.closest(".flow-host") && !el.closest(".fbar, .fvolet"));
};
/** Le nœud React Flow d'un élément de la sélection : le focus y va (Tab). */
const NODE_ID: Record<string, string> = { node: "", annotation: "annotation:", connector: "connector:", group: "group:" };

export function Shell() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const ready = state.run.kind === "ready";
  const loading = state.run.kind === "loading";
  const editable = useEditable();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (plain && event.key.toLowerCase() === "c" && !event.repeat && !elsewhere(event.target) && ready && editable && state.view.mode === "diagram") {
        event.preventDefault();
        commands.toggleTool("connector");
        return;
      }
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing(event.target))) {
        event.preventDefault();
        if (ready && state.view.mode !== "journal") dispatch({ type: "palette", open: true }); // le Journal a sa recherche
        return;
      }
      if (event.key !== "Escape") return;
      if (state.context) commands.closeContext();
      else if (state.palette.open) dispatch({ type: "palette", open: false });
      else if (state.colorsOpen) dispatch({ type: "colors", open: false });
      else if (state.menuOpen) dispatch({ type: "menu", open: false });
      else if (state.connectOpen && ready) dispatch({ type: "connect", open: false });
      else if (state.tool) commands.setTool(null);
      else if (state.walk && !typing(event.target)) commands.endWalk();
      else if (!typing(event.target)) commands.clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.palette.open, state.colorsOpen, state.menuOpen, state.connectOpen, state.walk, state.context, state.tool, state.view.mode, ready, editable, dispatch, commands]);
  // Coller (Orhan, 2026-10-09 : « coller une image depuis le presse-papiers ») : hors d'un champ, une copie de Living
  // Diagram se colle (lot 3 de docs/11), une image du presse-papiers devient une annotation image, un texte une note ;
  // dans un champ, le collage reste au champ. Copier, couper (lot 3) : la sélection de la toile, sauf si la page a du
  // texte sélectionné (une fiche, une description) : ce texte-là se copie.
  const control = state.view.mode === "control"; // la vue Contrôle se lit : rien ne s'y colle, la page le dit (2026-10-09)
  const journal = state.view.mode === "journal"; // la vue Journal remplace la toile : ni toile, ni outils, ni clavier de la toile
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      if (!ready || journal || typing(event.target) || !event.clipboardData) return;
      if (commands.pasteEvent(event.clipboardData)) event.preventDefault();
    };
    const onCopy = (cut: boolean) => (event: ClipboardEvent): void => {
      if (!ready || journal || elsewhere(event.target) || !event.clipboardData) return;
      const text = typeof window.getSelection === "function" ? String(window.getSelection() || "") : "";
      if (text) return;
      if (commands.copyEvent(event.clipboardData, cut)) event.preventDefault();
    };
    const copy = onCopy(false), cut = onCopy(true);
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("copy", copy); window.removeEventListener("cut", cut); };
  }, [ready, journal, commands]);
  // Annuler, rétablir, déplacer au clavier : à la capture, avant React Flow (qui déplacerait aussi le nœud focalisé).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!ready || journal || typing(event.target)) return;
      const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && (key === "y" || (key === "z" && event.shiftKey))) { if (!control) { event.preventDefault(); commands.redo(); } return; }
      if (mod && !event.altKey && key === "z") { if (!control) { event.preventDefault(); commands.undo(); } return; }
      const dialog = state.palette.open || state.menuOpen || state.connectOpen || state.colorsOpen;
      // Ctrl+D : dupliquer (lot 3) ; en Contrôle ou sans nom, rien ne se crée et la page le dit
      if (mod && !event.altKey && !event.shiftKey && key === "d" && !dialog && !elsewhere(event.target)) { if (commands.duplicate()) { event.preventDefault(); event.stopPropagation(); } return; }
      if (!control && !dialog && !elsewhere(event.target)) {
        if (mod && !event.altKey && key === "a") { event.preventDefault(); event.stopPropagation(); commands.selectAll(); return; }
        if (!mod && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) { if (commands.deleteSelection()) { event.preventDefault(); event.stopPropagation(); } return; }
        if (!mod && !event.altKey && (event.key === "F2" || (event.key === "Enter" && !event.shiftKey && onCanvas(event.target)))) {
          if (commands.editSelection()) { event.preventDefault(); event.stopPropagation(); }
          return;
        }
      }
      if (event.key === "Tab" && !mod && !event.altKey && !dialog && onCanvas(event.target) && (state.selection || state.picked.hosts.length + state.picked.annotations.length + state.picked.connectors.length + state.picked.groups.length)) {
        const next = commands.cycle(event.shiftKey ? -1 : 1);
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        const id = NODE_ID[next.kind] + next.id;
        // le nœud est dessiné au rendu suivant (sa classe `selected`) : le focus y va tout de suite s'il existe déjà ; hors
        // champ, la toile ne le monte pas (lot 13 de docs/11) : la vue se centre dessus et le focus suit à son arrivée
        const focus = (tries: number): void => {
          const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
          if (el) { el.focus({ preventScroll: true }); return; }
          if (tries === 0) commands.center();
          if (tries < FOCUS_TRIES) window.requestAnimationFrame(() => focus(tries + 1));
        };
        focus(0);
        return;
      }
      const arrow = ARROWS[event.key];
      if (!arrow || mod || event.altKey || elsewhere(event.target) || dialog) return;
      // pendant un parcours, ↑↓ vont d'un équipement à l'autre (← → déplacent toujours la sélection)
      if (state.walk && arrow[0] === 0) { event.preventDefault(); event.stopPropagation(); commands.stepWalk(arrow[1] as -1 | 1); return; }
      if (control) return;
      const step = event.shiftKey ? NUDGE_FAST : NUDGE_STEP;
      if (commands.nudge(arrow[0] * step, arrow[1] * step)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ready, control, journal, state.palette.open, state.menuOpen, state.connectOpen, state.colorsOpen, state.walk, state.selection, state.picked, commands]);
  // Le thème : une préférence du navigateur, posée sur la racine (tokens.css la lit).
  useEffect(() => {
    document.documentElement.dataset.theme = state.prefs.theme;
  }, [state.prefs.theme]);
  // La couleur des repères d'alignement (lot 8 de docs/11) : une préférence aussi, posée sur la racine.
  useEffect(() => { applyGuideColor(state.prefs.guideHue); }, [state.prefs.guideHue]);
  // La langue : choisie ici, sinon celle du navigateur ; `lang` sur la racine pour le lecteur d'écran et la césure.
  useEffect(() => {
    applyLanguage(state.prefs.language); // déjà posée par `setPrefs` ; ici pour la langue du navigateur au démarrage
  }, [state.prefs.language]);
  const showConnect = state.connectOpen || (!ready && !loading);
  // L'ordre du DOM est celui du clavier : la barre, la recherche, les outils, la fiche, la bande, les réglages, puis la
  // toile (revue Impeccable du 2026-10-07 : Tab parcourait 154 câbles avant la barre). L'empilement, lui, tient aux
  // z-index. La bande reste pendant un chargement : le focus y demeure d'une run à l'autre.
  return (
    <div className={"app" + (ready ? " ready" : "") + (ready && !journal && (state.selection || state.picked.hosts.length + state.picked.annotations.length + state.picked.connectors.length + state.picked.groups.length >= 2) ? " has-panel" : "")} tabIndex={-1}>
      <TopBar />
      {ready && !journal ? <Search /> : null}
      {ready && !journal ? <Toolbar /> : null}
      {ready && !journal ? <WalkBar /> : null}
      {ready && !journal ? <Panel /> : null}
      {(ready || loading) && state.runs && !journal ? <Timeline /> : null}
      {ready && !journal ? <Controls /> : null}
      {(ready || loading) && journal ? <Journal /> : null}
      {ready && !journal && state.journalUi.back ? <button type="button" className="journal-back glass" onClick={commands.backToJournal}><ArrowLeft aria-hidden="true" />{t("journal:ui.back")}</button> : null}
      {/* sous le Journal, la toile reste montée (sa vue, ses mesures) mais n'est jamais peinte : au rechargement, elle
          se dessinait le temps que le Journal arrive (Orhan, 2026-10-10) */}
      <div className={"stage" + (journal ? " under" : "")} inert={journal}><Canvas /></div>
      {loading && !journal ? <div className="loading-line" aria-hidden="true" /> : null /* le Journal a son propre état de lecture */}
      {ready && state.colorsOpen ? <TypePalette /> : null}
      {ready && state.context ? <ContextMenu /> : null}
      <Toast />
      {showConnect ? <Connect /> : null}
      <p id="live" className="sr-only" aria-live="polite">{model ? describe(model, state.selection, state.picked) : ""}</p>
    </div>
  );
}

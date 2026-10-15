// La toile : le seul composant qui la monte (une fois par run), lui pousse l'état de vue (bascules, règles,
// recherche, statuts masqués), lui demande les sélections venues d'ailleurs (adresse, fiches, palette), et lit ce
// qu'elle dit (`onSelect`). La toile elle-même (toile.ts) est sans DOM ; React Flow la dessine (Flow.tsx). Les hôtes
// d'intention et de placement de `/view` sont réutilisés sans leur DOM : un glissé épingle par l'API sous le nom
// donné, un alignement de même ; ce qui vient d'être placé se mémorise.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectionFromToken } from "../../canvas/model";
import { t as text } from "../../i18n";
import { exactRule, parseRule } from "../../canvas/query";
import type { Model } from "../../canvas/types";
import { searchCached } from "../state/search";
import type { Selection } from "../../canvas/types";
import { createIntentHost } from "../../shell/intent";
import { createPlacementHost } from "../../shell/placement";
import { Flow } from "../canvas/Flow";
import { FloatingBar } from "./FloatingBar";
import { CodeContext } from "../canvas/code";
import { CodeDraftLayer } from "../canvas/code-draft";
import type { ContextRequest } from "../canvas/Flow";
import type { ConnectorPatch } from "../../shell/apps";
import type { End } from "../../canvas/connectors";
import type { TableContent } from "../../contracts/intent";
import { createToile } from "../canvas/toile";
import { createUndo } from "../canvas/undo";
import { dropLocal } from "../state/history";
import type { MoveCause, Toile } from "../canvas/toile";
import { useEditable, useStore } from "../state/store";
import type { ViewState } from "../state/types";
import { itemsOf, same as sameMulti, size } from "../state/selection";
import type { Item, Multi } from "../state/selection";
import type { Op } from "../../shell/apps";
import type { Point } from "../../canvas/layout";

// Ce que la page pose sur la toile : la barre en haut, la bande des runs en bas, le panneau à droite quand une fiche
// est ouverte (`fit` et le centrage cadrent dans ce qui reste visible).
const INSETS = { top: 56, right: 0, bottom: 84, left: 0 };
const PANEL_W = 400;
const sameSelection = (a: Selection | null, b: Selection | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
const sameHosts = (a: Iterable<string>, b: string[]): boolean => { const x = Array.from(a).sort().join("\n"); return x === b.slice().sort().join("\n"); };

// Ce que la recherche éclaire : les équipements trouvés, propriétaires des ports, membres des groupes ; rien sans texte.
const highlight = (model: Model, text: string): string => (text.trim() ? exactRule(searchCached(model, text).hosts) : "");

// Pousse la vue dans la toile ; rend vrai si quelque chose a changé qui demande un nouveau placement. Les statuts
// masqués ne s'appliquent qu'en vue Contrôle (en Diagramme, tous les câbles se dessinent, neutres).
function pushView(toile: Toile, view: ViewState): boolean {
  const f = toile.state.filters;
  const control = view.mode === "control";
  const hide = view.hide.map(parseRule), only = view.only ? parseRule(view.only) : null;
  const masked = control ? view.hiddenStatuses.slice().sort() : [];
  const changed = f.showStubs !== view.showStubs || f.showDiff !== view.showDiff || toile.state.layers.notes !== view.showNotes || toile.state.control !== control
    || f.hide.map((r) => r.text).join("\n") !== view.hide.join("\n") || (f.only ? f.only.text : "") !== view.only
    || Array.from(f.hiddenStatuses).sort().join(",") !== masked.join(",");
  f.showStubs = view.showStubs; f.showDiff = view.showDiff; f.hide = hide; f.only = only; f.hiddenStatuses = new Set(masked);
  toile.state.showPorts = view.showPorts;
  toile.state.control = control;
  toile.state.layers = { speeds: view.showSpeeds, beams: view.showBeams, pins: view.showPins, notes: view.showNotes, oper: view.showOper };
  return changed;
}

export function Canvas() {
  const { state, dispatch, commands, handle } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const run = state.run;
  const model = run.kind === "ready" ? run.model : null;
  const runKey = model ? model.source.infrastructure + "\u0000" + model.source.collector_run_id : "none";
  const [toile, setToile] = useState<Toile | null>(null);

  // Une toile par run : React Flow est remonté avec la run (clé), ses écouteurs partent avec l'ancienne.
  useEffect(() => {
    if (!model) { setToile(null); return; }
    const { writer, placer, history } = commands.makeHosts(model.source.infrastructure);
    writer.locked = run.kind === "ready" && !run.data.intent; // intention illisible : on n'écrit pas à l'aveugle
    history.set(dropLocal(history.get())); // les déplacements locaux d'une autre toile ne se rejouent pas ici
    let created: Toile | null = null;
    const g = (): Toile => created as Toile;
    // Ce que la toile dit : sélection et vue (un `reveal` peut rallumer les voisins inconnus ou les changements).
    const syncView = (): void => {
      const f = g().state.filters, view = stateRef.current.view;
      const masked = Array.from(f.hiddenStatuses).sort();
      if (f.showStubs !== view.showStubs || f.showDiff !== view.showDiff || masked.join(",") !== view.hiddenStatuses.slice().sort().join(",")) {
        dispatch({ type: "view", patch: { showStubs: f.showStubs, showDiff: f.showDiff, hiddenStatuses: masked } });
      }
    };
    const onSelect = (selection: Selection | null, multi: Multi): void => { dispatch({ type: "select", selection, hosts: multi.hosts, picked: multi }); syncView(); };
    const note = (text: string): void => dispatch({ type: "note", text, busy: /…$/.test(text), at: Date.now() });
    const intents = createIntentHost(model, writer, {
      graph: g, openInGraph: (selection) => g().reveal(selection), refreshPage: () => dispatch({ type: "touched" }), note,
      mounted: () => false, container: () => document.createElement("div"),
    });
    const placements = createPlacementHost(model, placer, { graph: g, note });
    const undo = createUndo(model, writer, intents, g, history, note);
    // Un geste sur une sélection mixte (lot 2 de docs/11) : épingles et opérations des annotations et connecteurs en une
    // seule écriture, donc une seule entrée d'annulation.
    // Mettre en grille (lot 8) passe toujours par ici : sans nom, les équipements restent placés localement et la page le dit.
    const onBlock = (pins: Map<string, Point>, ops: Op[], cause: MoveCause): void => {
      const pinOps = Array.from(pins.keys()).sort().map((hostname): Op => { const p = pins.get(hostname) as Point; return { op: "pin", hostname, x: Math.round(p.x), y: Math.round(p.y) }; });
      const count = pins.size + new Set(ops.map((op) => ("id" in op ? op.id : ""))).size;
      if (cause === "gridded" && !intents.canWrite()) { note(text("shell:messages.griddedLocal", { count })); return; }
      const key = cause === "gridded" ? "shell:messages.itemsGridded" : cause === "aligned" ? "shell:messages.itemsAligned" : "shell:messages.itemsMoved";
      void intents.apply(pinOps.concat(ops), text(key, { count, author: writer.author }));
    };
    created = createToile(model, { onSelect, onPin: intents.onPin, onPins: intents.onPins, onPlaced: placements.onPlaced, onMoved: undo.onMoved, onBlock,
      canWrite: () => stateRef.current.view.mode === "diagram" && intents.canWrite(),
      later: (run, ms) => { const timer = window.setTimeout(run, ms); return () => window.clearTimeout(timer); } });
    created.state.insets = { ...INSETS };
    pushView(created, stateRef.current.view);
    created.state.query = highlight(model, stateRef.current.palette.text);
    created.render(false);
    const wanted = stateRef.current.wanted;
    const first = wanted ? selectionFromToken(model, wanted.kind, wanted.token) : null;
    if (first) created.reveal(first); else created.select(null);
    commands.setHandle({ toile: created, intents, placements, writer, placer, undo });
    setToile(created);
    return () => commands.setHandle(null);
  }, [model, commands, dispatch]);

  // La vue (bascules, règles, statuts masqués) : un nouveau placement, cadrage gardé ; les noms des ports : un repeint.
  useEffect(() => {
    if (!handle || state.view.mode === "journal") return; // le Journal cache la toile : elle garde sa vue telle quelle
    if (pushView(handle.toile, state.view)) handle.toile.render(true); else handle.toile.repaint();
  }, [handle, state.view]);

  // La recherche éclaire tant qu'il y a du texte, liste ouverte ou non : chercher n'est pas filtrer.
  // Un parcours (walk.ts) éclaire de même tous les équipements du compte parcouru.
  useEffect(() => {
    if (!handle) return;
    handle.toile.state.query = state.walk ? exactRule(state.walk.hosts) : highlight(handle.toile.model, state.palette.text);
    handle.toile.repaint();
  }, [handle, state.palette.text, state.walk]);

  // Une sélection demandée ailleurs (adresse, fiche, palette) : la toile la résout, la montre, et le dit (`onSelect`).
  useEffect(() => {
    if (!handle || !model) return;
    const t = handle.toile;
    t.state.insets = { ...INSETS, right: state.selection || size(state.picked) >= 2 ? PANEL_W : 0 };
    if (state.wanted) {
      // une sélection pour une autre infrastructure (le Journal montre un objet d'ailleurs) attend la toile de celle-ci
      if (model.source.infrastructure !== state.address.infrastructure) return;
      const found = selectionFromToken(model, state.wanted.kind, state.wanted.token);
      if (found) t.reveal(found);
      else { // un objet demandé (adresse, journal) qui n'est pas dans cette run : on le dit, la vue reste où elle est
        dispatch({ type: "want", wanted: null });
        dispatch({ type: "note", text: text("shell:messages.notFoundInRun", { token: state.wanted.token }), at: Date.now() });
      }
      return;
    }
    if (sameSelection(t.state.selection, state.selection) && sameHosts(t.state.selected, state.hosts) && sameMulti(t.state.multi, state.picked)) return;
    if (size(state.picked) >= 2) t.selectItems(itemsOf(state.picked));
    else if (state.hosts.length >= 2) t.selectHosts(state.hosts);
    else if (state.selection) t.reveal(state.selection);
    else t.select(null);
  }, [handle, model, state.wanted, state.selection, state.hosts, state.picked, state.address.infrastructure, dispatch]);

  // Une annotation glissée, redimensionnée ou éditée en place (texte, tableau) : une écriture, sous le nom (docs/10 §6, A3, A4).
  const onAnnotation = useCallback((id: string, patch: { x?: number; y?: number; w?: number; h?: number; text?: string; content?: TableContent }): void => {
    const { text, content, ...box } = patch;
    const shape = model ? model.annotationById.get(id) : undefined;
    // le texte d'une note, ou l'étiquette d'une forme éditée en place (lot 2 de docs/11)
    if (text !== undefined && shape && shape.content.kind === "shape") commands.annotationUpdate(id, { content: { ...shape.content, label: text.slice(0, 80) } });
    else if (text !== undefined) commands.annotationUpdate(id, { content: { kind: "note", text } });
    else if (content) commands.annotationUpdate(id, { content });
    else commands.annotationUpdate(id, box);
  }, [commands, model]);
  const onGroupLabel = useCallback((id: string, label: string): void => commands.groupUpdate(id, { label: label.slice(0, 80) }), [commands]);
  const onConnector = useCallback((id: string, patch: ConnectorPatch): void => commands.connectorUpdate(id, patch), [commands]);
  const onConnectorCreate = useCallback((fields: { start: End; end: End }): void => commands.connectorCreate(fields), [commands]);
  const onContext = useCallback((request: ContextRequest): void => commands.openContext(request), [commands]);
  // L'outil connecteur se range après une création, sauf Maj tenue (création en série, lot 1 de docs/11).
  const onToolDone = useCallback((keep: boolean): void => { if (!keep) commands.setTool(null); }, [commands]);
  // Alt + glissé relâché (lot 3 de docs/11) : la copie à la place du fantôme.
  const onClone = useCallback((items: Item[], d: Point): void => commands.cloneDrop(items, d), [commands]);
  const editable = useEditable();
  // Le bloc de code (lot 16 de docs/11) : ses commandes et le nom de l'infrastructure (l'avertissement dit qui le lira) ;
  // son brouillon (un collage ou une insertion pas encore enregistrés) se dessine dans le plan, à côté de la barre.
  const code = useMemo(() => ({ commands, infrastructure: state.address.infrastructure }), [commands, state.address.infrastructure]);
  return toile ? <CodeContext.Provider value={code}><Flow key={runKey} toile={toile} prefs={state.prefs} editable={editable} onAnnotation={onAnnotation} onConnector={onConnector} onGroupLabel={onGroupLabel} onConnectorCreate={onConnectorCreate} onContext={onContext} editRequest={state.editRequest}
    toolArmed={state.tool === "connector"} onToolDone={onToolDone} onClone={onClone}><FloatingBar /><CodeDraftLayer /></Flow></CodeContext.Provider> : null;
}

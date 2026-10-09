// Le store : l'état (reducer.ts), les commandes (ce que les composants demandent : ouvrir une run, poser une règle,
// aligner la sélection…), les effets (l'API, l'adresse, le clavier) et la poignée de la toile (posée par `Canvas`,
// seul composant qui la monte). Couches strictes : api/ → state/ → components/. Un composant lit `useStore()` et
// appelle une commande ; il ne fait jamais d'appel réseau, ne touche jamais la toile.
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AlignMode } from "../../canvas/align";
import type { Toile, Viewport } from "../canvas/toile";
import type { StackHolder, Undo } from "../canvas/undo";
import { build, tokenOf } from "../../canvas/model";
import { exactRule } from "../../canvas/query";
import type { Annotation, CatalogueEntry, Connector, GroupStyle, Model, Selection } from "../../canvas/types";
import type { AnnotationPatch, ConnectorPatch, Op, Placer, RunEntry, Writer } from "../../shell/apps";
import { DEFAULT_SIZE } from "../../canvas/annotations";
import { DEFAULT_LENGTH } from "../../canvas/connectors";
import type { Point } from "../../canvas/layout";
import { fresh as freshTable, grownBox } from "../../canvas/table";
import type { TableContent } from "../../contracts/intent";
import { GRID } from "../canvas/Flow";
import type { IntentHost } from "../../shell/intent";
import { plural } from "../ui";
import type { PlacementHost } from "../../shell/placement";
import { previousOf } from "../../shell/timeline";
import { fetchRun, fetchRuns, readAsset, readAuthor, readToken, uploadAsset, writeAuthor, writeToken } from "../api/client";
import { setAssetReader } from "../canvas/assets";
import type { Session } from "../api/client";
import { makePlacer, makeWriter } from "../api/writers";
import type { AppWriter } from "../api/writers";
import { emptyStack, labels } from "./history";
import type { Stack } from "./history";
import { formatHash, formatSearch, parseHash, parseSearch } from "./address";
import { journalCommands } from "./journal-commands";
import type { JournalCommands } from "./journal-commands";
import { debug } from "./debug";
import { readPrefs, writePrefs } from "./prefs";
import type { Prefs } from "./prefs";
import { initialState, reducer } from "./reducer";
import type { Action, AppState, ContextMenuState, SelectionToken, ViewMode, ViewState } from "./types";
import { stepWalk, walkHosts, walkLabel } from "./walk";
import type { Walk, WalkKind } from "./walk";

export interface CanvasHandle { toile: Toile; intents: IntentHost; placements: PlacementHost; writer: Writer; placer: Placer | null; undo: Undo }

export interface Commands extends JournalCommands {
  connect: (fields: { token: string; infrastructure: string; author: string }) => void;
  listRuns: () => void;
  openRun: (runId: string, from: string) => void;
  openLatest: () => void;
  stepRun: (direction: -1 | 1) => void;
  compareTo: (from: string) => void;
  forgetToken: () => void;
  setAuthor: (name: string) => void;
  setView: (patch: Partial<ViewState>) => void;
  /** La vue (2026-10-09) : Diagramme ou Contrôle ; quitter le Contrôle finit un parcours de défauts. */
  setMode: (mode: ViewMode) => void;
  // La vue Journal (filtres, lecture, « montrer », retour) : `journal-commands.ts`.
  /** Une préférence du navigateur (thème, grille, aimant, minimap) : appliquée et rangée dans `localStorage`. */
  setPrefs: (patch: Partial<Prefs>) => void;
  toggleStatus: (status: string) => void;
  addHide: (rule: string) => void;
  removeHide: (rule: string) => void;
  setOnly: (rule: string) => void;
  clearRules: () => void;
  hideHosts: (hosts: string[]) => void;
  isolateHosts: (hosts: string[]) => void;
  reveal: (selection: Selection | null) => void;
  selectHosts: (hosts: string[]) => void;
  clearSelection: () => void;
  align: (mode: AlignMode) => void;
  fit: () => void;
  /** Centre la vue sur la sélection (un élément ou la sélection multiple). */
  center: () => void;
  unpin: (hosts: string[]) => void;
  /** La teinte d'un équipement ou d'un type (docs/10), `null` = revenir au défaut ; par l'hôte d'intention. */
  color: (hostname: string, hue: string | null) => void;
  colorType: (type: string, hue: string | null) => void;
  colorHosts: (hosts: string[], hue: string | null) => void;
  /** Les groupes (docs/10 §5), par l'hôte d'intention ; créer sélectionne le groupe créé. */
  groupCreate: (label: string, members: string[]) => void;
  groupUpdate: (id: string, patch: { label?: string; description?: string; members?: string[]; style?: Partial<GroupStyle> }) => void;
  groupAdd: (id: string, members: string[]) => void;
  groupRemove: (id: string, members: string[]) => void;
  groupDelete: (id: string) => void;
  /** Les annotations (docs/10 §6) : créer au centre de la vue (puis la sélectionner), modifier, dupliquer, supprimer. */
  annotationCreate: (content: Annotation["content"], extra?: AnnotationPatch) => void;
  annotationUpdate: (id: string, patch: AnnotationPatch & { content?: Annotation["content"] }) => void;
  annotationDuplicate: (id: string) => void;
  /** Une image choisie (fichier) : envoyée au magasin, puis une annotation `image` à sa taille naturelle (600 de large au plus) ; `id` : remplacer celle d'une annotation. */
  annotationImage: (file: Blob, id?: string) => void;
  annotationDelete: (id: string) => void;
  /** Le contenu d'un tableau remplacé ; une ligne ou une colonne de plus (ou de moins) agrandit (réduit) la boîte d'autant. */
  tableUpdate: (id: string, content: TableContent) => void;
  /** Détache une annotation : libre, là où elle est dessinée (ou au centre de la vue si son ancre est absente). */
  annotationDetach: (id: string) => void;
  /** Les connecteurs (docs/10 §6, 1.4.0) : créer (puis sélectionner), modifier, détacher les deux bouts, supprimer. */
  connectorCreate: (fields: { start: Connector["start"]; end: Connector["end"] } & ConnectorPatch) => void;
  connectorUpdate: (id: string, patch: ConnectorPatch) => void;
  connectorDetach: (id: string) => void;
  connectorDelete: (id: string) => void;
  /** Le menu contextuel (clic droit) : ouvrir pour une cible, fermer. */
  openContext: (menu: ContextMenuState) => void;
  closeContext: () => void;
  /** Une édition en place demandée au nœud (cellule d'un tableau, ou texte d'une note : `cell` null). */
  requestEdit: (id: string, cell: [number, number] | null) => void;
  /** Insérer une annotation ou un connecteur d'une sorte (note, rectangle, ellipse, table, connector) à un point du plan. */
  insertAt: (kind: string, at: Point) => void;
  /** Ouvre le choix d'un fichier d'image (le champ de la barre d'outils). */
  pickImage: () => void;
  /** Une image ou un texte collés (Ctrl+V) : une annotation image (envoyée au magasin) ou une note, au centre de la vue. */
  paste: (data: DataTransfer) => boolean;
  /** La sélection multiple courante. */
  selectedHosts: () => string[];
  resetMoves: () => void;
  /** Annuler, rétablir (docs/10 §7) : la dernière modification de cette page, ou la dernière annulée. */
  undo: () => void;
  redo: () => void;
  /** Le parcours d'un compte de la barre : le commencer (le même compte le finit), avancer, finir en rendant la
   *  sélection et la vue d'avant. Chaque pas montre l'équipement et ouvre sa fiche. */
  startWalk: (kind: WalkKind) => void;
  stepWalk: (direction: -1 | 1) => void;
  endWalk: () => void;
  /** Déplace la sélection au clavier ; rend faux s'il n'y a rien à déplacer. */
  nudge: (dx: number, dy: number) => boolean;
  /** Les écrivains d'une run qui vient d'être montée (session courante, nom courant) et la pile d'annulation. */
  makeHosts: () => { writer: AppWriter; placer: Placer | null; history: StackHolder };
  /** La toile vient d'être montée (ou démontée) : les composants qui en dépendent se redessinent. */
  setHandle: (handle: CanvasHandle | null) => void;
}

interface StoreValue { state: AppState; dispatch: (action: Action) => void; commands: Commands; catalogue: Record<string, CatalogueEntry>; handle: CanvasHandle | null }
const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore hors du Store");
  return value;
}
export const useModel = (): Model | null => { const { state } = useStore(); return state.run.kind === "ready" ? state.run.model : null; };
/** L'intention n'a pas pu être lue avec la run : l'écriture est coupée (on écrirait sur un document qu'on n'a pas vu). */
export const WRITE_LOCK = "L'intention de cette infrastructure n'a pas pu être lue : les modifications sont coupées pour ne rien écraser.";
export const useWriteLock = (): string | null => { const { state } = useStore(); return state.run.kind === "ready" && !state.run.data.intent ? WRITE_LOCK : null; };
/** Vrai en vue Diagramme avec un écrivain qui a un nom : tout ce qui s'édite (couleurs, groupes, annotations, épingles)
 *  passe par ici ; la vue Contrôle se lit seulement (2026-10-09). */
export const useEditable = (): boolean => { const { state, handle } = useStore(); return state.view.mode === "diagram" && !!handle && handle.intents.canWrite(); };
/** Vrai en vue Contrôle. */
export const useControl = (): boolean => { const { state } = useStore(); return state.view.mode === "control"; };

const sameView = (a: ViewState, b: ViewState): boolean => a.mode === b.mode && a.showStubs === b.showStubs && a.showPorts === b.showPorts && a.showSpeeds === b.showSpeeds
  && a.showBeams === b.showBeams && a.showPins === b.showPins && a.showNotes === b.showNotes && a.showOper === b.showOper && a.showDiff === b.showDiff
  && a.only === b.only && a.hide.join("\n") === b.hide.join("\n") && a.hiddenStatuses.join(",") === b.hiddenStatuses.join(",")
  && JSON.stringify(a.journal) === JSON.stringify(b.journal);

// Ce que l'adresse porte comme sélection : l'élément lu (par identité), ou celui qu'on attend encore de la toile.
function selectionToken(state: AppState): SelectionToken | null {
  if (state.selection && state.run.kind === "ready") {
    const token = tokenOf(state.run.model, state.selection);
    return token ? { kind: token[0], token: token[1] } : null;
  }
  return state.wanted;
}

export function Store({ catalogue, children }: { catalogue: Record<string, CatalogueEntry>; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [handle, setHandleState] = useState<CanvasHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleRef = useRef<CanvasHandle | null>(null);
  const opening = useRef(0); // une ouverture plus récente rend la précédente muette (sa réponse n'écrit pas)
  const pushNext = useRef(false); // la prochaine écriture de l'adresse est une nouvelle entrée d'historique (« montrer »)
  // La session (jeton, infrastructure) se lit ici, tenue à jour avant toute action : une commande lancée dans la
  // foulée d'un `dispatch` ne doit pas lire un état que React n'a pas encore appliqué.
  const sessionRef = useRef<Session>({ token: "", infrastructure: "" });
  // La pile d'annulation : par infrastructure (l'intention l'est), elle traverse les runs ; les boutons lisent ses étiquettes.
  const stackRef = useRef<Stack>(emptyStack());
  // Le parcours en cours, tenu ici avant que React l'applique (deux ↓ de suite), et ce qu'il y avait avant lui.
  const walkRef = useRef<Walk | null>(null);
  const beforeWalk = useRef<{ selection: Selection | null; hosts: string[]; view: Viewport | null } | null>(null);

  const commands = useMemo<Commands>(() => {
    const session = (): Session => sessionRef.current;
    const graph = (): Toile | null => (handleRef.current ? handleRef.current.toile : null);
    const current = (): AppState => stateRef.current;

    async function openRun(runId: string, from: string): Promise<void> {
      const turn = ++opening.current;
      const infrastructure = session().infrastructure;
      dispatch({ type: "address", address: { infrastructure, runId, from } });
      dispatch({ type: "loading", infrastructure, runId });
      const result = await fetchRun(session(), runId, from, catalogue);
      if (turn !== opening.current) return;
      if (!result.ok) {
        if (result.status === 401) { writeToken(""); sessionRef.current = { ...sessionRef.current, token: "" }; dispatch({ type: "session", token: "" }); }
        dispatch({ type: "failed", message: result.message });
        return;
      }
      const model = build(result.data);
      dispatch({ type: "ready", model, data: result.data, warnings: result.warnings, runs: result.runs, remembered: result.remembered });
    }
    async function listRuns(): Promise<RunEntry[] | null> {
      dispatch({ type: "listing" });
      const result = await fetchRuns(session());
      if (!result.ok) {
        if (result.status === 401) { writeToken(""); sessionRef.current = { ...sessionRef.current, token: "" }; dispatch({ type: "session", token: "" }); }
        dispatch({ type: "runs", runs: null, message: result.message });
        return null;
      }
      dispatch({ type: "runs", runs: result.runs, message: result.runs.length ? null : "aucune run archivée pour cette infrastructure" });
      return result.runs;
    }
    // La dernière run, comparée à celle d'avant : ce qu'on veut voir en arrivant, ce qui a changé.
    async function openLatest(): Promise<void> {
      const runs = await listRuns();
      if (!runs || !runs.length) { dispatch({ type: "connect", open: true }); return; }
      const last = runs[runs.length - 1];
      const before = previousOf(runs, last.run_id);
      void openRun(last.run_id, before ? before.run_id : "");
    }
    const setView = (patch: Partial<ViewState>): void => dispatch({ type: "view", patch });
    const walkTo = (walk: Walk): void => {
      walkRef.current = walk;
      dispatch({ type: "walk", walk });
      const g = graph();
      if (g) g.reveal({ kind: "node", id: walk.hosts[walk.index] });
    };
    function endWalk(): void {
      walkRef.current = null;
      dispatch({ type: "walk", walk: null });
      const g = graph(), before = beforeWalk.current;
      beforeWalk.current = null;
      if (!g || !before) return;
      if (before.hosts.length >= 2) g.selectHosts(before.hosts); else g.select(before.selection);
      if (before.view) g.restoreView(before.view);
    }
    const history: StackHolder = {
      get: () => stackRef.current,
      set: (stack) => { stackRef.current = stack; dispatch({ type: "history", ...labels(stack) }); },
    };
    const rules = (): ViewState => current().view;
    // Une annotation créée à un point du plan (coin haut gauche aimanté à la grille), sinon au centre de la vue ;
    // `extra` peut porter l'ancrage et la position relative (note attachée depuis le menu), et prime.
    function createAnnotation(content: Annotation["content"], at: Point | null, extra: AnnotationPatch): void {
      const h = handleRef.current;
      if (!h) return;
      const size = DEFAULT_SIZE[content.kind], w = extra.w || size.w, hh = extra.h || size.h;
      const snap = (v: number): number => Math.round(v / GRID) * GRID;
      const point = at ? { x: snap(at.x), y: snap(at.y) } : ((c) => ({ x: snap(c.x - w / 2), y: snap(c.y - hh / 2) }))(h.toile.viewCenter());
      const op: Op = { op: "annotation_create", content, x: point.x, y: point.y, w, h: hh, ...extra };
      void h.intents.onAnnotation([op], "annotation créée").then((intent) => {
        if (!intent) return;
        const id = "a" + intent.revision + "-1"; // l'identité que le serveur attribue à la première création d'une requête
        if (h.toile.model.annotationById.has(id)) h.toile.reveal({ kind: "annotation", id });
      });
    }
    const commands: Commands = {
      connect: ({ token, infrastructure, author }) => {
        writeToken(token); writeAuthor(author);
        if (infrastructure !== sessionRef.current.infrastructure) history.set(emptyStack()); // une autre infrastructure, une autre intention
        sessionRef.current = { token, infrastructure };
        dispatch({ type: "session", token, author });
        dispatch({ type: "address", address: { infrastructure, runId: "", from: "" } });
        if (!token || !infrastructure) { dispatch({ type: "runs", runs: null, message: "le jeton et l'infrastructure sont nécessaires" }); return; }
        void openLatest();
      },
      listRuns: () => { void listRuns(); },
      openRun: (runId, from) => { void openRun(runId, from); },
      openLatest: () => { void openLatest(); },
      stepRun: (direction) => {
        const { runs, address } = current();
        if (!runs) return;
        const at = runs.findIndex((run) => run.run_id === address.runId);
        const target = runs[at + direction];
        if (at < 0 || !target) return;
        const before = direction > 0 ? address.runId : (previousOf(runs, target.run_id) || { run_id: "" }).run_id;
        void openRun(target.run_id, before);
      },
      compareTo: (from) => { void openRun(current().address.runId, from); },
      forgetToken: () => { writeToken(""); sessionRef.current = { ...sessionRef.current, token: "" }; dispatch({ type: "session", token: "" }); dispatch({ type: "connect", open: true }); },
      setAuthor: (name) => {
        const trimmed = name.trim().slice(0, 80);
        writeAuthor(trimmed);
        dispatch({ type: "session", author: trimmed });
        if (handleRef.current) handleRef.current.writer.author = trimmed;
      },
      setView,
      setMode: (mode) => {
        if (current().view.mode === mode) return;
        if (mode !== "control" && current().walk) endWalk(); // les comptes d'erreurs n'existent qu'en Contrôle
        if (mode === "journal" && current().journalUi.back) dispatch({ type: "journalUi", patch: { back: false } });
        setView({ mode });
      },
      ...journalCommands({
        dispatch, current, session, setView, pushNext: () => { pushNext.current = true; },
        dropToken: () => { writeToken(""); sessionRef.current = { ...sessionRef.current, token: "" }; dispatch({ type: "session", token: "" }); dispatch({ type: "connect", open: true }); },
        connect: (fields) => commands.connect(fields),
      }),
      setPrefs: (patch) => { writePrefs({ ...current().prefs, ...patch }); dispatch({ type: "prefs", patch }); },
      toggleStatus: (status) => {
        const masked = rules().hiddenStatuses;
        setView({ hiddenStatuses: masked.includes(status) ? masked.filter((st) => st !== status) : masked.concat(status) });
      },
      addHide: (rule) => { if (rule.trim() && !rules().hide.includes(rule)) setView({ hide: rules().hide.concat(rule) }); },
      removeHide: (rule) => setView({ hide: rules().hide.filter((r) => r !== rule) }),
      setOnly: (rule) => setView({ only: rule }),
      clearRules: () => setView({ hide: [], only: "" }),
      hideHosts: (hosts) => { if (hosts.length) { setView({ hide: rules().hide.concat(exactRule(hosts)) }); dispatch({ type: "select", selection: null, hosts: [] }); } },
      isolateHosts: (hosts) => { if (hosts.length) setView({ only: exactRule(hosts) }); },
      reveal: (selection) => { const g = graph(); if (g) g.reveal(selection); else dispatch({ type: "select", selection, hosts: [] }); },
      selectHosts: (hosts) => { const g = graph(); if (g) g.selectHosts(hosts); },
      clearSelection: () => { const g = graph(); if (g) g.select(null); else dispatch({ type: "select", selection: null, hosts: [] }); },
      align: (mode) => { const g = graph(); if (g) g.alignSelected(mode); },
      fit: () => { const g = graph(); if (g) g.fit(); },
      center: () => { const g = graph(); if (g) g.frame(); },
      unpin: (hosts) => { if (handleRef.current) handleRef.current.intents.unpin(hosts); },
      color: (hostname, hue) => { if (handleRef.current) handleRef.current.intents.onColor(hostname, hue); },
      colorType: (type, hue) => { if (handleRef.current) handleRef.current.intents.onTypeColor(type, hue); },
      colorHosts: (hosts, hue) => { if (handleRef.current) handleRef.current.intents.onColors(hosts, hue); },
      groupCreate: (label, members) => {
        const h = handleRef.current;
        if (!h) return;
        void h.intents.onGroup([{ op: "group_create", label, members }], "groupe " + label + " créé").then((intent) => {
          if (!intent) return;
          const id = "g" + intent.revision + "-1"; // l'identité que le serveur attribue à la première création d'une requête
          if (h.toile.model.groupById.has(id)) h.toile.reveal({ kind: "group", id });
        });
      },
      groupUpdate: (id, patch) => { if (handleRef.current) void handleRef.current.intents.onGroup([{ op: "group_update", id, ...patch }], "groupe modifié"); },
      groupAdd: (id, members) => { if (handleRef.current) void handleRef.current.intents.onGroup([{ op: "group_add", id, members }], plural(members.length, "membre") + " ajouté" + (members.length > 1 ? "s" : "") + " au groupe"); },
      groupRemove: (id, members) => { if (handleRef.current) void handleRef.current.intents.onGroup([{ op: "group_remove", id, members }], plural(members.length, "membre") + " retiré" + (members.length > 1 ? "s" : "") + " du groupe"); },
      groupDelete: (id) => {
        const h = handleRef.current;
        if (!h) return;
        void h.intents.onGroup([{ op: "group_delete", id }], "groupe supprimé").then(() => {
          if (h.toile.state.selection && h.toile.state.selection.kind === "group") h.toile.select(null);
          // supprimé pour de bon : la ligne d'état dit comment revenir en arrière
          if (!h.toile.model.groupById.has(id)) dispatch({ type: "note", text: "groupe supprimé (" + h.writer.author + ") · Ctrl+Z pour annuler", at: Date.now() });
        });
      },
      annotationCreate: (content, extra = {}) => createAnnotation(content, null, extra),
      annotationUpdate: (id, patch) => { if (handleRef.current) void handleRef.current.intents.onAnnotation([{ op: "annotation_update", id, ...patch }], "annotation modifiée"); },
      annotationDuplicate: (id) => {
        const h = handleRef.current, a = h ? h.toile.model.annotationById.get(id) : undefined;
        if (!h || !a) return;
        const op: Op = { op: "annotation_create", content: a.content, anchor: a.anchor, x: a.x + GRID, y: a.y + GRID, w: a.w, h: a.h, z: a.z, locked: false, leader: a.leader, style: a.style };
        void h.intents.onAnnotation([op], "annotation dupliquée").then((intent) => {
          if (!intent) return;
          const made = "a" + intent.revision + "-1";
          if (h.toile.model.annotationById.has(made)) h.toile.reveal({ kind: "annotation", id: made });
        });
      },
      annotationImage: (file, id) => {
        const h = handleRef.current;
        if (!h) return;
        dispatch({ type: "note", text: "envoi de l'image…", busy: true, at: Date.now() });
        void uploadAsset(session(), file).then((result) => {
          if (!result.ok) { dispatch({ type: "note", text: "image non enregistrée : " + result.message, at: Date.now() }); return; }
          const r = result.receipt, k = Math.min(1, 600 / Math.max(1, r.width));
          const content = { kind: "image" as const, asset: r.asset, alt: "" };
          if (id) { commands.annotationUpdate(id, { content: { ...content, alt: ((h.toile.model.annotationById.get(id) || { content: { alt: "" } }).content as { alt?: string }).alt || "" } }); return; }
          commands.annotationCreate(content, { w: Math.max(20, Math.round(r.width * k)), h: Math.max(20, Math.round(r.height * k)) });
        });
      },
      annotationDelete: (id) => {
        const h = handleRef.current;
        if (!h) return;
        void h.intents.onAnnotation([{ op: "annotation_delete", id }], "annotation supprimée").then(() => {
          if (h.toile.state.selection && h.toile.state.selection.kind === "annotation") h.toile.select(null);
          if (!h.toile.model.annotationById.has(id)) dispatch({ type: "note", text: "annotation supprimée (" + h.writer.author + ") · Ctrl+Z pour annuler", at: Date.now() });
        });
      },
      tableUpdate: (id, content) => {
        const h = handleRef.current, a = h ? h.toile.model.annotationById.get(id) : undefined;
        if (!h || !a || a.content.kind !== "table") return;
        const box = grownBox(a.content, content, a);
        commands.annotationUpdate(id, { content, ...(box.w !== a.w || box.h !== a.h ? box : {}) });
      },
      annotationDetach: (id) => {
        const h = handleRef.current, a = h ? h.toile.model.annotationById.get(id) : undefined;
        if (!h || !a) return;
        const frame = h.toile.frames.get(id), center = h.toile.viewCenter();
        commands.annotationUpdate(id, { anchor: { kind: "free", ref: null }, leader: false, x: frame ? frame.x : center.x - a.w / 2, y: frame ? frame.y : center.y - a.h / 2 });
      },
      connectorCreate: (fields) => {
        const h = handleRef.current;
        if (!h) return;
        void h.intents.onConnector([{ op: "connector_create", ...fields }], "connecteur créé").then((intent) => {
          if (!intent) return;
          const id = "c" + intent.revision + "-1";
          if (h.toile.model.connectorById.has(id)) h.toile.reveal({ kind: "connector", id });
        });
      },
      connectorUpdate: (id, patch) => { if (handleRef.current) void handleRef.current.intents.onConnector([{ op: "connector_update", id, ...patch }], "connecteur modifié"); },
      connectorDetach: (id) => {
        const h = handleRef.current, c = h ? h.toile.model.connectorById.get(id) : undefined, ends = h ? h.toile.ends.get(id) : undefined;
        if (!h || !c || !ends) return;
        const free = (p: Point): Connector["start"] => ({ kind: "free", x: Math.round(p.x), y: Math.round(p.y) });
        commands.connectorUpdate(id, { ...(c.start.kind === "free" ? {} : { start: free(ends.a) }), ...(c.end.kind === "free" ? {} : { end: free(ends.b) }) });
      },
      connectorDelete: (id) => {
        const h = handleRef.current;
        if (!h) return;
        void h.intents.onConnector([{ op: "connector_delete", id }], "connecteur supprimé").then(() => {
          if (h.toile.state.selection && h.toile.state.selection.kind === "connector") h.toile.select(null);
          if (!h.toile.model.connectorById.has(id)) dispatch({ type: "note", text: "connecteur supprimé (" + h.writer.author + ") · Ctrl+Z pour annuler", at: Date.now() });
        });
      },
      openContext: (menu) => dispatch({ type: "context", menu }),
      closeContext: () => { if (current().context) dispatch({ type: "context", menu: null }); },
      requestEdit: (id, cell) => dispatch({ type: "editRequest", request: { id, cell, at: Date.now() } }),
      insertAt: (kind, at) => {
        if (kind === "connector") { commands.connectorCreate({ start: { kind: "free", x: Math.round(at.x - DEFAULT_LENGTH / 2), y: Math.round(at.y) }, end: { kind: "free", x: Math.round(at.x + DEFAULT_LENGTH / 2), y: Math.round(at.y) } }); return; }
        const content: Annotation["content"] | null = kind === "note" ? { kind: "note", text: "Note" } : kind === "rectangle" ? { kind: "shape", shape: "rectangle", label: "" } : kind === "ellipse" ? { kind: "shape", shape: "ellipse", label: "" } : kind === "table" ? freshTable([["Colonne 1", "Colonne 2"], ["", ""]]) : null;
        if (content) createAnnotation(content, at, {});
      },
      pickImage: () => { const input = typeof document === "undefined" ? null : document.querySelector<HTMLInputElement>(".toolbar input[type=file]"); if (input) input.click(); },
      paste: (data) => {
        const h = handleRef.current;
        if (!h || !h.intents.canWrite()) return false;
        const file = Array.from(data.files || []).find((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type));
        if (file) { commands.annotationImage(file); return true; }
        const text = (data.getData("text/plain") || "").replace(/\r\n?/g, "\n").trim();
        if (!text) return false;
        createAnnotation({ kind: "note", text: text.slice(0, 2000) }, null, {});
        return true;
      },
      selectedHosts: () => current().hosts,
      resetMoves: () => { const g = graph(); if (g) { g.resetPins(); dispatch({ type: "touched" }); } },
      undo: () => { if (handleRef.current) void handleRef.current.undo.undo(); },
      redo: () => { if (handleRef.current) void handleRef.current.undo.redo(); },
      nudge: (dx, dy) => { const g = graph(); return !!g && g.nudge(dx, dy); },
      startWalk: (kind) => {
        const s = current(), g = graph();
        if (s.run.kind !== "ready" || !g) return;
        const live = s.walk ? walkRef.current : null;
        if (live && live.kind === kind) { endWalk(); return; }
        const hosts = walkHosts(s.run.model, kind);
        if (!hosts.length) { dispatch({ type: "note", text: walkLabel(kind, 0), at: Date.now() }); return; }
        if (!live) beforeWalk.current = { selection: s.selection, hosts: s.hosts, view: g.viewport() };
        if (kind === "diff" && !s.view.showDiff) setView({ showDiff: true });
        walkTo({ kind, hosts, index: 0 });
      },
      stepWalk: (direction) => { const live = current().walk ? walkRef.current : null; if (live) walkTo(stepWalk(live, direction)); },
      endWalk,
      makeHosts: () => ({
        history,
        writer: makeWriter(session, current().author, (name) => dispatch({ type: "session", author: name })),
        placer: ((run) => (run.kind === "ready" && run.remembered ? makePlacer(session) : null))(current().run),
      }),
      setHandle: (next) => {
        handleRef.current = next; setHandleState(next);
        // les images des annotations se lisent avec la session courante (docs/10 §6) ; sans toile, plus rien ne se lit
        setAssetReader(next ? (asset) => readAsset(session(), asset) : null);
      },
    };
    return commands;
  }, [catalogue]);

  // Au démarrage : le jeton (onglet) et le nom (navigateur), puis l'adresse ; avec un jeton et une infrastructure, la
  // run demandée s'ouvre, ou la dernière ; sinon l'accueil.
  useEffect(() => {
    if (typeof location === "undefined") return;
    const token = readToken(), author = readAuthor();
    const address = parseSearch(location.search);
    const parsed = parseHash(location.hash);
    sessionRef.current = { token, infrastructure: address.infrastructure };
    dispatch({ type: "session", token, author });
    dispatch({ type: "prefs", patch: readPrefs() });
    dispatch({ type: "address", address });
    dispatch({ type: "view", patch: parsed.view });
    dispatch({ type: "want", wanted: parsed.selection });
    if (token && address.infrastructure && address.runId) commands.openRun(address.runId, address.from);
    else if (token && address.infrastructure) commands.openLatest();
    else dispatch({ type: "connect", open: true });
    // L'adresse modifiée à la main dans une page ouverte : la vue et la sélection suivent.
    const onHash = (): void => {
      const next = parseHash(location.hash);
      if (!sameView(stateRef.current.view, next.view)) dispatch({ type: "view", patch: next.view });
      dispatch({ type: "want", wanted: next.selection });
    };
    // Retour / Suivant du navigateur (« montrer » depuis le Journal pousse une entrée) : la run, la vue et la sélection
    // de l'entrée retrouvée ; une autre infrastructure se rouvre.
    const onPop = (): void => {
      const where = parseSearch(location.search), now = stateRef.current.address;
      if (where.infrastructure && where.infrastructure !== sessionRef.current.infrastructure) commands.connect({ token: sessionRef.current.token, infrastructure: where.infrastructure, author: stateRef.current.author });
      else if (where.runId && (where.runId !== now.runId || where.from !== now.from)) commands.openRun(where.runId, where.from);
      onHash();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onPop); };
  }, [commands]);

  // La vue Journal se lit à l'ouverture et à chaque changement de filtres ou d'infrastructure (toujours à neuf : le
  // journal a pu grandir depuis la dernière fois).
  const journalKey = state.view.mode === "journal" ? JSON.stringify([state.view.journal, state.address.infrastructure, state.token]) : "";
  useEffect(() => {
    if (journalKey && stateRef.current.token) commands.loadJournal(false);
  }, [journalKey, commands]);

  // L'adresse suit l'état : run, bascules, règles, sélection par identité. Jamais le jeton.
  useEffect(() => {
    if (typeof history === "undefined" || typeof location === "undefined") return;
    const search = formatSearch(state.address);
    const hash = formatHash(state.view, selectionToken(state));
    const wanted = location.pathname + search + hash;
    if (location.pathname + location.search + location.hash === wanted) return;
    if (pushNext.current) history.pushState(null, "", wanted); else history.replaceState(null, "", wanted);
    pushNext.current = false;
  }, [state.address, state.view, state.selection, state.wanted, state.run]);

  const value = useMemo<StoreValue>(() => ({ state, dispatch, commands, catalogue, handle }), [state, commands, catalogue, handle]);
  debug.note(state, handle);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

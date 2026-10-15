// Les commandes des objets de l'intention (docs/10 §5 et §6), sorties du store comme celles du presse-papiers et du bloc
// de code : groupes, annotations, connecteurs, supprimer la sélection, insérer. Tout s'écrit par l'hôte d'intention :
// sous le nom, au journal, dans la pile d'annulation. Revue de session (2026-10-15) : une rafale de flèches en attente se
// termine avant toute suppression (M1 : sinon la rafale écrivait sur une identité morte et tout le paquet était refusé) ;
// une insertion ne se pose sur la grille que si l'aimant est mis (J1), par la même règle que le collage (`snapped`).
import { t } from "../../i18n";
import type { Annotation, Connector, GroupStyle } from "../../canvas/types";
import type { AnnotationPatch, ConnectorPatch, Op } from "../../shell/apps";
import { DEFAULT_SIZE } from "../../canvas/annotations";
import { DEFAULT_LENGTH } from "../../canvas/connectors";
import type { Point } from "../../canvas/layout";
import { fresh as freshTable, grownBox } from "../../canvas/table";
import type { TableContent } from "../../contracts/intent";
import { uploadAsset } from "../api/client";
import type { Session } from "../api/client";
import { GRID } from "../canvas/Flow";
import { snapped } from "./clipboard";
import { deleteOps, empty, size as sizeOf } from "./selection";
import type { Multi } from "./selection";
import type { CanvasHandle } from "./store";
import type { Action, AppState } from "./types";

export interface IntentCommands {
  /** Suppr / Retour arrière : annotations, connecteurs et groupes de la sélection supprimés en une requête (une entrée
   *  d'annulation) ; un équipement ne se supprime pas, la ligne d'état le dit et propose de le masquer (D5). Rend
   *  faux s'il n'y avait rien à faire. */
  deleteSelection: () => boolean;
  /** Les groupes (docs/10 §5), par l'hôte d'intention ; créer sélectionne le groupe créé. */
  groupCreate: (label: string, members: string[]) => void;
  groupUpdate: (id: string, patch: { label?: string; description?: string; members?: string[]; style?: Partial<GroupStyle> }) => void;
  groupAdd: (id: string, members: string[]) => void;
  groupRemove: (id: string, members: string[]) => void;
  groupDelete: (id: string) => void;
  /** Les annotations (docs/10 §6) : créer à un point du plan (coin haut gauche ; sinon au centre de la vue), puis la
   *  sélectionner ; `extra` peut porter l'ancrage et la position relative (note attachée depuis le menu), et prime. */
  annotationCreate: (content: Annotation["content"], extra?: AnnotationPatch, at?: Point | null) => void;
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
  /** Insérer une annotation ou un connecteur d'une sorte (note, rectangle, ellipse, table, connector, code) à un point du plan. */
  insertAt: (kind: string, at: Point) => void;
}

export interface IntentDeps {
  dispatch: (action: Action) => void;
  current: () => AppState;
  session: () => Session;
  handle: () => CanvasHandle | null;
  /** Le bloc de code s'insère en brouillon (code-commands.ts, lot 16). */
  codeInsert: (at: Point | null) => void;
}

export function intentCommands({ dispatch, current, session, handle, codeInsert }: IntentDeps): IntentCommands {
  const say = (text: string): void => dispatch({ type: "note", text, at: Date.now() });
  // Une suppression part après la rafale de flèches en attente (revue de session, M1) : la toile l'écrit d'abord.
  const ready = (): CanvasHandle | null => { const h = handle(); if (h) h.toile.flush(); return h; };
  const snap = (v: number): number => snapped(v, current().prefs.snap);
  // Une création, puis la sélection de ce qui a été créé : l'identité que le serveur attribue à la première création
  // d'une requête (`<préfixe><révision>-1`).
  const reveal = (h: CanvasHandle, prefix: "a" | "c" | "g", kind: "annotation" | "connector" | "group") => (intent: { revision: number } | null): void => {
    if (!intent) return;
    const id = prefix + intent.revision + "-1";
    const known = kind === "annotation" ? h.toile.model.annotationById : kind === "connector" ? h.toile.model.connectorById : h.toile.model.groupById;
    if (known.has(id)) h.toile.reveal({ kind, id });
  };
  const commands: IntentCommands = {
    deleteSelection: () => {
      const h = ready();
      if (!h) return false;
      const s = h.toile.state;
      const multi: Multi = sizeOf(s.multi) ? s.multi : empty();
      const ops = deleteOps(multi);
      const devices = multi.hosts.filter((host) => { const node = h.toile.model.nodeByHost.get(host); return !!node && !node.ghost; });
      if (!ops.length && !devices.length) return false;
      const kept = devices.length ? { text: t(devices.length > 1 ? "shell:messages.devicesKept" : "shell:messages.deviceKept"), offer: { kind: "hide" as const, hosts: devices } } : null;
      if (!ops.length || !h.intents.canWrite()) {
        if (kept) dispatch({ type: "note", text: kept.text, offer: kept.offer, at: Date.now() });
        else say(t("shell:messages.giveName"));
        return true;
      }
      void h.intents.apply(ops, t("shell:messages.itemsDeleted", { count: ops.length, author: h.writer.author })).then((intent) => {
        if (!intent) return;
        // ce qui reste sélectionné : les équipements (on peut encore les masquer), rien d'autre
        if (devices.length) h.toile.selectHosts(devices); else h.toile.select(null);
        const done = t("shell:messages.itemsDeleted", { count: ops.length, author: h.writer.author });
        dispatch({ type: "note", text: kept ? done + " · " + kept.text : done, offer: kept ? kept.offer : undefined, at: Date.now() });
      });
      return true;
    },
    groupCreate: (label, members) => {
      const h = handle();
      if (h) void h.intents.onGroup([{ op: "group_create", label, members }], t("shell:messages.groupCreated", { name: label })).then(reveal(h, "g", "group"));
    },
    groupUpdate: (id, patch) => { const h = handle(); if (h) void h.intents.onGroup([{ op: "group_update", id, ...patch }], t("shell:messages.groupChanged")); },
    groupAdd: (id, members) => { const h = handle(); if (h) void h.intents.onGroup([{ op: "group_add", id, members }], t("shell:messages.membersAdded", { count: members.length })); },
    groupRemove: (id, members) => { const h = handle(); if (h) void h.intents.onGroup([{ op: "group_remove", id, members }], t("shell:messages.membersRemoved", { count: members.length })); },
    groupDelete: (id) => {
      const h = ready();
      if (!h) return;
      void h.intents.onGroup([{ op: "group_delete", id }], t("shell:messages.groupDeleted")).then(() => {
        if (h.toile.state.selection && h.toile.state.selection.kind === "group") h.toile.select(null);
        // supprimé pour de bon : la ligne d'état dit comment revenir en arrière
        if (!h.toile.model.groupById.has(id)) say(t("shell:messages.groupDeletedUndo", { author: h.writer.author }));
      });
    },
    annotationCreate: (content, extra = {}, at = null) => {
      const h = handle();
      if (!h) return;
      const size = DEFAULT_SIZE[content.kind], w = extra.w || size.w, hh = extra.h || size.h;
      const point = at ? { x: snap(at.x), y: snap(at.y) } : ((c) => ({ x: snap(c.x - w / 2), y: snap(c.y - hh / 2) }))(h.toile.viewCenter());
      const op: Op = { op: "annotation_create", content, x: point.x, y: point.y, w, h: hh, ...extra };
      void h.intents.onAnnotation([op], t("shell:messages.annotationCreated")).then(reveal(h, "a", "annotation"));
    },
    annotationUpdate: (id, patch) => { const h = handle(); if (h) void h.intents.onAnnotation([{ op: "annotation_update", id, ...patch }], t("shell:messages.annotationChanged")); },
    annotationDuplicate: (id) => {
      const h = handle(), a = h ? h.toile.model.annotationById.get(id) : undefined;
      if (!h || !a) return;
      const op: Op = { op: "annotation_create", content: a.content, anchor: a.anchor, x: a.x + GRID, y: a.y + GRID, w: a.w, h: a.h, z: a.z, locked: false, leader: a.leader, style: a.style };
      void h.intents.onAnnotation([op], t("shell:messages.annotationDuplicated")).then(reveal(h, "a", "annotation"));
    },
    annotationImage: (file, id) => {
      const h = handle();
      if (!h) return;
      dispatch({ type: "note", text: t("shell:messages.imageSending"), busy: true, at: Date.now() });
      void uploadAsset(session(), file).then((result) => {
        if (!result.ok) { say(t("shell:messages.imageNotSaved", { reason: result.message })); return; }
        const r = result.receipt, k = Math.min(1, 600 / Math.max(1, r.width));
        const content = { kind: "image" as const, asset: r.asset, alt: "" };
        if (id) { commands.annotationUpdate(id, { content: { ...content, alt: ((h.toile.model.annotationById.get(id) || { content: { alt: "" } }).content as { alt?: string }).alt || "" } }); return; }
        commands.annotationCreate(content, { w: Math.max(20, Math.round(r.width * k)), h: Math.max(20, Math.round(r.height * k)) });
      });
    },
    annotationDelete: (id) => {
      const h = ready();
      if (!h) return;
      void h.intents.onAnnotation([{ op: "annotation_delete", id }], t("shell:messages.annotationDeleted")).then(() => {
        if (h.toile.state.selection && h.toile.state.selection.kind === "annotation") h.toile.select(null);
        if (!h.toile.model.annotationById.has(id)) say(t("shell:messages.annotationDeletedUndo", { author: h.writer.author }));
      });
    },
    tableUpdate: (id, content) => {
      const h = handle(), a = h ? h.toile.model.annotationById.get(id) : undefined;
      if (!h || !a || a.content.kind !== "table") return;
      const box = grownBox(a.content, content, a);
      commands.annotationUpdate(id, { content, ...(box.w !== a.w || box.h !== a.h ? box : {}) });
    },
    annotationDetach: (id) => {
      const h = handle(), a = h ? h.toile.model.annotationById.get(id) : undefined;
      if (!h || !a) return;
      const frame = h.toile.frames.get(id), center = h.toile.viewCenter();
      commands.annotationUpdate(id, { anchor: { kind: "free", ref: null }, leader: false, x: frame ? frame.x : center.x - a.w / 2, y: frame ? frame.y : center.y - a.h / 2 });
    },
    connectorCreate: (fields) => {
      const h = handle();
      if (h) void h.intents.onConnector([{ op: "connector_create", ...fields }], t("shell:messages.connectorCreated")).then(reveal(h, "c", "connector"));
    },
    connectorUpdate: (id, patch) => { const h = handle(); if (h) void h.intents.onConnector([{ op: "connector_update", id, ...patch }], t("shell:messages.connectorChanged")); },
    connectorDetach: (id) => {
      const h = handle(), c = h ? h.toile.model.connectorById.get(id) : undefined, ends = h ? h.toile.ends.get(id) : undefined;
      if (!h || !c || !ends) return;
      const free = (p: Point): Connector["start"] => ({ kind: "free", x: Math.round(p.x), y: Math.round(p.y) });
      commands.connectorUpdate(id, { ...(c.start.kind === "free" ? {} : { start: free(ends.a) }), ...(c.end.kind === "free" ? {} : { end: free(ends.b) }) });
    },
    connectorDelete: (id) => {
      const h = ready();
      if (!h) return;
      void h.intents.onConnector([{ op: "connector_delete", id }], t("shell:messages.connectorDeleted")).then(() => {
        if (h.toile.state.selection && h.toile.state.selection.kind === "connector") h.toile.select(null);
        if (!h.toile.model.connectorById.has(id)) say(t("shell:messages.connectorDeletedUndo", { author: h.writer.author }));
      });
    },
    insertAt: (kind, at) => {
      if (kind === "code") { codeInsert(at); return; } // un brouillon : rien n'existe avant le premier enregistrement (lot 16)
      if (kind === "connector") {
        const half = DEFAULT_LENGTH / 2;
        commands.connectorCreate({ start: { kind: "free", x: snap(at.x - half), y: snap(at.y) }, end: { kind: "free", x: snap(at.x + half), y: snap(at.y) } });
        return;
      }
      const content: Annotation["content"] | null = kind === "note" ? { kind: "note", text: t("shell:messages.defaultNote") } : kind === "rectangle" ? { kind: "shape", shape: "rectangle", label: "" } : kind === "ellipse" ? { kind: "shape", shape: "ellipse", label: "" } : kind === "table" ? freshTable([[t("shell:messages.column", { n: 1 }), t("shell:messages.column", { n: 2 })], ["", ""]]) : null;
      if (content) commands.annotationCreate(content, {}, at);
    },
  };
  return commands;
}

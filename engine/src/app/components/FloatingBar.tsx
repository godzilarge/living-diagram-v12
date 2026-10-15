// La barre contextuelle flottante (lot 4 de docs/11) : les réglages fréquents de l'élément sélectionné, à un clic,
// au-dessus de lui. Quels boutons et où : `state/floating.ts` (pur) ; ici, le rendu, la place à chaque image, le
// clavier et l'exécution, par les commandes du store (les mêmes que l'inspecteur : la barre n'a rien qu'il n'ait pas).
//
// Une couche à soi, en coordonnées d'écran, plutôt que `NodeToolbar` de React Flow : il faut la zone visible (sous la
// barre du haut, la recherche, la barre d'outils, au-dessus de la bande, à gauche du panneau), passer dessous quand le
// haut manque, éviter de couvrir une annotation, s'ancrer au milieu du tracé d'un connecteur (sa boîte peut être grande
// et vide) et ouvrir des volets qui ne masquent jamais l'objet : `NodeToolbar` ne fait que « au-dessus de la boîte des
// nœuds donnés », avec un style en ligne. La couche s'abonne à la vue (`transform`) et à la toile ; la toile ne la connaît
// pas et ne se reconstruit jamais pour elle.
//
// Cachée pendant tout geste (gate.ts) et Maj tenue (le temps d'un Maj + clic), revenue 120 ms après ; l'arrivée (150 ms,
// 4 px) ne se joue qu'au passage de cachée à montrée. Masquée par préférence (Ctrl+. ou le panneau Affichage), Alt+T la
// rappelle pour la sélection en cours. Clavier : Alt+T donne le focus, ← → la parcourent, ↓ ouvre un volet, Échap le
// ferme puis rend la toile. Alt + A / H / D / W / V / S et Alt + Maj + H / V alignent une sélection multiple.
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useStore as useFlowStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LENGTH } from "../../canvas/connectors";
import { MAX_COLUMNS, MAX_ROWS, columnsOf, insertColumn, insertRow } from "../../canvas/table";
import type { Model } from "../../canvas/types";
import { t } from "../../i18n";
import { FloatingHost } from "../canvas/Flow";
import type { Toile } from "../canvas/toile";
import { alignCommand, alignFromKey, anchorOf, barLabel, entriesOf, movableCount, nextHeads, nextTextAlign, placeBar, placeVolet, selectionKey, shows, targetOf, toScreen, BAR_H, GAP } from "../state/floating";
import type { BarAlign, BarButton, BarEntry, Geometry, Obstacle, Rect, Target, Zone } from "../state/floating";
import { useEditable, useStore } from "../state/store";
import { FaceOf } from "./floating-faces";
import { VoletBody } from "./FloatingVolet";
import { codeRun } from "../state/code-bar";

/** Le retour après un geste ou Maj relâchée ; le délai avant la première infobulle (puis sans attendre d'une case à l'autre). */
const RETURN_MS = 120, TIP_MS = 400;
const NO_VIEW: [number, number, number] = [0, 0, 1];
type Commands = ReturnType<typeof useStore>["commands"];

/** La zone de la barre, relative à la toile : sous la recherche et la barre d'outils, au-dessus de la bande, à gauche du panneau. */
function zoneOf(host: DOMRect): Zone {
  const rect = (selector: string): DOMRect | null => { const el = document.querySelector(selector); return el ? el.getBoundingClientRect() : null; };
  const tops = [".search", ".toolbar"].map(rect).filter((r): r is DOMRect => !!r && r.height > 0);
  const band = rect(".band"), panel = rect(".panel");
  const top = (tops.length ? Math.max(...tops.map((r) => r.bottom)) : host.top + 56) - host.top + GAP;
  const bottom = (band && band.height ? band.top : host.bottom - GAP) - host.top - GAP;
  const right = (panel && panel.width ? panel.left : host.right) - host.left - GAP;
  return { left: GAP, top, right, bottom };
}

/** La place des éléments dans le plan, lue dans la toile (posée à chaque dessin par Flow.tsx). */
const geometryOf = (toile: Toile): Geometry => ({
  node: (host) => { const c = toile.state.positions.get(host), b = toile.boxes.get(host); return c && b ? { x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h } : null; },
  annotation: (id) => toile.frames.get(id) || null,
  connector: (id) => toile.ends.get(id) || null,
  group: (id) => toile.groupFrames.get(id) || null,
});

/** Ce que la barre évite de couvrir : les annotations dessinées (poids 1), les cartes (0,5) ; jamais la sélection. Seuls
 *  comptent les éléments des deux rangées où elle peut se poser (au-dessus et au-dessous de l'ancre) : le tri se fait
 *  dans le plan, avant toute conversion, pour qu'un panoramique sur 500 cartes ne convertisse que les voisines. */
function obstaclesOf(toile: Toile, view: { x: number; y: number; zoom: number }, anchor: Rect): Obstacle[] {
  const out: Obstacle[] = [];
  const multi = toile.state.multi, k = view.zoom || 1;
  const reach = GAP + BAR_H;
  const y0 = (anchor.y - reach - view.y) / k, y1 = (anchor.y + anchor.h + reach - view.y) / k;
  const near = (top: number, bottom: number): boolean => bottom >= y0 && top <= y1;
  toile.frames.forEach((frame, id) => { if (!multi.annotations.includes(id) && near(frame.y, frame.y + frame.h)) out.push({ box: toScreen(frame, view), weight: 1 }); });
  toile.state.positions.forEach((c, host) => {
    const b = toile.boxes.get(host);
    if (!b || b.w <= 60 || toile.state.selected.has(host) || !near(c.y - b.h / 2, c.y + b.h / 2)) return;
    out.push({ box: toScreen({ x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h }, view), weight: 0.5 });
  });
  return out;
}

/** Ce que le DOM dessine et que la toile ne garde pas : les étiquettes des connecteurs (un obstacle comme une
 *  annotation) ; pour un connecteur sélectionné, son tracé échantillonné et son étiquette, obstacles forts (la barre ne
 *  masque jamais l'objet : elle se pose à côté d'un tracé vertical). En coordonnées de la toile (`host`). */
const STRONG = 40, SAMPLES = 48;
function drawnObstacles(host: DOMRect, selectedConnector: string | null): Obstacle[] {
  const out: Obstacle[] = [];
  const box = (r: DOMRect): Rect => ({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height });
  const mine = selectedConnector ? document.querySelector(`.react-flow__node[data-id="connector:${CSS.escape(selectedConnector)}"]`) : null;
  // l'étiquette du connecteur sélectionné fait partie de l'ancre (labelOf), pas des obstacles
  document.querySelectorAll<SVGGraphicsElement>(".flow .connector-label-box").forEach((el) => { if (!mine || !mine.contains(el)) out.push({ box: box(el.getBoundingClientRect()), weight: 1 }); });
  const path = mine ? mine.querySelector<SVGPathElement>("path.connector-line") : null;
  const ctm = path ? path.getScreenCTM() : null;
  if (path && ctm && typeof path.getTotalLength === "function") {
    const length = path.getTotalLength();
    for (let i = 0; i <= SAMPLES; i += 1) {
      const at = path.getPointAtLength((length * i) / SAMPLES), p = new DOMPoint(at.x, at.y).matrixTransform(ctm);
      out.push({ box: { x: p.x - host.left - 3, y: p.y - host.top - 3, w: 6, h: 6 }, weight: STRONG });
    }
  }
  return out;
}

/** L'ancre d'un connecteur à l'écran : le milieu de son tracé, et son étiquette quand il en a une (elle est posée au
 *  milieu : la barre ne la couvre pas plus que le tracé). */
function labelOf(anchor: Rect, host: DOMRect, connector: string): Rect {
  const el = document.querySelector(`.react-flow__node[data-id="connector:${CSS.escape(connector)}"] .connector-label-box`);
  if (!el) return anchor;
  const r = el.getBoundingClientRect(), x = Math.min(anchor.x, r.left - host.left), y = Math.min(anchor.y, r.top - host.top);
  return { x, y, w: Math.max(anchor.x + anchor.w, r.right - host.left) - x, h: Math.max(anchor.y + anchor.h, r.bottom - host.top) - y };
}

/** Ce qu'un bouton fait, pour la cible, par les commandes du store. */
function execute(button: BarButton, value: string | null, target: Target, model: Model, toile: Toile, commands: Commands, pickFile: () => void): void {
  const id = button.id;
  if (target.kind === "annotation") {
    const a = target.a, s = a.style, update = (patch: Parameters<Commands["annotationUpdate"]>[1]): void => commands.annotationUpdate(a.id, patch);
    const style = (patch: Partial<typeof s>): void => update({ style: patch });
    if (id === "hue" && value) style({ hue: value as typeof s.hue });
    else if (id === "text_size" && value) style({ text_size: Number(value) });
    else if (id === "bold") style({ text_weight: s.text_weight === "bold" ? "regular" : "bold" });
    else if (id === "text_align") style({ text_align: nextTextAlign(s.text_align) });
    else if (id === "fill_opacity" && value) style({ fill_opacity: Number(value) });
    else if (id === "stroke_style" && value) style({ stroke_style: value as typeof s.stroke_style });
    else if (id === "radius" && value) style({ radius: Number(value) });
    else if (id === "opacity" && value) style({ opacity: Number(value) });
    else if (id === "plane" && value) update({ z: value as typeof a.z });
    else if (id === "lock") update({ locked: !a.locked });
    else if (id === "duplicate") commands.duplicate({ kind: "annotation", id: a.id });
    else if (id === "delete") commands.annotationDelete(a.id);
    else if (id === "edit_label") commands.requestEdit(a.id, null);
    else if (id === "replace") pickFile();
    else if (a.content.kind === "code") codeRun(id, value, a, a.content, commands); // lot 16 : langage, police, coloration, numéros, hauteur
    else if (a.content.kind === "table") {
      const c = a.content;
      if (id === "add_row" && c.rows.length < MAX_ROWS) commands.tableUpdate(a.id, insertRow(c, c.rows.length));
      else if (id === "add_column" && columnsOf(c) < MAX_COLUMNS) commands.tableUpdate(a.id, insertColumn(c, columnsOf(c)));
      else if (id === "header") commands.tableUpdate(a.id, { ...c, header: !c.header });
    }
    return;
  }
  if (target.kind === "connector") {
    const c = target.c, update = (patch: Parameters<Commands["connectorUpdate"]>[1]): void => commands.connectorUpdate(c.id, patch);
    if (id === "heads") update({ heads: nextHeads(c) });
    else if (id === "route" && value) update({ route: value as typeof c.route });
    else if (id === "hue" && value) update({ style: { hue: value as typeof c.style.hue } });
    else if (id === "stroke_width" && value) update({ style: { stroke_width: Number(value) } });
    else if (id === "line_style" && value) update({ style: { stroke_style: value as typeof c.style.stroke_style } });
    else if (id === "reverse") update({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });
    else if (id === "lock") update({ locked: !c.locked });
    else if (id === "delete") commands.connectorDelete(c.id);
    return;
  }
  if (target.kind === "group") {
    const g = target.g, present = g.members.filter((host) => model.nodeByHost.has(host));
    const style = (patch: Partial<typeof g.style>): void => commands.groupUpdate(g.id, { style: patch });
    if (id === "hue" && value) style({ hue: value as typeof g.style.hue });
    else if (id === "shape" && value) style({ shape: value as typeof g.style.shape });
    else if (id === "label_position" && value) style({ label_position: value as typeof g.style.label_position });
    else if (id === "select_members") commands.selectHosts(present);
    else if (id === "paint_members") commands.colorHosts(present, g.style.hue);
    else if (id === "delete") commands.groupDelete(g.id);
    return;
  }
  const hosts = target.kind === "device" ? [target.host] : target.multi.hosts;
  const devices = hosts.filter((host) => { const n = model.nodeByHost.get(host); return !!n && n.kind !== "stub" && !n.ghost; });
  if (id === "group" && value) { if (value === "new") commands.groupCreate(t("shell:context.defaultGroup"), devices); else commands.groupAdd(value, devices); return; }
  if (id === "hide") { commands.hideHosts(hosts); return; }
  if (id === "isolate") { commands.isolateHosts(hosts); return; }
  if (target.kind === "device") {
    const host = target.host;
    if (id === "hue") commands.color(host, value);
    else if (id === "pin") { if (model.pinByHost.has(host)) commands.unpin([host]); else commands.pinHere(host); }
    else if (id === "note") commands.annotationCreate({ kind: "note", text: t("shell:context.defaultNote") }, { anchor: { kind: "device", ref: host }, x: 60, y: -120, leader: true });
    else if (id === "connect") {
      const at = toile.state.positions.get(host) || { x: 0, y: 0 }, box = toile.boxes.get(host) || { w: 0, h: 0 };
      commands.connectorCreate({ start: { kind: "device", ref: host, side: "auto" }, end: { kind: "free", x: Math.round(at.x + box.w / 2 + DEFAULT_LENGTH), y: Math.round(at.y) } });
    }
    return;
  }
  const multi = target.multi;
  if (id === "align" && value) commands.align(alignCommand(value as BarAlign, movableCount(model, multi).cardsOnly) as BarAlign);
  else if (id === "hue") commands.colorItems(multi, value);
  else if (id === "duplicate") commands.duplicate();
  else if (id === "delete") commands.deleteSelection();
  else if (id === "lock") commands.lockItems(multi.annotations, multi.connectors, !button.pressed);
}

const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && !!el.tagName && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
};

export function FloatingBar() {
  const host = useContext(FloatingHost);
  return host ? <Bar toile={host.toile} gate={host.gate} /> : null;
}

function Bar({ toile, gate }: { toile: Toile; gate: { busy: () => boolean; subscribe: (l: () => void) => () => void } }) {
  const { state, commands, dispatch } = useStore();
  const { i18n } = useTranslation();
  const editable = useEditable();
  const version = useSyncExternalStore(toile.subscribe, toile.version, toile.version);
  const busy = useSyncExternalStore(gate.subscribe, gate.busy, gate.busy);
  const [settled, setSettled] = useState(true);
  const [shift, setShift] = useState(false);
  const [summoned, setSummoned] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); // l'arrêt de tabulation de la barre (tabulation itinérante)
  const [tip, setTip] = useState<{ el: HTMLElement; label: string; keys: string; volet: boolean } | null>(null);
  const bar = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), volet = useRef<HTMLDivElement>(null), tipEl = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const wasLive = useRef(false), focusNext = useRef(false), lastTip = useRef(0), tipTimer = useRef<number | null>(null);
  const placedRef = useRef<{ bar: Rect; below: boolean; anchor: Rect; zone: Zone } | null>(null);

  const model = state.run.kind === "ready" ? state.run.model : null;
  const key = selectionKey(state.selection, state.picked);
  const target = model && model === toile.model ? targetOf(model, state.selection, state.picked) : null;
  const visible = !!target && shows({ editable, control: state.view.mode !== "diagram", tool: !!state.tool, preferred: state.prefs.fbar, summoned: summoned !== "" && summoned === key });
  const suspended = busy || !settled || shift;
  const live = visible && !suspended;
  // la vue ne compte que quand la barre se montre : sans elle, un panoramique ne redessine rien ici
  const transform = useFlowStore(useCallback((s: ReactFlowState) => (visible ? s.transform : NO_VIEW), [visible]));

  // Un geste : cachée tout de suite ; fini, elle revient 120 ms après.
  useEffect(() => {
    if (busy) { setSettled(false); return undefined; }
    const timer = window.setTimeout(() => setSettled(true), RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);
  // La sélection change : un rappel par Alt+T ne vaut plus, un volet se ferme.
  useEffect(() => { setOpen(null); setTip(null); if (summoned && summoned !== key) setSummoned(""); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!live) { setOpen(null); setTip(null); } }, [live]);

  // les boutons suivent le modèle (une teinte posée : une version de plus), la sélection et la langue ; pas la vue (un
  // panoramique ne les recalcule pas)
  const entries: BarEntry[] = useMemo(() => (target && model ? entriesOf(model, target) : []), [model, key, version, state.revision, i18n.language, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const buttons = entries.filter((e): e is BarButton => e.id !== "sep");
  const openButton = open ? buttons.find((b) => b.id === open && b.volet) || null : null;
  const focusCanvas = useCallback((): void => {
    const el = document.querySelector<HTMLElement>(".flow .react-flow__node.selected") || document.querySelector<HTMLElement>(".flow-host");
    if (el) el.focus({ preventScroll: true });
  }, []);
  const focusFirst = useCallback((): void => {
    const el = body.current ? body.current.querySelector<HTMLElement>(".fb[tabindex='0']") || body.current.querySelector<HTMLElement>(".fb") : null;
    if (el) el.focus({ preventScroll: true });
  }, []);

  // Le clavier de la page : Ctrl+. (afficher / masquer, une préférence), Alt+T (le focus, ou le rappel), Alt + lettre
  // (aligner une sélection multiple), Maj tenue (la barre s'efface le temps d'un Maj + clic).
  const latest = useRef({ state, target, visible, live, editable, model });
  latest.current = { state, target, visible, live, editable, model };
  useEffect(() => {
    let shiftTimer: number | null = null;
    const down = (event: KeyboardEvent): void => {
      const now = latest.current;
      if (now.state.view.mode === "journal" || typing(event.target)) return;
      const inBar = !!(event.target as Element | null)?.closest?.(".fbar, .fvolet");
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "." || event.code === "Period")) {
        event.preventDefault();
        const next = !now.state.prefs.fbar;
        commands.setPrefs({ fbar: next });
        setSummoned("");
        dispatch({ type: "note", text: t(next ? "shell:fbar.shown" : "shell:fbar.hidden"), at: Date.now() });
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyT" || event.key.toLowerCase() === "t") && !event.shiftKey) {
        if (!now.target || !now.editable || now.state.view.mode !== "diagram") return;
        event.preventDefault();
        if (!now.state.prefs.fbar) setSummoned(selectionKey(now.state.selection, now.state.picked));
        focusNext.current = true;
        if (now.live) focusFirst();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && now.target && now.target.kind === "multi" && now.editable && now.state.view.mode === "diagram" && now.model) {
        const mode = alignFromKey(event.key, event.code, event.shiftKey);
        if (mode && movableCount(now.model, now.target.multi).count >= (mode.startsWith("distribute") ? 3 : 2)) {
          event.preventDefault();
          commands.align(alignCommand(mode, movableCount(now.model, now.target.multi).cardsOnly) as BarAlign);
        }
        return;
      }
      if (event.key === "Shift" && !event.repeat && !inBar) { if (shiftTimer !== null) window.clearTimeout(shiftTimer); setShift(true); }
    };
    const up = (event: KeyboardEvent): void => {
      if (event.key !== "Shift") return;
      if (shiftTimer !== null) window.clearTimeout(shiftTimer);
      shiftTimer = window.setTimeout(() => { shiftTimer = null; setShift(false); }, RETURN_MS);
    };
    const blur = (): void => setShift(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); if (shiftTimer !== null) window.clearTimeout(shiftTimer); };
  }, [commands, dispatch, focusFirst]);

  // Un volet ouvert : un appui dehors (hors de son bouton) le ferme ; Échap aussi, d'où que vienne le focus, avant
  // que la page ne vide la sélection (à la capture : il ferme ce qui est ouvert d'abord, comme le menu contextuel).
  useEffect(() => {
    if (!open) return undefined;
    const down = (event: PointerEvent): void => {
      const el = event.target as Element | null;
      if (!el || (volet.current && volet.current.contains(el)) || el.closest?.(`.fb[data-id="${open}"]`)) return;
      setOpen(null);
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const inside = !!(document.activeElement && document.activeElement.closest(".fbar, .fvolet"));
      setOpen(null);
      setTip(null);
      const opener = body.current ? body.current.querySelector<HTMLElement>(`.fb[data-id="${open}"]`) : null;
      if (opener && inside) opener.focus();
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  }, [open]);

  // La place, à chaque image où quelque chose a pu bouger (vue, toile, sélection, panneau) : posée par des variables
  // CSS sur l'élément (CSSOM, jamais un style en ligne) ; les classes d'état aussi, que React ne réécrit pas.
  useLayoutEffect(() => {
    const el = bar.current, inner = body.current;
    if (!el || !inner || !target) { wasLive.current = false; return; }
    const hostEl = el.parentElement;
    if (!hostEl) return;
    const view = { x: transform[0], y: transform[1], zoom: transform[2] };
    const plane = anchorOf(target.kind === "multi" ? target.multi : toile.state.multi, geometryOf(toile));
    const hostRect = hostEl.getBoundingClientRect();
    const zone = zoneOf(hostRect);
    const line = target.kind === "connector" ? target.c.id : null;
    const anchor = plane ? (line ? labelOf(toScreen(plane, view), hostRect, line) : toScreen(plane, view)) : null;
    const place = anchor ? placeBar(anchor, inner.offsetWidth, zone, obstaclesOf(toile, view, anchor).concat(drawnObstacles(hostRect, line)), !!line) : null;
    el.classList.toggle("suspended", suspended);
    el.classList.toggle("offscreen", !place);
    if (place && anchor) {
      el.style.setProperty("--fx", place.x + "px");
      el.style.setProperty("--fy", place.y + "px");
      el.style.setProperty("--cx", place.caret + "px");
      el.style.setProperty("--cy", place.caretY + "px");
      el.classList.toggle("below", place.below);
      el.classList.toggle("left", place.side === "left");
      el.classList.toggle("right", place.side === "right");
      el.dataset.covers = String(place.covers);
      placedRef.current = { bar: { x: place.x, y: place.y, w: inner.offsetWidth, h: inner.offsetHeight }, below: place.below, anchor, zone };
    } else placedRef.current = null;
    const nowLive = live && !!place;
    if (nowLive && !wasLive.current) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    wasLive.current = nowLive;
    if (nowLive && focusNext.current) { focusNext.current = false; focusFirst(); }
  });
  // Le volet : du côté de la barre opposé à la sélection, sinon de l'autre côté de la sélection ; jamais sur l'objet.
  useLayoutEffect(() => {
    const el = volet.current, placed = placedRef.current;
    if (!el || !placed || !openButton || !bar.current) return;
    const opener = bar.current.querySelector<HTMLElement>(`.fb[data-id="${openButton.id}"]`);
    const host = bar.current.parentElement;
    if (!opener || !host) return;
    const h = host.getBoundingClientRect(), r = opener.getBoundingClientRect();
    const at = placeVolet(placed.bar, placed.below, { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }, el.offsetWidth, el.offsetHeight, placed.zone, placed.anchor);
    el.style.setProperty("--vx", at.x + "px");
    el.style.setProperty("--vy", at.y + "px");
    el.classList.toggle("up", at.up);
  });
  // L'infobulle : « libellé · raccourci », contre la barre (ou le volet), du côté opposé à la sélection.
  useLayoutEffect(() => {
    const el = tipEl.current, placed = placedRef.current;
    if (!el || !tip || !placed || !bar.current || !bar.current.parentElement) return;
    const h = bar.current.parentElement.getBoundingClientRect(), r = tip.el.getBoundingClientRect();
    const ref = tip.volet && volet.current ? volet.current.getBoundingClientRect() : (body.current as HTMLDivElement).getBoundingClientRect();
    const below = tip.volet && volet.current ? !volet.current.classList.contains("up") : placed.below;
    let y = below ? ref.bottom - h.top + 6 : ref.top - h.top - 6 - el.offsetHeight;
    if (y < placed.zone.top || y + el.offsetHeight > placed.zone.bottom) y = below ? ref.top - h.top - 6 - el.offsetHeight : ref.bottom - h.top + 6;
    const x = Math.max(placed.zone.left, Math.min(r.left - h.left + r.width / 2 - el.offsetWidth / 2, placed.zone.right - el.offsetWidth));
    el.style.setProperty("--tx", Math.round(x) + "px");
    el.style.setProperty("--ty", Math.round(y) + "px");
  });
  useEffect(() => () => { if (tipTimer.current !== null) window.clearTimeout(tipTimer.current); }, []);

  if (!target || !model || !visible) return null;
  const showTip = (el: HTMLElement | null, label: string, keys: string, now: boolean, inVolet = false): void => {
    if (tipTimer.current !== null) { window.clearTimeout(tipTimer.current); tipTimer.current = null; }
    if (!el) { if (tip) lastTip.current = performance.now(); setTip(null); return; }
    const wait = now || performance.now() - lastTip.current < TIP_MS ? 0 : TIP_MS;
    const show = (): void => { lastTip.current = performance.now(); setTip({ el, label, keys, volet: inVolet }); };
    if (wait) tipTimer.current = window.setTimeout(show, wait); else show();
  };
  const run = (button: BarButton, value: string | null = null): void => {
    execute(button, value, target, model, toile, commands, () => { if (file.current) file.current.click(); });
    if (button.volet && button.volet.kind === "groups") setOpen(null);
  };
  const toggle = (button: BarButton, focusInside: boolean): void => {
    setTip(null);
    if (open === button.id) { setOpen(null); return; }
    setOpen(button.id);
    if (focusInside) window.requestAnimationFrame(() => {
      const first = volet.current ? volet.current.querySelector<HTMLElement>("[aria-checked='true'], [tabindex='0'], button") : null;
      if (first) first.focus({ preventScroll: true });
    });
  };
  const roving = (el: HTMLElement): void => { if (el.dataset.id) setActive(el.dataset.id); };
  const barKeys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const all = body.current ? Array.from(body.current.querySelectorAll<HTMLElement>(".fb")) : [];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => { const next = all[(i + all.length) % all.length]; if (next) { roving(next); next.focus(); } };
    if (event.key === "ArrowRight") { event.preventDefault(); go(at + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); go(at - 1); }
    else if (event.key === "Home") { event.preventDefault(); go(0); }
    else if (event.key === "End") { event.preventDefault(); go(all.length - 1); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const button = buttons.find((b) => b.id === (document.activeElement as HTMLElement).dataset.id);
      if (button && button.volet) { event.preventDefault(); toggle(button, true); }
    } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTip(null); focusCanvas(); }
  };
  const voletKeys = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab") return; // Échap : à la capture, plus haut
    event.preventDefault();
    event.stopPropagation();
    const id = open;
    setOpen(null);
    setTip(null);
    const opener = id && body.current ? body.current.querySelector<HTMLElement>(`.fb[data-id="${id}"]`) : null;
    if (opener) { roving(opener); opener.focus(); }
  };
  const stop = buttons.some((b) => b.id === active) ? active : buttons.length ? buttons[0].id : null;
  return (
    <>
      <div ref={bar} className="fbar nopan nodrag nowheel" role="toolbar" aria-label={barLabel(target)} aria-orientation="horizontal" aria-keyshortcuts="Alt+T" onKeyDown={barKeys}>
        <div ref={body} className="fbar-body">
          {entries.map((entry, i) => {
            if (entry.id === "sep") return <span key={"sep" + i} className="fb-sep" aria-hidden="true" />;
            const b = entry as BarButton;
            const tab = b.id === stop ? 0 : -1;
            const tint = b.face.kind === "glyph" && b.face.glyph === "fill" && target.kind === "annotation" ? " hue-" + target.a.style.hue : "";
            return (
              <button key={b.id} type="button" data-id={b.id} tabIndex={tab} className={"fb" + (b.volet ? " opens" : "") + (b.danger ? " danger" : "") + (b.face.kind === "text" ? " named" : "") + tint}
                aria-label={b.label} aria-keyshortcuts={b.aria} aria-pressed={b.pressed === undefined ? undefined : b.pressed ? "true" : "false"}
                aria-haspopup={b.volet ? (b.volet.kind === "groups" ? "menu" : "dialog") : undefined} aria-expanded={b.volet ? (open === b.id ? "true" : "false") : undefined}
                onClick={() => { if (b.volet) toggle(b, false); else run(b); }}
                onPointerEnter={(event) => { if (!open) showTip(event.currentTarget, b.label, b.keys || "", false); }} onPointerLeave={() => showTip(null, "", "", false)}
                onFocus={(event) => { roving(event.currentTarget); if (!open && event.currentTarget.matches(":focus-visible")) showTip(event.currentTarget, b.label, b.keys || "", true); }}
                onBlur={() => showTip(null, "", "", false)}>
                <FaceOf face={b.face} />
              </button>
            );
          })}
          <span className="fbar-caret" aria-hidden="true" />
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label={t("shell:fbar.imageFile")}
          onChange={(event) => { const chosen = event.target.files && event.target.files[0]; if (chosen && target.kind === "annotation") commands.annotationImage(chosen, target.a.id); event.target.value = ""; }} />
      </div>
      {openButton ? (
        <div ref={volet} className={"fvolet nopan nodrag nowheel" + (target.kind === "annotation" ? " hue-" + target.a.style.hue : "")} role={openButton.volet && openButton.volet.kind === "groups" ? undefined : "dialog"}
          aria-label={openButton.volet && openButton.volet.kind === "groups" ? undefined : openButton.label} onKeyDown={voletKeys}>
          <VoletBody button={openButton} onPick={(value) => run(openButton, value)} onTip={(el, label, keys) => showTip(el, label, keys, true, true)} />
        </div>
      ) : null}
      {tip ? <div ref={tipEl} className="ftip" aria-hidden="true"><span className="ftip-label">{tip.label}</span>{tip.keys ? <span className="ftip-keys">{tip.keys}</span> : null}</div> : null}
    </>
  );
}


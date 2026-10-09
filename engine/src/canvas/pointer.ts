// Le pointeur sur la toile : le panoramique de la vue, le glissé d'un équipement (ou de toute la sélection multiple,
// d'un bloc, quand il en fait partie), le clic qui sélectionne, et le rectangle de sélection (Maj + glissé sur le fond). Rien du dessin ni du modèle ici : le graphe fournit ce qu'il
// sait faire (déplacer un équipement, sélectionner, dire ce qu'un point touche) et ce module ne tient que l'état
// des appuis. Un appui annulé (toucher ou stylet interrompu, fenêtre qui perd le focus, nœud redessiné) n'a jamais
// de relâchement : on libère quand même, sinon le nœud ou la vue suivrait la souris sans appui (revue, H1).
import { s } from "./dom";
import type { Point } from "./layout";
import type { Selection } from "./types";

export interface View { k: number; tx: number; ty: number }
/** Un rectangle en coordonnées d'écran (celles du canevas), bords ordonnés. */
export interface ScreenRect { left: number; top: number; right: number; bottom: number }
const CLICK_SLOP = 4;

export interface PointerHost {
  view: () => View;
  /** Pose une vue (panoramique) et la peint. */
  setView: (view: View) => void;
  at: (hostname: string) => Point;
  /** Ceux qui bougent avec cet équipement quand on le glisse : lui seul, ou toute la sélection multiple s'il en fait partie. */
  companions: (hostname: string) => string[];
  /** Déplace un équipement à ce point (unités du dessin) : sa position, son épingle locale, ses câbles suivent. */
  moveTo: (hostname: string, point: Point) => void;
  /** Des équipements relâchés après un glissé réel : un seul, ou la sélection glissée d'un bloc. */
  dropped: (hostnames: string[]) => void;
  select: (selection: Selection | null) => void;
  /** Maj + clic sur un équipement : entre ou sort de la sélection multiple. */
  toggleHost: (hostname: string) => void;
  /** Maj + glissé sur le fond : les équipements dans ce rectangle d'écran deviennent la sélection. */
  selectIn: (rect: ScreenRect) => void;
  entityAt: (target: EventTarget | null) => Selection | null;
  tipHide: () => void;
  tipShowAt: (entity: Selection, x: number, y: number) => void;
}

export interface Pointer {
  bindNode: (group: SVGGElement, hostname: string) => void;
  /** Un appui est en cours (glissé ou panoramique) : la bulle ne se rallume pas sur un focus reçu à l'appui. */
  busy: () => boolean;
}

const additive = (pointer: PointerEvent): boolean => pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;

export function bind(svg: SVGSVGElement, host: PointerHost): Pointer {
  let dragging = false;
  let pan: { x: number; y: number; tx: number; ty: number; moved: boolean; target: EventTarget | null; marquee: boolean } | null = null;
  const marquee = s("rect", { class: "marquee", visibility: "hidden" });
  svg.appendChild(marquee);

  const relative = (pointer: PointerEvent): Point => { const rect = svg.getBoundingClientRect(); return { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top }; };
  const marqueeRect = (pointer: PointerEvent): ScreenRect => {
    const origin = relative({ clientX: (pan as NonNullable<typeof pan>).x, clientY: (pan as NonNullable<typeof pan>).y } as PointerEvent);
    const now = relative(pointer);
    return { left: Math.min(origin.x, now.x), top: Math.min(origin.y, now.y), right: Math.max(origin.x, now.x), bottom: Math.max(origin.y, now.y) };
  };
  const paintMarquee = (rect: ScreenRect | null): void => {
    if (!rect) { marquee.setAttribute("visibility", "hidden"); return; }
    marquee.setAttribute("x", String(rect.left)); marquee.setAttribute("y", String(rect.top));
    marquee.setAttribute("width", String(rect.right - rect.left)); marquee.setAttribute("height", String(rect.bottom - rect.top));
    marquee.setAttribute("visibility", "visible");
  };

  function bindNode(group: SVGGElement, hostname: string): void {
    let start: { x: number; y: number; origins: Map<string, Point>; moved: boolean; additive: boolean } | null = null;
    const end = (): void => { start = null; dragging = false; };
    group.addEventListener("pointerdown", (event) => {
      const pointer = event as PointerEvent;
      if (pointer.button > 0) return; // clic droit ou central : ni glissé ni sélection
      event.stopPropagation();
      dragging = true;
      host.tipHide();
      // Chaque équipement entraîné part de sa propre place : l'écart du pointeur s'applique à tous, le bloc garde sa forme.
      const origins = new Map(host.companions(hostname).map((member): [string, Point] => [member, { ...host.at(member) }]));
      start = { x: pointer.clientX, y: pointer.clientY, origins, moved: false, additive: additive(pointer) };
      group.setPointerCapture(pointer.pointerId);
    });
    group.addEventListener("pointermove", (event) => {
      if (!start) return;
      const pointer = event as PointerEvent;
      const dx = pointer.clientX - start.x, dy = pointer.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      start.moved = true;
      const k = host.view().k;
      start.origins.forEach((origin, member) => host.moveTo(member, { x: origin.x + dx / k, y: origin.y + dy / k }));
    });
    // Au relâchement : un appui sans mouvement sélectionne (Maj : ajoute ou retire de la sélection multiple) ; un
    // glissé épingle, et la page décide d'enregistrer ou non.
    group.addEventListener("pointerup", () => {
      if (start && !start.moved) { if (start.additive) host.toggleHost(hostname); else host.select({ kind: "node", id: hostname }); }
      else if (start && start.moved) host.dropped(Array.from(start.origins.keys()));
      end();
    });
    group.addEventListener("pointercancel", end);
    group.addEventListener("lostpointercapture", end);
  }

  svg.addEventListener("pointerdown", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button > 0) return;
    host.tipHide();
    const view = host.view();
    pan = { x: pointer.clientX, y: pointer.clientY, tx: view.tx, ty: view.ty, moved: false, target: event.target, marquee: additive(pointer) };
    svg.setPointerCapture(pointer.pointerId); // la capture détourne l'événement click : on ne s'appuie pas dessus
  });
  svg.addEventListener("pointermove", (event) => {
    if (!pan) return;
    const pointer = event as PointerEvent;
    const dx = pointer.clientX - pan.x, dy = pointer.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    pan.moved = true;
    if (pan.marquee) { paintMarquee(marqueeRect(pointer)); return; }
    host.setView({ k: host.view().k, tx: pan.tx + dx, ty: pan.ty + dy });
  });
  svg.addEventListener("pointerup", (event) => {
    if (pan && !pan.moved) host.select(host.entityAt(pan.target));
    else if (pan && pan.marquee) { host.selectIn(marqueeRect(event as PointerEvent)); paintMarquee(null); }
    pan = null;
  });
  const cancel = (): void => { pan = null; paintMarquee(null); }; // un appui annulé ne laisse pas la vue suivre la souris (revue, H1)
  svg.addEventListener("pointercancel", cancel);
  svg.addEventListener("lostpointercapture", cancel);
  // Le survol : la bulle suit le pointeur tant qu'il reste sur le même élément ; un glissé (vue ou équipement) la cache.
  svg.addEventListener("pointermove", (event) => {
    if (pan || dragging) { host.tipHide(); return; }
    const entity = host.entityAt(event.target);
    if (!entity) { host.tipHide(); return; }
    const point = relative(event as PointerEvent);
    host.tipShowAt(entity, point.x, point.y);
  });
  svg.addEventListener("pointerleave", () => host.tipHide());
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const wheel = event as WheelEvent;
    const point = relative(wheel as unknown as PointerEvent);
    const view = host.view();
    const k = Math.min(Math.max(view.k * Math.exp(-wheel.deltaY * 0.0015), 0.05), 6);
    host.setView({ k, tx: point.x - ((point.x - view.tx) / view.k) * k, ty: point.y - ((point.y - view.ty) / view.k) * k });
  }, { passive: false });

  return { bindNode, busy: () => dragging || !!pan };
}

export const pointer = { bind };

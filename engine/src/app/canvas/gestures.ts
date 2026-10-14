// Les gestes de vue de la toile de l'application qui ne passent pas par React Flow tel quel (D1, D2 de docs/11) :
// Ctrl (ou Cmd) + molette zoome du même pas que la molette seule (wheel.ts), et l'appui du bouton du milieu, qui
// déplace la vue (React Flow), n'a plus d'action du navigateur ; Espace tenu, la toile le sait (`useSpaceHeld`).
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { wheelZoom, zoomAround } from "./wheel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useViewGestures(container: RefObject<HTMLDivElement | null>, rf: ReactFlowInstance<any, any>, MIN_ZOOM: number, MAX_ZOOM: number): void {
  // D2, révisée par Orhan le 2026-10-14 : la molette zoome (React Flow, autour du pointeur). Avec Ctrl (ou Cmd), React
  // Flow prendrait le cran pour un pincement de pavé tactile (×4 par cran) : pris à la capture, il zoome du pas de la
  // molette seule ; un vrai pincement (petits pas) garde le sien (wheel.ts).
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target as Element | null;
      if (target && typeof target.closest === "function" && target.closest(".nowheel")) return;
      event.preventDefault();
      event.stopPropagation();
      const view = rf.getViewport(), k = wheelZoom(view.zoom, event.deltaY, event.deltaMode, MIN_ZOOM, MAX_ZOOM);
      if (k === view.zoom) return;
      const box = el.getBoundingClientRect();
      void rf.setViewport(zoomAround(view, k, event.clientX - box.left, event.clientY - box.top));
    };
    // Le bouton du milieu déplace la vue (D1) : React Flow le prend (d3-zoom, `panOnDrag` [1]) mais n'annule pas l'action
    // du navigateur, qui lançait son défilement automatique (Windows, Firefox) ou, sous Linux, collait la sélection
    // primaire au relâchement. Sur `mousedown` seulement (annuler le `pointerdown` couperait les événements souris que
    // d3-zoom écoute), sans arrêter la propagation ; `auxclick` de même.
    const onMiddle = (event: MouseEvent): void => { if (event.button === 1) event.preventDefault(); };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    el.addEventListener("mousedown", onMiddle, { capture: true });
    el.addEventListener("auxclick", onMiddle, { capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("mousedown", onMiddle, { capture: true });
      el.removeEventListener("auxclick", onMiddle, { capture: true });
    };
  }, [container, rf, MIN_ZOOM, MAX_ZOOM]);
}

/** Espace tenu hors d'un champ (D1 révisée) : la page pose `space-pan` sur la toile, ses éléments laissent passer les
 *  appuis jusqu'au fond (canvas.css) et rien ne se glisse ; React Flow déplace alors la vue (`panActivationKeyCode`). */
export function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      return !!el && !!el.tagName && (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName) || el.isContentEditable);
    };
    const down = (event: KeyboardEvent): void => { if (event.key === " " && !typing(event.target)) setHeld(true); };
    const up = (event: KeyboardEvent): void => { if (event.key === " ") setHeld(false); };
    const lost = (): void => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", lost);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", lost); };
  }, []);
  return held;
}

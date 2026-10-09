// Le panneau : la fiche de ce qui est sélectionné, qui glisse depuis la droite ; rien quand rien n'est sélectionné
// (le diagramme est la page). Une chose à lire à la fois. Son bord gauche se glisse pour l'élargir (une préférence du
// navigateur, comme le thème) : les ports, les câbles et les contrôles se lisent alors en entier.
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { aggregateOf, beamOf, clusterOf, groupOf, linkOf, nodeOf } from "../../canvas/model";
import { PANEL_WIDTH, clampPanelWidth } from "../state/prefs";
import { useModel, useStore } from "../state/store";
import { Button } from "../ui";
import { AnnotationCard } from "./cards/AnnotationCard";
import { ConnectorCard } from "./cards/ConnectorCard";
import { GroupCard } from "./cards/GroupCard";
import { LinkCard } from "./cards/LinkCard";
import { MultiCard } from "./cards/MultiCard";
import { NodeCard } from "./cards/NodeCard";
import { AggregateCard, BeamCard, ClusterCard } from "./cards/StructureCards";

// la largeur vit dans une variable de la racine (CSSOM, que la CSP admet) : la feuille de style la lit, rien en ligne
const setWidthVar = (width: number): void => { document.documentElement.style.setProperty("--panel-w", width + "px"); };
// la toile garde au moins cette largeur à gauche du panneau
const CANVAS_MIN = 360;
const fitWindow = (width: number): number => Math.max(PANEL_WIDTH.min, Math.min(clampPanelWidth(width), window.innerWidth - CANVAS_MIN));

/** La poignée du bord gauche : glisser élargit ou rétrécit, ← → au clavier (Maj : par 64), double-clic ou Origine
 *  rendent la largeur de départ. Une seule écriture de préférence, à la relâche. */
function Resizer() {
  const { state, commands } = useStore();
  const width = state.prefs.panelWidth;
  const drag = useRef<{ x: number; width: number; now: number } | null>(null);
  useEffect(() => { setWidthVar(fitWindow(width)); }, [width]);
  const save = (next: number): void => { const fitted = fitWindow(next); setWidthVar(fitted); if (fitted !== width) commands.setPrefs({ panelWidth: fitted }); };
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: fitWindow(width), now: fitWindow(width) };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const at = drag.current;
    if (!at) return;
    at.now = fitWindow(at.width + at.x - event.clientX);
    setWidthVar(at.now);
  };
  const up = (): void => { const at = drag.current; drag.current = null; if (at) save(at.now); };
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16;
    const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step : event.key === "Home" ? PANEL_WIDTH.base : null;
    if (next === null) return;
    event.preventDefault();
    save(next);
  };
  return (
    <div className="panel-resize" role="separator" aria-orientation="vertical" aria-label="largeur du panneau" title="glisser pour élargir · double-clic : largeur de départ"
      aria-valuemin={PANEL_WIDTH.min} aria-valuemax={PANEL_WIDTH.max} aria-valuenow={fitWindow(width)} tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={() => save(PANEL_WIDTH.base)} onKeyDown={keys} />
  );
}

export function Panel() {
  const { state, commands } = useStore();
  const model = useModel();
  if (!model) return null;
  const { selection, hosts } = state;
  let card = null;
  if (hosts.length >= 2) card = <MultiCard model={model} hosts={hosts} />;
  else if (selection) {
    const node = nodeOf(model, selection), link = linkOf(model, selection), beam = beamOf(model, selection), cluster = clusterOf(model, selection), aggregate = aggregateOf(model, selection);
    const group = groupOf(model, selection);
    const annotation = selection.kind === "annotation" ? model.annotationById.get(selection.id) : undefined;
    const connector = selection.kind === "connector" ? model.connectorById.get(selection.id) : undefined;
    if (node) card = <NodeCard model={model} node={node} />;
    else if (annotation) card = <AnnotationCard model={model} a={annotation} />;
    else if (connector) card = <ConnectorCard model={model} c={connector} />;
    else if (group) card = <GroupCard model={model} group={group} />;
    else if (link) card = <LinkCard model={model} link={link} />;
    else if (beam) card = <BeamCard model={model} beam={beam} />;
    else if (cluster) card = <ClusterCard model={model} cluster={cluster} />;
    else if (aggregate) card = <AggregateCard model={model} aggregate={aggregate} />;
  }
  if (!card) return null;
  const key = hosts.length >= 2 ? "multi" : selection ? selection.kind + ":" + selection.id : "";
  return (
    <aside className="panel glass" key={key} aria-label="fiche de l'élément sélectionné">
      <Resizer />
      <Button variant="ghost" icon className="panel-close" aria-label="fermer la fiche" onClick={commands.clearSelection}><X /></Button>
      <div className="panel-scroll">{card}</div>
    </aside>
  );
}

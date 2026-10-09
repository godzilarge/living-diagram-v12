// Le panneau Affichage (Orhan, 2026-10-07 : « une sorte de palette qui me permet d'afficher ou non des éléments, et qui
// sera peut-être enrichie par la suite ») : les couches de la toile, chacune une bascule. Elles sont l'état de vue, donc
// dans l'adresse (une vue se partage par un lien). Une couche de plus = une ligne de `LAYERS`. « Changements » reste
// dans la barre, à côté des comptes du diff qu'il accompagne.
import { CircleDashed, Gauge, Network, Pin, SlidersHorizontal, StickyNote, Tag, Unplug } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import type { Model } from "../../canvas/types";
import { useModel, useStore } from "../state/store";
import type { ViewState } from "../state/types";
import { Dialog, Toggle } from "../ui";

type LayerKey = "showBeams" | "showSpeeds" | "showPorts" | "showOper" | "showStubs" | "showPins" | "showNotes";
interface Layer { key: LayerKey; label: string; sample: (model: Model) => string; icon: ComponentType<SVGProps<SVGSVGElement>> }

/** Les couches, par section, dans l'ordre du panneau. */
export const LAYERS: { title: string; layers: Layer[] }[] = [
  { title: "sur les câbles", layers: [
    { key: "showBeams", label: "port-channels et vPC", sample: (m) => String(m.beams.length), icon: Network },
    { key: "showSpeeds", label: "vitesses", sample: () => "10G", icon: Gauge },
    { key: "showPorts", label: "noms des ports", sample: () => "Eth1/1", icon: Tag },
    // ce que les équipements disent de leurs ports (`oper_status`), pas un verdict : visible dans les deux vues (2026-10-09)
    { key: "showOper", label: "câbles down", sample: (m) => String(m.links.filter((l) => l.raw.oper === "down").length), icon: Unplug },
  ] },
  { title: "équipements", layers: [
    { key: "showStubs", label: "voisins inconnus", sample: (m) => String(m.kindCounts.get("stub") || 0), icon: CircleDashed },
    { key: "showPins", label: "épingles", sample: (m) => String(m.pinByHost.size), icon: Pin },
  ] },
  { title: "contexte", layers: [
    { key: "showNotes", label: "annotations", sample: (m) => String(m.annotationById.size), icon: StickyNote },
  ] },
];

// Combien de couches s'écartent de leur défaut : le bouton le dit, pour qu'une vue chargée ne surprenne pas.
const changed = (view: ViewState): number => LAYERS.flatMap((s) => s.layers).filter((l) => view[l.key] !== (l.key === "showPins" || l.key === "showNotes")).length;

function Panel({ onClose }: { onClose: () => void }) {
  const { state, commands } = useStore();
  const model = useModel();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { // un clic hors du panneau (et hors de son bouton) le ferme
    const down = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target || (ref.current && ref.current.contains(target)) || (target.closest && target.closest(".display-toggle"))) return;
      onClose();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [onClose]);
  if (!model) return null;
  return (
    <Dialog label="affichage de la toile" className="display glass" modal={false} onClose={onClose}>
      <div ref={ref} className="display-body">
        {LAYERS.map((section) => (
          <section key={section.title} className="display-section">
            <h2 className="display-title">{section.title}</h2>
            {section.layers.map(({ key, label, sample, icon: Icon }) => {
              const on = state.view[key];
              return (
                <button key={key} type="button" role="switch" aria-checked={on ? "true" : "false"} className="layer" onClick={() => commands.setView({ [key]: !on } as Partial<ViewState>)}>
                  <Icon className="layer-icon" aria-hidden="true" />
                  <span className="layer-label">{label}</span>
                  <span className="pill tone-neutral layer-sample" aria-hidden="true">{sample(model)}</span>
                  <span className="switch" aria-hidden="true"><span className="knob" /></span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function Display() {
  const { state } = useStore();
  const model = useModel();
  const [open, setOpen] = useState(false);
  if (!model) return null;
  const n = changed(state.view);
  return (
    <span className="display-anchor">
      <Toggle className="toggle display-toggle" pressed={open} onClick={() => setOpen((was) => !was)} aria-haspopup="dialog" title="couches de la toile : port-channels, vitesses, ports, voisins, épingles, annotations">
        <SlidersHorizontal /><span className="word">affichage</span>{n ? <span className="pill tone-accent display-count" aria-label={n + " couches modifiées"}>{n}</span> : null}
      </Toggle>
      {open ? <Panel onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

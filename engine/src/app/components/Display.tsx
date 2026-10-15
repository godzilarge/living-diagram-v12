// Le panneau Affichage (Orhan, 2026-10-07 : « une sorte de palette qui me permet d'afficher ou non des éléments, et qui
// sera peut-être enrichie par la suite ») : les couches de la toile, chacune une bascule. Elles sont l'état de vue, donc
// dans l'adresse (une vue se partage par un lien). Une couche de plus = une ligne de `LAYERS`. « Changements » reste
// dans la barre, à côté des comptes du diff qu'il accompagne. La barre contextuelle (lot 4 de docs/11) s'y affiche ou
// s'y masque aussi, mais c'est une préférence du navigateur (prefs.ts), jamais dans l'adresse ; Ctrl+. fait de même.
// La couleur des repères d'alignement (lot 8) aussi : une rangée de pastilles, le chartreuse et les teintes nommées qui
// tiennent un contraste de 3:1 sur la toile dans les deux thèmes (`GUIDE_HUES`), et « défaut ».
import { CircleDashed, Gauge, Network, PanelTop, Pin, RotateCcw, RulerDimensionLine, SlidersHorizontal, StickyNote, Tag, Unplug } from "lucide-react";
import { HUE_LABEL } from "../../canvas/hues";
import type { HueName } from "../../canvas/hues";
import { GUIDE_HUES } from "../canvas/guides";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Model } from "../../canvas/types";
import { useModel, useStore } from "../state/store";
import type { ViewState } from "../state/types";
import { Dialog, Toggle } from "../ui";

type LayerKey = "showBeams" | "showSpeeds" | "showPorts" | "showOper" | "showStubs" | "showPins" | "showNotes";
interface Layer { key: LayerKey; sample: (model: Model) => string; icon: ComponentType<SVGProps<SVGSVGElement>> }

/** Les couches, par section, dans l'ordre du panneau ; le libellé d'une couche est la clé `display.<key>`. */
export const LAYERS: { title: "cables" | "devices" | "context"; layers: Layer[] }[] = [
  { title: "cables", layers: [
    { key: "showBeams", sample: (m) => String(m.beams.length), icon: Network },
    { key: "showSpeeds", sample: () => "10G", icon: Gauge },
    { key: "showPorts", sample: () => "Eth1/1", icon: Tag },
    // ce que les équipements disent de leurs ports (`oper_status`), pas un verdict : visible dans les deux vues (2026-10-09)
    { key: "showOper", sample: (m) => String(m.links.filter((l) => l.raw.oper === "down").length), icon: Unplug },
  ] },
  { title: "devices", layers: [
    { key: "showStubs", sample: (m) => String(m.kindCounts.get("stub") || 0), icon: CircleDashed },
    { key: "showPins", sample: (m) => String(m.pinByHost.size), icon: Pin },
  ] },
  { title: "context", layers: [
    { key: "showNotes", sample: (m) => String(m.annotationById.size), icon: StickyNote },
  ] },
];

// Combien de couches s'écartent de leur défaut : le bouton le dit, pour qu'une vue chargée ne surprenne pas.
const changed = (view: ViewState): number => LAYERS.flatMap((s) => s.layers).filter((l) => view[l.key] !== (l.key === "showPins" || l.key === "showNotes")).length;

function Panel({ onClose }: { onClose: () => void }) {
  const { state, commands } = useStore();
  const model = useModel();
  const { t } = useTranslation();
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
    <Dialog label={t("display.label")} className="display glass" modal={false} onClose={onClose}>
      <div ref={ref} className="display-body">
        {LAYERS.map((section) => (
          <section key={section.title} className="display-section">
            <h2 className="display-title">{t(`display.${section.title}`)}</h2>
            {section.layers.map(({ key, sample, icon: Icon }) => {
              const on = state.view[key];
              return (
                <button key={key} type="button" role="switch" aria-checked={on ? "true" : "false"} className="layer" onClick={() => commands.setView({ [key]: !on } as Partial<ViewState>)}>
                  <Icon className="layer-icon" aria-hidden="true" />
                  <span className="layer-label">{t(`display.${key}`)}</span>
                  <span className="pill tone-neutral layer-sample" aria-hidden="true">{sample(model)}</span>
                  <span className="switch" aria-hidden="true"><span className="knob" /></span>
                </button>
              );
            })}
          </section>
        ))}
        <section className="display-section">
          <h2 className="display-title">{t("display.editing")}</h2>
          <button type="button" role="switch" aria-checked={state.prefs.fbar ? "true" : "false"} aria-keyshortcuts="Control+." className="layer" onClick={() => commands.setPrefs({ fbar: !state.prefs.fbar })}>
            <PanelTop className="layer-icon" aria-hidden="true" />
            <span className="layer-label">{t("display.showFbar")}</span>
            <kbd className="kbd layer-sample" aria-hidden="true">Ctrl+.</kbd>
            <span className="switch" aria-hidden="true"><span className="knob" /></span>
          </button>
          <GuideColors />
        </section>
      </div>
    </Dialog>
  );
}

/** La couleur des repères d'alignement : une préférence du navigateur, jamais une intention (propre à chacun). */
function GuideColors() {
  const { state, commands } = useStore();
  const { t } = useTranslation();
  const chosen = state.prefs.guideHue;
  const pick = (hue: HueName | null): void => commands.setPrefs({ guideHue: hue });
  const swatch = (hue: HueName | null, label: string) => (
    // une cible de 24 × 24 (WCAG 2.5.8), la pastille de 16 dessinée dedans (audit du 2026-10-15)
    <button key={hue || "default"} type="button" role="radio" aria-checked={chosen === hue ? "true" : "false"} aria-label={label} title={label}
      className={"guide-swatch " + (hue ? "guide-" + hue : "guide-default")} onClick={() => pick(hue)}><span className="guide-dot" aria-hidden="true" /></button>
  );
  return (
    <div className="guide-colors">
      <div className="guide-colors-head">
        <RulerDimensionLine className="layer-icon" aria-hidden="true" />
        <span className="layer-label" id="guide-colors-label">{t("display.guideColor")}</span>
        {/* un verbe dans un bouton fantôme, pas un mot gris qui se lisait comme l'état (critique du 2026-10-15) */}
        <button type="button" className="pbtn ghost guide-reset" disabled={!chosen} title={t("display.guideDefaultTitle")} onClick={() => pick(null)}><RotateCcw aria-hidden="true" />{t("display.guideDefault")}</button>
      </div>
      <div className="guide-swatches" role="radiogroup" aria-labelledby="guide-colors-label">
        {swatch(null, t("display.chartreuse"))}
        {GUIDE_HUES.map((hue) => swatch(hue, HUE_LABEL[hue]))}
      </div>
    </div>
  );
}

export function Display() {
  const { state } = useStore();
  const model = useModel();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!model) return null;
  const n = changed(state.view);
  return (
    <span className="display-anchor">
      <Toggle className="toggle display-toggle" pressed={open} onClick={() => setOpen((was) => !was)} aria-haspopup="dialog" title={t("display.title")}>
        <SlidersHorizontal /><span className="word">{t("display.button")}</span>{n ? <span className="pill tone-accent display-count" aria-label={t("display.changed", { count: n })}>{n}</span> : null}
      </Toggle>
      {open ? <Panel onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

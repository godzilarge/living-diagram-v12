// L'avertissement des valeurs sensibles d'un bloc de code (lot 16 de docs/11), à côté du bloc qu'on écrit, jamais
// dessus : la famille des volets (fond, bordure, ombre, coins) et un filet d'avertissement. Chaque valeur avec sa ligne,
// sa sorte et sa nature (un hash ne se lit pas, un type 7 se déchiffre en une seconde), la ligne montrée avec la valeur
// en points (on ne la revoit jamais en clair) ; un clic mène à la valeur dans le texte. Trois issues : « Retirer ces
// valeurs » (remplacées par `<removed>`), « Garder tel quel » (une alerte reste sur le bloc et dans la fiche),
// « Modifier le texte ». Échap revient au texte. Garde sa taille d'écran (`--unzoom`) ; se pose à gauche du bloc quand
// la droite manque.
import { Eraser, ShieldAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { maskedPreview } from "../code/secrets";
import type { Secret } from "../code/secrets";
import { MASK } from "../code/tokens";

/** La largeur de l'avertissement à l'écran (`.code-warn-panel`, à taille d'écran constante). */
const WARN_W = 448;

export interface WarnProps {
  text: string; found: Secret[]; infrastructure: string; width: number;
  onGo: (f: Secret) => void; onRemove: () => void; onKeep: () => void; onEdit: () => void; onClose: () => void;
}

export function CodeWarn({ text, found, infrastructure, width, onGo, onRemove, onKeep, onEdit, onClose }: WarnProps) {
  const { t } = useTranslation("panel");
  const panel = useRef<HTMLDivElement>(null), first = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState(false);
  const lines = text.split("\n"), n = found.length;
  useLayoutEffect(() => { if (panel.current) panel.current.style.setProperty("--cw-x", width + 12 + "px"); }, [width]);
  // Le côté se décide sur la place du bloc à l'écran, une fois tout posé (le brouillon pose sa place après ses enfants) :
  // à droite si l'avertissement y tient avant le panneau, sinon à gauche s'il y tient, sinon à droite quand même.
  useEffect(() => {
    const el = panel.current, block = el ? el.parentElement : null;
    if (!el || !block) return;
    const b = block.getBoundingClientRect(), sheet = document.querySelector(".panel"), band = document.querySelector(".band");
    const limit = (sheet ? sheet.getBoundingClientRect().left : window.innerWidth) - 16;
    setLeft(b.right + 12 + WARN_W > limit && b.left - 12 - WARN_W > 0);
    // aligné sur le haut du bloc, remonté s'il passerait sous la bande des runs (jamais au-dessus de la barre du haut)
    const zoom = width ? b.width / width : 1, h = el.getBoundingClientRect().height;
    const bottom = (band ? band.getBoundingClientRect().top : window.innerHeight) - 12;
    const lift = Math.min(0, Math.max(56 - b.top, bottom - h - b.top));
    el.style.setProperty("--cw-y", lift / zoom + "px");
    if (first.current) first.current.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={panel} className={"code-warn-panel nodrag nopan nowheel" + (left ? " left" : "")} role="alertdialog" aria-labelledby="code-warn-title" aria-describedby="code-warn-why"
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
      <div className="code-warn-head" id="code-warn-title"><ShieldAlert aria-hidden="true" /><span>{t("code.warnTitle", { count: n })}</span></div>
      <p className="code-warn-why" id="code-warn-why">{t("code.warnWhy", { infrastructure })}</p>
      <div className="code-warn-list" role="list">
        {found.map((f) => {
          const kind = t(("code.secretKind." + f.kind) as never), nature = t(("code.secretNature." + f.nature) as never);
          return (
            <button key={f.line + ":" + f.start} type="button" role="listitem" className="code-warn-row" onClick={() => onGo(f)}
              aria-label={t("code.warnGo", { line: f.line + 1, kind, nature })}>
              <span className="code-warn-ln">{t("code.warnLine", { line: f.line + 1 })}</span>
              <span className="code-warn-kind">{kind}<span className={"code-warn-nature" + (f.nature === "hash" ? " hash" : "")}>{nature}</span></span>
              <span className="code-warn-line">{maskedPreview(lines[f.line] || "", f)}</span>
            </button>
          );
        })}
      </div>
      <p className="code-warn-note">{t("code.warnNote", { mask: MASK })}</p>
      <div className="code-warn-actions">
        <button ref={first} type="button" className="pbtn primary" onClick={onRemove}><Eraser aria-hidden="true" />{t("code.removeValues", { count: n })}</button>
        <button type="button" className="pbtn" onClick={onKeep}>{t("code.keep")}</button>
        <span className="spacer" />
        <button type="button" className="pbtn ghost" onClick={onEdit}>{t("code.editText")}</button>
      </div>
    </div>
  );
}

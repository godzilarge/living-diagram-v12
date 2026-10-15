// L'avertissement des valeurs sensibles d'un bloc de code (lot 16 de docs/11), à côté du bloc qu'on écrit, jamais
// dessus quand la place le permet : la famille des volets (fond, bordure, ombre, coins) et un filet d'avertissement.
// Chaque valeur avec sa ligne, sa sorte et sa nature (un hash ne se lit pas, un type 7 se déchiffre en une seconde), la
// ligne montrée avec la valeur en points (on ne la revoit jamais en clair) ; un clic mène à la valeur dans le texte.
// Trois issues : « Retirer ces valeurs » (remplacées par `<removed>`), « Garder tel quel » (une alerte reste sur le bloc
// et dans la fiche), « Modifier le texte ». Échap revient au texte. Garde sa taille d'écran (`--unzoom`).
//
// Audit du 2026-10-15 : sa place vient de `placeWarn` (à droite, à gauche, dessous, dessus, sinon sur le bloc), dans la
// zone visible, jamais sous la fiche ; c'est un dialogue modal (`aria-modal`) : le focus y entre à l'ouverture (sur
// « Retirer », le choix le plus sûr) et Tab / Maj+Tab y tournent sans en sortir ; la liste des valeurs est une vraie
// liste de boutons (`ul` / `li`).
import { Eraser, ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { placeWarn } from "../code/geometry";
import { maskedPreview } from "../code/secrets";
import type { Secret } from "../code/secrets";
import { MASK } from "../code/tokens";
import { CHROME } from "./chrome";

/** La largeur de l'avertissement à l'écran (`.code-warn-panel`, à taille d'écran constante), son écart au bloc. */
const WARN_W = 448, WARN_GAP = 12, EDGE = 12;

export interface WarnProps {
  text: string; found: Secret[]; infrastructure: string; width: number;
  onGo: (f: Secret) => void; onRemove: () => void; onKeep: () => void; onEdit: () => void; onClose: () => void;
}

/** La zone où l'avertissement peut se poser (pixels d'écran) : sous la barre du haut, au-dessus de la bande des runs, à
 *  gauche de la fiche ouverte. */
function zoneOfPage(): { left: number; top: number; right: number; bottom: number } {
  const sheet = document.querySelector(".panel"), band = document.querySelector(".band");
  return {
    left: EDGE, top: CHROME.top,
    right: (sheet ? sheet.getBoundingClientRect().left : window.innerWidth) - 16,
    bottom: (band ? band.getBoundingClientRect().top : window.innerHeight) - EDGE,
  };
}

export function CodeWarn({ text, found, infrastructure, width, onGo, onRemove, onKeep, onEdit, onClose }: WarnProps) {
  const { t } = useTranslation("panel");
  const panel = useRef<HTMLDivElement>(null), first = useRef<HTMLButtonElement>(null);
  const lines = text.split("\n"), n = found.length;
  // La place se décide sur celle du bloc à l'écran, une fois tout posé (le brouillon pose sa place après ses enfants),
  // puis se rapporte aux unités du bloc (l'avertissement en est un enfant, mis à l'échelle de l'écran par --unzoom).
  useEffect(() => {
    const el = panel.current, block = el ? el.parentElement : null;
    if (!el || !block) return;
    const b = block.getBoundingClientRect(), zoom = width && b.width ? b.width / width : 1;
    const at = placeWarn({ x: b.left, y: b.top, w: b.width, h: b.height }, WARN_W, el.getBoundingClientRect().height, zoneOfPage(), WARN_GAP);
    el.style.setProperty("--cw-x", (at.x - b.left) / zoom + "px");
    el.style.setProperty("--cw-y", (at.y - b.top) / zoom + "px");
    el.dataset.side = at.side;
    if (first.current) first.current.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Tab et Maj+Tab tournent dans l'avertissement ; Échap revient au texte.
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !panel.current) return;
    const all = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    if (!all.length) return;
    event.preventDefault();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (event.shiftKey ? all.length - 1 : 0) : (at + (event.shiftKey ? all.length - 1 : 1)) % all.length;
    all[next].focus({ preventScroll: true });
  };
  return (
    <div ref={panel} className="code-warn-panel nodrag nopan nowheel" role="alertdialog" aria-modal="true" aria-labelledby="code-warn-title" aria-describedby="code-warn-why" onKeyDown={keys}>
      <div className="code-warn-head" id="code-warn-title"><ShieldAlert aria-hidden="true" /><span>{t("code.warnTitle", { count: n })}</span></div>
      <p className="code-warn-why" id="code-warn-why">{t("code.warnWhy", { infrastructure })}</p>
      <ul className="code-warn-list">
        {found.map((f) => {
          const kind = t(("code.secretKind." + f.kind) as never), nature = t(("code.secretNature." + f.nature) as never);
          return (
            <li key={f.line + ":" + f.start}>
              <button type="button" className="code-warn-row" onClick={() => onGo(f)} aria-label={t("code.warnGo", { line: f.line + 1, kind, nature })}>
                <span className="code-warn-ln">{t("code.warnLine", { line: f.line + 1 })}</span>
                <span className="code-warn-kind">{kind}<span className={"code-warn-nature" + (f.nature === "hash" ? " hash" : "")}>{nature}</span></span>
                <span className="code-warn-line">{maskedPreview(lines[f.line] || "", f)}</span>
              </button>
            </li>
          );
        })}
      </ul>
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

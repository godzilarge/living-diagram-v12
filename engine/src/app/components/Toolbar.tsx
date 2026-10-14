// La barre d'outils de la toile, en haut au centre (Orhan, 2026-10-07 : « une petite palette discrète mais assez
// visible de commandes ») : ce qu'on fait sur la toile. Au repos, quatre icônes : annuler, rétablir, cadrer tout,
// centrer sur la sélection. Avec deux équipements sélectionnés ou plus, les alignements apparaissent (répartir à
// partir de trois), puis le compte de la sélection et de quoi la vider ; ils disparaissent avec elle, jamais grisés.
// Les préférences d'affichage restent en bas à gauche (Controls) : ici on agit, là-bas on règle ce qu'on voit.
// L'outil connecteur est un bouton à bascule (lot 1 de docs/11, touche C) : armé, on tire des connecteurs sur la toile.
import { AlignHorizontalJustifyCenter, AlignHorizontalSpaceAround, AlignVerticalJustifyCenter, AlignVerticalSpaceAround, Circle, Crosshair, Image, Maximize, MoveUpRight, Redo2, Square, StickyNote, Table, Undo2, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ALIGN_LABEL } from "../../canvas/align";
import type { AlignMode } from "../../canvas/align";
import { labelText } from "../state/history";
import { useControl, useEditable, useStore } from "../state/store";
import type { ReactNode } from "react";
import { Button } from "../ui";

const ALIGN_ICON: Record<AlignMode, typeof Crosshair> = {
  horizontal: AlignHorizontalJustifyCenter, vertical: AlignVerticalJustifyCenter,
  "distribute-horizontal": AlignHorizontalSpaceAround, "distribute-vertical": AlignVerticalSpaceAround,
};

/** Le bloc Insérer (docs/10 §6) : chaque outil pose une annotation au centre de la vue et ouvre sa fiche ; le
 *  connecteur, lui, arme un outil (on le tire sur la toile). */
const INSERTS = [
  { key: "note", label: "toolbar.insertNote", icon: StickyNote },
  { key: "rectangle", label: "toolbar.insertRectangle", icon: Square },
  { key: "ellipse", label: "toolbar.insertEllipse", icon: Circle },
  { key: "table", label: "toolbar.insertTable", icon: Table },
] as const;

function Tool({ label, keys, disabled, pressed, onClick, children }: { label: string; keys?: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return <Button variant="ghost" icon disabled={disabled} onClick={onClick} aria-label={label} aria-pressed={pressed === undefined ? undefined : pressed} aria-keyshortcuts={keys && keys.length === 1 ? keys : undefined}
    title={keys ? t("toolbar.keys", { label, keys }) : label}>{children}</Button>;
}

export function Toolbar() {
  const { state, commands, handle } = useStore();
  const { t } = useTranslation();
  const { undo, redo } = state.history;
  const editable = useEditable();
  const control = useControl(); // la vue Contrôle se lit : ni annuler, ni insérer, ni aligner (2026-10-09)
  const file = useRef<HTMLInputElement>(null);
  const count = state.hosts.length;
  const selected = !!state.selection || count > 0;
  const modes: AlignMode[] = control ? [] : count >= 3 ? ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"] : count === 2 ? ["horizontal", "vertical"] : [];
  return (
    <div className="toolbar glass" role="toolbar" aria-label={t("toolbar.label")}>
      {control ? null : <>
        <Tool label={undo ? t("toolbar.undo", { what: labelText(undo) }) : t("toolbar.undoNone")} keys={undo ? "Ctrl+Z" : undefined} disabled={!undo} onClick={commands.undo}><Undo2 /></Tool>
        <Tool label={redo ? t("toolbar.redo", { what: labelText(redo) }) : t("toolbar.redoNone")} keys={redo ? "Ctrl+Y" : undefined} disabled={!redo} onClick={commands.redo}><Redo2 /></Tool>
        <span className="toolbar-sep" aria-hidden="true" />
      </>}
      <Tool label={t("toolbar.fit")} onClick={commands.fit}><Maximize /></Tool>
      <Tool label={selected ? t("toolbar.center") : t("toolbar.centerNone")} disabled={!selected} onClick={commands.center}><Crosshair /></Tool>
      {editable ? (
        <div className="toolbar-group" role="group" aria-label={t("toolbar.insertGroup")}>
          <span className="toolbar-sep" aria-hidden="true" />
          {INSERTS.map(({ key, label, icon: Icon }) => <Tool key={key} label={t(label)} onClick={() => { const g = handle ? handle.toile.viewCenter() : { x: 0, y: 0 }; commands.insertAt(key, { x: g.x - 100, y: g.y - 40 }); }}><Icon /></Tool>)}
          <Tool label={t("toolbar.connectorTool")} keys="C" pressed={state.tool === "connector"} onClick={() => commands.toggleTool("connector")}><MoveUpRight /></Tool>
          <Tool label={t("toolbar.insertImage")} onClick={() => { if (file.current) file.current.click(); }}><Image /></Tool>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("toolbar.imageFile")} tabIndex={-1}
            onChange={(event) => { const chosen = event.target.files && event.target.files[0]; if (chosen) commands.annotationImage(chosen); event.target.value = ""; }} />
        </div>
      ) : null}
      {modes.length || (control && count >= 2) ? (
        <div className="toolbar-group" role="group" aria-label={modes.length ? t("toolbar.alignGroup") : t("toolbar.selectionGroup")}>
          <span className="toolbar-sep" aria-hidden="true" />
          {modes.map((mode) => { const Icon = ALIGN_ICON[mode]; return <Tool key={mode} label={ALIGN_LABEL[mode]} onClick={() => commands.align(mode)}><Icon /></Tool>; })}
          {modes.length ? <span className="toolbar-sep" aria-hidden="true" /> : null}
          <span className="pill tone-accent toolbar-count" title={t("toolbar.selected", { count })}>{count}</span>
          <Tool label={t("toolbar.clear")} keys={t("keys.escape")} onClick={commands.clearSelection}><X /></Tool>
        </div>
      ) : null}
    </div>
  );
}

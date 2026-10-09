// La barre d'outils de la toile, en haut au centre (Orhan, 2026-10-07 : « une petite palette discrète mais assez
// visible de commandes ») : ce qu'on fait sur la toile. Au repos, quatre icônes : annuler, rétablir, cadrer tout,
// centrer sur la sélection. Avec deux équipements sélectionnés ou plus, les alignements apparaissent (répartir à
// partir de trois), puis le compte de la sélection et de quoi la vider ; ils disparaissent avec elle, jamais grisés.
// Les préférences d'affichage restent en bas à gauche (Controls) : ici on agit, là-bas on règle ce qu'on voit.
import { AlignHorizontalJustifyCenter, AlignHorizontalSpaceAround, AlignVerticalJustifyCenter, AlignVerticalSpaceAround, Circle, Crosshair, Image, Maximize, MoveUpRight, Redo2, Square, StickyNote, Table, Undo2, X } from "lucide-react";
import { useRef } from "react";
import { ALIGN_LABEL } from "../../canvas/align";
import type { AlignMode } from "../../canvas/align";
import { useStore } from "../state/store";
import type { ReactNode } from "react";
import { Button } from "../ui";

const ALIGN_ICON: Record<AlignMode, typeof Crosshair> = {
  horizontal: AlignHorizontalJustifyCenter, vertical: AlignVerticalJustifyCenter,
  "distribute-horizontal": AlignHorizontalSpaceAround, "distribute-vertical": AlignVerticalSpaceAround,
};

/** Le bloc Insérer (docs/10 §6) : chaque outil pose une annotation (ou un connecteur) au centre de la vue et ouvre sa fiche. */
const INSERTS: { key: string; label: string; icon: typeof Crosshair }[] = [
  { key: "note", label: "insérer une note", icon: StickyNote },
  { key: "rectangle", label: "insérer un rectangle", icon: Square },
  { key: "ellipse", label: "insérer une ellipse", icon: Circle },
  { key: "connector", label: "insérer un connecteur", icon: MoveUpRight },
  { key: "table", label: "insérer un tableau", icon: Table },
];

function Tool({ label, keys, disabled, onClick, children }: { label: string; keys?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <Button variant="ghost" icon disabled={disabled} onClick={onClick} aria-label={label} title={keys ? label + " (" + keys + ")" : label}>{children}</Button>;
}

export function Toolbar() {
  const { state, commands, handle } = useStore();
  const { undo, redo } = state.history;
  const editable = !!handle && handle.intents.canWrite();
  const file = useRef<HTMLInputElement>(null);
  const count = state.hosts.length;
  const selected = !!state.selection || count > 0;
  const modes: AlignMode[] = count >= 3 ? ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"] : count === 2 ? ["horizontal", "vertical"] : [];
  return (
    <div className="toolbar glass" role="toolbar" aria-label="actions sur la toile">
      <Tool label={undo ? "annuler : " + undo : "rien à annuler"} keys={undo ? "Ctrl+Z" : undefined} disabled={!undo} onClick={commands.undo}><Undo2 /></Tool>
      <Tool label={redo ? "rétablir : " + redo : "rien à rétablir"} keys={redo ? "Ctrl+Y" : undefined} disabled={!redo} onClick={commands.redo}><Redo2 /></Tool>
      <span className="toolbar-sep" aria-hidden="true" />
      <Tool label="cadrer tout" onClick={commands.fit}><Maximize /></Tool>
      <Tool label={selected ? "centrer sur la sélection" : "rien de sélectionné"} disabled={!selected} onClick={commands.center}><Crosshair /></Tool>
      {editable ? (
        <div className="toolbar-group" role="group" aria-label="insérer une annotation">
          <span className="toolbar-sep" aria-hidden="true" />
          {INSERTS.map(({ key, label, icon: Icon }) => <Tool key={key} label={label} onClick={() => { const g = handle ? handle.toile.viewCenter() : { x: 0, y: 0 }; commands.insertAt(key, key === "connector" ? g : { x: g.x - 100, y: g.y - 40 }); }}><Icon /></Tool>)}
          <Tool label="insérer une image" onClick={() => { if (file.current) file.current.click(); }}><Image /></Tool>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="fichier d'image (PNG, JPEG ou WebP, 4 Mo au plus)" tabIndex={-1}
            onChange={(event) => { const chosen = event.target.files && event.target.files[0]; if (chosen) commands.annotationImage(chosen); event.target.value = ""; }} />
        </div>
      ) : null}
      {modes.length ? (
        <div className="toolbar-group" role="group" aria-label="aligner la sélection">
          <span className="toolbar-sep" aria-hidden="true" />
          {modes.map((mode) => { const Icon = ALIGN_ICON[mode]; return <Tool key={mode} label={ALIGN_LABEL[mode]} onClick={() => commands.align(mode)}><Icon /></Tool>; })}
          <span className="toolbar-sep" aria-hidden="true" />
          <span className="pill tone-accent toolbar-count" title={count + " équipements sélectionnés"}>{count}</span>
          <Tool label="vider la sélection" keys="Échap" onClick={commands.clearSelection}><X /></Tool>
        </div>
      ) : null}
    </div>
  );
}

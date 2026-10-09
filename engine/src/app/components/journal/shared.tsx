// Ce que les morceaux de la vue Journal partagent : l'icône d'une catégorie, le texte surligné par la recherche, la
// phrase d'une entrée avec ses objets cités (montrés dans le Diagramme, ou dits « supprimé » quand ils ne sont plus là),
// et le curseur qui glisse sous le choix d'un groupe exclusif (infrastructure, période).
import { CircleQuestionMark, Group, Palette, Pin, Spline, StickyNote } from "lucide-react";
import { Fragment, useLayoutEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { marks } from "../../state/journal-text";
import type { JournalCategory, JournalEntry, Piece, RefKind, Sentence } from "../../state/journal";

export const ICON: Record<JournalCategory, ReactNode> = {
  positions: <Pin aria-hidden="true" />, colors: <Palette aria-hidden="true" />, groups: <Group aria-hidden="true" />,
  annotations: <StickyNote aria-hidden="true" />, connectors: <Spline aria-hidden="true" />, other: <CircleQuestionMark aria-hidden="true" />,
};

/** Un objet cité est-il encore là ? `true` : on peut le montrer ; `false` : il a disparu (de la run, ou supprimé) ;
 *  pour une autre infrastructure que celle qu'on regarde, on ne sait pas : `true`. */
export type Presence = (infrastructure: string, kind: RefKind, id: string) => boolean;
export type Show = (infrastructure: string, kind: RefKind, id: string) => void;

/** Le texte, les mots cherchés surlignés. */
export function Marked({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  return <>{marks(text, words).map((part, i) => (part.hit ? <mark key={i} className="j-hit">{part.text}</mark> : <span key={i}>{part.text}</span>))}</>;
}

/** Un objet cité : un bouton (dans le détail), un texte cliquable à la souris (dans la tête de ligne, déjà un bouton :
 *  au clavier, « o » l'ouvre), ou un texte suivi de « supprimé » quand il n'est plus là. */
export function Ref({ piece, entry, words, presence, show, inline, tag = true }: { piece: Exclude<Piece, string>; entry: JournalEntry; words: string[]; presence: Presence; show: Show; inline: boolean; tag?: boolean }) {
  const className = "j-ref ref-" + piece.ref;
  const title = "montrer dans le diagramme" + (piece.text !== piece.id ? " (" + piece.id + ")" : "");
  if (!presence(entry.infrastructure, piece.ref, piece.id)) {
    const word = piece.ref === "node" ? "absent de la run" : "supprimé";
    return <><span className={className + " gone"}><Marked text={piece.text} words={words} /></span>{tag ? <span className="j-gone"> {word}</span> : <span className="sr-only"> ({word})</span>}</>;
  }
  const open = (event: MouseEvent): void => { event.stopPropagation(); show(entry.infrastructure, piece.ref, piece.id); };
  if (inline) return <span className={className} title={title} onClick={open}><Marked text={piece.text} words={words} /></span>;
  return <button type="button" className={className} title={title} onClick={open}><Marked text={piece.text} words={words} /><span className="sr-only"> : montrer dans le diagramme</span></button>;
}

/** La phrase d'une entrée. Dans la tête d'une ligne (`inline`), l'auteur a sa colonne : le « a » du verbe n'est dit
 *  qu'au lecteur d'écran (« Orhan a placé… »), les champs modifiés (« : position, style ») passent en gris, et un objet
 *  supprimé par la phrase même (« supprimé le groupe Bord ») ne redit pas « supprimé ». */
export function Phrase({ sentence, entry, words, presence, show, inline = false }: { sentence: Sentence; entry: JournalEntry; words: string[]; presence: Presence; show: Show; inline?: boolean }) {
  const lead = sentence.pieces[0];
  const deletes = typeof lead === "string" && lead.startsWith("a supprimé");
  const text = (piece: string, i: number): ReactNode => {
    if (!inline) return <Marked key={i} text={piece} words={words} />;
    if (i === 0 && piece.startsWith("a ")) return <Fragment key={i}><span className="sr-only"> a </span><Marked text={piece.slice(2)} words={words} /></Fragment>;
    if (piece.startsWith(" : ")) return <span key={i} className="j-fields"> : <Marked text={piece.slice(3)} words={words} /></span>;
    return <Marked key={i} text={piece} words={words} />;
  };
  return <>{sentence.pieces.map((piece, i) => (typeof piece === "string" ? text(piece, i)
    : <Ref key={i} piece={piece} entry={entry} words={words} presence={presence} show={show} inline={inline} tag={!(inline && deletes)} />))}</>;
}

/** Le curseur d'un groupe exclusif : un fond relevé posé sous le choix (`[aria-pressed="true"]`), qui glisse d'un choix
 *  à l'autre. Le conteneur porte le dessin (`::before`, journal.css) ; ici, seulement sa place, en variables CSS (par le
 *  CSSOM : la CSP n'admet aucun style en ligne). Posé sans mouvement la première fois, il glisse ensuite. */
export function useThumb<T extends HTMLElement>(dep: unknown) {
  const box = useRef<T>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const place = (): void => {
      const on = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      el.style.setProperty("--thumb-o", on ? "1" : "0");
      if (!on) return;
      el.style.setProperty("--thumb-x", on.offsetLeft + "px");
      el.style.setProperty("--thumb-y", on.offsetTop + "px");
      el.style.setProperty("--thumb-w", on.offsetWidth + "px");
      el.style.setProperty("--thumb-h", on.offsetHeight + "px");
    };
    place();
    const ready = requestAnimationFrame(() => el.classList.add("thumb-ready"));
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (watch) watch.observe(el);
    return () => { cancelAnimationFrame(ready); if (watch) watch.disconnect(); };
  }, [dep]);
  return box;
}

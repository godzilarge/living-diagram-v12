// La barre contextuelle pendant l'écriture d'un bloc de code (lot 16 bis de docs/11) : la même barre qui passe de « bloc
// sélectionné » à « écriture » (chercher, retour à la ligne, taille et police, ✕ abandonner, ✓ enregistrer) puis à
// « recherche » (le champ, le compte, Aa, mot entier, expression régulière, précédent, suivant, remplacer ; la rangée
// « remplacer par » se déplie dessous) : pas de second panneau. Mêmes gabarits que la barre (`.fbar`, `.fb`, `.fvolet`) ;
// les commandes en icônes, le mot en infobulle et en nom accessible. Posée contre l'écriture, jamais dessus (placeBar),
// elle suit la vue ; affichée quelle que soit la préférence « barre contextuelle » (la recherche y vit). Les boutons ne
// prennent pas le focus au texte (un clic garde le curseur) ; les champs de la recherche, si.
import { ArrowDown, ArrowUp, CaseSensitive, ChevronDown, Regex, Replace, ReplaceAll, Search, WholeWord, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useStore as useFlowStore } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import type { Writing } from "../code/writing";
import { writingEntries } from "../state/code-bar";
import { placeBar, placeVolet } from "../state/floating";
import type { BarButton, Rect } from "../state/floating";
import { FaceOf } from "./floating-faces";
import { zoneOf } from "./FloatingBar";
import { TextVolet } from "./TextVolets";

const keep = (event: { preventDefault: () => void }): void => event.preventDefault(); // le focus reste au texte

/** Un bouton de la barre de l'écriture : l'icône, le mot en infobulle (`title`) et en nom accessible. */
function Fb({ id, label, keys, pressed, danger, opens, open, named, onClick, children }: { id: string; label: string; keys?: string; pressed?: boolean | "mixed"; danger?: boolean; opens?: boolean; open?: boolean; named?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" data-id={id} className={"fb" + (opens ? " opens" : "") + (danger ? " danger" : "") + (named ? " named" : "")} aria-label={label} title={keys ? label + " · " + keys : label}
      aria-pressed={pressed === undefined ? undefined : String(pressed) as "true" | "false" | "mixed"} aria-haspopup={opens ? "dialog" : undefined} aria-expanded={opens ? (open ? "true" : "false") : undefined}
      onPointerDown={opens ? undefined : keep} onClick={onClick}>{children}</button>
  );
}

export function WritingBar({ w }: { w: Writing }) {
  const { t } = useTranslation("shell");
  useFlowStore((s) => s.transform); // la barre suit la vue (panoramique, zoom)
  const [open, setOpen] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const bar = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), volet = useRef<HTMLDivElement>(null);
  const find = useRef<HTMLInputElement>(null), repl = useRef<HTMLInputElement>(null);
  const placed = useRef<{ bar: Rect; below: boolean; anchor: Rect; zone: ReturnType<typeof zoneOf> } | null>(null);
  const a = w.actions, s = w.search;
  useEffect(() => { if (!w.dirty) setArmed(false); }, [w.dirty]);
  useEffect(() => { if (s.open) setOpen(null); }, [s.open]);
  // chaque demande d'ouverture (Ctrl+F, Ctrl+H, la loupe) redonne le focus au champ : « remplacer par » s'il est déplié
  // et que la recherche est déjà écrite, sinon la recherche
  useEffect(() => {
    if (!s.open) return;
    const target = s.replace && s.search ? repl.current : find.current;
    if (target) { target.focus({ preventScroll: true }); target.select(); }
  }, [s.asked, s.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // « remplacer par » déplié : le focus va à son champ (replié : retour à la recherche)
  useEffect(() => {
    if (!s.open) return;
    const target = s.replace ? repl.current : find.current;
    if (target && document.activeElement !== target && bar.current && bar.current.contains(document.activeElement)) { target.focus({ preventScroll: true }); target.select(); }
  }, [s.replace]); // eslint-disable-line react-hooks/exhaustive-deps

  // La place, à chaque image : contre l'écriture, au-dessus (dessous si le haut manque), jamais sur elle.
  useLayoutEffect(() => {
    const el = bar.current, inner = body.current, target = a.element();
    if (!el || !inner || !el.parentElement || !target) return;
    const host = el.parentElement.getBoundingClientRect(), r = target.getBoundingClientRect(), zone = zoneOf(host);
    const anchor = { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height };
    const place = placeBar(anchor, inner.offsetWidth, zone, [], false, inner.offsetHeight);
    el.classList.toggle("offscreen", !place);
    if (!place) { placed.current = null; return; }
    el.style.setProperty("--fx", place.x + "px");
    el.style.setProperty("--fy", place.y + "px");
    el.style.setProperty("--cx", place.caret + "px");
    el.style.setProperty("--cy", place.caretY + "px");
    el.classList.toggle("below", place.below);
    placed.current = { bar: { x: place.x, y: place.y, w: inner.offsetWidth, h: inner.offsetHeight }, below: place.below, anchor, zone };
  });
  useLayoutEffect(() => {
    const el = volet.current, now = placed.current, opener = open && body.current ? body.current.querySelector<HTMLElement>(`.fb[data-id="${open}"]`) : null;
    if (!el || !now || !opener || !bar.current || !bar.current.parentElement) return;
    const h = bar.current.parentElement.getBoundingClientRect(), r = opener.getBoundingClientRect();
    const at = placeVolet(now.bar, now.below, { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }, el.offsetWidth, Math.max(el.offsetHeight, el.scrollHeight + 2), now.zone, now.anchor);
    el.style.setProperty("--vx", at.x + "px");
    el.style.setProperty("--vy", at.y + "px");
    el.style.setProperty("--vc", at.caret + "px");
    el.classList.toggle("up", at.up);
    for (const side of ["above", "below", "left", "right"]) el.classList.toggle("at-" + side, at.side === side);
  });
  // un volet ouvert : Échap ou un clic dehors le ferme, le focus revient au texte
  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => { setOpen(null); a.focus(); };
    const down = (event: PointerEvent): void => { const el = event.target as Element | null; if (el && !(volet.current && volet.current.contains(el)) && !el.closest?.(`.fb[data-id="${open}"]`)) setOpen(null); };
    const key = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  }, [open, a]);

  const run = (b: BarButton, value: string | null = null): void => {
    if (b.id === "code_search") { a.search.open(false); return; }
    if (b.id === "code_wrap") a.setWrap(!w.wrap);
    else if (b.id === "code_save") { a.save(); return; }
    else if (b.id === "code_abandon") { if (w.dirty && !armed) { setArmed(true); return; } a.abandon(); return; }
    else if (b.id === "text_size" && value && value.startsWith("size:")) a.setSize(Number(value.slice(5)));
    else if (b.id === "text_size" && value && value.startsWith("font:")) a.setFont(value.slice(5));
    if (!b.volet) a.focus();
  };
  const entries = writingEntries(w, armed);
  const openButton = open ? (entries.find((e) => e.id === open) as BarButton | undefined) : undefined;
  return (
    <>
      <div ref={bar} className="fbar writing nopan nodrag nowheel" role="toolbar" aria-label={t("fbar.writingLabel")} aria-orientation="horizontal">
        <div ref={body} className={"fbar-body" + (s.open && s.replace ? " two-rows" : "")}>
          {s.open ? <SearchRows w={w} find={find} repl={repl} /> : entries.map((entry, i) => {
            if (entry.id === "sep") return <span key={"sep" + i} className="fb-sep" aria-hidden="true" />;
            const b = entry as BarButton;
            return <Fb key={b.id} id={b.id} label={b.label} keys={b.keys} pressed={b.pressed} danger={b.danger} opens={!!b.volet} open={open === b.id} named={b.face.kind === "value" || b.face.kind === "text"}
              onClick={() => { if (b.volet) setOpen(open === b.id ? null : b.id); else run(b); }}><FaceOf face={b.face} /></Fb>;
          })}
          <span className="fbar-caret" aria-hidden="true" />
        </div>
      </div>
      {openButton && openButton.volet && openButton.volet.kind === "textSize" ? (
        <div ref={volet} className="fvolet nopan nodrag nowheel" role="dialog" aria-label={openButton.label}>
          <div className="fvolet-body"><TextVolet volet={openButton.volet} onPick={(value) => run(openButton, value)} /></div>
          <span className="fvolet-caret" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
}

/** La recherche dans la barre : le champ et ses options, le compte, précédent, suivant, « remplacer par » à déplier ; la
 *  rangée « remplacer par » dessous. Entrée = suivant (Maj : précédent) ; dans « remplacer par », Entrée remplace,
 *  Ctrl+Entrée remplace tout ; Échap ferme la recherche et rend le focus au texte ; Alt+C, Alt+W, Alt+R basculent. */
function SearchRows({ w, find, repl }: { w: Writing; find: React.RefObject<HTMLInputElement | null>; repl: React.RefObject<HTMLInputElement | null> }) {
  const { t } = useTranslation("shell");
  const a = w.actions, s = w.search;
  const close = (): void => { a.search.close(); a.focus(); };
  const keys = (event: ReactKeyboardEvent<HTMLInputElement>, replace: boolean): void => {
    const mod = event.ctrlKey || event.metaKey;
    event.stopPropagation();
    if (event.key === "Enter" && !replace) { event.preventDefault(); if (event.shiftKey) a.search.previous(); else a.search.next(); }
    else if (event.key === "Enter" && replace) { event.preventDefault(); if (mod) a.search.replaceAll(); else a.search.replaceOne(); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.altKey && /^[cwr]$/i.test(event.key)) {
      event.preventDefault();
      const k = event.key.toLowerCase();
      a.search.query(k === "c" ? { caseSensitive: !s.caseSensitive } : k === "w" ? { wholeWord: !s.wholeWord } : { regexp: !s.regexp });
    } else if (mod && event.key.toLowerCase() === "h") { event.preventDefault(); a.search.setReplace(!s.replace); }
    else if (mod && event.key.toLowerCase() === "f") { event.preventDefault(); if (find.current) find.current.select(); }
  };
  const count = !s.search ? "" : !s.valid ? t("fbar.searchBad") : !s.count ? t("fbar.searchNone")
    : s.index ? t("fbar.searchAt", { index: s.index, total: s.capped ? s.count + "+" : String(s.count) }) : t("fbar.searchCount", { count: s.count });
  const option = (id: string, label: string, keys: string, on: boolean, flip: () => void, icon: ReactNode) => (
    <Fb id={id} label={label} keys={keys} pressed={on} onClick={flip}>{icon}</Fb>
  );
  return (
    <>
      <div className="fbar-row" role="search">
        <Fb id="search_close" label={t("fbar.searchClose")} keys={t("fbar.keyEscape")} onClick={close}><X /></Fb>
        <span className="fb-field"><Search aria-hidden="true" />
          <input ref={find} className="fb-input" type="text" value={s.search} spellCheck={false} autoComplete="off" aria-label={t("fbar.searchFind")} placeholder={t("fbar.searchFind")}
            onChange={(event) => a.search.query({ search: event.target.value })} onKeyDown={(event) => keys(event, false)} />
          <span className={"fb-count" + (s.search && (!s.count || !s.valid) ? " none" : "")} aria-live="polite">{count}</span>
        </span>
        {option("search_case", t("fbar.searchCase"), "Alt+C", s.caseSensitive, () => a.search.query({ caseSensitive: !s.caseSensitive }), <CaseSensitive />)}
        {option("search_word", t("fbar.searchWord"), "Alt+W", s.wholeWord, () => a.search.query({ wholeWord: !s.wholeWord }), <WholeWord />)}
        {option("search_regex", t("fbar.searchRegex"), "Alt+R", s.regexp, () => a.search.query({ regexp: !s.regexp }), <Regex />)}
        <span className="fb-sep" aria-hidden="true" />
        <Fb id="search_previous" label={t("fbar.searchPrevious")} keys={t("fbar.keyShiftEnter")} onClick={() => a.search.previous()}><ArrowUp /></Fb>
        <Fb id="search_next" label={t("fbar.searchNext")} keys={t("fbar.keyEnter")} onClick={() => a.search.next()}><ArrowDown /></Fb>
        <Fb id="search_replace" label={t("fbar.searchReplaceToggle")} keys="Ctrl+H" pressed={s.replace} onClick={() => a.search.setReplace(!s.replace)}><ChevronDown /></Fb>
      </div>
      {s.replace ? (
        <div className="fbar-row">
          <span className="fb-field"><Replace aria-hidden="true" />
            <input ref={repl} className="fb-input" type="text" value={s.replaceWith} spellCheck={false} autoComplete="off" aria-label={t("fbar.searchReplaceWith")} placeholder={t("fbar.searchReplaceWith")}
              onChange={(event) => a.search.query({ replace: event.target.value })} onKeyDown={(event) => keys(event, true)} />
          </span>
          <Fb id="search_replace_one" label={t("fbar.searchReplaceOne")} keys={t("fbar.keyEnter")} onClick={() => a.search.replaceOne()}><Replace /></Fb>
          <Fb id="search_replace_all" label={t("fbar.searchReplaceAll")} keys={t("fbar.keyReplaceAll")} onClick={() => a.search.replaceAll()}><ReplaceAll /></Fb>
        </div>
      ) : null}
    </>
  );
}

// La recherche de l'écriture d'un bloc de code (lot 16 bis de docs/11) : la logique est celle de CodeMirror
// (`@codemirror/search` : requête, suivant, précédent, remplacer, tout remplacer, Aa, mot entier, expression régulière),
// l'interface vit dans la barre contextuelle (components/WritingBar.tsx : une seule barre, pas de second panneau).
// CodeMirror ne surligne les résultats que son panneau ouvert : ce panneau est une ancre vide, rangée hors de la vue
// (`panels({ topContainer })`, editor.ts), qui rapporte l'état de la recherche à la page (`onState`) à chaque
// changement. Sans minuterie ni React.
import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll, replaceNext, search, searchPanelOpen, setSearchQuery } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";

/** Au-delà, le compte s'arrête (« 1 000+ ») : compter coûte une passe sur le texte. */
export const COUNT_MAX = 1000;

/** Ce qu'une requête peut changer. */
export type QueryPatch = Partial<{ search: string; replace: string; caseSensitive: boolean; wholeWord: boolean; regexp: boolean }>;
/** Ce que la barre montre de la recherche. `index` : le rang du résultat sélectionné (0 = aucun). */
export interface SearchState {
  open: boolean; replace: boolean; search: string; replaceWith: string;
  caseSensitive: boolean; wholeWord: boolean; regexp: boolean; valid: boolean;
  count: number; index: number; capped: boolean;
  /** Le nombre de demandes d'ouverture (Ctrl+F, Ctrl+H, la loupe) : chacune redonne le focus au champ. */
  asked: number;
}
export const CLOSED: SearchState = { open: false, replace: false, search: "", replaceWith: "", caseSensitive: false, wholeWord: false, regexp: false, valid: true, count: 0, index: 0, capped: false, asked: 0 };

/** Les résultats d'une requête et le rang de la sélection parmi eux (une passe, `COUNT_MAX` au plus). */
export function countMatches(view: EditorView, q: SearchQuery): { count: number; index: number; capped: boolean } {
  if (!q.valid || !q.search) return { count: 0, index: 0, capped: false };
  const sel = view.state.selection.main, cursor = q.getCursor(view.state);
  let count = 0, index = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    count += 1;
    if (r.value.from === sel.from && r.value.to === sel.to) index = count;
    if (count >= COUNT_MAX) return { count, index, capped: true };
  }
  return { count, index, capped: false };
}

function stateOf(view: EditorView, replace: boolean, asked: number): SearchState {
  const q = getSearchQuery(view.state);
  return { open: searchPanelOpen(view.state), replace, search: q.search, replaceWith: q.replace, caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp, valid: q.valid || !q.search, ...countMatches(view, q), asked };
}

/** L'extension de recherche : le panneau-ancre (hors de la vue) qui rapporte l'état, et `replace`, la rangée
 *  « remplacer par » dépliée ou non (un réglage de la barre, gardé ici pour l'état rapporté). */
export function searching(onState: (state: SearchState) => void): { extension: Extension; controls: SearchControls } {
  let replace = false, asked = 0, view: EditorView | null = null;
  const report = (): void => { if (view) onState(stateOf(view, replace, asked)); };
  const createPanel = (v: EditorView): Panel => {
    view = v;
    const dom = v.dom.ownerDocument.createElement("div");
    dom.className = "code-search-anchor";
    return {
      dom, top: true,
      mount: report,
      update: (u: ViewUpdate) => { if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) report(); },
      destroy: () => { onState({ ...CLOSED, asked }); },
    };
  };
  const query = (v: EditorView, over: QueryPatch): void => {
    const q = getSearchQuery(v.state);
    const next = new SearchQuery({ search: q.search, replace: q.replace, caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp, ...over });
    if (!next.eq(q)) v.dispatch({ effects: setSearchQuery.of(next) });
  };
  const controls: SearchControls = {
    open: (v, withReplace) => { view = v; replace = withReplace || replace; asked += 1; if (!searchPanelOpen(v.state)) openSearchPanel(v); report(); },
    close: (v) => { replace = false; if (searchPanelOpen(v.state)) closeSearchPanel(v); },
    setReplace: (v, on) => { replace = on; view = v; report(); },
    query,
    next: (v) => { findNext(v); report(); },
    previous: (v) => { findPrevious(v); report(); },
    replaceOne: (v) => { replaceNext(v); report(); },
    replaceAll: (v) => { replaceAll(v); report(); },
  };
  return { extension: search({ top: true, createPanel }), controls };
}

/** Ce que la barre fait de la recherche (toujours sur la vue de l'écriture en cours). */
export interface SearchControls {
  open: (view: EditorView, replace: boolean) => void;
  close: (view: EditorView) => void;
  setReplace: (view: EditorView, on: boolean) => void;
  query: (view: EditorView, over: QueryPatch) => void;
  next: (view: EditorView) => void;
  previous: (view: EditorView) => void;
  replaceOne: (view: EditorView) => void;
  replaceAll: (view: EditorView) => void;
}

/** Les mêmes commandes, sur une vue donnée (l'écriture en cours) : ce que la barre appelle. */
export interface EditorSearch {
  open: (replace: boolean) => void; close: () => void; setReplace: (on: boolean) => void; query: (over: QueryPatch) => void;
  next: () => void; previous: () => void; replaceOne: () => void; replaceAll: () => void;
}
export const boundSearch = (controls: SearchControls, view: EditorView): EditorSearch => ({
  open: (replace) => controls.open(view, replace), close: () => controls.close(view), setReplace: (on) => controls.setReplace(view, on),
  query: (over) => controls.query(view, over), next: () => controls.next(view), previous: () => controls.previous(view),
  replaceOne: () => controls.replaceOne(view), replaceAll: () => controls.replaceAll(view),
});

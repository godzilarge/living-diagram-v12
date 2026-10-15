// L'écriture d'un bloc de code dans CodeMirror 6 (lot 16 bis de docs/11), posée en place dans le bloc, sous la
// transformation de la toile (CodeMirror ≥ 6.18 lit l'échelle de ses ancêtres : clic, sélection et curseur restent
// justes à tout zoom ; la page redemande une mesure quand le zoom change). L'affichage reste en SVG (code.tsx) :
// CodeMirror ne sert que pendant l'écriture.
//
// Ce que CodeMirror apporte : l'historique propre au texte (Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z, jamais celui du diagramme),
// la recherche et le remplacement (search.ts ; l'interface est dans la barre), les curseurs multiples (Ctrl+D,
// Ctrl+clic), Alt+↑↓, Ctrl+/, Tab / Maj+Tab, Ctrl+A, les parenthèses appariées (sans fermeture automatique).
// Ce que la page lui impose : la coloration de Prism en décorations (mêmes familles, mêmes couleurs que la lecture), la
// règle de coupure de wrap.ts (chaque mot marqué « jamais coupé » ou « coupé au caractère », le retrait des rangées de
// suite, par `outerDecorations` : la marque d'un mot enveloppe celles de Prism et n'est jamais coupée par elles), la
// géométrie de geometry.ts (gouttière, x du texte, hauteur de rangée, colonnes : la feuille code-editor.css), les
// valeurs sensibles repérées en direct, et le nettoyage de ce qui entre (tabulations à quatre colonnes, retours
// chariot, caractères interdits). Aucune minuterie ici : la page fournit `schedule`.
import { Compartment, EditorSelection, EditorState, Prec, RangeSet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { Extension, Text, Transaction, TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, ViewPlugin, drawSelection, gutterLineClass, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, panels } from "@codemirror/view";
import type { DecorationSet, KeyBinding, ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, simplifySelection } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap, searchPanelOpen } from "@codemirror/search";
import { bracketMatching, indentUnit } from "@codemirror/language";
import { CODE } from "./geometry";
import { cleanTyped, unclean } from "./languages";
import { findSecrets } from "./secrets";
import type { Secret } from "./secrets";
import { codeLines } from "./tokens";
import type { Line } from "./tokens";
import { hangOf, isLong, wordsOf } from "./wrap";
import { boundSearch, searching } from "./search";
import type { EditorSearch, SearchState } from "./search";

/** Ce que la page donne à l'éditeur. */
export interface EditorHooks {
  /** Ctrl+Entrée, et Échap quand rien d'autre n'est ouvert : la page enregistre (après l'avertissement). */
  onSave: () => void;
  /** Échap ou Tab avec l'avertissement ouvert : la page le ferme, ou y donne le focus ; vrai si elle l'a fait. */
  onEscape: () => boolean;
  onTab: (back: boolean) => boolean;
  onDoc: (text: string) => void;
  onSearch: (state: SearchState) => void;
  /** Un collage qui dépasserait la borne du contrat : refusé, la page le dit. */
  onTooLong: () => void;
  /** Rappeler `fn` après `ms` ; rend de quoi annuler (la minuterie vit dans la page). */
  schedule: (fn: () => void, ms: number) => () => void;
  /** Les caractères au plus (le contrat). */
  max: number;
}
export interface EditorOptions {
  text: string; language: string; highlight: boolean; numbers: boolean; wrap: boolean; cols: number; lh: number; label: string;
  /** Où s'ouvrir : l'offset du curseur, et la ligne et le rang (rangée de suite) à mettre en haut. */
  at: { offset: number; line: number; k: number };
}
/** L'écriture ouverte, vue de la page. */
export interface EditorSession {
  view: EditorView;
  text: () => string;
  setGeometry: (geo: { cols: number; wrap: boolean }) => void;
  setLanguage: (language: string, highlight: boolean) => void;
  /** Sélectionner une valeur (ligne, colonnes) et la montrer ; le focus revient au texte. */
  select: (line: number, start: number, end: number) => void;
  /** La ligne et le rang de la rangée en haut de l'écriture (la lecture reprend là). */
  topLine: (lh: number) => { line: number; k: number };
  search: EditorSearch;
  measure: () => void;
  focus: () => void;
  destroy: () => void;
}

// ---------- la géométrie de la coupure : colonnes et retour à la ligne ----------
interface Geo { cols: number; wrap: boolean }
const geoChanged = StateEffect.define<Geo>();
const geoField = StateField.define<Geo>({
  create: () => ({ cols: 80, wrap: true }),
  update: (value, tr) => { for (const e of tr.effects) if (e.is(geoChanged)) return e.value; return value; },
});

/** Les lignes que CodeMirror rend : sa fenêtre et les lignes de la sélection (il les rend même loin de la fenêtre).
 *  Toutes reçoivent les décorations, sinon une ligne rendue sans elles serait coupée autrement. */
function renderedLines(view: EditorView): number[] {
  const doc = view.state.doc, out = new Set<number>();
  for (let n = doc.lineAt(view.viewport.from).number; n <= doc.lineAt(view.viewport.to).number; n += 1) out.add(n);
  for (const r of view.state.selection.ranges) { out.add(doc.lineAt(r.head).number); out.add(doc.lineAt(r.anchor).number); }
  return Array.from(out).sort((a, b) => a - b);
}

const marks = new Map<string, Decoration>();
const mark = (cls: string): Decoration => { let d = marks.get(cls); if (!d) { d = Decoration.mark({ class: cls }); marks.set(cls, d); } return d; };

// ---------- la coloration : Prism en décorations, sur les lignes rendues ----------
interface Hl { language: string; highlight: boolean }
const hlChanged = StateEffect.define<Hl>();
const hlField = StateField.define<Hl>({
  create: () => ({ language: "plain", highlight: true }),
  update: (value, tr) => { for (const e of tr.effects) if (e.is(hlChanged)) return e.value; return value; },
});
const settled = StateEffect.define<null>();
/** Un texte court se recolore en entier à chaque frappe ; un long, ligne à ligne là où il change, puis en entier
 *  `SETTLE_MS` après la dernière frappe (une chaîne sur plusieurs lignes reprend alors sa couleur). */
export const FULL_CHARS = 4000, SETTLE_MS = 200;

function prismPlugin(schedule: EditorHooks["schedule"]): Extension {
  return ViewPlugin.fromClass(class {
    lines: Line[]; decorations: DecorationSet; cancel: (() => void) | null = null;
    constructor(readonly view: EditorView) { this.lines = this.tokenize(view.state); this.decorations = this.build(view); }
    tokenize(state: EditorState): Line[] { const h = state.field(hlField); return codeLines(state.doc.toString(), h.language, h.highlight); }
    update(u: ViewUpdate): void {
      const relang = u.transactions.some((tr) => tr.effects.some((e) => e.is(hlChanged)));
      const calm = u.transactions.some((tr) => tr.effects.some((e) => e.is(settled)));
      if (relang || calm || (u.docChanged && u.state.doc.length <= FULL_CHARS)) this.lines = this.tokenize(u.state);
      else if (u.docChanged) { this.patch(u); this.later(); }
      if (u.docChanged || relang || calm || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
    }
    /** Les lignes touchées, recolorées seules ; les autres gardent leurs morceaux. */
    patch(u: ViewUpdate): void {
      const h = u.state.field(hlField), next = this.lines.slice();
      let shift = 0;
      u.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
        const la = u.startState.doc.lineAt(fromA).number - 1, lz = u.startState.doc.lineAt(toA).number - 1;
        const na = u.state.doc.lineAt(fromB).number - 1, nz = u.state.doc.lineAt(toB).number - 1;
        const fresh: Line[] = [];
        for (let n = na; n <= nz; n += 1) fresh.push(codeLines(u.state.doc.line(n + 1).text, h.language, h.highlight)[0] || []);
        next.splice(la + shift, lz - la + 1, ...fresh);
        shift += (nz - na) - (lz - la);
      });
      this.lines = next;
    }
    later(): void {
      if (this.cancel) this.cancel();
      this.cancel = schedule(() => { this.cancel = null; this.view.dispatch({ effects: settled.of(null) }); }, SETTLE_MS);
    }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>(), h = view.state.field(hlField), colored = h.highlight && h.language !== "plain";
      for (const n of renderedLines(view)) {
        const line = view.state.doc.line(n);
        let at = line.from;
        for (const s of this.lines[n - 1] || []) {
          if (s.c && (colored || s.c === "masked") && at + s.t.length <= line.to) b.add(at, at + s.t.length, mark("tk-" + s.c));
          at += s.t.length;
        }
      }
      return b.finish();
    }
    destroy(): void { if (this.cancel) this.cancel(); }
  }, { decorations: (v) => v.decorations });
}

// ---------- la coupure : la règle de wrap.ts, imposée mot à mot ----------
// Une ligne plus longue que `cols` reçoit son retrait (`hang-N`) ; chacun de ses mots est marqué `w-n` (jamais coupé)
// ou `w-a` (coupé au caractère).
const wrapPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: ViewUpdate): void {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(geoChanged)))) this.decorations = this.build(u.view);
  }
  build(view: EditorView): DecorationSet {
    const { cols, wrap } = view.state.field(geoField);
    const b = new RangeSetBuilder<Decoration>();
    if (!wrap) return b.finish();
    for (const n of renderedLines(view)) {
      const line = view.state.doc.line(n);
      if (line.length <= cols) continue;
      const hang = hangOf(line.text, cols);
      b.add(line.from, line.from, Decoration.line({ class: "hang hang-" + hang }));
      for (const [a, z] of wordsOf(line.text)) b.add(line.from + a, line.from + z, mark(isLong(z - a, cols, hang) ? "w-a" : "w-n"));
    }
    return b.finish();
  }
}, { provide: (p) => EditorView.outerDecorations.of((view) => { const v = view.plugin(p); return v ? v.decorations : Decoration.none; }) });

// ---------- les valeurs sensibles : repérées en direct, surlignées, un point dans la gouttière ----------
const secretsField = StateField.define<Secret[]>({
  create: (state) => findSecrets(state.doc.toString()),
  update: (value, tr) => (tr.docChanged ? findSecrets(tr.newDoc.toString()) : value),
});
const lineStart = (doc: Text, line: number): number => doc.line(Math.min(doc.lines, line + 1)).from;
const secretMarks = EditorView.decorations.compute([secretsField], (state) => {
  const b = new RangeSetBuilder<Decoration>();
  state.field(secretsField).forEach((f) => { const at = lineStart(state.doc, f.line); b.add(at + f.start, at + f.end, mark("cm-secret")); });
  return b.finish();
});
const flag = new class extends GutterMarker { override elementClass = "flag"; }();
const secretGutter = gutterLineClass.compute([secretsField], (state) => {
  const lines = Array.from(new Set(state.field(secretsField).map((f) => f.line))).sort((a, b) => a - b);
  return RangeSet.of(lines.map((l) => flag.range(lineStart(state.doc, l))));
});

// ---------- ce qui entre : nettoyé comme un collage ----------
/** Une frappe ou un dépôt qui porte une tabulation, un retour chariot ou un caractère interdit : le texte nettoyé à sa
 *  colonne (une tabulation va au prochain multiple de quatre), le curseur après lui. */
const cleanInput = EditorState.transactionFilter.of((tr: Transaction): Transaction | TransactionSpec => {
  if (!tr.docChanged) return tr;
  let dirty = false;
  tr.changes.iterChanges((_a, _b, _c, _d, inserted) => { if (!dirty && unclean(inserted.toString())) dirty = true; });
  if (!dirty) return tr;
  const specs: { from: number; to: number; insert: string }[] = [];
  tr.changes.iterChanges((from, to, _c, _d, inserted) => {
    const line = tr.startState.doc.lineAt(from), prefix = line.text.slice(0, from - line.from);
    specs.push({ from, to, insert: cleanTyped(prefix + inserted.toString()).slice(prefix.length) });
  });
  const changes = tr.startState.changes(specs), last = specs[specs.length - 1];
  return { changes, selection: EditorSelection.cursor(changes.mapPos(last.to, 1)), scrollIntoView: true, userEvent: "input" };
});

/** Tab sans sélection : des espaces jusqu'à la prochaine colonne multiple de quatre ; avec une sélection : indenter. */
const tabSpaces = (view: EditorView): boolean => {
  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);
  view.dispatch(state.changeByRange((r) => {
    const col = r.head - state.doc.lineAt(r.head).from, spaces = " ".repeat(4 - (col % 4));
    return { changes: { from: r.head, insert: spaces }, range: EditorSelection.cursor(r.head + spaces.length) };
  }), { userEvent: "input", scrollIntoView: true });
  return true;
};

const COMMENT: Record<string, string | null> = { plain: null, python: "#", bash: "#", json: null, yaml: "#", cisco_ios: "!", fortios: "#" };
const commentData = (language: string): Extension => EditorState.languageData.of(() => (COMMENT[language] ? [{ commentTokens: { line: COMMENT[language] } }] : []));

/** Aligner l'écriture sur la lecture : la rangée `k` de la ligne `line` à la marge du texte (CODE.PAD sous le haut de
 *  l'écriture). Les hauteurs de CodeMirror sont mesurées à l'écran (`getBoundingClientRect` : à l'échelle de la toile),
 *  le défilement (`scrollTop`) est en unités du dessin : une hauteur se divise par `scaleY` (relu à chaque mesure) avant
 *  d'être un défilement (sans cela, 300 devenait 391 au zoom 1,3). Trois passes au plus : les hauteurs des lignes
 *  voisines, estimées avant d'être rendues, se corrigent quand elles le sont. */
function alignTop(view: EditorView, line: number, k: number, lh: number, pass = 0): void {
  view.requestMeasure({
    read: (v) => {
      const block = v.lineBlockAt(v.state.doc.line(Math.min(v.state.doc.lines, line + 1)).from);
      return block.top / (v.scaleY || 1) + k * lh - v.scrollDOM.scrollTop;
    },
    write: (delta, v) => {
      if (Math.abs(delta) < 0.5) return;
      v.scrollDOM.scrollTop += delta;
      if (pass < 3) alignTop(v, line, k, lh, pass + 1);
    },
  });
}

function keys(hooks: EditorHooks, find: (view: EditorView, replace: boolean) => void, close: (view: EditorView) => void): Extension {
  const save = (): boolean => { hooks.onSave(); return true; };
  const escape = (view: EditorView): boolean => {
    if (hooks.onEscape()) return true;
    if (searchPanelOpen(view.state)) { close(view); return true; }
    if (view.state.selection.ranges.length > 1) return simplifySelection(view);
    return save();
  };
  const own: KeyBinding[] = [
    { key: "Mod-Enter", run: save },
    { key: "Escape", run: escape },
    { key: "Mod-f", run: (view) => { find(view, false); return true; }, preventDefault: true },
    { key: "Mod-h", run: (view) => { find(view, true); return true; }, preventDefault: true },
    { key: "Tab", run: (view) => hooks.onTab(false) || tabSpaces(view), shift: (view) => hooks.onTab(true) || indentLess(view) },
  ];
  // la recherche de CodeMirror sans son panneau (« aller à la ligne » ouvrirait un panneau invisible ici)
  const searchKeys = searchKeymap.filter((b) => b.key !== "Mod-f" && b.key !== "Mod-Alt-g" && b.key !== "Escape");
  return [Prec.highest(keymap.of(own)), keymap.of([...searchKeys, ...historyKeymap, ...defaultKeymap])];
}

/** Un collage qui ferait passer le texte au-delà de la borne du contrat (une fois nettoyé : une tabulation devient
 *  jusqu'à quatre espaces) ; un texte démesuré n'est pas nettoyé pour le savoir. */
export function pasteTooLong(docLength: number, selected: number, raw: string, max: number): boolean {
  const kept = docLength - selected;
  if (kept + raw.length <= max && !raw.includes("\t")) return false;
  return kept + (raw.length > max * 4 ? raw.length : cleanTyped(raw).length) > max;
}

/** Ouvre l'écriture dans `host` (un élément posé par la page sur la zone du code), le focus dedans. */
export function openEditor(host: HTMLElement, options: EditorOptions, hooks: EditorHooks): EditorSession {
  const wrapC = new Compartment(), commentC = new Compartment();
  const anchors = host.ownerDocument.createElement("div"); // le panneau de recherche (une ancre vide), hors de la vue
  anchors.className = "code-search-anchors";
  host.appendChild(anchors);
  const found = searching(hooks.onSearch);
  const find = (view: EditorView, replace: boolean): void => found.controls.open(view, replace);
  const wrapAttrs = (wrap: boolean): Extension => (wrap ? EditorView.contentAttributes.of({ class: "ld-wrap" }) : []);
  const state = EditorState.create({
    doc: options.text,
    selection: { anchor: Math.min(options.at.offset, options.text.length) },
    extensions: [
      geoField.init(() => ({ cols: options.cols, wrap: options.wrap })),
      hlField.init(() => ({ language: options.language, highlight: options.highlight })),
      secretsField, cleanInput,
      EditorState.allowMultipleSelections.of(true), EditorState.tabSize.of(4), indentUnit.of("    "),
      commentC.of(commentData(options.language)),
      history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(), highlightSelectionMatches(), bracketMatching(),
      lineNumbers(), secretGutter,
      found.extension, panels({ topContainer: anchors, bottomContainer: anchors }),
      keys(hooks, find, (view) => found.controls.close(view)),
      EditorView.domEventHandlers({
        paste: (event, view) => {
          const raw = event.clipboardData ? event.clipboardData.getData("text/plain") : "", sel = view.state.selection.main;
          if (!raw || !pasteTooLong(view.state.doc.length, sel.to - sel.from, raw, hooks.max)) return false;
          event.preventDefault();
          hooks.onTooLong();
          return true;
        },
      }),
      EditorView.clipboardInputFilter.of((text) => cleanTyped(text)),
      prismPlugin(hooks.schedule), wrapPlugin, secretMarks,
      wrapC.of(wrapAttrs(options.wrap)),
      EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off", "aria-label": options.label }),
      EditorView.updateListener.of((u) => { if (u.docChanged) hooks.onDoc(u.state.doc.toString()); }),
    ],
  });
  const view = new EditorView({ state, parent: host });
  alignTop(view, options.at.line, options.at.k, options.lh);
  view.focus();
  return {
    view,
    text: () => view.state.doc.toString(),
    setGeometry: (geo) => { view.dispatch({ effects: [geoChanged.of(geo), wrapC.reconfigure(wrapAttrs(geo.wrap))] }); view.requestMeasure(); },
    setLanguage: (language, highlight) => { view.dispatch({ effects: [hlChanged.of({ language, highlight }), commentC.reconfigure(commentData(language))] }); },
    select: (line, start, end) => {
      const doc = view.state.doc, at = lineStart(doc, line), stop = doc.line(Math.min(doc.lines, line + 1)).to;
      view.dispatch({ selection: { anchor: Math.min(at + start, stop), head: Math.min(at + end, stop) }, scrollIntoView: true });
      view.focus();
    },
    topLine: (lh) => {
      // la rangée posée à la marge du texte (CODE.PAD sous le haut de l'écriture) est à la hauteur `scrollTop` du
      // document, à l'échelle de l'écran pour CodeMirror (`scaleY`) ; on lit son milieu : un défilement arrondi au pixel
      // ne fait pas glisser d'une ligne
      const sy = view.scaleY || 1, middle = (view.scrollDOM.scrollTop + lh / 2) * sy, block = view.lineBlockAtHeight(middle);
      return { line: view.state.doc.lineAt(block.from).number - 1, k: Math.max(0, Math.floor((middle - block.top) / (lh * sy))) };
    },
    search: boundSearch(found.controls, view),
    measure: () => view.requestMeasure(),
    focus: () => view.focus(),
    destroy: () => { view.destroy(); anchors.remove(); },
  };
}

export const editor = { FULL_CHARS, SETTLE_MS, pasteTooLong };

// L'écriture en place d'un bloc de code (lots 16 et 16 bis de docs/11) : CodeMirror 6 (code/editor.ts) posé sur la zone
// du code, aux mesures exactes de la lecture (gouttière, x du texte, hauteur de rangée, coupures : aucun saut en
// passant de l'une à l'autre), ouvert là où l'on lisait. Ctrl+Entrée enregistre ; Échap ferme la recherche, puis
// enregistre et sort ; un clic dehors enregistre ; abandonner passe par la barre (✕, deux clics s'il y a des
// modifications). Ctrl+Z / Ctrl+Y défont le texte (l'historique de l'éditeur, jamais celui du diagramme), Ctrl+F / Ctrl+H
// cherchent et remplacent (l'interface est dans la barre contextuelle, components/WritingBar.tsx), Ctrl + molette change
// la taille du code. Rien n'est enregistré sans que les valeurs sensibles aient été vues : marquées en direct dans le
// texte, puis l'avertissement (code-warn.tsx) avant l'enregistrement, comme au lot 16. Les dimensions passent par des
// variables CSS posées par le CSSOM, jamais par un style en ligne. Revue du 2026-10-15, gardée : seules les valeurs
// **nouvelles** par rapport au texte enregistré sont signalées (M1) ; un champ démonté avec une valeur nouvelle non vue
// rend son texte à la page, qui le garde en attente ; un texte trop long garde l'écriture ouverte (M2).
import { useStore as useFlowStore } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { CODE, layout, openingOf } from "../code/geometry";
import { openEditor } from "../code/editor";
import type { EditorSession } from "../code/editor";
import { normalizeCode } from "../code/languages";
import { maskSecrets, newSecrets } from "../code/secrets";
import type { Secret } from "../code/secrets";
import { CLOSED } from "../code/search";
import { writing } from "../code/writing";
import { stepSize, wheelSteps } from "../state/sizes";
import { CODE_MAX } from "../state/code-commands";
import type { CodeOutcome } from "../state/code-commands";
import { useCode } from "./code";
import { CodeWarn } from "./code-warn";
import { debug } from "../state/debug";

/** Une rafale de tailles (molette, pas à pas de la barre) ne s'écrit qu'une fois, ce délai après la dernière. */
const SIZE_SETTLE_MS = 400;
/** Ce qui, cliqué, ne quitte pas l'écriture : elle-même, la barre et ses volets, l'avertissement. */
const INSIDE = ".code-editor, .fbar, .fvolet, .ftip, .code-warn-panel";

export interface EditorProps {
  /** L'écriture, pour la barre : « annotation:a3-1 » ou « draft:4 ». */
  writingKey: string; draft: boolean;
  /** La boîte (unités du dessin) et ce qui règle le dessin du code. */
  w: number; h: number; size: number; font: string; numbers: boolean; wrap: boolean; language: string; highlight: boolean;
  /** Le texte de départ et la première rangée lue (l'écriture s'ouvre là) ; `saved` : le texte enregistré (vide pour un
   *  brouillon), les valeurs qu'il porte déjà ne sont pas redemandées. */
  initial: string; saved?: string; first: number; label: string; infrastructure: string;
  /** Ouvre l'avertissement tout de suite (un collage qui porte des valeurs sensibles, une écriture en attente). */
  warnAtOnce?: boolean;
  /** Démonté sans fin, le texte s'enregistre (un bloc sorti du champ) ; un brouillon, lui, s'abandonne. */
  saveOnLeave?: boolean;
  /** Démonté sans fin avec une valeur nouvelle jamais vue : le texte, rendu à la page (qui le garde en attente). */
  onLeave?: (text: string) => void;
  /** Ce que la barre règle pendant l'écriture : la page l'écrit (un bloc) ou le garde (un brouillon). */
  onSize: (size: number) => void; onFont: (font: string) => void; onWrap: (wrap: boolean) => void;
  /** `null` : abandon ; sinon le texte vu, ce qui en a été fait, et la rangée en haut de l'écriture (la lecture y reprend). */
  onDone: (text: string | null, outcome: CodeOutcome, removed: number, top: { line: number; k: number }) => void;
}

const setVars = (el: HTMLElement | null, vars: Record<string, string>): void => { if (el) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); };

export function CodeEditor(props: EditorProps) {
  const { w, h, font, numbers, wrap, language, highlight, initial, saved = "", warnAtOnce = false } = props;
  const box = useRef<HTMLDivElement>(null), cm = useRef<HTMLDivElement>(null);
  const session = useRef<EditorSession | null>(null);
  const { commands } = useCode();
  const zoom = useFlowStore((s) => s.transform[2]);
  // la taille vivante : la molette et le pas à pas la changent tout de suite, la page l'écrit après la rafale
  const [live, setLive] = useState<number | null>(null);
  const size = live ?? props.size;
  const [lines, setLines] = useState(() => initial.split("\n").length);
  const [warn, setWarn] = useState<{ text: string; found: Secret[] } | null>(() => {
    if (!warnAtOnce) return null;
    const text = normalizeCode(initial), found = newSecrets(text, saved);
    return found.length ? { text, found } : null;
  });
  const finished = useRef(false), value = useRef(initial), warnRef = useRef(warn);
  const latest = useRef(props);
  latest.current = props;
  warnRef.current = warn;
  // la géométrie de la lecture, au nombre de lignes de ce qui s'écrit (la gouttière suit ses chiffres)
  const l = layout({ w, h, size, font, numbers, text: value.current, wrap });
  const say = (text: string): void => { if (commands) commands.codeSay(text); };
  const topOf = (): { line: number; k: number } => (session.current ? session.current.topLine(l.lh) : { line: 0, k: 0 });
  const finish = (text: string | null, outcome: CodeOutcome = "plain", removed = 0): void => {
    if (finished.current) return;
    finished.current = true;
    latest.current.onDone(text, outcome, removed, topOf());
  };
  const commit = (): void => {
    const s = session.current;
    if (!s || finished.current) return;
    const text = normalizeCode(s.text());
    if (!text.trim()) { finish(null); return; }
    // trop long : l'écriture reste ouverte avec ce qui a été écrit, la page le dit (revue, M2)
    if (text.length > CODE_MAX) { say(t("shell:code.tooLong", { max: CODE_MAX })); s.focus(); return; }
    const found = newSecrets(text, saved);
    if (!found.length) { finish(text); return; }
    // l'écriture montre le texte qui sera enregistré : numéros, points rouges et sélection tombent juste (revue, B2)
    if (s.text() !== text) s.view.dispatch({ changes: { from: 0, to: s.view.state.doc.length, insert: text } });
    setWarn({ text, found });
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const toWarn = (last: boolean): void => {
    const all = box.current ? Array.from(box.current.querySelectorAll<HTMLElement>(".code-warn-panel button")) : [];
    const target = last ? all[all.length - 1] : box.current ? box.current.querySelector<HTMLElement>(".code-warn-panel .pbtn.primary") : null;
    if (target) target.focus({ preventScroll: true });
  };

  // L'ouverture : CodeMirror dans la zone du code, là où l'on lisait ; la barre apprend qu'une écriture est ouverte.
  useLayoutEffect(() => {
    const el = cm.current;
    if (!el) return undefined;
    const p = latest.current;
    const opened = layout({ w: p.w, h: p.h, size: p.size, font: p.font, numbers: p.numbers, text: p.initial, wrap: p.wrap }, p.first);
    const s = openEditor(el, {
      text: p.initial, language: p.language, highlight: p.highlight, numbers: p.numbers, wrap: p.wrap, cols: opened.cols, lh: opened.lh, label: p.label,
      at: openingOf(p.initial, opened),
    }, {
      onSave: () => commitRef.current(),
      onEscape: () => { if (!warnRef.current) return false; setWarn(null); return true; },
      onTab: (back) => { if (!warnRef.current) return false; toWarn(back); return true; },
      onDoc: (text) => {
        value.current = text;
        setLines(text.split("\n").length);
        if (warnRef.current) setWarn(null);
        writing.update(p.writingKey, { dirty: text !== p.initial });
      },
      onSearch: (search) => writing.update(p.writingKey, { search }),
      onTooLong: () => say(t("shell:code.tooLong", { max: CODE_MAX })),
      schedule: (fn, ms) => { const timer = window.setTimeout(fn, ms); return () => window.clearTimeout(timer); },
      max: CODE_MAX,
    });
    session.current = s;
    debug.noteEditor(s.view);
    // ouvert avec l'avertissement (un collage) : le focus est à lui, pas au texte (audit du 2026-10-15, P1)
    if (warnRef.current) window.requestAnimationFrame(() => toWarn(false));
    writing.open({
      key: p.writingKey, draft: p.draft, size: p.size, font: p.font, wrap: p.wrap, dirty: false, search: CLOSED,
      actions: {
        save: () => commitRef.current(),
        abandon: () => finish(null),
        setSize: (next) => setLive(next),
        setFont: (next) => latest.current.onFont(next),
        setWrap: (next) => latest.current.onWrap(next),
        search: s.search,
        focus: () => s.focus(),
        element: () => box.current,
      },
    });
    return () => {
      writing.close(p.writingKey);
      if (debug.editor() === s.view) debug.noteEditor(null);
      leaveRef.current(s);
      s.destroy();
      session.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Démonté sans fin (la toile ne monte que ce qui se voit, lot 13) : enregistré comme quitté, sauf s'il porte une valeur
  // sensible nouvelle non vue (jamais enregistrée en silence) ou s'il est trop long : rendu à la page (`onLeave`), qui le
  // garde en attente et le dit ; jamais perdu (revue, M1). Un brouillon s'abandonne (la page le dit).
  const leave = (s: EditorSession): void => {
    if (finished.current) return;
    finished.current = true;
    const p = latest.current, text = normalizeCode(s.text()), top = s.topLine(l.lh);
    if (!(p.saveOnLeave ?? true)) { p.onDone(null, "plain", 0, top); return; }
    if ((newSecrets(text, saved).length || text.length > CODE_MAX) && p.onLeave) { p.onLeave(text); return; }
    p.onDone(text.trim() ? text : null, "plain", 0, top);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  // La géométrie suit la boîte, la taille, la police, les numéros et le retour à la ligne : mêmes mesures que la lecture.
  useLayoutEffect(() => {
    setVars(cm.current, {
      "--cm-top": CODE.HEAD + "px", "--cm-left": CODE.RAIL + "px", "--cm-w": w - CODE.RAIL + "px", "--cm-h": h - CODE.HEAD - l.foot + "px",
      "--cm-fs": size + "px", "--cm-lh": l.lh + "px", "--cm-gw": (numbers ? l.gutter : CODE.LEFT) + "px", "--cm-pad": CODE.PAD + "px",
      // `cols` caractères et une demi-colonne de jeu : les arrondis du navigateur ne décident jamais d'une coupure
      "--cm-wrapw": (l.cols + 0.5) * l.cw + "px",
    });
    if (cm.current) cm.current.classList.toggle("no-numbers", !numbers);
    if (session.current) { session.current.setGeometry({ cols: l.cols, wrap }); }
  }, [w, h, size, numbers, wrap, l.cols, l.lh, l.gutter, l.foot, l.cw, lines]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session.current) session.current.setLanguage(language, highlight); }, [language, highlight]);
  useEffect(() => { if (session.current) session.current.measure(); }, [zoom]);
  useEffect(() => { writing.update(props.writingKey, { size, font, wrap }); }, [props.writingKey, size, font, wrap]);
  // la taille vivante s'écrit après la rafale ; revenue de la page, elle n'est plus « vivante »
  useEffect(() => {
    if (live === null) return undefined;
    if (live === props.size) { setLive(null); return undefined; }
    const timer = window.setTimeout(() => latest.current.onSize(live), SIZE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [live, props.size]);

  // Ctrl + molette dans l'écriture : la taille du code (hors écriture, elle reste le zoom de la toile).
  useEffect(() => {
    const el = cm.current;
    if (!el) return undefined;
    let acc = 0;
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); event.stopPropagation();
      const step = wheelSteps(acc, event.deltaY, event.deltaMode);
      acc = step.acc;
      if (step.steps) setLive((now) => { let next = now ?? latest.current.size; for (let i = 0; i < Math.abs(step.steps); i += 1) next = stepSize(next, step.steps > 0 ? 1 : -1); return next; });
    };
    el.addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", wheel, { capture: true });
  }, []);
  // Un clic dehors (ni l'écriture, ni la barre et ses volets, ni l'avertissement) enregistre.
  useEffect(() => {
    const down = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target || !target.closest || target.closest(INSIDE) || warnRef.current) return;
      commitRef.current();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  return (
    <div ref={box} className={"code-editor cf-" + font} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
      <div ref={cm} className="code-cm nodrag nopan nowheel" data-writing={props.writingKey} onKeyDown={(event) => event.stopPropagation()} />
      {warn ? (
        <CodeWarn text={warn.text} found={warn.found} infrastructure={props.infrastructure} width={w}
          onGo={(f) => { if (session.current) session.current.select(f.line, f.start, f.end); }}
          onRemove={() => finish(maskSecrets(warn.text, warn.found), "removed", warn.found.length)}
          onKeep={() => finish(warn.text, "kept", 0)} onEdit={() => { const f = warn.found[0]; setWarn(null); window.requestAnimationFrame(() => { if (session.current) session.current.select(f.line, f.start, f.end); }); }}
          onClose={() => { setWarn(null); if (session.current) session.current.focus(); }} />
      ) : null}
    </div>
  );
}

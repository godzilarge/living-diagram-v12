// L'écriture en place d'un bloc de code (lot 16 de docs/11) : un `textarea` à chasse fixe posé sur la zone du code, la
// gouttière des numéros gardée et défilant avec lui ; il s'ouvre là où l'on lisait (le curseur sur la première ligne
// visible). Ctrl+Entrée enregistre, Échap annule, Tab insère quatre espaces, un clic dehors enregistre. Rien n'est
// enregistré sans que les valeurs sensibles aient été vues : l'avertissement (code-warn.tsx) s'ouvre à côté du bloc,
// liste chaque valeur avec sa ligne et sa nature, un point rouge dans la gouttière ; « Retirer ces valeurs »,
// « Garder tel quel » ou « Modifier le texte ». Les dimensions libres passent par des variables CSS posées par le CSSOM,
// jamais par un style en ligne. Revue du 2026-10-15 : seules les valeurs **nouvelles** par rapport au texte enregistré
// sont signalées (une valeur gardée ne se redemande pas) ; un champ démonté avec une valeur nouvelle non vue rend son
// texte à la page, qui le garde en attente (M1) ; un texte trop long garde le champ ouvert (M2) ; le texte est remis à
// sa forme normalisée avant l'avertissement, pour que lignes et sélection tombent juste (B2).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent } from "react";
import { t } from "../../i18n";
import { CODE, editorGutter, lineHeight, offsetOfLine } from "../code/geometry";
import { cleanTyped, normalizeCode } from "../code/languages";
import { maskSecrets, newSecrets } from "../code/secrets";
import type { Secret } from "../code/secrets";
import { CODE_MAX } from "../state/code-commands";
import type { CodeOutcome } from "../state/code-commands";
import { useCode } from "./code";
import { CodeWarn } from "./code-warn";

export interface EditorProps {
  /** La boîte (unités du dessin) ; le champ couvre tout sous l'en-tête. */
  w: number; h: number; size: number; font: string; numbers: boolean;
  /** Le texte de départ et la première ligne lue (l'écriture s'ouvre là) ; `saved` : le texte enregistré (vide pour un
   *  brouillon), les valeurs qu'il porte déjà ne sont pas redemandées. */
  initial: string; saved?: string; first: number; label: string; infrastructure: string;
  /** Ouvre l'avertissement tout de suite (un collage qui porte des valeurs sensibles, une écriture en attente). */
  warnAtOnce?: boolean;
  /** Démonté sans fin, le texte s'enregistre (un bloc sorti du champ) ; un brouillon, lui, s'abandonne. */
  saveOnLeave?: boolean;
  /** Démonté sans fin avec une valeur nouvelle jamais vue : le texte, rendu à la page (qui le garde en attente). */
  onLeave?: (text: string) => void;
  /** `null` : abandon ; sinon le texte vu, et ce qui en a été fait. */
  onDone: (text: string | null, outcome: CodeOutcome, removed: number) => void;
}

const setVars = (el: HTMLElement | null, vars: Record<string, string>): void => { if (el) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); };

export function CodeEditor({ w, h, size, font, numbers, initial, saved = "", first, label, infrastructure, warnAtOnce = false, saveOnLeave = true, onLeave, onDone }: EditorProps) {
  const area = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null);
  const { commands } = useCode();
  const [warn, setWarn] = useState<{ text: string; found: Secret[] } | null>(() => {
    if (!warnAtOnce) return null;
    const text = normalizeCode(initial), found = newSecrets(text, saved);
    return found.length ? { text, found } : null;
  });
  const [lines, setLines] = useState(() => initial.split("\n").length);
  const finished = useRef(false), value = useRef(initial), latest = useRef(onDone), leave = useRef(onLeave);
  latest.current = onDone;
  leave.current = onLeave;
  const lh = lineHeight(size), total = Math.max(lines, 1);
  const flagged = new Set(warn ? warn.found.map((f) => f.line) : []);
  // la gouttière s'élargit du point rouge quand une ligne est marquée (il ne touche plus un numéro à deux chiffres)
  const gutterW = numbers ? editorGutter(total, size, font, flagged.size > 0) : 0;
  const finish = (text: string | null, outcome: CodeOutcome = "plain", removed = 0): void => {
    if (finished.current) return;
    finished.current = true;
    latest.current(text, outcome, removed);
  };
  // Démonté sans fin (la toile ne monte que ce qui se voit, lot 13) : enregistré comme quitté, sauf s'il porte une valeur
  // sensible nouvelle non vue (jamais enregistrée en silence) : le texte est rendu à la page (`onLeave`), qui le garde en
  // attente et le dit ; jamais perdu (revue, M1). Un brouillon s'abandonne (la page le dit). Décidé une micro-tâche plus
  // tard : le mode strict de React (développement) démonte et remonte aussitôt chaque effet ; un éditeur remonté n'a pas fini.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current || finished.current) return;
        finished.current = true;
        const text = normalizeCode(value.current);
        if (!saveOnLeave) { latest.current(null, "plain", 0); return; }
        // (de même un texte trop long : refusé à l'enregistrement, il serait perdu ; il attend, et se dit au retour)
        if ((newSecrets(text, saved).length || text.length > CODE_MAX) && leave.current) { leave.current(text); return; }
        latest.current(text.trim() ? text : null, "plain", 0);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setVars(box.current, { "--ce-top": CODE.HEAD + "px", "--ce-h": Math.max(lh * 3, h - CODE.HEAD) + "px", "--ce-fs": size + "px", "--ce-lh": lh + "px",
      "--ce-pl": (numbers ? CODE.RAIL + gutterW : CODE.LEFT) + "px", "--ce-py": CODE.PAD + "px", "--ce-gw": gutterW + "px", "--ce-gl": CODE.RAIL + "px" });
  }, [h, size, lh, numbers, gutterW]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    // ouvert avec l'avertissement (un collage) : le focus est à lui (il l'a pris en se montant), pas au champ (audit du
    // 2026-10-15, P1 : l'effet du parent passait après celui de l'enfant et le reprenait)
    if (warn) return;
    const at = offsetOfLine(el.value, first);
    el.focus({ preventScroll: true });
    el.setSelectionRange(at, at);
    el.scrollTop = first * lh;
    sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sync = (): void => {
    const el = area.current;
    if (el) setVars(gutter.current, { "--gs": -el.scrollTop + "px" });
  };
  /** Le champ remis à un texte (normalisé, ou nettoyé d'un dépôt), le curseur gardé à sa place relative. */
  const replace = (el: HTMLTextAreaElement, text: string, caret: number): void => {
    el.value = text;
    el.setSelectionRange(caret, caret);
    value.current = text;
    setLines(text.split("\n").length);
  };
  const tooLong = (): void => { if (commands) commands.codeSay(t("shell:code.tooLong", { max: CODE_MAX })); };
  const commit = (): void => {
    const el = area.current;
    if (!el || finished.current) return;
    const text = normalizeCode(el.value);
    if (!text.trim()) { finish(null); return; }
    // trop long : le champ reste ouvert avec ce qui a été écrit, la page le dit (revue, M2)
    if (text.length > CODE_MAX) { tooLong(); el.focus({ preventScroll: true }); return; }
    const found = newSecrets(text, saved);
    if (found.length) {
      // le champ montre le texte qui sera enregistré : numéros, points rouges et sélection tombent juste (revue, B2)
      if (el.value !== text) replace(el, text, Math.min(el.selectionStart, text.length));
      setWarn({ text, found });
      return;
    }
    finish(text);
  };
  const select = (f: Secret): void => {
    const el = area.current;
    if (!el) return;
    const lines = el.value.split("\n");
    if (f.line >= lines.length) { el.focus(); return; }
    const at = offsetOfLine(el.value, f.line) + f.start;
    el.focus({ preventScroll: true });
    el.setSelectionRange(at, Math.min(at + (f.end - f.start), at + lines[f.line].length - f.start));
    el.scrollTop = Math.max(0, f.line * lh - el.clientHeight / 3);
    sync();
  };
  const toWarn = (last: boolean): void => {
    const all = box.current ? Array.from(box.current.querySelectorAll<HTMLElement>(".code-warn-panel button")) : [];
    const target = last ? all[all.length - 1] : box.current ? box.current.querySelector<HTMLElement>(".code-warn-panel .pbtn.primary") : null;
    if (target) target.focus({ preventScroll: true });
  };
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (warn) setWarn(null); else finish(null); return; }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); return; }
    // l'avertissement ouvert, Tab n'écrit rien dans le texte : il va à l'avertissement (son choix d'abord)
    if (event.key === "Tab" && warn) { event.preventDefault(); toWarn(event.shiftKey); return; }
    if (event.key === "Tab" && !event.shiftKey) { event.preventDefault(); event.currentTarget.setRangeText("    ", event.currentTarget.selectionStart, event.currentTarget.selectionEnd, "end"); value.current = event.currentTarget.value; }
  };
  const paste = (event: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    const raw = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget, text = normalizeCode(raw);
    if (el.value.length - (el.selectionEnd - el.selectionStart) + text.length > CODE_MAX) { tooLong(); return; }
    el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
    value.current = el.value;
    setLines(el.value.split("\n").length);
  };
  // un texte déposé (glisser-déposer contourne le collage) ou tapé : tabulations, CR et caractères interdits nettoyés
  // tout de suite, les colonnes restent justes (revue, B2 et B4)
  const changed = (el: HTMLTextAreaElement): void => {
    const raw = el.value, clean = cleanTyped(raw);
    if (clean !== raw) replace(el, clean, cleanTyped(raw.slice(0, el.selectionStart)).length);
    else value.current = raw;
    const n = el.value.split("\n").length;
    if (n !== lines) setLines(n);
    if (warn) setWarn(null);
  };
  return (
    <div ref={box} className={"code-editor cf-" + font} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
      <div className="code-edit-hint" aria-hidden="true">
        <kbd>{t("shell:code.keySave")}</kbd> {t("shell:code.hintSave")} <kbd>{t("shell:code.keyCancel")}</kbd> {t("shell:code.hintCancel")} <kbd>Tab</kbd> {t("shell:code.hintTab")}
      </div>
      {numbers ? (
        <div className="code-edit-gutter" aria-hidden="true">
          <div ref={gutter} className="code-edit-nums">{Array.from({ length: total }, (_, i) => <div key={i} className={flagged.has(i) ? "flag" : undefined}>{i + 1}</div>)}</div>
        </div>
      ) : null}
      <textarea ref={area} className="code-edit nodrag nopan nowheel" defaultValue={initial} aria-label={label} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
        maxLength={CODE_MAX} onKeyDown={keys} onScroll={sync} onPaste={paste} onChange={(event) => changed(event.target)}
        onBlur={(event) => { const to = event.relatedTarget as Node | null; if (warn || (to && box.current && box.current.contains(to))) return; commit(); }} />
      {warn ? (
        <CodeWarn text={warn.text} found={warn.found} infrastructure={infrastructure} width={w}
          onGo={select} onRemove={() => finish(maskSecrets(warn.text, warn.found), "removed", warn.found.length)}
          onKeep={() => finish(warn.text, "kept", 0)} onEdit={() => { const f = warn.found[0]; setWarn(null); window.requestAnimationFrame(() => select(f)); }}
          onClose={() => { setWarn(null); if (area.current) area.current.focus(); }} />
      ) : null}
    </div>
  );
}

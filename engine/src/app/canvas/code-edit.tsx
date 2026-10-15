// L'écriture en place d'un bloc de code (lot 16 de docs/11) : un `textarea` à chasse fixe posé sur la zone du code, la
// gouttière des numéros gardée et défilant avec lui ; il s'ouvre là où l'on lisait (le curseur sur la première ligne
// visible). Ctrl+Entrée enregistre, Échap annule, Tab insère quatre espaces, un clic dehors enregistre. Rien n'est
// enregistré sans que les valeurs sensibles aient été vues : l'avertissement (code-warn.tsx) s'ouvre à côté du bloc,
// liste chaque valeur avec sa ligne et sa nature, un point rouge dans la gouttière ; « Retirer ces valeurs »,
// « Garder tel quel » ou « Modifier le texte ». Les dimensions libres passent par des variables CSS posées par le CSSOM,
// jamais par un style en ligne.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent } from "react";
import { t } from "../../i18n";
import { CODE, charWidth, lineHeight, offsetOfLine } from "../code/geometry";
import { normalizeCode } from "../code/languages";
import { findSecrets, maskSecrets } from "../code/secrets";
import type { Secret } from "../code/secrets";
import type { CodeOutcome } from "../state/code-commands";
import { CodeWarn } from "./code-warn";

export interface EditorProps {
  /** La boîte (unités du dessin) ; le champ couvre tout sous l'en-tête. */
  w: number; h: number; size: number; font: string; numbers: boolean;
  /** Le texte de départ et la première ligne lue (l'écriture s'ouvre là). */
  initial: string; first: number; label: string; infrastructure: string;
  /** Ouvre l'avertissement tout de suite (un collage qui porte des valeurs sensibles). */
  warnAtOnce?: boolean;
  /** Démonté sans fin, le texte s'enregistre (un bloc sorti du champ) ; un brouillon, lui, s'abandonne. */
  saveOnLeave?: boolean;
  /** `null` : abandon ; sinon le texte vu, et ce qui en a été fait. */
  onDone: (text: string | null, outcome: CodeOutcome, removed: number) => void;
}

const setVars = (el: HTMLElement | null, vars: Record<string, string>): void => { if (el) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); };

export function CodeEditor({ w, h, size, font, numbers, initial, first, label, infrastructure, warnAtOnce = false, saveOnLeave = true, onDone }: EditorProps) {
  const area = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null);
  const [warn, setWarn] = useState<{ text: string; found: Secret[] } | null>(() => {
    if (!warnAtOnce) return null;
    const text = normalizeCode(initial), found = findSecrets(text);
    return found.length ? { text, found } : null;
  });
  const [lines, setLines] = useState(() => initial.split("\n").length);
  const finished = useRef(false), value = useRef(initial), latest = useRef(onDone);
  latest.current = onDone;
  const lh = lineHeight(size), total = Math.max(lines, 1);
  const gutterW = numbers ? Math.ceil(String(total).length * charWidth(size, font) + 2 * CODE.GUTTER) : 0;
  const finish = (text: string | null, outcome: CodeOutcome = "plain", removed = 0): void => {
    if (finished.current) return;
    finished.current = true;
    latest.current(text, outcome, removed);
  };
  // Démonté sans fin (la toile ne monte que ce qui se voit, lot 13) : enregistré comme quitté, sauf s'il porte une valeur
  // sensible non vue (jamais enregistrée en silence) ; alors rien ne s'écrit et la page le dit.
  useEffect(() => () => {
    if (finished.current) return;
    finished.current = true;
    const text = normalizeCode(value.current);
    latest.current(!saveOnLeave || findSecrets(text).length ? null : text, "plain", 0);
  }, []);
  useLayoutEffect(() => {
    setVars(box.current, { "--ce-top": CODE.HEAD + "px", "--ce-h": Math.max(lh * 3, h - CODE.HEAD) + "px", "--ce-fs": size + "px", "--ce-lh": lh + "px",
      "--ce-pl": (numbers ? CODE.RAIL + gutterW : CODE.LEFT) + "px", "--ce-py": CODE.PAD + "px", "--ce-gw": gutterW + "px", "--ce-gl": CODE.RAIL + "px" });
  }, [h, size, lh, numbers, gutterW]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    if (warn) { el.focus({ preventScroll: true }); return; }
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
  const commit = (): void => {
    const el = area.current;
    if (!el || finished.current) return;
    const text = normalizeCode(el.value);
    if (!text.trim()) { finish(null); return; }
    const found = findSecrets(text);
    if (found.length) { setWarn({ text, found }); return; }
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
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (warn) setWarn(null); else finish(null); return; }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); return; }
    if (event.key === "Tab" && !event.shiftKey) { event.preventDefault(); event.currentTarget.setRangeText("    ", event.currentTarget.selectionStart, event.currentTarget.selectionEnd, "end"); value.current = event.currentTarget.value; }
  };
  const paste = (event: ReactClipboardEvent<HTMLTextAreaElement>): void => {
    const raw = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    el.setRangeText(normalizeCode(raw), el.selectionStart, el.selectionEnd, "end");
    value.current = el.value;
    setLines(el.value.split("\n").length);
  };
  const flagged = new Set(warn ? warn.found.map((f) => f.line) : []);
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
        onKeyDown={keys} onScroll={sync} onPaste={paste}
        onChange={(event) => { value.current = event.target.value; const n = event.target.value.split("\n").length; if (n !== lines) setLines(n); if (warn) setWarn(null); }}
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

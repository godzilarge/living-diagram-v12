// La fiche d'un bloc de code (lot 16 de docs/11), les parties propres à la sorte, dans la fiche d'annotation : l'alerte
// des valeurs sensibles gardées (et « Retirer ces valeurs »), le titre, le code **en entier** coloré par les mêmes
// familles que la toile (des `span` à classes, jamais du HTML), copier ; puis « Affichage » (repliée) : langage,
// police, coloration, numéros, retour à la ligne (lot 16 bis), hauteur de la boîte (et « ajuster au contenu »), taille
// libre de 8 à 64. Les mêmes réglages que la barre
// contextuelle (parité). Sans nom, tout se lit.
import { Check, Copy, Eraser, MoveVertical, ShieldAlert } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Annotation } from "../../../canvas/types";
import type { CodeContent } from "../../../contracts/intent";
import { CODE, CODE_SIZE, fitHeightOf, lineCount, lineWindow, minHeight } from "../../code/geometry";
import { LANGUAGES, LANGUAGE_LABEL } from "../../code/languages";
import { withSecrets } from "../../code/secrets";
import type { Secret } from "../../code/secrets";
import { secretTitle, shieldTitle } from "../../code/secret-tip";
import { linesOf } from "../../code/tokens";
import type { Line } from "../../code/tokens";
import { secretsIn, useCopied } from "../../canvas/code";
import { useStore } from "../../state/store";
import { NumberField, Row, Section, Segmented, Select, TextInput } from "../../ui/inspector";
import { FontList } from "../CodeVolets";

/** La hauteur d'une ligne du code dans la fiche (`.insp-code pre`, 12/19) ; au-delà de `WINDOW_FROM` lignes, seules
 *  les lignes visibles sont rendues (audit du 2026-10-15 : un bloc de 2 000 lignes coûtait 8 000 éléments et une tâche
 *  de 160 à 240 ms à l'ouverture de la fiche). */
const LINE_PX = 19, WINDOW_FROM = 200;

/** Le code de la fiche, coloré par les familles de la toile ; une valeur sensible gardée dit au survol sa nature et qui
 *  la lit (`title`, jamais la valeur). Fenêtré au-delà de `WINDOW_FROM` lignes. */
function CodeLines({ lines, colored, secrets, infrastructure, label }: { lines: Line[]; colored: boolean; secrets: Secret[]; infrastructure: string; label: string }) {
  const pre = useRef<HTMLPreElement>(null);
  const [top, setTop] = useState(0);
  const windowed = lines.length > WINDOW_FROM;
  const view = windowed ? lineWindow(lines.length, top * LINE_PX, pre.current ? pre.current.clientHeight : 300, LINE_PX) : { from: 0, to: lines.length, before: 0, after: 0 };
  useLayoutEffect(() => {
    const el = pre.current;
    if (!el) return;
    el.style.setProperty("--ln-before", view.before + "px");
    el.style.setProperty("--ln-after", view.after + "px");
    // la colonne des numéros : un chiffre de marge devant le plus long (« 1000 » ne colle plus au bord)
    el.style.setProperty("--ln-digits", String(Math.max(4, String(lines.length).length + 1)));
    if (windowed) el.style.setProperty("--ln-cols", String(lines.reduce((m, l) => Math.max(m, l.reduce((k, seg) => k + seg.t.length, 0)), 0)));
  }, [view.before, view.after, windowed, lines]);
  const secretAt = (line: number, offset: number): Secret | undefined => secrets.find((f) => f.line === line && offset >= f.start && offset < f.end);
  return (
    <pre ref={pre} tabIndex={0} aria-label={label} className={windowed ? "windowed" : undefined} onScroll={windowed ? (event) => setTop(Math.floor(event.currentTarget.scrollTop / LINE_PX)) : undefined}>
      {windowed ? <span className="ln-pad before" aria-hidden="true" /> : null}
      {lines.slice(view.from, view.to).map((segs, k) => {
        const i = view.from + k;
        let offset = 0;
        return (
          <span key={i} className="ln" data-n={i + 1}>{segs.map((seg, j) => {
            const at = offset;
            offset += seg.t.length;
            const found = seg.c === "secret" ? secretAt(i, at) : undefined;
            return <span key={j} className={seg.c && (colored || seg.c === "masked" || seg.c === "secret") ? "tk-" + seg.c : undefined} title={found ? secretTitle(found, infrastructure) : undefined}>{seg.t}</span>;
          })}{"\n"}</span>
        );
      })}
      {windowed ? <span className="ln-pad after" aria-hidden="true" /> : null}
    </pre>
  );
}

/** Le titre de la fiche : le titre du bloc, sinon « Bloc sans titre ». */
export const codeTitle = (c: CodeContent, untitled: string): string => c.title || untitled;

/** Le contenu : l'alerte, le titre, le code entier et copier. */
export function CodeContentRows({ a, c, canWrite }: { a: Annotation; c: CodeContent; canWrite: boolean }) {
  const { commands, state } = useStore();
  const { t } = useTranslation("panel");
  const copied = useCopied() === a.id;
  const secrets = secretsIn(c.text), total = lineCount(c.text);
  const colored = c.highlight && c.language !== "plain";
  // par le cache des lignes (la fiche se redessine à chaque action du store : revue du lot 16, B3)
  const lines = withSecrets(linesOf(a.id + "-card", c.text, c.language, colored), secrets);
  return (
    <>
      {secrets.length ? (
        <div className="insp-warn" role="status">
          <span className="insp-warn-icon" title={shieldTitle(secrets, state.address.infrastructure)}><ShieldAlert aria-hidden="true" /></span>
          <span>{t("code.secretsVisible", { count: secrets.length, infrastructure: state.address.infrastructure })}{" "}
            {canWrite ? <button type="button" className="insp-btn" onClick={() => commands.codeRemoveSecrets(a.id)}><Eraser aria-hidden="true" />{t("code.removeValues", { count: secrets.length })}</button> : null}
          </span>
        </div>
      ) : null}
      {canWrite ? <Row label={t("code.title")}><TextInput value={c.title} max={80} label={t("code.titleLabel")} placeholder={t("code.titlePlaceholder")} onCommit={(title) => commands.codeSet([a.id], { title: title.trim() })} /></Row> : null}
      <div className={"insp-code cf-" + c.font}>
        <div className="insp-code-head">
          <span>{t("code.meta", { language: LANGUAGE_LABEL[c.language] || c.language, count: total })}</span><span className="grow" />
          <button type="button" className="insp-btn" onClick={() => commands.codeCopy(a.id)}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? t("code.copied") : t("code.copy")}</button>
        </div>
        <CodeLines lines={lines} colored={colored} secrets={secrets} infrastructure={state.address.infrastructure} label={t("code.codeLabel", { count: total })} />
      </div>
    </>
  );
}

/** « Affichage » : les réglages de la barre, plus la hauteur de la boîte. */
export function CodeDisplay({ a, c }: { a: Annotation; c: CodeContent }) {
  const { commands, state } = useStore();
  const { t } = useTranslation("panel");
  // la hauteur saisie suit les bornes des poignées : jamais sous trois lignes ; sur la grille seulement si l'aimant est
  // mis (règle du lot 8 ; revue du lot 16, B5)
  const low = minHeight(a.style.text_size);
  const height = (h: number): number => Math.max(low, state.prefs.snap ? Math.round(h / CODE.GRID) * CODE.GRID : Math.round(h));
  const set = (patch: Parameters<typeof commands.codeSet>[1]): void => commands.codeSet([a.id], patch);
  const fit = fitHeightOf({ w: a.w, size: a.style.text_size, font: c.font, numbers: c.line_numbers, text: c.text, wrap: c.wrap });
  return (
    <Section title={t("code.display")} collapsible defaultOpen={false}>
      <Row label={t("code.language")}><Select label={t("code.language")} value={c.language} options={LANGUAGES.map((l) => ({ value: l.id, label: LANGUAGE_LABEL[l.id] }))} onChange={(language) => set({ language: language as CodeContent["language"] })} /></Row>
      <Row label={t("code.font")} stack><FontList value={c.font} inVolet={false} onPick={(font) => set({ font: font as CodeContent["font"] })} /></Row>
      {c.language !== "plain" ? <Row label={t("code.highlight")}><Segmented label={t("code.highlight")} value={c.highlight ? "on" : "off"} options={[{ value: "on", label: t("code.highlightOn") }, { value: "off", label: t("code.highlightOff") }]} onPick={(v) => set({ highlight: v === "on" })} /></Row> : null}
      <Row label={t("code.numbers")}><Segmented label={t("code.numbers")} value={c.line_numbers ? "on" : "off"} options={[{ value: "on", label: t("code.numbersOn") }, { value: "off", label: t("code.numbersOff") }]} onPick={(v) => set({ line_numbers: v === "on" })} /></Row>
      <Row label={t("code.wrap")}><Segmented label={t("code.wrap")} value={c.wrap ? "on" : "off"} options={[{ value: "on", label: t("code.wrapOn") }, { value: "off", label: t("code.wrapOff") }]} onPick={(v) => set({ wrap: v === "on" })} /></Row>
      <Row label={t("code.height")}>
        <span className="insp-fit-row">
          <NumberField label={t("code.heightLabel")} value={a.h} min={low} max={4000} step={CODE.GRID} unit="px" onCommit={(h) => { const next = height(h); if (next !== a.h) commands.annotationUpdate(a.id, { h: next }); }} />
          {a.h !== fit ? <button type="button" className="pbtn ghost insp-fit" title={t("code.fitTitle")} onClick={() => commands.codeFit([a.id])}><MoveVertical aria-hidden="true" />{t("code.fit")}</button> : null}
        </span>
      </Row>
      <Row label={t("code.size")}><NumberField label={t("code.sizeLabel")} value={a.style.text_size} min={CODE_SIZE[0]} max={CODE_SIZE[1]} unit="px" onCommit={(text_size) => commands.annotationUpdate(a.id, { style: { text_size } })} /></Row>
    </Section>
  );
}

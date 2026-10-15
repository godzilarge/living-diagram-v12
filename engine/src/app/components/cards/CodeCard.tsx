// La fiche d'un bloc de code (lot 16 de docs/11), les parties propres à la sorte, dans la fiche d'annotation : l'alerte
// des valeurs sensibles gardées (et « Retirer ces valeurs »), le titre, le code **en entier** coloré par les mêmes
// familles que la toile (des `span` à classes, jamais du HTML), copier ; puis « Affichage » (repliée) : langage,
// police, coloration, numéros, hauteur de la boîte (et « ajuster au contenu »), taille. Les mêmes réglages que la barre
// contextuelle (parité). Sans nom, tout se lit.
import { Check, Copy, Eraser, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Annotation } from "../../../canvas/types";
import type { CodeContent } from "../../../contracts/intent";
import { CODE_SIZE, fitHeight, lineCount } from "../../code/geometry";
import { LANGUAGES, LANGUAGE_LABEL } from "../../code/languages";
import { withSecrets } from "../../code/secrets";
import { codeLines } from "../../code/tokens";
import { secretsIn, useCopied } from "../../canvas/code";
import { useStore } from "../../state/store";
import { NumberField, Row, Section, Segmented, Select, TextInput } from "../../ui/inspector";
import { FontList } from "../CodeVolets";

/** Le titre de la fiche : le titre du bloc, sinon « Bloc sans titre ». */
export const codeTitle = (c: CodeContent, untitled: string): string => c.title || untitled;

/** Le contenu : l'alerte, le titre, le code entier et copier. */
export function CodeContentRows({ a, c, canWrite }: { a: Annotation; c: CodeContent; canWrite: boolean }) {
  const { commands, state } = useStore();
  const { t } = useTranslation("panel");
  const copied = useCopied() === a.id;
  const secrets = secretsIn(c.text), total = lineCount(c.text);
  const colored = c.highlight && c.language !== "plain";
  const lines = withSecrets(codeLines(c.text, c.language, colored), secrets);
  return (
    <>
      {secrets.length ? (
        <div className="insp-warn" role="status">
          <ShieldAlert aria-hidden="true" />
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
        <pre tabIndex={0} aria-label={t("code.codeLabel", { count: total })}>
          {lines.map((segs, i) => (
            <span key={i} className="ln">{segs.map((s, k) => <span key={k} className={s.c && (colored || s.c === "masked" || s.c === "secret") ? "tk-" + s.c : undefined}>{s.t}</span>)}{"\n"}</span>
          ))}
        </pre>
      </div>
    </>
  );
}

/** « Affichage » : les réglages de la barre, plus la hauteur de la boîte. */
export function CodeDisplay({ a, c }: { a: Annotation; c: CodeContent }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const set = (patch: Parameters<typeof commands.codeSet>[1]): void => commands.codeSet([a.id], patch);
  const fit = fitHeight(lineCount(c.text), a.style.text_size);
  return (
    <Section title={t("code.display")} collapsible defaultOpen={false}>
      <Row label={t("code.language")}><Select label={t("code.language")} value={c.language} options={LANGUAGES.map((l) => ({ value: l.id, label: LANGUAGE_LABEL[l.id] }))} onChange={(language) => set({ language: language as CodeContent["language"] })} /></Row>
      <Row label={t("code.font")} stack><FontList value={c.font} inVolet={false} onPick={(font) => set({ font: font as CodeContent["font"] })} /></Row>
      {c.language !== "plain" ? <Row label={t("code.highlight")}><Segmented label={t("code.highlight")} value={c.highlight ? "on" : "off"} options={[{ value: "on", label: t("code.highlightOn") }, { value: "off", label: t("code.highlightOff") }]} onPick={(v) => set({ highlight: v === "on" })} /></Row> : null}
      <Row label={t("code.numbers")}><Segmented label={t("code.numbers")} value={c.line_numbers ? "on" : "off"} options={[{ value: "on", label: t("code.numbersOn") }, { value: "off", label: t("code.numbersOff") }]} onPick={(v) => set({ line_numbers: v === "on" })} /></Row>
      <Row label={t("code.height")}>
        <span className="insp-fit-row">
          <NumberField label={t("code.heightLabel")} value={a.h} min={80} max={4000} step={20} unit="px" onCommit={(h) => commands.annotationUpdate(a.id, { h })} />
          {a.h !== fit ? <button type="button" className="insp-btn insp-fit" onClick={() => commands.codeFit([a.id])}>{t("code.fit")}</button> : null}
        </span>
      </Row>
      <Row label={t("code.size")}><NumberField label={t("code.sizeLabel")} value={a.style.text_size} min={CODE_SIZE[0]} max={CODE_SIZE[1]} unit="px" onCommit={(text_size) => commands.annotationUpdate(a.id, { style: { text_size } })} /></Row>
    </Section>
  );
}

// Les choix d'un bloc de code (lot 16 de docs/11) que la barre contextuelle et la fiche partagent : la liste des
// polices (chacune dans son propre rendu : son nom, puis un échantillon qui départage 0 / O, 1 / l / I) et la liste des
// langages (le code, puis la configuration réseau ; la détection propose le langage du contenu quand il en diffère, avec
// « appliquer »). Rien ne s'écrit ici : chaque choix remonte (`onPick`), la barre ou la fiche l'exécute.
import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CODE_FONTS, FONT_SAMPLE } from "../code/geometry";
import { LANGUAGES, LANGUAGE_LABEL, detectLanguage } from "../code/languages";

/** Les flèches dans une liste : le focus se déplace, rien ne se choisit. */
function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  event.stopPropagation();
  const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button"));
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next = all[Math.min(all.length - 1, Math.max(0, at + step))];
  if (next) next.focus();
}

export function FontList({ value, onPick, inVolet }: { value: string; onPick: (id: string) => void; inVolet: boolean }) {
  const { t } = useTranslation("panel");
  return (
    <div className={"font-list" + (inVolet ? "" : " insp-fontlist")} role="radiogroup" aria-label={t("code.fontList")} onKeyDown={moveFocus}>
      {CODE_FONTS.map((f) => {
        const on = f.id === value;
        return (
          <button key={f.id} type="button" role="radio" aria-checked={on ? "true" : "false"} tabIndex={on ? 0 : -1} className={"font-item cf-" + f.id} aria-label={f.family} onClick={() => onPick(f.id)}>
            <span className="font-name">{f.family}</span>
            <span className="font-sample" aria-hidden="true">{FONT_SAMPLE}</span>
            <Check className="vcheck" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function LanguageList({ value, text, onPick }: { value: string; text: string; onPick: (id: string) => void }) {
  const { t } = useTranslation("panel");
  const found = detectLanguage(text);
  const suggest = found.id !== value && found.id !== "plain" ? found.id : null;
  const group = (title: string, network: boolean) => (
    <>
      <div className="vgroup-label">{title}</div>
      {LANGUAGES.filter((l) => l.network === network).map((l) => {
        const on = l.id === value;
        return (
          <button key={l.id} type="button" role="radio" aria-checked={on ? "true" : "false"} tabIndex={on ? 0 : -1} className="lang-item" onClick={() => onPick(l.id)}>
            <span>{LANGUAGE_LABEL[l.id]}</span><Check className="vcheck" aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
  return (
    <>
      {suggest ? (
        <div className="vsuggest">
          <span>{t("code.looksLike")} <b>{LANGUAGE_LABEL[suggest]}</b></span><span className="grow" />
          <button type="button" className="vbtn" aria-label={t("code.applyLanguage", { language: LANGUAGE_LABEL[suggest] })} onClick={() => onPick(suggest)}>{t("code.apply")}</button>
        </div>
      ) : null}
      <div className="lang-list" role="radiogroup" aria-label={t("code.language")} onKeyDown={moveFocus}>
        {group(t("code.groupCode"), false)}
        {group(t("code.groupNetwork"), true)}
      </div>
    </>
  );
}

/** Le volet de la barre contextuelle : la légende (le réglage et sa valeur), puis la liste. */
export function CodeVolet({ volet, onPick }: { volet: { kind: "codeLanguage"; value: string; text: string } | { kind: "codeFont"; value: string }; onPick: (value: string) => void }) {
  const { t } = useTranslation("panel");
  const font = CODE_FONTS.find((f) => f.id === volet.value);
  return (
    <>
      <div className="volet-cap"><span>{volet.kind === "codeFont" ? t("code.font") : t("code.language")}</span><b>{volet.kind === "codeFont" ? (font ? font.family : volet.value) : LANGUAGE_LABEL[volet.value] || volet.value}</b></div>
      {volet.kind === "codeFont" ? <FontList value={volet.value} inVolet onPick={onPick} /> : <LanguageList value={volet.value} text={volet.text} onPick={onPick} />}
    </>
  );
}

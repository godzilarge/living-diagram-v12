import { LogoMark } from "../ui";
import { Island } from "../ui";
import { useText } from "../i18n";
import { PrefsControls } from "../shell/PrefsControls";
import { usePrefs } from "../shell/usePrefs";
import { Bars } from "./sections/Bars";
import { Buttons, IconButtons } from "./sections/Controls";
import { Feedback, Tooltips } from "./sections/Feedback";
import { Inputs } from "./sections/Inputs";
import { Surfaces } from "./sections/Surfaces";
import "./page.css";

export function Page() {
  const t = useText();
  const { prefs, language, setPrefs } = usePrefs();
  return (
    <div className="page">
      <Island name="switcher" as="header" layout="panel" className="page-head">
        <div className="page-brand">
          <LogoMark />
          <div>
            <h1>{t("primitives:title")}</h1>
            <p>{t("primitives:subtitle")}</p>
          </div>
        </div>
        <PrefsControls prefs={prefs} language={language} onChange={setPrefs} layout="inline" />
      </Island>
      <Bars />
      <IconButtons />
      <Buttons />
      <Inputs />
      <Feedback />
      <Tooltips />
      <Surfaces />
    </div>
  );
}

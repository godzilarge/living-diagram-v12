// The minimal v2 shell, proof of the pipeline: the top islands (the logo; the tools) rendered from the primitives over
// an empty map. The real surfaces come as bricks (`/brique-ui`), built against design/comps/shell/.
import { Download, Search, Settings } from "lucide-react";
import { Button, IconButton, Island, LogoMark, Popover, Separator, Shortcut } from "../ui";
import { useText } from "../i18n";
import { PrefsControls } from "./PrefsControls";
import { usePrefs } from "./usePrefs";
import "./Shell.css";

export function Shell() {
  const t = useText();
  const { prefs, language, setPrefs } = usePrefs();
  const ctrlK = [t("ui:keys.ctrl"), "K"];
  return (
    <div className="shell">
      <main className="shell-map" aria-label={t("shell:map")} />
      <div className="shell-top shell-top-start">
        <Island name="brand" layout="bar">
          <IconButton label={t("shell:home")} icon={<LogoMark />} tooltipPlacement="bottom-start" />
        </Island>
      </div>
      <div className="shell-top shell-top-end">
        <Island name="tools" layout="bar">
          <Button
            icon={<Search />}
            aria-label={t("shell:search")}
            tooltip={t("shell:searchSoon")}
            shortcut={ctrlK.join(" ")}
            disabled
            className="shell-search"
          >
            <Shortcut keys={ctrlK} />
          </Button>
          <IconButton label={t("shell:export")} icon={<Download />} disabled disabledReason={t("shell:exportSoon")} />
          <Separator />
          <Popover
            name="settings"
            label={t("shell:settings")}
            trigger={(props, open) => (
              <IconButton {...props} label={t("shell:settings")} icon={<Settings />} pressed={open} tooltipPlacement="bottom-end" />
            )}
          >
            <PrefsControls prefs={prefs} language={language} onChange={setPrefs} />
          </Popover>
        </Island>
      </div>
    </div>
  );
}

// The tools island of the home: search (the palette comes with brick 4), arrange the widgets (later), the settings
// popover, and the user (accounts come with OAuth: the button shows the declared author's initial).
import { LayoutDashboard, Search, Settings, User } from "lucide-react";
import { Avatar, Button, IconButton, Island, Popover, Separator, Shortcut } from "../ui";
import { useText } from "../i18n";
import { useAuthor } from "../state/author";
import { PrefsControls } from "../shell/PrefsControls";
import { usePrefs } from "../shell/usePrefs";

export function HomeTools() {
  const t = useText();
  const { prefs, language, setPrefs } = usePrefs();
  const ctrlK = [t("ui:keys.ctrl"), "K"];
  const author = useAuthor();
  return (
    <Island name="tools" layout="bar">
      <Button icon={<Search />} aria-label={t("shell:search")} tooltip={t("shell:searchSoon")} shortcut={ctrlK.join(" ")} disabled className="home-search">
        <Shortcut keys={ctrlK} />
      </Button>
      <IconButton label={t("home:arrange")} icon={<LayoutDashboard />} disabled disabledReason={t("home:arrangeSoon")} />
      <Popover
        name="settings"
        label={t("shell:settings")}
        trigger={(props, open) => <IconButton {...props} label={t("shell:settings")} icon={<Settings />} pressed={open} tooltipPlacement="bottom-end" />}
      >
        <PrefsControls prefs={prefs} language={language} onChange={setPrefs} />
      </Popover>
      <Separator />
      <IconButton
        label={author || t("home:account")}
        icon={author ? <Avatar name={author} /> : <User />}
        disabled
        disabledReason={t("home:accountSoon")}
        tooltipPlacement="bottom-end"
      />
    </Island>
  );
}

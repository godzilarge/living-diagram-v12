// The tools every page of the shell shares (design/comps/shell: the tools island): search (it opens the page's
// palette, brick 4, and names it by `aria-controls`), the settings popover (theme, accent, language), and the user (accounts come with OAuth: the declared
// author's initial, else the User icon). The home adds its "arrange" button; the diagram its export.
import { Search, Settings, User } from "lucide-react";
import type { Ref } from "react";
import { Avatar, Button, IconButton, Popover, Shortcut } from "../ui";
import { useText } from "../i18n";
import { useAuthor } from "../state/author";
import { PrefsControls } from "./PrefsControls";
import { usePrefs } from "./usePrefs";
import "./ShellTools.css";

/** The search button: what it opens (the palette's id), whether it is open, and its node (the focus comes back to
 *  it when the palette closes). */
export type SearchControl = Readonly<{ open: boolean; controls: string; onOpen: () => void; ref: Ref<HTMLButtonElement> }>;

export function SearchButton({ search }: { search: SearchControl }) {
  const t = useText();
  const ctrlK = [t("ui:keys.ctrl"), "K"];
  return (
    <Button
      ref={search.ref}
      icon={<Search />}
      aria-label={t("shell:search")}
      aria-haspopup="dialog"
      aria-expanded={search.open}
      aria-controls={search.open ? search.controls : undefined}
      tooltip={t("shell:searchEverywhere")}
      shortcut={ctrlK.join(" ")}
      onClick={search.onOpen}
      className="shell-search"
    >
      <Shortcut keys={ctrlK} />
    </Button>
  );
}

export function SettingsPopover() {
  const t = useText();
  const { prefs, language, setPrefs } = usePrefs();
  return (
    <Popover
      name="settings"
      label={t("shell:settings")}
      trigger={(props) => <IconButton {...props} label={t("shell:settings")} icon={<Settings />} tooltipPlacement="bottom-end" />}
    >
      <PrefsControls prefs={prefs} language={language} onChange={setPrefs} />
    </Popover>
  );
}

/** The user, the same on every page: the declared author's initial and "account and language", disabled until
 *  accounts come (the reason in its tooltip). */
export function UserButton() {
  const t = useText();
  const author = useAuthor();
  return (
    <IconButton
      label={author ? t("shell:user", { author }) : t("shell:account")}
      icon={author ? <Avatar name={author} /> : <User />}
      disabled
      disabledReason={t("shell:accountSoon")}
      tooltipPlacement="bottom-end"
    />
  );
}

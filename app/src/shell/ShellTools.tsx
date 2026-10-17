// The tools every page of the shell shares (design/comps/shell: the tools island): search (it opens the page's
// palette, brick 4, and names it by `aria-controls`), the settings popover (theme, accent, language), and the user (the
// declared author's initial, else the User icon; it opens the name popover until accounts come with OAuth). The home adds its "arrange" button; the diagram its export.
import { Search, Settings, User } from "lucide-react";
import { useState } from "react";
import type { Ref } from "react";
import { Avatar, Button, Field, IconButton, Popover, Shortcut } from "../ui";
import { useText } from "../i18n";
import { setAuthor, useAuthor } from "../state/author";
import { PrefsControls } from "./PrefsControls";
import { usePrefs } from "./usePrefs";
import "./ShellTools.css";

/** A declared name keeps this many characters (`setAuthor` cuts there too). */
const NAME_MAX = 80;

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

/** The user, the same on every page: the declared author's initial (the User icon without a name), opening the name
 *  popover. Until accounts come (PRODUCT.md: OAuth), the author is a typed name, written on every change; nothing is
 *  written without it. */
export function UserButton() {
  const t = useText();
  const author = useAuthor();
  return (
    <Popover
      name="user"
      label={t("shell:name.label")}
      trigger={(props) => (
        <IconButton
          {...props}
          label={author ? t("shell:name.user", { author }) : t("shell:name.anonymous")}
          icon={author ? <Avatar name={author} /> : <User />}
          tooltipPlacement="bottom-end"
        />
      )}
    >
      {(close) => <NameForm author={author} onSaved={close} />}
    </Popover>
  );
}

/** The name: a sentence that says what it is for, the field (Enter saves), the save button, and under them whether
 *  changes are written. */
function NameForm({ author, onSaved }: { author: string; onSaved: () => void }) {
  const t = useText();
  const [name, setName] = useState(author);
  const save = (): void => {
    setAuthor(name);
    onSaved();
  };
  return (
    <div className="shell-name">
      <p className="shell-name-intro">{t("shell:name.intro")}</p>
      <div className="shell-name-row">
        <Field
          label={t("shell:name.label")}
          placeholder={t("shell:name.placeholder")}
          maxLength={NAME_MAX}
          value={name}
          autoFocus
          autoComplete="name"
          spellCheck={false}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            save();
          }}
          className="shell-name-field"
        />
        <Button variant="primary" onClick={save}>
          {t("shell:name.save")}
        </Button>
      </div>
      <p className="shell-name-hint">{t(author ? "shell:name.hintNamed" : "shell:name.hintAnonymous")}</p>
    </div>
  );
}

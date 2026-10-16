// The tools island of the home: the shell's search, settings and user (`shell/ShellTools`), and the home's own
// "arrange the widgets" (later).
import { LayoutDashboard } from "lucide-react";
import { IconButton, Island, Separator } from "../ui";
import { useText } from "../i18n";
import { SearchButton, SettingsPopover, UserButton } from "../shell/ShellTools";
import type { SearchControl } from "../shell/ShellTools";

export function HomeTools({ search }: { search: SearchControl }) {
  const t = useText();
  return (
    <Island name="tools" layout="bar">
      <SearchButton search={search} />
      <IconButton label={t("home:arrange")} icon={<LayoutDashboard />} disabled disabledReason={t("home:arrangeSoon")} />
      <SettingsPopover />
      <Separator />
      <UserButton />
    </Island>
  );
}

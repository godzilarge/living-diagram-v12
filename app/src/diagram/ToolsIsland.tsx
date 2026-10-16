// The tools island of the diagram (design/comps/shell/index.html, `.tools`): the shell's search, export (PNG or SVG,
// with a later brick), the settings popover, then the user.
import { Download } from "lucide-react";
import { IconButton, Island, Separator } from "../ui";
import { useText } from "../i18n";
import { SearchButton, SettingsPopover, UserButton } from "../shell/ShellTools";
import type { SearchControl } from "../shell/ShellTools";

export function ToolsIsland({ search }: { search: SearchControl }) {
  const t = useText();
  return (
    <Island name="tools" layout="bar">
      <SearchButton search={search} />
      <IconButton label={t("shell:export")} icon={<Download />} disabled disabledReason={t("shell:exportSoon")} />
      <SettingsPopover />
      <Separator />
      <UserButton />
    </Island>
  );
}

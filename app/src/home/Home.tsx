// The home (design/comps/shell/home.html): the ground, the logo island on the left, the tools island on the right,
// then the grid of widgets from y = 80: Infrastructures over Latest collections (two thirds), Latest modifications
// over the free slot (one third); the grid never scrolls, its widgets do. It renders the home's state; `useHome`
// reads the API, with as many collections and modifications as the browser's preferences say (`homeRuns`,
// `homeChanges`, chosen in each widget's settings). The logo is a link to the home itself (the base of the v2:
// `/next/` served, `/` in development).
import { IconLink, Island, LogoMark } from "../ui";
import { useText } from "../i18n";
import { useHome } from "../state/useHome";
import { usePrefs } from "../shell/usePrefs";
import { ChangesWidget } from "./ChangesWidget";
import { FreeSlot } from "./FreeSlot";
import { HomeTools } from "./HomeTools";
import { InfrastructuresWidget } from "./InfrastructuresWidget";
import { RunsWidget } from "./RunsWidget";
import "./Home.css";

export function Home() {
  const t = useText();
  const { prefs, setPrefs } = usePrefs();
  const { state, connect, see } = useHome({ runs: prefs.homeRuns, changes: prefs.homeChanges });
  const setRuns = (rows: number) => setPrefs({ ...prefs, homeRuns: rows as typeof prefs.homeRuns });
  const setChanges = (rows: number) => setPrefs({ ...prefs, homeChanges: rows as typeof prefs.homeChanges });
  return (
    <div className="home">
      <div className="home-top home-top-start">
        <Island name="brand" layout="bar">
          <IconLink href={import.meta.env.BASE_URL} label={t("shell:home")} icon={<LogoMark />} tooltipPlacement="bottom-start" />
        </Island>
      </div>
      <div className="home-top home-top-end">
        <HomeTools />
      </div>
      <main className="home-space" aria-label={t("home:page")}>
        <div className="home-col">
          <InfrastructuresWidget state={state} onConnect={connect} />
          <RunsWidget state={state} rows={prefs.homeRuns} onRows={setRuns} onSee={see} />
        </div>
        <div className="home-col">
          <ChangesWidget state={state} rows={prefs.homeChanges} onRows={setChanges} />
          <FreeSlot />
        </div>
      </main>
    </div>
  );
}

// What the page shows in place of the diagram, in a panel island at the centre of the map: the token to type (asked
// again when refused), or why there is no diagram (the API refused or did not answer, no collection archived).
import { Island } from "../ui";
import { TokenForm } from "../shell/TokenForm";
import type { Blocked } from "./words";

export function StateIsland({ blocked, onConnect }: { blocked: Blocked; onConnect: (token: string) => void }) {
  return (
    <Island name="state" layout="panel" className="diagram-state">
      {blocked.kind === "token" ? <TokenForm refused={blocked.refused} onConnect={onConnect} /> : <p className="shell-note diagram-sentence">{blocked.text}</p>}
    </Island>
  );
}

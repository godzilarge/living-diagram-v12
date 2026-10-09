// Le point d'entrée de la toile : assemble l'espace de noms `LD` (le même que la page a toujours exposé : les tests
// sous Node et le pilote Chromium y lisent le modèle, le graphe et les applications), le pose sur `globalThis`, puis
// démarre la page autonome (données embarquées) ou la coquille servie (données lues par l'API). Le bloc JSON de la
// page n'est lu qu'une fois (revue de la toile, M1).
import { alignment } from "./canvas/align";
import { annotations } from "./canvas/annotations";
import { card } from "./canvas/card";
import { connectors } from "./canvas/connectors";
import { dom } from "./canvas/dom";
import { format } from "./canvas/format";
import { geometry } from "./canvas/geometry";
import { graph } from "./canvas/graph";
import { groups } from "./canvas/groups";
import { hues } from "./canvas/hues";
import { icons } from "./canvas/icons";
import { layout } from "./canvas/layout";
import { model } from "./canvas/model";
import { pill } from "./canvas/pill";
import { query } from "./canvas/query";
import { reveal } from "./canvas/reveal";
import { scene } from "./canvas/scene";
import { speed } from "./canvas/speed";
import { table } from "./canvas/table";
import { tags } from "./canvas/tags";
import { tip } from "./canvas/tip";
import type { PageData } from "./canvas/types";
import { apps } from "./shell/apps";
import { inspect } from "./shell/inspect";
import { intent } from "./shell/intent";
import { boot, startPage } from "./shell/main";
import { placement } from "./shell/placement";
import { shell, startShell } from "./shell/shell";
import type { ShellData } from "./shell/shell";
import { structures } from "./shell/structures";
import { tables } from "./shell/tables";
import { timeline } from "./shell/timeline";
import { widgets } from "./shell/widgets";

const LD = Object.assign(apps, { model, layout, annotations, table, connectors, geometry, query, alignment, card, scene, pill, speed, tags, reveal: { reveal }, dom: { ...dom, ...format, ...widgets }, icons, hues, groups, tip, graph, inspect, intent, placement, structures, tables, timeline, boot, shell });
export type LD = typeof LD;
(globalThis as unknown as { LD: LD }).LD = LD;

// Ce que la page embarque : un snapshot (page autonome) ou rien (coquille servie, qui lira l'API).
function embedded(): PageData | ShellData | null {
  if (typeof document === "undefined") return null;
  const block = document.getElementById("ld-data");
  if (!block) return null;
  try {
    return JSON.parse(block.textContent || "") as PageData | ShellData;
  } catch (error) {
    document.body.appendChild(dom.h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + (error as Error).message));
    throw error;
  }
}

const data = embedded();
if (data) {
  if (data.snapshot) startPage(data as PageData);
  else startShell(data as ShellData);
}

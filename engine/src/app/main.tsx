// Le point d'entrée de l'application (`/`) : monte React sur `#app` quand la page en a un ; expose les modules purs
// (`LDApp`) pour les tests sous Node, qui chargent ce fichier construit sans aucun DOM, et un regard sur l'état
// pour le pilote Chromium. Le catalogue des codes (sens, règle) est lu une fois dans le bloc JSON de la page.
import { createRoot } from "react-dom/client";
import { alignment } from "../canvas/align";
import { query } from "../canvas/query";
import type { CatalogueEntry } from "../canvas/types";
import { App } from "./App";
import { address } from "./state/address";
import { context } from "./state/context";
import { history } from "./state/history";
import { searching } from "./state/search";
import { walking } from "./state/walk";
import { READ_ZOOM, openingView } from "./canvas/opening";
import { snap } from "./canvas/snap";
import { initialState, reducer } from "./state/reducer";
import { debug } from "./state/debug";
import { defaultPrefs, parsePrefs, readPrefs } from "./state/prefs";
import "@xyflow/react/dist/base.css";
import "./styles/index.css";
import "./styles/flow.css";

export const LDApp = { address, history, searching, walking, context, opening: { READ_ZOOM, openingView }, snap, reducer, initialState, query, alignment, debug, prefs: { parsePrefs, defaultPrefs } };
(globalThis as unknown as { LDApp: typeof LDApp }).LDApp = LDApp;

function readCatalogue(): Record<string, CatalogueEntry> {
  const block = document.getElementById("ld-catalogue");
  if (!block) return {};
  try { return JSON.parse(block.textContent || "{}") as Record<string, CatalogueEntry>; } catch (error) { return {}; }
}

const root = typeof document === "undefined" ? null : document.getElementById("app");
// Le thème et la largeur du panneau sont posés avant le premier rendu : sinon la page s'affiche sombre puis bascule pour
// qui a choisi le clair, et le panneau s'ouvre étroit puis s'élargit.
if (root) {
  const prefs = readPrefs();
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.style.setProperty("--panel-w", prefs.panelWidth + "px");
}
if (root) createRoot(root).render(<App catalogue={readCatalogue()} />);

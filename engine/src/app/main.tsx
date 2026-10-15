// Le point d'entrée de l'application (`/`) : monte React sur `#app` quand la page en a un ; expose les modules purs
// (`LDApp`) pour les tests sous Node, qui chargent ce fichier construit sans aucun DOM (la toile, sans DOM ni React,
// en fait partie : ses gestes se testent à part ; revue de session, D2), et un regard sur l'état
// pour le pilote Chromium. Le catalogue des codes (sens, règle) est lu une fois dans le bloc JSON de la page. La langue
// (i18n) est fixée avant le premier rendu, comme le thème : rien ne s'affiche dans une langue puis dans l'autre.
import { createRoot } from "react-dom/client";
import { alignment, boxAlignment, gridding } from "../canvas/align";
import { guides } from "./canvas/guides";
import { selecting } from "./state/selection";
import { floating } from "./state/floating";
import { clipboard } from "./state/clipboard";
import { wheel } from "./canvas/wheel";
import { code } from "./code";
import { query } from "../canvas/query";
import type { CatalogueEntry } from "../canvas/types";
import { App } from "./App";
import { address } from "./state/address";
import { context } from "./state/context";
import { history } from "./state/history";
import { journal } from "./state/journal";
import { cell, csvName, csvOf } from "./state/journal-csv";
import { checkMeaning } from "./state/checks";
import { explain, problemText } from "../shell/http";
import { searching } from "./state/search";
import { walking } from "./state/walk";
import { READ_ZOOM, openingView } from "./canvas/opening";
import { snap } from "./canvas/snap";
import { handles } from "./canvas/handles";
import { hover } from "./canvas/hover";
import { tool } from "./canvas/tool";
import { reusing } from "./canvas/reuse";
import { initialState, reducer } from "./state/reducer";
import { debug } from "./state/debug";
import { NUDGE_MS, createToile } from "./canvas/toile";
import { build as buildModel } from "../canvas/model";
import { payloadFromToile, targetOf } from "./canvas/clip-toile";
import { createUndo } from "./canvas/undo";
import { OPS_PER_REQUEST, createIntentHost } from "../shell/intent";
import { applyGuideColor, defaultPrefs, parsePrefs, readPrefs } from "./state/prefs";
import { LANGUAGES, applyLanguage, detectLanguage, effectiveLanguage, i18n, setLanguage, t } from "../i18n";
import "@xyflow/react/dist/base.css";
import "./styles/index.css";
import "./styles/flow.css";

export const LDApp = { address, clipboard, code, floating, history, journal, journalCsv: { cell, csvName, csvOf }, checkMeaning, http: { explain, problemText }, searching, walking, context, opening: { READ_ZOOM, openingView }, snap, handles, hover, tool, reusing, reducer, initialState, model: { build: buildModel }, toile: { createToile, NUDGE_MS }, clipToile: { payloadFromToile, targetOf }, undoing: { createUndo }, intentHost: { createIntentHost, OPS_PER_REQUEST }, query, alignment, boxAlignment, gridding, guides, selecting, wheel, debug, prefs: { parsePrefs, defaultPrefs },
  i18n: { LANGUAGES, detectLanguage, effectiveLanguage, setLanguage, language: () => i18n.language, t } };
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
  applyLanguage(prefs.language);
  applyGuideColor(prefs.guideHue);
  document.documentElement.style.setProperty("--panel-w", prefs.panelWidth + "px");
}
if (root) createRoot(root).render(<App catalogue={readCatalogue()} />);

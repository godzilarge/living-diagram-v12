// The v2, served by the backend at /next/ until the migration ends: the diagram when the address names an
// infrastructure, else the home.
// the base (tokens, font, focus ring) comes first in the cascade: every primitive refines it
import "./styles/base.css";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./i18n";
import { Home } from "./home/Home";
import { routeOf } from "./state/address";

// the diagram brings the v1 canvas and its styles: read only when the address asks for it, never on the home
const Diagram = lazy(() => import("./diagram/Diagram").then((page) => ({ default: page.Diagram })));

const root = document.getElementById("root");
if (!root) throw new Error("the page has no #root element");
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      {routeOf(location.search) === "diagram" ? (
        <Suspense fallback={null}>
          <Diagram />
        </Suspense>
      ) : (
        <Home />
      )}
    </I18nextProvider>
  </StrictMode>,
);

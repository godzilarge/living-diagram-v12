// The living primitives page (second Vite entry): every primitive in every state, both themes, both accents. The
// reference anyone looks at, and what the Playwright measurement runs on (e2e/measure.spec.ts).
// the base (tokens, font, focus ring) comes first in the cascade: every primitive refines it
import "../styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../i18n";
import { Page } from "./Page";

const root = document.getElementById("root");
if (!root) throw new Error("the page has no #root element");
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Page />
    </I18nextProvider>
  </StrictMode>,
);

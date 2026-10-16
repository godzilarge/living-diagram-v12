// The v2, served by the backend at /next/ until the migration ends: it opens on the home.
// the base (tokens, font, focus ring) comes first in the cascade: every primitive refines it
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./i18n";
import { Home } from "./home/Home";

const root = document.getElementById("root");
if (!root) throw new Error("the page has no #root element");
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Home />
    </I18nextProvider>
  </StrictMode>,
);

// The v2 shell, served by the backend at /next/ until the migration ends.
// the base (tokens, font, focus ring) comes first in the cascade: every primitive refines it
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./i18n";
import { Shell } from "./shell/Shell";

const root = document.getElementById("root");
if (!root) throw new Error("the page has no #root element");
createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Shell />
    </I18nextProvider>
  </StrictMode>,
);

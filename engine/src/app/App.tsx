import { I18nextProvider } from "react-i18next";
import type { CatalogueEntry } from "../canvas/types";
import { i18n } from "../i18n";
import { Shell } from "./components/Shell";
import { Store } from "./state/store";

export function App({ catalogue }: { catalogue: Record<string, CatalogueEntry> }) {
  return <I18nextProvider i18n={i18n}><Store catalogue={catalogue}><Shell /></Store></I18nextProvider>;
}

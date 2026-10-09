import type { CatalogueEntry } from "../canvas/types";
import { Shell } from "./components/Shell";
import { Store } from "./state/store";

export function App({ catalogue }: { catalogue: Record<string, CatalogueEntry> }) {
  return <Store catalogue={catalogue}><Shell /></Store>;
}

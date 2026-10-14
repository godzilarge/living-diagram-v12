// Le sens d'un contrôle de B1 dans la langue de la page (2026-10-10, lot 6 de la langue) : le code est la clé du
// catalogue `checks`, dont le français recopie le catalogue du contrat (`ld_contracts.snapshot.codes`) à l'octet ; un
// test Python tient les deux alignés. Un code que la page ne connaît pas (serveur plus récent qu'elle) garde le texte
// français que le serveur embarque dans la page.
import { i18n, t } from "../../i18n";
import type { CatalogueEntry } from "../../canvas/types";

export const checkMeaning = (code: string, model: { catalogue: Record<string, CatalogueEntry> }): string =>
  i18n.exists("checks:meaning." + code) ? (t(("checks:meaning." + code) as never) as unknown as string) : (model.catalogue[code] || { meaning: "" }).meaning || "";

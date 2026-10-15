// La commande du texte (lot 4 bis de docs/11), que la barre contextuelle, les raccourcis (Ctrl+B, Ctrl+I, Ctrl+U,
// Ctrl+Maj+X, Ctrl+Maj+> et <) et les fiches partagent : un changement pour un objet ou toute une sélection, en une
// écriture par l'hôte d'intention (sous le nom, au journal, une entrée d'annulation). Ce qui change, objet par objet :
// `text-format.ts` (pur).
import { t } from "../../i18n";
import type { CanvasHandle } from "./store";
import { textOps } from "./text-format";
import type { TextChange, TextItem } from "./text-format";

export interface TextCommands {
  /** Un changement du texte de ces objets ; rien ne part si aucun ne change. */
  textFormat: (items: TextItem[], change: TextChange) => void;
}

export function textCommands(deps: { handle: () => CanvasHandle | null }): TextCommands {
  return {
    textFormat: (items, change) => {
      const h = deps.handle();
      if (!h || !h.intents.canWrite()) return;
      const ops = textOps(items, change);
      if (!ops.length) return;
      void h.intents.apply(ops, t("shell:fbar.textFormatted", { count: ops.length, author: h.writer.author }));
    },
  };
}

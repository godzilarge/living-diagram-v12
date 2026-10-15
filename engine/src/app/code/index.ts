// Le bloc de code (lot 16 de docs/11), sa partie pure : géométrie et défilement (geometry.ts), langages et détection
// (languages.ts), coloration en familles (tokens.ts, Prism 1.30.0), valeurs sensibles (secrets.ts). Exposée aux tests
// sous Node (`LDApp.code`) ; la toile (`app/canvas/code.tsx`), la fiche et la barre la lisent.
import { geometry } from "./geometry";
import { languages } from "./languages";
import { secrets } from "./secrets";
import { secretTip } from "./secret-tip";
import { tokens } from "./tokens";

export const code = { ...geometry, ...languages, ...tokens, ...secrets, ...secretTip };

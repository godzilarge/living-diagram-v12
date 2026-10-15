---
paths:
  - "engine/src/canvas/**"
  - "engine/src/shell/**"
  - "engine/src/i18n/**"
  - "engine/src/contracts/**"
  - "engine/*.mjs"
---

# Le moteur de diagramme (`engine/`)

TypeScript pur, zéro framework, zéro DOM : modèle (B5), scène, placement (B7), géométrie (B8), groupes, annotations,
connecteurs, règles de filtre, alignement. Partagé par l'application et par `/view`.

- **Un module du moteur est une fonction pure** : entrées explicites, sortie déterministe, aucun `setTimeout`, aucun
  accès au DOM ni au réseau. Tout ce qui est mesuré à l'écran est **estimé** (largeur d'un texte par chasse), jamais
  mesuré : même rendu sous le faux DOM des tests et dans Chromium.
- **Déterminisme** : positions entières, listes parcourues dans un ordre écrit, jamais un ensemble. Ce qui est
  mémorisé est ce qui est dessiné.
- Les types des contrats sont **générés** des schémas JSON (`npm run types`), jamais écrits à la main ; les types de
  l'API, eux, sont écrits à la main.
- `src/shell/` est la coquille de `/view`, **gelée** : correctifs seulement. Son bundle `viewer.js` est versionné dans
  le backend et reconstruit par `npm run build` (test de dérive `build.mjs --check`) : reconstruire **juste avant** de
  lancer la suite complète, un `--check` vert entre deux modifications ne prouve rien.
- `src/i18n/core.ts` est sans React et n'embarque que `common` en français ; `/view` reste en français.
- Versions épinglées (pas de `^`), `package-lock.json` versionné, bibliothèques de plus de deux semaines ; une
  bibliothèque éprouvée pour un geste standard (édition, recherche, retour à la ligne), jamais un champ maison.
- Tests sous Node dans `backend/tests/js/`, lancés par pytest ; un changement de règle se vérifie par **mutation**
  (le test doit tomber quand la règle est retirée).

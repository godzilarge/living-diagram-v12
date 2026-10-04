# `engine/` — la toile

**En une phrase : le moteur de diagramme de Living Diagram, en TypeScript pur, sans framework, construit en un seul
fichier que le backend embarque dans ses pages.** C'est la page `ld render` d'origine, portée telle quelle en
TypeScript (décision ③ « posséder la toile », 2026-10-04) : mêmes rendus à l'octet, mêmes tests.

## Ce que c'est, ce que ce n'est pas

- **C'est** la toile : le modèle de lecture d'un snapshot et d'un diff, le placement, la géométrie des tracés, le
  renderer SVG et ses interactions, la bulle, l'inspecteur, les vues en tableaux, et la coquille servie par
  `GET /view` (jeton, liste des runs, lecture par l'API).
- **Ce n'est pas** un service : rien ne tourne côté serveur. Le résultat du build est un fichier,
  `backend/src/ld_backend/render/assets/js/viewer.js`, **versionné** : Python n'a jamais besoin de Node, ni à
  l'installation ni à l'exécution. Seule la **modification** du moteur demande Node.
- **Zéro dépendance à l'exécution** : la page produite ne charge rien (ni CDN, ni police, ni script externe), elle
  est protégée par une CSP par empreinte. Les dépendances de `package.json` servent au build et aux types seulement.

## Entrée et sortie

| Entrée | Sortie |
|---|---|
| `src/**/*.ts` | `backend/src/ld_backend/render/assets/js/viewer.js` (`npm run build`), un seul fichier IIFE ES2020, non minifié, déterministe |
| `contracts/src/ld_contracts/schema/*.schema.json` | `src/contracts/*.ts` (`npm run types`), les types des contrats, générés, versionnés |

Dans la page, le fichier expose l'espace de noms global `LD` (`LD.model`, `LD.graph`, `LD.app`…) : c'est ce que les
tests sous Node (`backend/tests/js/`) et le pilote Chromium (`backend/tests/browser.py`) lisent.

## Arborescence

```
engine/
├── package.json, package-lock.json   dépendances de build, versions figées (esbuild, typescript, json-schema-to-typescript)
├── tsconfig.json                     strict, ES2020, DOM
├── build.mjs                         esbuild → viewer.js ; `--check` compare sans écrire (test de dérive côté backend)
├── types.mjs                         JSON Schema → TypeScript ; `--check` idem
└── src/
    ├── index.ts                      assemble `LD`, démarre la page autonome ou la coquille
    ├── contracts/                    GÉNÉRÉS : snapshot.ts, diff.ts, intent.ts (ne pas éditer)
    ├── canvas/                       la toile proprement dite, sans rien de la page
    │   ├── types.ts                  le modèle de lecture (entités indexées au-dessus des contrats) et la forme des données de la page
    │   ├── model.ts                  B5 analyse : index du snapshot, du diff et de l'intention, structures, répartition des contrôles
    │   ├── layout.ts                 B7 placement : force-dirigé déterministe, nœuds épinglés = contraintes dures
    │   ├── geometry.ts               B8 routage : tracés, éventails, cadres, étiquettes
    │   ├── graph.ts                  B9 renderer SVG : couches, dessin, glissé (→ épingle), zoom, sélection, clavier, paliers de zoom
    │   ├── tip.ts                    la bulle au survol
    │   ├── icons.ts                  icônes de type, dessinées
    │   ├── dom.ts                    fabrique d'éléments HTML et SVG (jamais de HTML écrit depuis une donnée)
    │   └── format.ts                 libellés et mise en texte des valeurs (statuts, sources, vitesses, écarts)
    └── shell/                        la page autour de la toile (en attendant un shell à part)
        ├── main.ts                   démarrage : en-tête, onglets, barre d'outils, légende, adresse = état de vue
        ├── widgets.ts                pastilles, liste de définitions, tableau
        ├── checks.ts                 la liste des contrôles d'un élément (partagée par l'inspecteur et les structures)
        ├── inspect.ts, structures.ts l'inspecteur : câble, équipement, agrégat, faisceau, cluster
        ├── tables.ts                 les vues : contrôles, qualité des données, sources, structures, diff
        ├── intent.ts                 B4 : l'onglet Intentions, la fiche d'une épingle, l'hôte qui relie glissé, écrivain et page
        ├── shell.ts                  la coquille servie : jeton, nom, runs, lecture par l'API, écrivain (envois sérialisés)
        └── apps.ts                   les applications démarrées (`LD.app`, `LD.shellApp`) et les types de l'écrivain
```

## Démarrer

```
cd engine
npm ci                 # une fois (Node ≥ 20) ; versions figées par package-lock.json ; node_modules/ est hors dépôt
npm run typecheck      # tsc --noEmit, strict
npm run build          # écrit backend/src/ld_backend/render/assets/js/viewer.js : à versionner avec les sources
npm run types          # régénère src/contracts/*.ts après un changement de schéma dans contracts/
npm run check          # les trois vérifications : types stricts, bundle à jour, types générés à jour
```

Puis les tests côté backend (`cd backend && uv run pytest`) : ils lisent le fichier construit, lancent les tests de la
toile sous Node (`tests/js/viewer.test.js`, faux DOM) et quelques rendus dans Chromium, et **vérifient la dérive** :
`test_the_built_viewer_matches_the_engine_sources` relance `tsc --noEmit`, `build.mjs --check` et `types.mjs --check`
(sauté si Node ou l'un des trois outils de `node_modules/` manque ; le message d'échec donne la commande à relancer).
Un `viewer.js` oublié après une modification des sources, ou une erreur de type, fait échouer la suite.

## Règles

- **Rien d'inventé** : le modèle indexe, il ne déduit pas ; ce qui est dessiné est dans le snapshot.
- **Jamais de HTML écrit depuis une donnée** (`innerHTML`, `insertAdjacentHTML`… interdits, testé sur les sources et
  sur le fichier construit) ; jamais de style en ligne (la CSP par empreinte n'en admet aucun).
- **Déterministe** : même snapshot ⇒ même placement ; même source ⇒ même `viewer.js` à l'octet.
- **Types stricts** sur le modèle ; les types des contrats ne s'éditent pas, ils se régénèrent.

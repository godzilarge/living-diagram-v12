# `engine/` — la toile, et ses deux faces

**En une phrase : le moteur de diagramme de Living Diagram, en TypeScript pur, sans framework, et les deux pages
qui le montrent : `/view`, la page de lecture de B1 (gelée), et l'application React servie à `/`.** La toile est la
page `ld render` d'origine, portée telle quelle en TypeScript (décision ③ « posséder la toile », 2026-10-04) ;
l'application (2026-10-07) est sa face utilisateur : le diagramme est la page, tout le reste flotte.

## Ce que c'est, ce que ce n'est pas

- **C'est** la toile : le modèle de lecture d'un snapshot et d'un diff, le placement, la géométrie des tracés, le
  renderer SVG et ses interactions (glissé, sélection multiple, rectangle, règles, alignement), la bulle ; puis ses
  deux faces : `src/shell/` (la page `ld render`, l'inspecteur, les tableaux, la coquille `/view`) et `src/app/`
  (l'application React : barre, bande des runs, palette, fiches).
- **Ce n'est pas** un service : rien ne tourne côté serveur. Le résultat du build est **versionné** dans les assets
  du backend (`render/assets/js/viewer.js` ; `render/assets/app/app.js`, `app.css`, `fonts/`) : Python n'a jamais
  besoin de Node, ni à l'installation ni à l'exécution. Seule la **modification** de la toile ou de l'application
  demande Node.
- **Zéro dépendance à l'exécution** : la page `ld render` ne charge rien (CSP par empreinte) ; l'application ne charge
  que ses propres fichiers depuis sa propre origine (React, React Flow, Lucide et les polices sont embarqués ; CSP
  `script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'`). Les dépendances de `package.json`
  servent au build, aux types, et au bundle de l'application.

## Entrée et sortie

| Entrée | Sortie |
|---|---|
| `src/index.ts`, `src/canvas/`, `src/shell/` | `backend/src/ld_backend/render/assets/js/viewer.js` (`npm run build`), un seul fichier IIFE ES2020, non minifié, déterministe |
| `src/app/main.tsx`, `src/app/`, `src/canvas/`, `src/shell/{http,intent,placement,timeline,inspect}.ts` | `backend/src/ld_backend/render/assets/app/app.js` (minifié, React en production), `app.css`, `fonts/*.woff2` (même `npm run build`), déterministes |
| `contracts/src/ld_contracts/schema/*.schema.json` | `src/contracts/*.ts` (`npm run types`), les types des contrats, générés, versionnés |

Dans la page, `viewer.js` expose l'espace de noms global `LD` (`LD.model`, `LD.graph`, `LD.app`…) et `app.js` expose
`LDApp` (`address`, `reducer`, `query`, `alignment`, `debug`) : c'est ce que les tests sous Node (`backend/tests/js/`)
et le pilote Chromium (`backend/tests/browser.py`) lisent. Sous Node, `app.js` se charge sans aucun DOM et ne monte rien.

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
    ├── canvas/                       la toile proprement dite, sans rien des pages
    │   ├── types.ts                  le modèle de lecture (entités indexées au-dessus des contrats) et la forme des données de la page
    │   ├── model.ts                  B5 analyse : index du snapshot, du diff et de l'intention, structures, répartition des contrôles
    │   ├── layout.ts                 B7 placement : force-dirigé déterministe, positions entières ; nœuds fixés (épingles, places mémorisées) = contraintes
    │   │                             dures ; `extend` complète un dessin existant (docs/09)
    │   ├── geometry.ts               B8 routage : tracés, éventails, cadres, étiquettes
    │   ├── card.ts                   la carte d'un équipement (2026-10-07) : rail de couleur du type, carreau de l'icône, nom en capitales, rôle, compte ; pur
    │   ├── scene.ts                  ce qu'une toile montre (2026-10-07) : visibles selon les filtres, placement en deux temps, ce qu'une sélection éclaire ; pur
    │   ├── graph.ts                  B9 renderer SVG : couches, placement en deux temps (infrastructure, puis voisins inconnus), mémoire de la page,
    │   │                             dessin, sélection simple et multiple, règles (masquer, isoler, éclairer), alignement, zoom, clavier, marges d'écran
    │   ├── pointer.ts                le pointeur : panoramique, glissé d'un équipement ou de la sélection d'un bloc (→ épingles), Maj + clic, rectangle (Maj + glissé)
    │   ├── query.ts                  les règles `[champ:]regex` : recherche, masquage, isolement (pur)
    │   ├── align.ts                  aligner, répartir une sélection (pur, positions entières)
    │   ├── tip.ts                    la bulle au survol
    │   ├── icons.ts                  icônes de type : glyphes pleins 32 × 32 en trois couches (silhouette, bandeau, symbole)
    │   ├── hues.ts                   les douze teintes nommées (docs/10) : défauts par type, résolution équipement > type > moteur ; pur
    │   ├── groups.ts                 les groupes (docs/10 §5) : énumérations du style, défauts, enveloppe depuis les membres, ancre de l'étiquette ; pur
    │   ├── annotations.ts            les annotations (docs/10 §6) : boîte depuis l'ancre et écart inverse, retour à la ligne, ligne de rappel, orphelines ; pur
    │   ├── table.ts                  le tableau d'une annotation (1.4.0) : grille au prorata des poids, cellules et fusions, lignes et colonnes insérées ou retirées, frontières glissées, boîte qui grandit ; pur
    │   ├── connectors.ts             les connecteurs (docs/10 §6.6) : ancres (1.5.0), contours réels (coins arrondis, ellipse), tracés droit / coudé / courbe avec sorties perpendiculaires, courbure lue d'un glissé, pointes, orphelins, visibilité ; pur
    │   ├── dom.ts                    fabrique d'éléments HTML et SVG (jamais de HTML écrit depuis une donnée)
    │   └── format.ts                 libellés et mise en texte des valeurs (statuts, sources, vitesses, écarts, la phrase des sources d'un câble)
    ├── shell/                        la page de lecture de B1 : `ld render` et la coquille `/view` (gelée le 2026-10-06, correctifs seulement)
    │   ├── main.ts                   démarrage : en-tête, onglets, barre d'outils, légende, adresse = état de vue
    │   ├── widgets.ts                pastilles, liste de définitions, tableau
    │   ├── checks.ts                 la liste des contrôles d'un élément (partagée par l'inspecteur et les structures)
    │   ├── inspect.ts, structures.ts l'inspecteur : câble, équipement, agrégat, faisceau, cluster
    │   ├── tables.ts                 les vues : contrôles, qualité des données, sources, structures, diff
    │   ├── intent.ts                 B4 : l'onglet Intentions, la fiche d'une épingle, l'hôte qui relie glissé, écrivain et page (réutilisé sans DOM par l'application)
    │   ├── placement.ts              docs/09 : l'hôte du placement mémorisé (envoi de ce qui vient d'être placé, réalignement, « replacer » confirmé)
    │   ├── http.ts                   ce que les deux faces partagent pour parler à l'API : routes, appel, jeton (onglet), nom (navigateur)
    │   ├── shell.ts                  la coquille servie : jeton, nom, runs, lecture par l'API, écrivain d'intention et de placement (envois sérialisés)
    │   ├── timeline.ts               la bande des runs de la coquille servie : passer de run en run, le diff suit, l'état de vue reste (2026-10-06)
    │   └── apps.ts                   les applications démarrées (`LD.app`, `LD.shellApp`) et les types de l'écrivain
    └── app/                          l'application React (2026-10-07), servie à `/` : couches strictes api/ → state/ → components/
        ├── main.tsx                  monte React sur `#app` (ou rien sous Node), expose `LDApp`, lit le catalogue des codes embarqué dans la page
        ├── App.tsx                   Store + Shell
        ├── api/                      client.ts (lire les runs, une run : snapshot, rapport, diff, intention, placement), writers.ts (les deux écrivains)
        ├── state/                    types.ts (état, actions), reducer.ts (pur), address.ts (état de vue ↔ URL, pur), store.tsx (commandes, effets,
        │                             poignée de la toile), debug.ts (regard pour Chromium)
        ├── canvas/                   la toile de l'application (2026-10-07, React Flow) : toile.ts (l'état et les commandes, sans DOM ni React),
        │                             Flow.tsx (React Flow : nœuds et arêtes depuis la toile, vue, appuis, bulle, grille, aimant, minimap), nodes.tsx
        │                             (carte, voisin inconnu, cadre de cluster), edges.tsx (câble, bande et étiquette de faisceau)
        ├── components/               Shell (clavier, thème), TopBar (comptes, règles, changements, nom), Display (panneau Affichage : couches `LAYERS`), Timeline (bande), Palette (règle, actions), Panel +
        │                             cards/ (équipement, câble, faisceau, cluster, agrégat, sélection multiple), Canvas (seul à monter la toile),
        │                             Controls (grille, aimant, minimap, cadrer, thème ; en bas à gauche), Connect, Toast
        ├── ui/                       bouton, bascule, badge, touche, champ, faits, section (maison, CSS à jetons)
        └── styles/                   tokens.css (la palette : sombre, et claire sous `[data-theme="light"]` ; couleurs de type), fonts.css (Inter,
                                      JetBrains Mono embarquées), base.css, canvas.css, flow.css (React Flow : poignées, grille, minimap), app.css
```

## Démarrer

```
cd engine
npm ci                 # une fois (Node ≥ 20) ; versions figées par package-lock.json ; node_modules/ est hors dépôt
npm run typecheck      # tsc --noEmit, strict
npm run build          # écrit render/assets/js/viewer.js et render/assets/app/ (app.js, app.css, fonts/) : à versionner avec les sources
npm run types          # régénère src/contracts/*.ts après un changement de schéma dans contracts/
npm run check          # les trois vérifications : types stricts, bundle à jour, types générés à jour
```

Puis les tests côté backend (`cd backend && uv run pytest`) : ils lisent le fichier construit, lancent les tests de la
toile sous Node (`tests/js/viewer.test.js`, faux DOM) et quelques rendus dans Chromium, et **vérifient la dérive** :
`test_the_built_viewer_matches_the_engine_sources` relance `tsc --noEmit`, `build.mjs --check` et `types.mjs --check`
(sauté si Node ou l'un des trois outils de `node_modules/` manque ; le message d'échec donne la commande à relancer).
Un `viewer.js` ou un `app/` oublié après une modification des sources, ou une erreur de type, fait échouer la suite.
L'application a ses propres tests : `tests/js/app.test.js` (modules purs, sans DOM) et `tests/test_app.py` (routes,
CSP, fichiers, sources sans HTML écrit, et un parcours de bout en bout dans Chromium).

## L'application (`src/app/`, 2026-10-07)

**Ce qu'elle fait** : afficher le diagramme d'une run, run après run, avec ses changements et ses intentions, et laisser
l'utilisateur chercher, sélectionner, masquer, aligner.

- **Le diagramme est la page** : la toile prend tout, sombre ; une barre fine en haut (identité, comptes en pastilles,
  règles posées, recherche, bascules, nom), la bande des runs en bas, un panneau qui glisse à droite quand quelque
  chose est sélectionné, une palette de recherche (`/` ou Ctrl+K), une ligne d'état qui s'efface.
- **Couches strictes** : `api/` parle à l'API ; `state/` tient l'état (réducteur pur), les commandes et les effets ;
  `components/` rend l'état et appelle des commandes, ne fait jamais d'appel réseau, ne touche jamais la toile.
  Seul `Canvas` monte la toile (une fois par run, React Flow remonté avec la run), lui pousse l'état de vue et lit ce
  qu'elle dit. Les hôtes d'intention et de placement de `/view` sont réutilisés sans leur DOM.
- **L'adresse est l'état de vue** : `?infrastructure=&run_id=&from=` (la run, comme `/view`) et
  `#node=…&stubs=1&ports=1&speeds=1&beams=1&pins=0&diff=0&hide=…&only=…&mask=…` (la vue : les couches du panneau Affichage en font partie) ; jamais le jeton (dans `sessionStorage`), le nom
  dans `localStorage`. En arrivant sans `run_id`, la dernière run s'ouvre comparée à la précédente.
- **La toile pour l'application** : Maj + clic ajoute à la sélection multiple, Maj + glissé sur le fond dessine un
  rectangle de sélection, glisser un équipement sélectionné déplace toute la sélection d'un bloc ; les règles
  `[champ:]regex` masquent (`hide`), isolent avec les voisins directs (`only`) ou éclairent (palette) ; aligner /
  répartir ou glisser la sélection pose ses épingles en un paquet sous le nom donné (sinon déplacements locaux, dits
  tels). Rien de tout cela n'apparaît dans `/view`.
- **Une seule pastille** (`canvas/pill.ts`, `app/canvas/pill.tsx`, `.pill` dans `styles/app.css`) : tout fait court (rôle
  HA, stack, vitesse, MLAG, statut, gravité) a la même capsule ; seul le ton (`tone-*`) change. Une commande est un
  rectangle aux coins de 6, jamais une capsule. Les vitesses (`canvas/speed.ts`) et les faisceaux révélés au clic
  (`canvas/reveal.ts`) sont des modules purs, testés sous Node (`LD.pill`, `LD.speed`, `LD.reveal`).
- **Direction visuelle** : une palette sombre dans `styles/tokens.css`, les teintes de statut de `/view` pour les
  données, l'interface monochrome avec un seul accent (cyan) pour ce qui est actif ; Inter variable et JetBrains Mono
  variable embarquées ; icônes Lucide ; mouvements de 150 à 220 ms, `prefers-reduced-motion` respecté ; jamais de
  style en ligne (testé), jamais de HTML écrit depuis une donnée (testé).
- **La toile de l'application dessine avec React Flow** (`@xyflow/react` 12.12.0, MIT, embarqué ; décision du
  2026-10-07, qui révise celle du 2026-10-06 pour l'application seulement, `/view` gardant graph.ts) : `canvas/toile.ts`
  tient l'état (filtres, épingles locales, mémoire des places, positions, sélection) et les commandes (placer, cadrer,
  montrer, sélectionner, déplacer, aligner, se réaligner), sans DOM ; `Flow.tsx` reconstruit nœuds et arêtes à chaque
  version de la toile et laisse React Flow tenir la vue, les appuis (Maj + clic, rectangle, glissé de la sélection) et
  le clavier ; les nœuds sont dessinés en SVG aux dimensions du plan de `card.ts` (la taille mesurée est celle
  calculée : positions déterministes, mêmes classes et styles que `/view`) ; les arêtes reprennent la géométrie de
  `/view` (éventail, bandes, halos, noms de port hors des cartes). Changer la forme d'un nœud = `card.ts` (le plan),
  `nodes.tsx` et `canvas.css`, une capture.
- **La carte** (`canvas/card.ts`, partagée avec `/view` ; forme large du 2026-10-07, sur les retours d'Orhan) : un rail
  de la couleur du type sur le bord gauche, l'icône de type dans un carreau teinté de la même couleur, le nom en
  capitales et en chasse fixe (largeur calculée, jamais mesurée), le rôle HA et le compte de stack sur une petite
  ligne dessous. Les couleurs de type sont des jetons (`--type-switch`, `--type-router`, `--type-firewall`…), posées
  par classe `type-*` sur le nœud ; les changer par équipement sera une intention (docs/10).
- **La couleur d'intention** (`canvas/hues.ts`, `docs/10`) : chaque carte porte la classe `hue-<teinte>` qui pose `--type`
  (rail, icône, minimap, icône de la fiche) ; la teinte vient de l'intention (celle de l'équipement, sinon celle de son
  type) ou du défaut du moteur. Dans la fiche d'un équipement et dans celle d'une sélection multiple (toute la
  sélection d'un coup), douze pastilles et « défaut » ; dans le menu, le volet
  « palette des types » ; les deux écrivent par l'hôte d'intention (`onColor`, `onTypeColor`), sous le nom donné,
  pour tout le monde. `/view` dessine les mêmes teintes et liste les couleurs dans l'onglet Intentions.
- **Les groupes** (`canvas/groups.ts`, `docs/10` §5) : un groupe = des membres + un style, jamais une forme à coordonnées ;
  son cadre (`FrameNode`, sous les cartes et les clusters, le plus grand dessous) se calcule à chaque dessin depuis les
  cartes de ses membres présents. Clic = fiche du groupe (`GroupCard` : nom et description éditables, membres et
  absents, actions, éditeur de style), glissé du cadre = ses membres déplacés d'un bloc (un paquet d'épingles), survol =
  bulle ; `#group=<id>` dans l'adresse. Création depuis la fiche d'une sélection multiple (« grouper », « ajouter à un
  groupe »), depuis la fiche d'un équipement (« ajouter à un groupe », retirer). `/view` liste les groupes dans l'onglet
  Intentions, sans les dessiner.
- **Les annotations** (`canvas/annotations.ts`, `app/canvas/annotation.tsx`, `cards/AnnotationCard.tsx`, `docs/10` §6) :
  une note, une forme, un tableau ou une image, avec une boîte et un ancrage (libre ; attachée à un équipement ou à un
  groupe : nœud React Flow **enfant** de sa carte ou de son cadre, elle suit le glissé nativement). Sélectionnée et
  éditable (un nom) : huit poignées (Maj garde le rapport), double-clic sur une note = texte en place ; glissé,
  redimensionnement et édition sont une écriture chacun, la boîte reste posée localement jusqu'à la réponse. Bloc
  **Insérer** dans la barre d'outils (au centre de la vue), couche « annotations » dans Affichage (`notes=0`), fiche
  complète (contenu, ancrage, ligne de rappel, plan, verrou, style, détacher, dupliquer, supprimer en deux clics).
  Les images se lisent par l'API avec le jeton et se montrent par une adresse `blob:` (`app/canvas/assets.ts`, CSP
  `img-src 'self' blob:`). `/view` liste les annotations dans l'onglet Intentions, sans les dessiner.
  **Depuis 1.4.0** (2026-10-09) : un tableau s'édite sur la toile (`app/canvas/table.tsx` : cellule choisie, plage avec
  Maj, double-clic = champ en place dans un `foreignObject`, frontières glissables, clic droit avec la cellule visée) ;
  le **menu contextuel** (`app/state/context.ts`, pur, testé sous Node : ce qu'un clic droit propose selon la cible et
  l'écriture ; `components/ContextMenu.tsx` l'exécute par les commandes du store, posé par des variables CSS) ; les
  **connecteurs** (`app/canvas/connector.tsx` : nœud React Flow non glissable qui lit la place vivante de ses bouts dans
  `nodeLookup`, trois poignées à taille d'écran constante visibles au survol ; `cards/ConnectorCard.tsx`) ; **les ancres**
  (1.5.0 : `app/canvas/anchors.tsx`, quatre points au milieu des côtés de chaque carte, disque, annotation et cadre,
  survolé ou sélectionné quand on peut écrire ; tirer depuis l'un d'eux crée un connecteur, brouillon dessiné dans le plan
  par `ViewportPortal` ; `app/canvas/snap.ts`, pur : un bout glissé s'accroche à une ancre à portée, sinon à l'élément
  dessous sur son contour, sinon reste libre, carte avant annotation avant cadre, l'autre bout du connecteur exclu) ; **Ctrl+V** (`Shell.tsx` : une image du presse-papiers part au magasin, un
  texte devient une note).
- **Les préférences du navigateur** (`state/prefs.ts`, `localStorage` `ld-prefs`, jamais dans l'adresse) : thème
  sombre ou clair (`data-theme` sur la racine, les deux palettes dans `tokens.css`), grille (lignes de 20 unités,
  `Background` de React Flow), aimant (un glissé s'aligne sur la grille, `snapToGrid`), minimap (`MiniMap` de React
  Flow, cartes colorées par type, cadre déplaçable). Réglées par `Controls`, en bas à gauche, avec « cadrer tout ».
- **Pas de Tailwind, pas de bibliothèque d'état ni de routeur** (décisions du 2026-10-06) : composants maison dans
  `ui/`, CSS à jetons, `useReducer`.

## Règles

- **Rien d'inventé** : le modèle indexe, il ne déduit pas ; ce qui est dessiné est dans le snapshot.
- **Jamais de HTML écrit depuis une donnée** (`innerHTML`, `insertAdjacentHTML`… interdits, testé sur les sources et
  sur le fichier construit) ; jamais de style en ligne (la CSP par empreinte n'en admet aucun).
- **Déterministe** : même snapshot ⇒ même placement ; même snapshot et même placement mémorisé ⇒ même dessin ; même source ⇒ même `viewer.js` à l'octet.
- **Types stricts** sur le modèle ; les types des contrats ne s'éditent pas, ils se régénèrent.

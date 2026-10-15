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
    ├── i18n/                         la langue de l'interface (2026-10-10) : core.ts (instance i18next sans React, `common` en
    │                                 français, `t`, `labelMap`, détection : ce que `/view` embarque), index.ts (l'application :
    │                                 `shell`, `panel`, l'anglais), types.ts (clés typées depuis tous les catalogues français),
    │                                 locales/<langue>/<espace>.json (fr = référence, en)
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
    │   ├── tip.ts                    la bulle au survol : ce qu'un câble, un équipement, un faisceau, un cluster, un groupe, une annotation, un connecteur ont à dire, en blocs (pur)
    │   ├── bubble.ts                 le dessin de la bulle (2026-10-09) : en-tête en Inter et pastilles, filet, tableau « libellé | valeur » aux colonnes alignées, pied ; largeurs estimées, jamais mesurées
    │   │                             Dans l'application, la bulle n'existe qu'à la souris : au clavier, Entrée ouvre la fiche, qui dit plus qu'elle (décision d'Orhan, 2026-10-10 : « la fiche suffit ») ;
    │   │                             au toucher, pas de survol, le tap ouvre la fiche. `/view` la montre au focus (`aria-describedby`). Échap la cache. Elle attend 100 ms avant d'apparaître, puis reste posée.
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
                                      (`app/code/` : le bloc de code du lot 16, partie pure ; `vendor/obsidian-cisco-syntax/` à côté de `src/` : la grammaire Cisco recopiée, MIT)
        ├── main.tsx                  monte React sur `#app` (ou rien sous Node), expose `LDApp`, lit le catalogue des codes embarqué dans la page
        ├── App.tsx                   Store + Shell
        ├── api/                      client.ts (lire les runs, une run : snapshot, rapport, diff, intention, placement), writers.ts (les deux écrivains)
        ├── state/                    types.ts (état, actions), reducer.ts (pur), address.ts (état de vue ↔ URL, pur), store.tsx (commandes, effets,
        │                             poignée de la toile), intent-commands.ts (groupes, annotations, connecteurs, supprimer, insérer),
        │                             debug.ts (regard pour Chromium)
        ├── canvas/                   la toile de l'application (2026-10-07, React Flow) : toile.ts (l'état et les commandes, sans DOM ni React),
        │                             Flow.tsx (React Flow : nœuds et arêtes depuis la toile, vue, appuis, bulle, grille, aimant, minimap), nodes.tsx
        │                             (carte, voisin inconnu, cadre de cluster), edges.tsx (câble, bande et étiquette de faisceau),
        │                             keys.ts (une frappe dans un champ lui appartient), chrome.ts (barre et bande posées sur la toile)
        ├── components/               Shell (clavier, thème), TopBar (comptes, règles, changements, nom), Display (panneau Affichage : couches `LAYERS`), Timeline (bande), Palette (règle, actions),
        │                             FloatingBar + FloatingVolet + floating-faces (la barre contextuelle, lot 4 ; état pur dans state/floating.ts), Panel +
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
- **Deux vues, une bascule dans la barre** (2026-10-09, Orhan : « une vue en mode diagramme pur et une autre plus en
  mode admin »). Le critère : **qui le dit**. **Diagramme** (défaut) : le réseau tel que les équipements le disent,
  câbles à l'encre sans statut, aucun point de gravité ni cerne de collecte ; la fiche d'un équipement est
  `cards/NodeFacts.tsx` (identité, câbles, cluster HA, agrégats, table des interfaces, voisins LLDP / CDP annoncés
  depuis `canvas/neighbors.ts`, apparence repliée en dernier), celle d'un câble `cards/LinkFacts.tsx` ; tout ce qui
  s'édite (épingles, teintes, groupes, annotations, connecteurs) vit ici. **Contrôle** (`#mode=control`) : comment B1 a
  dessiné (statuts, sources, contrôles, état de collecte ; `NodeCard`, `LinkCard`), en lecture seule : rien ne se
  glisse, ne s'insère, ne se colore ni ne s'annule, les cadres, annotations et connecteurs restent dessinés mais
  inertes, la barre d'outils se réduit à cadrer et centrer ; les masques de statut ne s'appliquent qu'ici. Le diff se
  lit dans les deux. `useEditable()` et `useControl()` (store) sont la seule porte ; la toile porte `mode-diagram` /
  `mode-control` (canvas.css). La couche « câbles down » (`oper=1`) montre `oper_status` dans les deux vues.
- **La vue Journal** (2026-10-09, `#mode=journal`, troisième bouton de la bascule) : qui a modifié quoi dans l'intention,
  quand, sur quelle infrastructure (`GET /api/intent/journal`). Une page pleine à la place de la toile, qui reste
  montée dessous (`inert`, sans outils ni bande ; sa vue n'est pas poussée tant que le Journal est ouvert). À gauche les
  facettes (infrastructure : celle qu'on regarde, toutes, ou une autre ; catégories ; auteurs, comptées par le serveur),
  en haut la recherche (`/` ou Ctrl+K, envoyée 250 ms après la dernière frappe) et la période ; les entrées par jour
  (heure locale), une phrase par entrée, une rafale résumée (« a placé 4 équipements »), dépliable en une phrase par
  opération et en opérations reçues. Un objet cité (équipement, groupe, annotation, connecteur) ouvre le Diagramme
  dessus, d'une autre infrastructure au besoin. Les filtres sont dans l'adresse en mode Journal seulement (`jq`, `jau`
  répétable, `jcat`, `jinfra` = `*` pour toutes, `jp` = `24h` / `7d` / `30d`). **Passe Impeccable du 2026-10-09** : les
  facettes ne bougent jamais (mêmes valeurs, même ordre, zéro grisé) ; les suites d'un même geste se replient (« ×8 »,
  moins de dix minutes, même auteur, même objet) ; une rafale prend sa catégorie majoritaire et se déplie par verbe, les
  équipements en puces ; une opération seule se déplie en faits (position, teinte, membres…), le JSON derrière « brut » ;
  les positions sont estompées ; un objet disparu de la run ouverte est dit « supprimé » / « absent de la run » au lieu
  d'un lien mort ; la recherche est surlignée (« trouvé dans le détail » sinon) et ne lit plus le nom de
  l'infrastructure ; « montrer » pousse une entrée d'historique (Retour ramène au Journal), pages lues, lignes dépliées
  et défilement survivent à l'aller-retour, une pastille « retour au journal » flotte dans le Diagramme ; au clavier, une
  seule étape de tabulation pour le fil, ↑↓ Origine Fin, Entrée, « o », lien d'évitement, focus gardé après « entrées
  plus anciennes » ; fuseau dans l'en-tête, limites du journal dites en bas ; bascule des vues gardée sous 900 px.
  Fichiers : phrases `state/journal-text.ts`, filtres / temps / suites `state/journal.ts` (purs, testés sous Node),
  commandes `state/journal-commands.ts` (une relecture redemande autant d'entrées qu'on en voyait, 500 au plus), vue
  `components/Journal.tsx` et `components/journal/` (`Facets`, `Tools`, `Row` mémoïsée, `shared`), `styles/journal.css`
  (`content-visibility` sur les lignes). **Reprise visuelle du 2026-10-10** : le fil est un registre à colonnes alignées
  (heure, catégorie, auteur, modification, infrastructure, révision) sous un en-tête figé, une ligne de haut (phrase
  complète en infobulle et dans le détail), une seule famille (Inter, chiffres tabulaires ; chasse fixe pour le JSON brut
  seulement), icône de catégorie sans tuile, champs modifiés en gris, « supprimé » en mot discret ; une recherche trouvée
  hors de la phrase dit le nom (`hiddenHit`, « trouvé : dc01-core-02 ») ; facettes : « Toutes » d'abord puis chaque
  infrastructure par son nom (un point pour celle qui est ouverte), un fond plein qui glisse sous le choix (`useThumb`
  dans `journal/shared.tsx` : place en variables CSS, dessin en `::before`), même curseur relevé sous la période ;
  catégorie ou auteur allumés = coche et fond à 11 % de leur teinte ; un filet entre les sections, « effacer » par section.
  Un seul tableau : l'en-tête des colonnes figé en haut, chaque jour une bande figée dessous (`overflow: clip`, pas
  `hidden`, qui casserait les en-têtes figés). **Export CSV** (bouton « CSV ») : toutes les entrées des filtres posés,
  lues page après page par le store (`exportJournal`, 100 000 au plus, le fichier le dit au-delà), écrites par
  `state/journal-csv.ts` (pur, testé sous Node) : « ; », UTF-8 avec marque, CRLF, une entrée par ligne (jamais repliée),
  date UTC, infrastructure, révision, auteur, catégorie, phrase, objets, opérations en JSON ; une cellule qui commence par
  = + - @ est précédée d'une apostrophe (injection de formule). **Passe « tout, P3 compris » du 2026-10-10** (critique 26/40,
  audit 17/20) : un objet qui n'est plus là garde un nom lisible et la ligne le dit en fin de cellule (« n'existe plus »,
  jamais au milieu de la phrase) ; une phrase qui retire a son verbe en rouge (`j-verb`, `destroy`) ; un sujet sans nom
  se dit par sa sorte (« la forme sans titre »), un ancrage ou un bout par le nom que le serveur cite ; une suite de
  positions d'un même auteur et d'une même infrastructure (trous ≤ 15 min, 3 entrées au moins) devient une **session**
  (« a placé 48 équipements, 312 requêtes depuis 10:13 », dépliable : équipements, requêtes, brut) ; **sessions et
  répétitions (« ×8 ») sont calculées par le serveur sur le journal entier** (`group` de l'entrée), jamais sur la liste
  filtrée : une ligne ne change plus de forme avec un filtre, une partie cachée se dit (« 2 des 6 requêtes ») ; la période gagne **Plage**
  (`jp=range&jfrom=&jto=`, jours compris, heure locale, volet de deux dates) ; l'en-tête (recherche, période, CSV) reste
  figé au défilement (`--head-h` posé par la page) ; pages de 200, la suite se lit en arrivant au bas du fil ; le
  résultat de l'export se dit sous le bouton ; un volet « ? » donne raccourcis et limites (auteur déclaré, pas
  authentifié) ; infrastructure et période en `radiogroup` (flèches, une étape de tabulation ; « Plage » s'ouvre à
  Entrée) ; au retour du Diagramme, le focus revient sur la ligne active (`journalUi.active`, `refocus`) ; « o » sur un
  objet disparu le dit ; l'état vide rappelle les filtres ; colonne Infrastructure masquée dès 1000 px ; facettes sans
  décalage en rangée ; pas de trait de chargement sous le Journal. **Recritique du même jour** (design 29/40, audit
  16/20), quatre défauts réels corrigés : la recherche trouve les mots affichés (« supprimé », « rouge », sans accents ;
  serveur) ; la colonne Infrastructure reste à toutes les largeurs (elle se resserre) ; les regroupements viennent du
  serveur ; le défilement est gardé au retour du Diagramme (tenu à chaque défilement, `.j-main` étant détaché au
  démontage) et la ligne focalisée ramenée en vue. Avec eux : statut d'export toujours rendu (région live fiable),
  erreur de plage reliée au champ (`aria-invalid`, `role="alert"`, bouton éteint neutre), icônes des positions ≥ 3:1 en
  clair, aide refermée quand on la quitte au clavier, « Plage » qui se referme, fuseau hors de la région live, note de
  bas de page avec la page seulement, barre d'outils qui passe à la ligne. **Action, lien, historique** (même jour) :
  facette **Action** (Créé, Modifié, Supprimé ; `jact=` ; une purge compte comme supprimée) ; au pied du détail, **Copier
  le lien** (`?infrastructure=X#mode=journal&jinfra=X&jrev=N`, `entryLink` : la page commence à cette révision, la ligne
  surlignée et focalisée, « Voir les plus récentes » ; une révision disparue le dit) et **Historique de** ses objets ;
  dans le Diagramme, chaque fiche (équipement, groupe, annotation, connecteur) a son bouton « historique au journal »
  (`openHistory`, `jobj=`, Retour ramène au Diagramme) ; l'historique se lit dans une pastille retirable sous l'en-tête.
  Un autre filtre posé quitte le lien (`rev` remis à `null`).
- **L'adresse est l'état de vue** : `?infrastructure=&run_id=&from=` (la run, comme `/view`) et
  `#mode=control|journal&node=…&stubs=1&ports=1&speeds=1&beams=1&pins=0&notes=0&oper=1&diff=0&hide=…&only=…&mask=…` (la vue : le mode et les couches du panneau Affichage en font partie) ; jamais le jeton (dans `sessionStorage`), le nom
  dans `localStorage`. En arrivant sans `run_id`, la dernière run s'ouvre comparée à la précédente.
- **La toile pour l'application** : les règles `[champ:]regex` masquent (`hide`), isolent avec les voisins directs
  (`only`) ou éclairent (palette) ; aligner / répartir ou glisser la sélection pose ses épingles en un paquet sous le
  nom donné (sinon déplacements locaux, dits tels). Rien de tout cela n'apparaît dans `/view`.
- **La sélection mixte et le clavier** (lot 2 de `docs/11`, 2026-10-14). Une sélection accepte équipements, annotations,
  connecteurs et groupes ensemble (`app/state/selection.ts`, pur, testé sous Node : sortes triées, élément principal =
  le dernier entré, rectangle, ordre de lecture, opérations de Suppr) ; câbles, faisceaux, clusters et agrégats se
  sélectionnent seuls. La toile la tient (`toile.state.multi`, `primary` ; `selectItems`, `allItems`, `cycle`), le
  store la reçoit (`picked`, `hosts` gardé), un seul élément garde sa clé dans l'adresse, plusieurs ne s'y écrivent
  pas. **Souris** (D1 et D2, révisées par Orhan le 2026-10-14) : le glissé nu sur le fond déplace la vue (Diagramme et
  Contrôle) ; Maj + glissé dessine un rectangle en mode « touche » qui ajoute à la sélection (Ctrl tenu à la relâche =
  englobés seulement ; calculé par la toile, pas par React Flow : jamais un cadre, un cluster ni un élément verrouillé) ;
  un clic sans glisser sur le fond vide la sélection ; Maj / Ctrl / Cmd + clic ajoute ou retire ; Espace + glissé
  déplace la vue même en partant d'un élément (`space-pan` : `app/canvas/gestures.ts`, `useSpaceHeld`, et `flow.css`),
  le bouton du milieu aussi, partout (son action du navigateur, défilement automatique ou collage, est annulée) ; la
  molette zoome, Ctrl + molette du même pas (`app/canvas/wheel.ts`), pincement = zoom. **Un bloc mixte glisse d'un
  coup** : épingles, places d'annotations et bouts libres des connecteurs (un connecteur sélectionné est glissable avec le bloc, ses bouts attachés suivent ce qu'ils tiennent), membres d'un
  cadre sélectionné, en une écriture (`onBlock` → `IntentHost.apply`) donc un seul Ctrl+Z (« déplacement de n
  éléments ») ; une annotation glissée seule garde son écriture d'avant. **Clavier** (`components/Shell.tsx`) :
  Ctrl+A sélectionne tout ce qui est visible (équipements de la run, annotations et connecteurs dessinés et non
  verrouillés ; jamais les cadres) ; Suppr ou Retour arrière supprime annotations, connecteurs et groupes de la
  sélection en une requête (un Ctrl+Z les rend, et ce qui tenait à un élément recréé le reprend : `relinkOps`) ; sur un
  équipement, rien ne part et la ligne d'état dit qu'il vient de la donnée, avec « masquer » (D5) ; les flèches
  déplacent toute la sélection, annotations et bouts libres compris, une rafale = une écriture (une suppression, un
  couper, un changement de run ou une annulation terminent d'abord la rafale en attente : `toile.flush()`) ; F2 ou Entrée ouvre
  l'édition en place d'une note, de l'étiquette d'une forme ou du nom d'un groupe (double-clic de même ; un champ
  d'une ligne, `app/canvas/inline.tsx`) ; Tab / Maj+Tab passent à l'élément suivant dans l'ordre de lecture (haut
  gauche → bas droite) quand une sélection existe et que le focus est sur la toile, le focus suit le nœud (Échap vide
  la sélection : Tab rend alors la main à la page). **Alignement** (dans la barre contextuelle depuis le lot 4) : des cartes seules gardent
  la règle des centres (« centrer » = même x, « milieu » = même y) ; dès qu'une annotation est dans la sélection, gauche, centre, droite, haut, milieu,
  bas et les deux répartitions se font par les boîtes (`canvas/align.ts`, `alignBoxes`, que `/view` n'embarque pas).
  **Une annotation attachée ne bouge jamais deux fois** (revue de session du 2026-10-15, H1) : flèches, alignement,
  grille et glissé calculent sa boîte visée dans le plan, puis son écart depuis le point de référence de son ancre
  **après** le geste (`toile.anchorAt`, la règle que le collage partage) ; une carte ou un cadre de groupe qui bouge
  avec elle ne la décale pas une seconde fois. La fiche
  d'une sélection mixte (`MultiCard`) compte par sorte ; dans un bloc, une note n'a pas ses poignées de taille.
- **Le presse-papiers** (lot 3 de `docs/11`, 2026-10-14). **Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D**, **Alt + glissé**, et
  dans le menu contextuel « copier », « couper », « coller ici », « dupliquer » avec leur raccourci écrit. Ce qui se
  copie : annotations et connecteurs ; un équipement donne **son nom en texte** (un par ligne) et ne se colle jamais
  (D6) ; un groupe ne se copie pas (la ligne d'état le dit) ; couper = copier puis supprimer exactement ce qui a été
  copié (annotations, connecteurs) : un équipement reste (D5, « masquer » proposé), un groupe aussi, et la page le dit. **La charge** (`app/state/clipboard.ts`, pur, testé sous Node) : `{ "living-diagram": 1, infrastructure,
  annotations, connectors, hosts }`, chaque annotation avec sa boîte dans le plan, chaque connecteur avec la place de
  ses deux bouts ; écrite en deux représentations, le format propre `application/x-living-diagram+json` (`web
  application/x-living-diagram+json` par l'API asynchrone, menu) et le texte (la charge en JSON, ou les noms seuls) ;
  relue dans cet ordre : le format propre, puis un texte qui commence par `{"living-diagram"`, sinon le comportement
  d'avant (une image devient une annotation image, un texte une note). Une version inconnue ou une charge abîmée ne
  colle rien et le dit. **Le repli** : la mémoire de l'onglet garde la dernière copie ; elle sert quand le système a
  refusé l'écriture, quand le texte collé est exactement celui de cette copie (le format propre ne survit pas
  toujours), et au menu « coller ici » si le navigateur refuse la lecture. **Coller** : au pointeur s'il est sur la
  toile (le coin haut gauche du collage dessous, aimanté à la grille avec l'aimant), sinon à la place d'origine
  décalée de +20 / +20, chaque collage répété au même endroit décalant encore ; une annotation garde son ancrage si
  l'ancre existe ici (un équipement du même nom ; un groupe du même id dans la même infrastructure seulement), sinon
  elle devient libre à sa place ; un connecteur suit les annotations collées avec lui, reste attaché à ce qui existe,
  sinon son bout devient un point libre ; un connecteur dont aucun bout ne bougerait est libéré et décalé (sinon il
  serait collé exactement sur l'original). **Deux requêtes, une entrée d'annulation** : les annotations et les
  connecteurs qui n'en visent aucune, puis les connecteurs qui visent une annotation collée, sous l'identité que le
  serveur lui a donnée (`a<révision>-<n>`, dans l'ordre des créations), lue sur la **réponse** de la première requête
  (`AppWriter.outcomeOf`) et vérifiée dans ce document (`verifyCreated`) ; `undo.chain` joint la seconde écriture à
  l'entrée de la première (`history.absorb`, « ajout de n éléments »). Si la seconde ne peut pas partir ou est refusée,
  la première est défaite (`undo.revert`, sans entrée) et la page dit « collage refusé » ; « n éléments collés » ne se
  dit qu'après tout. **Un collage appartient à sa toile** : l'écrivain d'une run écrit dans l'infrastructure de cette
  run (figée), et après chaque attente (renvoi d'image, requête) un collage dont la toile a changé s'arrête sans rien
  écrire de plus et le dit. Une annotation attachée collée d'ailleurs tombe sous le pointeur, son écart étant écrit
  depuis l'ancre d'ici (`Target.anchorAt`, `app/canvas/clip-toile.ts`) ; un collage est borné à 500 éléments et à
  1 Mio de corps (octets UTF-8) ; les ancrages libérés sont dits. D'une autre infrastructure, les images sont lues
  là-bas et renvoyées au magasin d'ici ; une image introuvable devient une note qui porte son texte de remplacement.
  **Dupliquer** : Ctrl+D copie la sélection et la colle à +20 / +20 sans toucher au presse-papiers ; après un Alt +
  glissé, Ctrl+D répète l'écart du clone tant que la sélection est la copie. **Alt + glissé** (`app/canvas/clone.tsx`) :
  l'appui est pris avant React Flow, un fantôme de la copie (les annotations dessinées comme sur la toile, les
  connecteurs) suit le pointeur à 60 %, la copie se crée à la relâche, l'original reste ; poignées, champs, Espace +
  glissé et le bouton du milieu gardent leur geste ; sans nom, Alt + glissé n'est pas pris. Deux Ctrl+D rapprochés posent
  deux copies à deux pas. Un appui sur la toile (hors d'un champ) efface la sélection de texte de la page, pour que
  Ctrl+C copie la sélection de la toile ; un texte sélectionné dans une fiche garde la copie native. En vue Contrôle ou sans nom, rien ne se colle ni ne se duplique, et
  la ligne d'état le dit ; copier reste possible. Les commandes : `app/state/clipboard-commands.ts` ; les événements
  natifs `copy`, `cut`, `paste` et Ctrl+D : `components/Shell.tsx` (dans un champ, ou avec du texte sélectionné dans
  la page, le navigateur garde la main). Ce que les nœuds de React Flow dessinent se calcule dans `app/canvas/flow-build.ts`
  (sorti de `Flow.tsx`).
- **La barre contextuelle flottante** (lot 4 de `docs/11`, 2026-10-14 ; prototype validé `bac-a-sable/lot-4/`,
  qui fait foi pour le rendu). Les réglages fréquents de l'élément sélectionné, à un clic, au-dessus de lui : une note
  (teinte | taille S / M / L · gras · alignement du texte | plan · verrou | dupliquer · supprimer), une forme (teinte ·
  remplissage · bordure · coins | étiquette | plan · verrou | dupliquer · supprimer), un tableau (ligne + · colonne + ·
  en-tête | teinte | plan | supprimer), une image (remplacer · opacité | plan · verrou | supprimer), un connecteur
  (pointes en cycle · tracé | teinte · épaisseur · style | inverser · verrou | supprimer), un groupe (teinte · forme ·
  position de l'étiquette | sélectionner les membres · leur appliquer la teinte | supprimer), un équipement (teinte |
  épingler à sa place / retirer l'épingle · grouper | note attachée · connecteur | masquer · isoler), une sélection
  multiple (aligner et répartir, un bouton à volet de deux rangées, répartir à partir de trois | grouper · teinte, qui
  colore tout ce qui en a une, équipements, annotations, connecteurs et groupes, en une écriture | dupliquer · supprimer
  · verrou, ou masquer · isoler pour des équipements seuls). Le bouton teinte dit sa valeur (« teinte : ambre »), un
  disque coupé quand la sélection en mêle deux. **Les alignements ont quitté la barre
  d'outils du haut** (D10) ; raccourcis Alt + A / H / D / W / V / S, Alt + Maj + H / V. Tout ce que la barre fait,
  l'inspecteur le fait (mêmes commandes du store, mêmes écritures, même pile d'annulation) : « épingler à sa place » est
  aussi dans le menu « … » de la fiche d'un équipement, « verrouiller » et la teinte de toute la sélection dans la fiche
  multiple. **Où** : au-dessus de la
  sélection, 8 px plus haut, centrée ; dessous quand le haut manque ; jamais sous la barre du haut, la recherche, la
  barre d'outils, le panneau ni la bande (zone lue dans le DOM) ; elle évite de couvrir une annotation (puis une carte,
  moins pénalisée, et les étiquettes des connecteurs) ; un connecteur seul l'ancre au milieu de son tracé et de son
  étiquette, son tracé échantillonné est un obstacle fort : un tracé vertical, la barre se pose à côté (`left` /
  `right`) ; l'ergot pointe l'ancre. Les volets s'ouvrent
  du côté de la barre opposé à la sélection, sinon au-delà de la sélection, sinon à côté de la barre : jamais sur
  l'objet. **Quand** : jamais en Contrôle, sans nom, l'outil connecteur armé, sur un câble, un faisceau, un cluster, un
  voisin inconnu ou un fantôme du diff ; cachée pendant tout geste (glissé, redimensionnement, rectangle, bout de
  connecteur, Alt + glissé, édition en place : `app/canvas/gate.ts`) et Maj tenue, revenue 120 ms après ; l'arrivée
  (150 ms, 4 px) ne se joue qu'au passage de cachée à montrée. **Masquer** : Ctrl + . ou la case « barre contextuelle »
  du panneau Affichage (une préférence du navigateur, `fbar` dans `ld-prefs`, jamais dans l'adresse) ; la ligne d'état
  dit la bascule ; masquée, Alt+T la rappelle pour la sélection en cours sans changer la préférence. **Clavier** : Alt+T
  donne le focus à la barre (`role="toolbar"`), ← → Origine Fin la parcourent, ↓ ou ↑ ouvre un volet et y entre, sur
  l'élément coché de son premier groupe de choix (← → ↑ ↓ dans un groupe) ; **Tab et Maj+Tab font le tour des groupes du
  volet** sans le fermer (dans « aligner et répartir » : la grille, les colonnes, l'ordre, « mettre en grille » ; dans le
  volet du langage : la suggestion et la liste ; passe de finition du 2026-10-15), un menu (grouper, ajouter à) se ferme
  à Tab comme un menu ; Échap ferme le volet (d'où que vienne le focus, avant de vider la sélection) puis rend la toile ;
  un volet qui ne tient pas au-dessus se raccourcit (sa liste défile) ou se pose à côté de la barre, le long de sa
  rangée, toujours avec une flèche vers son bouton ou sa rangée ;
  chaque bouton a son nom, son raccourci (`aria-keyshortcuts`), son infobulle « libellé · raccourci ». **Le code** :
  `state/floating.ts` (pur, testé sous Node : quels boutons pour quelle sélection et quel droit, la place de la barre et
  des volets) ; `components/FloatingBar.tsx` (une couche à soi en coordonnées d'écran, plutôt que `NodeToolbar` de
  React Flow : zone visible, dessous, évitement, ancre d'un connecteur, volets ; elle s'abonne à la vue et à la toile,
  la toile ne la connaît pas), `FloatingVolet.tsx`, `floating-faces.tsx` (icônes et glyphes qui montrent la valeur),
  `styles/floating.css` ; `HueGrid` et `PositionGrid` (`ui/inspector.tsx`) sont les grilles de l'inspecteur, partagées ;
  `state/floating-commands.ts` (épingler ici, verrouiller une sélection).
- **Les repères d'alignement et « mettre en grille »** (lot 8 de `docs/11`, 2026-10-14 ; prototype validé
  `bac-a-sable/lot-8/`, qui fait foi pour le rendu). Pendant un glissé (une carte, un bloc, une annotation, un
  cadre), un Alt + glissé et le redimensionnement d'une annotation, un trait chartreuse de 1 px dit « aligné avec »
  (centre ↔ centre, bord ↔ bord, le centre d'abord, une ligne par axe ; l'écart égal se cote en capsule) et la boîte s'y
  colle à moins de 8 px d'écran ; l'aimant de la grille s'applique **après**, sur l'axe libre ; **Ctrl** tenu suspend les
  deux (la pastille du geste dit « libre ») ; les flèches n'ont pas de repères. Le calcul est pur
  (`app/canvas/guides.ts`, testé sous Node, 0,16 ms par pas avec 400 candidates), le branchement corrige les positions que
  React Flow propose avant de les montrer (`app/canvas/guide-drag.ts`, dans `onNodesChange` ; React Flow n'aimante plus
  lui-même), la couche se dessine à l'écran dans son propre état (`app/canvas/GuideLayer.tsx`) : un pas de glissé ne
  reconstruit jamais la toile. **Mettre en grille** (`gridBoxes` dans `canvas/align.ts`) : dans le volet « aligner et
  répartir » (colonnes − / + au moins de cases vides, ordre par nom ou à l'écran, aperçu au survol, l'en-tête dit « 12 →
  4 × 3 »), par **Alt+G** et au clic droit d'une sélection ; trois éléments au moins, une écriture, un Ctrl+Z. Les
  préférences du navigateur : repères allumés (bouton règle de `Controls`), leur couleur (panneau Affichage : le
  chartreuse et les teintes qui tiennent 3:1 sur la toile dans les deux thèmes, `GUIDE_HUES`, vérifié par un test),
  l'ordre de la grille. Parcours Chromium : `backend/tests/test_app_guides.py`.
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
  version de la toile (en reprenant l'objet déjà montré de tout ce qui n'a pas changé, voir « La toile à la jauge ») et
  laisse React Flow tenir la vue, les appuis (Maj + clic, rectangle, glissé de la sélection) et le clavier ; les nœuds sont dessinés en SVG aux dimensions du plan de `card.ts` (la taille mesurée est celle
  calculée : positions déterministes, mêmes classes et styles que `/view`) ; les arêtes reprennent la géométrie de
  `/view` (éventail, bandes, halos, noms de port hors des cartes). Changer la forme d'un nœud = `card.ts` (le plan),
  `nodes.tsx` et `canvas.css`, une capture.
- **La toile à la jauge** (lot 13 de `docs/11`, 2026-10-14 ; 500 équipements du générateur, 1 038 câbles). Rien ne
  change à l'écran ; ce qui coûtait est ailleurs. **Ce qui ne change pas garde son objet** : la toile reconstruit tout à
  chaque version (`flow-build.ts`), puis `app/canvas/reuse.ts` (pur, testé sous Node) reprend l'objet déjà montré de
  chaque nœud et arête qui ne diffère en rien (égalité en profondeur bornée), avec ses mesures (`measured`) quand il a
  changé ; React Flow ne redessine que ce qui change, une version sans changement ne lui donne rien. Nœuds et arêtes
  sont `React.memo` (les cartes, disques, clusters et cadres sur leurs seules données). **Ce qui se calcule une fois** :
  par toile et par langue, le plan d'une carte, les textes traduits (noms accessibles, rôles), les groupes de vitesse
  (par scène), la bande d'un faisceau ; la place des pastilles de câble (`placeCableTags`) ne se recalcule qu'au
  changement de positions, et **après un déplacement elle attend que les positions ne bougent plus** (120 ms,
  minuterie de la page dans `Flow.tsx`) : pendant ce temps les pastilles gardent leur place relative sur leur câble,
  comme pendant un glissé, et le résultat final est celui d'un calcul immédiat. **Une pastille cachée au repos**
  (étiquette de faisceau sans la couche ni un clic qui la révèle, vitesse éteinte) n'entre dans le dessin qu'à sa
  première apparition puis y reste, pour s'effacer en fondu ; son arrivée garde son fondu (`@starting-style`,
  `canvas.css`) ; elles faisaient la moitié des arêtes, chacune un `svg` de React Flow. **React Flow ne monte que ce qui
  se voit** (`onlyRenderVisibleElements`) : un élément entre dans le DOM quand sa boîte entre dans la vue ; cadres,
  clusters et connecteurs déclarent leur taille (`width`, `height` ; un connecteur, la boîte de son tracé, qui ne prend
  aucun appui) pour être jugés sur leur vraie boîte, jamais sur une mesure périmée ; un nœud démonté puis remonté ne
  rejoue pas une demande d'édition (`claim`, `annotation.tsx`) ; un champ d'édition en place qui disparaît avec son
  nœud enregistre, comme quitté (`useFinish`, `inline.tsx`) ; Tab vers un élément hors champ centre la vue sur lui et
  le focus suit à son arrivée (`Shell.tsx`). Un connecteur ne s'abonne qu'à ses deux bouts ; le glissé d'un cadre de
  groupe déplace ses membres dans le même passage que le cadre. **Chiffres** (Chromium sans écran ni GPU, 1440 × 900,
  médianes de trois ; avant → après) : premier dessin, placement mémorisé, 2,79 s → 1,25 s ; du clic à la fiche peinte
  719 → 146 ms (DOM à jour 443 → 73 ms) ; à la barre contextuelle 777 → 211 ms ; flèche, un équipement 288 → 45 ms,
  vingt 360 → 50 ms ; collage de 30 éléments 1 444 → 298 ms ; glissé d'une carte 15-17 → 51-53 images/s (image la plus
  longue 433 → 67 ms) ; panoramique de près 19-22 → 37-45 i/s, de loin 22 → 36 i/s ; « cadrer tout » 413 → 535 ms (tout
  se monte) ; tas JS 75 → 34 Mo, 45 000 → 9 000 éléments DOM à l'ouverture. Sur `demo-dc` (33 équipements), du clic à
  la fiche peinte 131 → 112 ms. Ce qui reste reconstruit à chaque version : la liste des nœuds et arêtes (comparés un à
  un, ~15 ms à 500) ; ce qui reste lent : la tramée logicielle de Chromium sans GPU (plein écran, panneaux floutés),
  « cadrer tout » qui monte tout. Mesures, profils et captures : `.impeccable/planche-lot-13/` (scripts rejouables) ;
  garde Chromium `backend/tests/test_app_gauge.py` (marquée `slow`, lancée dans la suite complète).
- **La carte** (`canvas/card.ts`, partagée avec `/view` ; forme large du 2026-10-07, sur les retours d'Orhan) : un rail
  de la couleur du type sur le bord gauche, l'icône de type dans un carreau teinté de la même couleur, le nom en
  capitales et en chasse fixe (largeur calculée, jamais mesurée), le rôle HA et le compte de stack sur une petite
  ligne dessous. Les couleurs de type sont des jetons (`--type-switch`, `--type-router`, `--type-firewall`…), posées
  par classe `type-*` sur le nœud ; les changer par équipement sera une intention (docs/10).
- **Le nom se lit en dézoomant** (lot 5 de `docs/11`, 2026-10-13) : le nom fait 18 dans la carte (80 de haut, largeur
  commune mesurée sur les noms seuls) ; sous 0,6 la toile passe en `zoom-far` (icône 28, nom 24 centré), sous 0,4 en
  `zoom-tiny` (le nom seul à 30, 14 caractères au plus). Trois dessins dans la même boîte (`card.ts` : `plan().far`,
  `plan().tiny` ; `nodes.tsx`), un seul montré par classe (`styles/canvas.css`) : placement et câbles ne bougent pas.
  La run s'ouvre au zoom de lecture 0,55 (`app/canvas/opening.ts`) ; un voisin inconnu est un disque de 10 dans un
  nœud de 40 × 40, centre sur la grille quand l'aimant est mis.
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
  éditable (un nom) : huit poignées (Maj garde le rapport, Alt part du centre ; voir plus bas), double-clic sur une note = texte en place ; glissé,
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
  (1.5.0, revues au lot 1 de `docs/11` : `app/canvas/anchors.tsx`, quatre points au milieu des côtés de chaque carte,
  disque, annotation et cadre, **jamais au repos ni sur la sélection**, seulement sur la cible d'un bout qu'on tire ou
  sous le pointeur quand l'outil connecteur est armé ; `app/canvas/snap.ts`, pur : un bout glissé s'accroche à une ancre à portée, sinon à l'élément
  dessous sur son contour, sinon reste libre, carte avant annotation avant cadre, l'autre bout du connecteur exclu) ; **Ctrl+V** (`Shell.tsx` : une image du presse-papiers part au magasin, un
  texte devient une note ; une copie de Living Diagram se colle d'abord, voir « Le presse-papiers »).
- **Ce qu'on manipule se voit** (lot 1 de `docs/11`, 2026-10-13). **Poignées** (`app/canvas/handles.ts`, pur, testé sous
  Node ; dessinées par `annotation.tsx`) : taille d'écran constante (× 1 / zoom), quatre coins carrés de 8 px, quatre
  barres de 14 × 5 posées sur les côtés (pas de barre sur un côté de moins de 40 px à l'écran), curseurs de
  redimensionnement ; Maj garde le rapport (coins), **Alt redimensionne depuis le centre** ; une pastille « L × H » (le
  `PillSvg` partagé, ton `muted`) colle à la poignée saisie pendant le geste, « X, Y » au-dessus d'une annotation glissée
  (les valeurs de la fiche) ; l'annotation passe devant le temps du geste. **L'outil connecteur** (`app/canvas/tool.ts`,
  pur ; `app/canvas/drawing.tsx` le branche) : le bouton de la barre est une bascule (`aria-pressed`), touche **C** hors
  d'un champ ; armé, la toile prend la croix et ses appuis avant React Flow (ni glissé, ni sélection, ni panoramique) :
  tirer depuis une ancre (bout fixe) ou l'intérieur d'un élément (bout `auto`) crée le connecteur à la relâche, un clic
  pose le départ et le clic suivant finit ; Échap ou un second appui le range ; il se range seul après une création,
  sauf Maj tenue (création en série). État `tool` dans le store, rangé en Contrôle et au changement de run. **Les
  marques de la cible** (`app/canvas/hover.ts`, pur) : sur l'élément que vise un bout (outil, ou bout d'un connecteur
  existant), deux cibles comme draw.io : le contour en accent plein = bout `auto`, les quatre ancres = bout fixe, celle à
  portée (14 px) grossit ; dessinées une seule fois dans une couche par-dessus la toile (`drawing.tsx`, `SketchLayer`,
  état à part : le pointeur ne redessine qu'elle). **Survol** quand on peut écrire : un liseré d'accent à 50 %, 1 px
  d'écran, sur l'annotation, le cadre, le connecteur (classe `editable` sur la toile) ; curseur `move` sur une annotation
  non verrouillée, `default` en Contrôle. **La bulle** (`app/canvas/tips.tsx`, sortie de `Flow.tsx`) ne se montre jamais
  sur ce qui est sélectionné, ni pendant un geste (glissé, rectangle, redimensionnement, bout tiré, outil armé), ni
  pendant une édition en place (les nœuds le disent par `hold`). Une annotation attachée se dessine toujours au-dessus de
  son ancre : sa fiche et son menu ne proposent plus « dessous ». Un groupe se supprime sans confirmation, depuis la fiche
  comme depuis le menu, et la ligne d'état dit Ctrl+Z.
- **Les préférences du navigateur** (`state/prefs.ts`, `localStorage` `ld-prefs`, jamais dans l'adresse) : thème
  sombre ou clair (`data-theme` sur la racine, les deux palettes dans `tokens.css`), grille (lignes de 20 unités,
  `Background` de React Flow), aimant (un glissé s'aligne sur la grille, `snapToGrid`), minimap (`MiniMap` de React
  Flow, cartes colorées par type, cadre déplaçable). Réglées par `Controls`, en bas à gauche, avec « cadrer tout ».
  La barre contextuelle affichée ou masquée (`fbar`, lot 4) se règle par Ctrl + . ou dans le panneau Affichage.
  Les repères d'alignement (`guides`, `guideHue`) et l'ordre de « mettre en grille » (`gridOrder`) : lot 8, plus haut.
- **La langue** (2026-10-10, `src/i18n/`) : **i18next + react-i18next**, sur une instance propre ; les composants lisent
  `t` par `useTranslation()` (espace `shell` par défaut, `useTranslation(["shell", "common"])` pour en lire un autre,
  clé `common:…`), un module TypeScript pur importe `t` de `i18n/`. Catalogues **embarqués** (un JSON par langue et par
  espace de noms : `common` = vocabulaire partagé, statuts ; `shell` = barre, menu, réglages, accueil), aucune lecture
  réseau. Le **français est la référence** et type les clés (`tsc` refuse une clé inconnue) ; le repli est le français.
  **Langue retenue** : celle choisie (menu ou accueil, `LanguageSwitch`, rangée dans `ld-prefs`), sinon la première
  langue du navigateur que l'on parle, sinon l'anglais ; posée avant le premier rendu avec `<html lang>`, jamais dans
  l'adresse (un lien partagé reste le même). **Ajouter un texte** : une clé dans `locales/fr/<espace>.json` et la même
  dans `en/`, avec les mêmes `{{variables}}` ; un pluriel s'écrit par catégories CLDR (`clé_one`, `clé_many`, `clé_other`
  en français, où `many` sert à 1 000 000 ; `clé_one`, `clé_other` en anglais) et s'appelle `t("clé", { count })`.
  `_zero` est une forme facultative (« aucun équipement changé ») ; une clé **sans** pluriel ne porte jamais `{{count}}`
  (i18next y chercherait un pluriel : nommer la variable `total`). Un texte rangé dans l'état (libellé d'annuler, détail
  d'un résultat de recherche, avertissement de la barre, échec d'une run ou du Journal) se range **sans langue** (clé et
  valeurs, `history.Label` ; `state/said.ts` : `said(clé, valeurs)` ou `answer(statut, corps)`, écrit par `sayText` à
  l'affichage) ou se recalcule avec la langue dans sa clé de cache : il suit un changement de langue. Le choix d'une
  langue passe par `applyLanguage` (`i18n/index.ts`) **avant** de changer l'état (`setPrefs`) : le rendu qui suit parle
  déjà la nouvelle langue, même un composant qui lit `t` sans le hook. La ponctuation vient du catalogue
  (`punct.colon()`, `punct.semicolon()`, `common:punct.percent` : « : » avec une espace en français, sans en anglais),
  jamais `" : "` écrit dans le code. Les clés du Journal sont typées (`tx(clé)`, `ParseKeys<"journal">`) ; une clé
  composée passe par `dyn(...)`, derrière un ensemble fermé. Les textes que React Flow lit au lecteur d'écran (rôles des
  nœuds et des arêtes, nom d'un câble) sont posés par `Flow.tsx` depuis `shell:canvas.role` / `cable` / `beam`. **Un module partagé avec `/view`** (`canvas/format.ts`,
  `hues.ts`, `icons.ts`, `groups.ts`, `annotations.ts`, `connectors.ts`, les hôtes `shell/intent.ts`, `placement.ts`,
  `http.ts`, la bulle `tip.ts` / `bubble.ts`) lit le catalogue `common` par le noyau (`i18n/core.ts`, sans React) ; ses dictionnaires sont des `labelMap`
  (lus à chaque accès, `MAP[x] || x` inchangé chez les appelants). `/view` et `ld render` embarquent ce noyau et restent
  en français : personne n'y change de langue (`viewer.js` passe de 278 à 375 Ko, i18next compris). Espaces de noms :
  `common` (vocabulaire partagé, messages des hôtes), `shell` (barre, recherche, outils, menus, messages de
  l'application), `panel` (les fiches), `journal` (la vue Journal), `checks` (le sens des contrôles, le code pour clé ;
  le français recopie le catalogue du contrat à l'octet, `backend/tests/test_i18n_checks.py` le vérifie ; un code inconnu de
  la page garde le texte que le serveur embarque, `app/state/checks.ts`). Une date ou un tri passe par `locale()` (`i18n/`),
  jamais par une locale écrite en dur.
  `backend/tests/js/i18n.test.js` vérifie tout cela (catégories lues dans `Intl.PluralRules`) et que le fichier construit
  change de langue. Le Chromium des tests parle `fr-FR` (`tests/browser.py`, `lang=`), un test dédié le met en `en-US`.
  **Avancement** : lot 1 (socle, barre, menu, réglages, accueil), lot 2 (recherche, barre d'outils et libellés
  d'annuler / rétablir, panneau Affichage, bande des runs, parcours), lot 3 (les fiches, le menu contextuel, la palette
  des types, les messages d'état, `format.ts` et les dictionnaires partagés), lot 4 (la toile : bulle `tip.ts` /
  `bubble.ts` dans `common:tip`, pastilles ACTIVE / PASSIVE et liste d'un stack, noms accessibles des nœuds, aides
  de React Flow dans `shell:canvas` ; `Flow.tsx` reconstruit ses nœuds et son `ariaLabelConfig` au changement de
  langue), lot 5 (le Journal : espace `journal`, phrases sans auxiliaire posé par `withAux` (« a {{phrase}} » en
  français, rien en anglais), dates et tri par `Intl` dans la locale de la langue (`locale()` : `fr-FR`, `en-GB`), « 1er »
  pour le premier du mois en français, export CSV aux en-têtes et au séparateur de la langue (« ; » / « , »), noms
  d'objets sans nom venus du serveur traduits par `subjectLabel`), lot 6 (le sens des contrôles, espace `checks` ; le mode
  d'un cluster HA en mots dans l'application, `haModeText`, `/view` le garde tel qu'enregistré), lot 7 (les refus de l'API : l'API répond en
  anglais avec un code stable, `shell/http.ts` écrit son texte d'après le code dans `common:http.problem` /
  `common:http.field`, la phrase anglaise du serveur en repli), lot 8 (**aucune chaîne française en dur** : `strings.mjs`, lancé par
  `npm run check` et par la suite Python, lit avec le compilateur TypeScript le fichier que l'application livre, arbre
  secoué et catalogues retirés, et refuse tout texte de `src/` qui a une lettre accentuée du français, un mot outil
  français, un mot que seul le français des catalogues emploie (lexique tiré des catalogues à chaque lancement, mots
  du code exclus) ou la typographie française ; une exception se déclare dans `ALLOWED` avec sa raison ; l'onglet Intentions de `/view` vit dans
  `shell/intent-tab.ts`, que l'application n'embarque plus). **Glossaire anglais** (accepté par Orhan) : équipement = device, câble = cable, contrôle = check,
  épingle = pin, run = run, jeton = token ; vues Diagram / Checks / Log. `/view` et `ld render` restent en français.
- **Le bloc de code** (lot 16 de `docs/11`, 2026-10-14 ; Intent 1.6.0, `docs/10` §6.7) : une cinquième sorte
  d'annotation, `code`, pour coller sur le diagramme un bout de configuration ou de script, lisible, coloré si on le
  veut, copiable, et ne jamais enregistrer un mot de passe sans l'avoir vu. **Insérer** : bouton du bloc Insérer de la
  barre d'outils ou menu du fond ; un brouillon s'ouvre en écriture, rien n'existe avant Ctrl+Entrée. **Coller**
  (Ctrl+V) : un texte de trois lignes au moins dont le langage se reconnaît devient un bloc avec son langage, sinon une
  note comme avant ; **Ctrl+Maj+V** (ou « coller comme bloc de code » au clic droit du fond) en fait **toujours** un
  bloc, au langage détecté même non sûr, sinon « Texte brut » (Orhan, 2026-10-15 ; `pasteChoice` dans
  `app/code/languages.ts` ; mêmes règles : normalisation, borne, avertissement des valeurs sensibles) ; Ctrl+Z défait le
  collage. **Valeurs sensibles** : avant tout enregistrement (création, écriture,
  collage), la page repère les mots de passe, hashs, communautés SNMP, clés (Cisco, FortiOS, Junos, clés privées,
  clé = valeur en YAML / JSON / Python / Bash) et avertit à côté du bloc : chaque valeur avec sa ligne, sa sorte et sa
  nature (hash, type 7 réversible, chiffrée, en clair), la valeur en points, un point rouge dans la gouttière, un clic qui
  la sélectionne dans le texte ; « Retirer ces valeurs » (`<removed>`), « Garder tel quel » (une alerte reste sur le bloc
  et dans la fiche, qui propose encore de les retirer), « Modifier le texte ». L'avertissement est un dialogue modal : le
  focus y entre sur « Retirer », Tab y tourne et n'écrit rien dans le texte ; il se pose à droite du bloc, à gauche,
  dessous, dessus, sinon sur le bloc, toujours dans la zone visible, jamais sous la fiche (`placeWarn`). **Rappel** :
  une valeur gardée reste dessinée en rouge souligné et le bloc porte un bouclier ; au survol de la valeur ou du
  bouclier, la bulle dit sa nature (« type 7 : réversible »…) et « lisible par tous ceux qui ouvrent {infrastructure} »,
  jamais la valeur (`app/code/secret-tip.ts`) ; la fiche dit la même chose au survol (`title`). Rien n'est redemandé ni
  bloqué. Rien n'est envoyé ailleurs.
  **Coloration** : Prism 1.30.0 (`prismjs`, MIT, `manual: true`, `Prism.tokenize` seulement, jamais de HTML ni de DOM),
  grammaires Python, Bash, JSON, YAML de Prism, Cisco IOS / NX-OS recopiée de `blakebratcher/obsidian-cisco-syntax` 0.2.0
  (MIT, `engine/vendor/obsidian-cisco-syntax/` avec sa licence), FortiOS écrite ici (`app/code/fortios.ts`) ; chaque jeton
  rangé dans l'une de onze familles (`app/code/tokens.ts`), dessinées en `tspan` / `span` à classes `tk-…`, couleurs en
  jetons dans les deux thèmes (≥ 4,5:1 sur le fond, l'en-tête et la gouttière, testé) ; un nom d'hôte n'est jamais
  colorié à moitié, la variable d'une boucle Bash n'est pas un mot-clé ; coloration au choix par bloc. **Polices** :
  JetBrains Mono, IBM Plex Mono, Source Code Pro, Cascadia Mono (OFL, `@fontsource` 5.3.0, regular, latin et latin
  étendu, `unicode-range` : un fichier n'est téléchargé que si un bloc l'affiche), chasse mesurée par police (Cascadia
  0,59 em) pour couper les lignes (`›`), jamais de retour à la ligne. **Hauteur libre, le code défile dans la boîte** :
  seules les lignes visibles sont dessinées ; barre de défilement fine (survol, sélection), pouce glissable, piste qui
  pagine ; pied « lignes 34-58 sur 120 » ; **sur un bloc sélectionné seul, la molette fait défiler le code** (en butée,
  rien ne passe à la toile), ailleurs elle zoome (D2), Ctrl + molette zoome toujours ; Page préc. / Page suiv. / Origine /
  Fin. La position de défilement est un état de vue (`app/code/view.ts`) : ni contrat, ni journal, ni historique.
  **Écrire** : double-clic, F2 ou Entrée ; un `textarea` à chasse fixe sur la zone du code, la gouttière gardée, ouvert
  là où l'on lisait ; Ctrl+Entrée enregistre, Échap annule, Tab = 4 espaces, un clic dehors enregistre. **Barre
  contextuelle** : teinte | langage (volet, avec la détection qui propose), police (volet, chaque police dans son rendu),
  coloration, numéros, ajuster la hauteur (60 lignes au plus, absent si inutile), taille | plan, verrou | dupliquer,
  supprimer ; **copier** dans l'en-tête du bloc (à la souris) et dans la fiche (au clavier aussi). **Fiche** : titre,
  code entier coloré (au-delà de 200 lignes, seules les lignes visibles sont rendues : Ctrl+A dans la fiche ne prend
  que la fenêtre, « copier » prend tout), « Affichage » (mêmes réglages, plus la hauteur). **Recherche** : le texte d'un bloc (et d'une note) se cherche, section « notes et
  code », un bloc s'ouvre à la ligne trouvée. Code : `app/code/` (`geometry.ts`, `languages.ts`, `tokens.ts`, `secret-tip.ts`,
  `secrets.ts`, `prism.ts`, `fortios.ts`, `view.ts` ; pur, `LDApp.code`, `backend/tests/js/code.test.js`),
  `app/canvas/code.tsx` (dessin, défilement), `code-edit.tsx` (écriture), `code-warn.tsx` (avertissement),
  `code-draft.tsx` (brouillon, `ViewportPortal`), `app/state/code-commands.ts`, `code-bar.ts`, `components/CodeVolets.tsx`,
  `cards/CodeCard.tsx`, `styles/code.css` ; parcours Chromium `backend/tests/test_app_code.py`. Clavier : la barre (ses
  volets compris, Tab y fait le tour des groupes) et la fiche portent tout ce que la souris fait ; la barre de
  défilement et la molette n'ont pas d'équivalent au clavier autre que Page préc. / Page suiv. / Origine / Fin sur le
  bloc sélectionné ; « copier » de l'en-tête du bloc est retiré de l'arbre d'accessibilité (celui de la fiche le porte).
- **Pas de Tailwind, pas de bibliothèque d'état ni de routeur** (décisions du 2026-10-06) : composants maison dans
  `ui/`, CSS à jetons, `useReducer`.

## Règles

- **Rien d'inventé** : le modèle indexe, il ne déduit pas ; ce qui est dessiné est dans le snapshot.
- **Un geste = une entrée d'annulation, même au-delà de 500 opérations** (revue de session, M2) : l'hôte d'intention
  découpe par 500 (la borne de l'API) ; dans l'application, la pile relie les morceaux (`IntentHooks.parts`,
  `undo.chain`), et si un morceau est refusé, ceux déjà écrits sont défaits (`undo.revert`) et la page le dit.
- **Insérer se pose sur la grille si l'aimant est mis**, sinon au point arrondi (revue de session, J1) : annotation,
  connecteur, bloc de code, comme le collage et Alt + glissé ; une seule règle, `snapped` (`app/state/clipboard.ts`).
- **Jamais de HTML écrit depuis une donnée** (`innerHTML`, `insertAdjacentHTML`… interdits, testé sur les sources et
  sur le fichier construit) ; jamais de style en ligne (la CSP par empreinte n'en admet aucun).
- **Déterministe** : même snapshot ⇒ même placement ; même snapshot et même placement mémorisé ⇒ même dessin ; même source ⇒ même `viewer.js` à l'octet.
- **Types stricts** sur le modèle ; les types des contrats ne s'éditent pas, ils se régénèrent.

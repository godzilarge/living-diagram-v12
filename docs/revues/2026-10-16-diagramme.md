# Revue indépendante : brique 2 de la migration v2, la coquille du diagramme (2026-10-16)

**0 critique, 3 hauts, 5 moyens, 10 bas.**

Relecteur : `relecteur-ui`, sans les conclusions de l'auteur. Rapport consigné tel que rendu ; le traitement est en
fin de document. Étalon : `design/comps/shell/index.html` à l'état par défaut (mesuré dans Chromium à 1440 × 900,
clair et sombre), `DESIGN.md`, `docs/13-migration-plan.md` ligne 2, `.claude/rules/app.md`. La toile v1, le panneau,
la recherche et l'édition sont hors revue.

**Suites** : `npm run check` vert (137 tests). `npx playwright test e2e/diagram.spec.ts` vert (10 tests). `engine npm
run check` vert.

**Conforme, mesuré dans les deux thèmes** :
- Îlots à 16 / 12 px.
- Hauteurs 48 / 32 / 46.
- Couleurs et graisses identiques à la maquette au pixel près : onglets, L1/L2/L3, séries, fil 16 px en line-2, rail
  pointillé ink-3 de la série comparée, compte d'erreurs, séparateurs.
- Fond de carte paper / #161719 et points #DCDEE2 / #2C2E31.
- Repli sous 1200 px.
- Mouvement réduit : le zoom saute sans interpolation, le rail passe à 1 ms.
- Aucun style en ligne, aucun `dangerouslySetInnerHTML`, aucun bouton natif hors `ui/`.

Le dépôt est rendu dans son état initial (sondes supprimées de `app/e2e/`).

## Hauts

- **H1** `app/src/diagram/Canvas.css:27`
  - **Fait** : `margin: 0 0 var(--chrome-bottom) var(--space-lg)`. La variable `--chrome-bottom` n'est définie nulle
    part (`grep` sur `app/src` et `engine/src/app/styles`), donc la déclaration est invalide. Dès que la vue
    d'ensemble est allumée (N), la minimap se pose à (0, 766, 178 × 134) : collée aux bords gauche et bas, elle passe
    sous l'îlot des commandes, qu'elle chevauche de 64 px.
  - **Attendu** : 16 px des bords, 12 px des îlots, aucun chevauchement (DESIGN.md § Layout).
  - **Test** : `e2e/diagram.spec.ts:136` ne vérifie que la visibilité.
  - **Sonde** : `zz-revue-probe4.spec.ts` (`gapToControls: -64`, `left: 0`), capture `minimap-light.png`.

- **H2** `app/src/ui/RunBand.tsx:76`, `app/src/state/runs.ts:41`
  - **Fait** : la bande affiche toutes les séries sur une ligne, sans borne ni défilement. Avec 23 séries, elle
    mesure 2781 px de large, commence à x = −1357 et passe sous les commandes de la toile. L'audit lève `runs:
    -1357.0 px from the left edge` et `canvas-controls overlaps runs`. Les séries les plus anciennes deviennent
    inatteignables à la souris. La fixture de l'accueil porte déjà une infrastructure à cent séries (lab-sec).
  - **Attendu** : aucun îlot ne se chevauche (DESIGN.md § Layout), et la page ne plafonne pas ce qu'on voit
    (docs/13). La forme de la solution relève d'Orhan.
  - **Sonde** : `zz-revue-probe2.spec.ts` › « A many runs at 1440 », capture `A-many-runs.png`.

- **H3** `app/src/state/diff-facts.ts:13`, `app/src/diagram/words.ts:62`
  - **Fait** : le libellé affiche le total du moteur (`diffCount` : sections, contrôles apparus et résolus,
    couverture, redémarrages, instabilités), mais l'infobulle ne détaille que les équipements et les câbles. Sur la
    série livrée, on lit « 10 changements » avec l'infobulle « 1 équipement et 5 câbles changés depuis le 12 janv. ».
    Les 4 autres changements (une grappe HA changée, un contrôle apparu, une couverture, un redémarrage) ne sont
    nommés nulle part.
  - **Attendu** : dans la maquette, l'infobulle rend compte du libellé (14 = 4 + 10). Le front n'affiche pas un
    nombre sans pouvoir dire d'où il vient.
  - **Test** : `tests/diagram-words.test.ts:52` fige la paire 14 / 4 / 10 sur des faits inventés, et
    `tests/diagram-state.test.ts:70` ne vérifie que `total >= 0`.
  - **Sonde** : `zz-revue-probe.spec.ts` › « probe app light » (`diffTip`).

## Moyens

- **M1** `app/src/diagram/useShellKeys.ts:12`
  - **Fait** : Échap, réglages ouverts, ferme le popover **et** désélectionne l'équipement (`#node=dc01-acc-01`
    devient `""`). Cause : `editable()` ne reconnaît que le focus *dans* un `[data-layer]`, or le popover laisse le
    focus sur son déclencheur. La liste « Comparer avec… », elle, garde la sélection.
  - **Attendu** : une touche Échap ferme la couche du dessus, rien d'autre.
  - **Test** : aucun.
  - **Sonde** : `zz-revue-probe2.spec.ts` › « F escape… » (`F`, `F2`, `F3`).

- **M2** `app/src/state/useDiagram.ts:86-107`, `app/src/diagram/ContextIsland.tsx:39`
  - **Fait** : pendant la lecture de la liste des séries, la page est blanche. Ce cas couvre toute adresse sans
    `from`, donc le lien de l'accueil. On ne voit ni grille, ni choix de série, ni indicateur occupé
    (`[aria-busy=true]` : 0), et les commandes affichent « 100 % » sur une toile absente. Cause : la run est encore
    `idle`, donc `waiting` est faux. La clé `diagram:state.loading` (« Reading the collection… ») existe mais n'est
    jamais lue.
  - **Attendu** : un état de chargement visible et annoncé.
  - **Sonde** : `zz-revue-probe2.spec.ts` › « D loading », capture `D-loading-runs.png`.

- **M3** `engine/src/app/canvas/Flow.tsx:70,516`, `app/src/diagram/Canvas.tsx:153`, `DESIGN.md:283`
  - **Fait** : dans la maquette, un point de 1 px de rayon tous les 24 px d'écran, fixe. Dans la livraison, la
    grille suit le zoom (20 unités) : au zoom d'ouverture (74 %), le motif est de 14,76 px pour un rayon de 0,74 px,
    soit 2,6 fois plus de points par surface ; au zoom de la maquette (62 %), 12,4 px. La ligne ajoutée à DESIGN.md
    dit « one every 20 units… the approved mockup's value ». La couleur est bien celle de la maquette, le pas ne
    l'est pas.
  - **Attendu** : la grille de la maquette, que Orhan a voulue discrète.
  - **Sonde** : `zz-revue-probe.spec.ts` (`grid.pattern`, `grid.circle`).

- **M4** `app/src/ui/RunBand.tsx:67`
  - **Fait** : le nom accessible de la série comparée est « 12 Jancompared ». Le `<small>` n'est séparé que par une
    marge CSS, sans espace dans le DOM.
  - **Attendu** : « 12 Jan compared », ou le mot porté proprement dans le nom.
  - **Sonde** : `zz-revue-probe3.spec.ts` (`ariaSnapshot` de `[data-float=runs]`).

- **M5** `app/src/diagram/Diagram.tsx:89`
  - **Fait** : la toile est rendue avant les îlots dans le DOM. Depuis la carte, Tab parcourt les 9 cartes avant
    d'atteindre le logo. Avec 500 équipements, il faut 500 Tab avant le premier îlot.
  - **Attendu** : un clavier complet ; la coquille atteignable sans traverser la toile.
  - **Sonde** : `zz-revue-probe2.spec.ts` › « E keyboard » (séquence `E`).

## Bas

- **B1** `app/src/state/useDiagram.ts:62-65` : après un 401 sur l'instantané, le formulaire de jeton s'affiche, mais
  le choix de série reste occupé (sablier, « Collection »). `refuse` ne sort pas de l'état `loading`. Sonde :
  `zz-revue-probe2.spec.ts` › « J… K », capture `K-401.png`.
- **B2** `app/src/diagram/ContextIsland.tsx:28` : « 10 changements » est un arrêt de Tab qui ne fait rien sur
  Entrée. Il n'est pas désactivé et ne donne aucun motif. Sonde : `zz-revue-probe2.spec.ts` › « G » (`G2`).
- **B3** `app/src/diagram/CanvasControls.tsx:39`, `app/src/shell/ShellTools.tsx:16`, `app/src/ui/Shortcut.css:10` :
  deux défauts sur les contrôles désactivés.
  - Ils annoncent des touches que rien n'écoute : « Edit: in progress M », « Search everywhere: in progress Ctrl K ».
  - La puce `Ctrl K` reste en ink-3 avec un contour line-2 alors que l'icône passe en ink-4 (gris de désactivé).
    L'avatar, dans le même cas, avait été corrigé (revue accueil B5) : deux définitions du même état.
  - Sondes : `zz-revue-probe3.spec.ts` (`tips`), `zz-revue-probe.spec.ts` (`chip`, `searchIcon`).
- **B4** `app/src/diagram/RunsIsland.tsx:30` : sur la première série, « Comparer avec… » est désactivé
  (`aria-disabled="true"`) sans infobulle de motif (`compareTips: []`). DESIGN.md § Buttons : « a tooltip still says
  why ». Sonde : `zz-revue-probe5.spec.ts`.
- **B5** `app/src/diagram/ViewsIsland.tsx:18` : un lien v1 `#mode=control` ouvre Diagramme, mais l'adresse garde
  `#mode=control`. L'adresse dit autre chose que la page. Sonde : `zz-revue-probe5.spec.ts` (`hash`, `selected`).
- **B6** `app/src/state/runs.ts:4`, `app/src/state/useDiagram.ts:106` : l'en-tête affirme « the address always
  carries `from` explicitly » et cite la règle v1 (`engine/src/shell/timeline.ts:6` : sans `from`, la série s'ouvre
  sans diff). Le code fait l'inverse. Conséquence : la même adresse `?run_id=X` s'ouvre sans diff sur `/` et avec
  diff sur `/next/`, contrairement à `address.ts:3-4`. La ligne 29 de `docs/a-juger-a-l-usage.md` ne mentionne pas
  cet écart avec la v1.
- **B7** Code et clés morts :
  - `diagram:context.notCompared`, `diagram:band.title`, `diagram:state.loading`
    (`app/src/i18n/locales/en/diagram.json:15,53,69`) ;
  - les commandes `openRun` et `stepRun` (`app/src/state/useDiagram.ts:27,29`) ne sont appelées par aucun composant.
- **B8** Valeurs hors jetons, toutes reprises de la maquette sans jeton : `app/src/diagram/Diagram.css:79` (36px),
  `:90` (52px), `app/src/ui/RunBand.css:33` (6px), `:41` (pointillé 4px/7px).
- **B9** Écarts de 1 à 4 px avec la maquette (mesurés) :
  - les choix infrastructure et série font 95 / 164 px contre 97 / 166, donc le séparateur tombe à x = 359 contre 363
    et l'îlot contexte fait 448 px contre 452 ;
  - l'îlot des vues a un retrait de 0 7px contre 0 8px 0 4px ;
  - « Collectes » est en 500 contre 400 dans la maquette (DESIGN dit 500 : la maquette et DESIGN.md se contredisent).
  - Sonde : `zz-revue-probe.spec.ts`.
- **B10** `app/src/diagram/ToolsIsland.tsx:16` : le même bouton utilisateur a deux noms selon la page (« orhan »
  sur l'accueil, « orhan, account and language » sur le diagramme). Le diagramme emprunte `home:account`, et
  `diagram:tools.userSoon` duplique `home:accountSoon`.

## Sondes

Specs Playwright dans `docs/revues/2026-10-16-diagramme-sondes/`. On les rejoue en les posant dans `app/e2e/`, puis
`PROBE_OUT=<dir> npx playwright test e2e/<fichier>`.

- `zz-revue-probe.spec.ts` : géométrie et styles, application contre maquette ouverte en `file://`, deux thèmes ;
- `zz-revue-probe2.spec.ts` : séries nombreuses, 1280 / 1199, chargement, Tab, Échap, désactivés, mouvement réduit,
  API muette, 401, série en échec ;
- `zz-revue-probe3.spec.ts` : arbre d'accessibilité et infobulles ;
- `zz-revue-probe4.spec.ts` : minimap ;
- `zz-revue-probe5.spec.ts` : `#mode=control`, « Comparer avec… » désactivé.

Le même dossier contient les mesures (`app-*.json`, `comp-*.json`, `probe2.json`…) et, sous `captures/`
(non versionnées), `A-many-runs.png`, `D-loading-runs.png`, `K-401.png`, `B-1199.png`, `minimap-light.png`,
`minimap-dark.png`.

## Traitement (2026-10-16, le jour même, tout traité)

- **H1** : la marge de la minimap vient des jetons (16 px du bord, 12 px au-dessus de l'îlot des commandes :
  `app/src/diagram/Canvas.css`) ; DESIGN.md § Navigation dit que la minimap est un îlot au-dessus des commandes ;
  test `diagram.spec.ts` « the overview is an island above the controls… ».
- **H2** : la rangée du bas est une ligne flexible (`.diagram-bottom`) : les commandes au début, la bande à la fin,
  12 px entre elles ; la bande rétrécit et **ses séries défilent dedans** (`.ui-runs`, barre de défilement cachée :
  molette, glissé, flèches, Début / Fin, focus ; la série courante est amenée en vue, encore après le chargement de
  la police). Comportement prudent, forme à juger à l'usage (`docs/a-juger-a-l-usage.md`). Test : cent collectes,
  aucun chevauchement, la plus ancienne atteinte par Début.
- **H3** : `diffFactsOf` rend chaque part non nulle du total du moteur (équipements, interfaces, câbles, agrégats,
  domaines MLAG, grappes HA, contrôles apparus et résolus, couvertures, redémarrages, instabilités) ; l'infobulle
  les énumère ; le test vérifie que la somme des parts est le total sur deux fixtures réelles, et le parcours
  Chromium relit l'infobulle contre le libellé.
- **M1** : une couche ouverte (`[data-layer]` dans la page) garde toutes les touches, que le focus soit dedans ou sur
  son déclencheur ; test : Échap ferme les réglages sans toucher la sélection.
- **M2** : pendant la lecture de la liste des collectes, le choix de collecte est occupé (`aria-busy`) et dit
  « Lecture de la collecte… » ; les commandes de la toile n'apparaissent qu'avec une toile ; test avec une liste
  lente.
- **M3** : la grille est celle de la maquette, **fixe à l'écran** (points de 1 px tous les 24 px, jetons `grid.step`
  et `grid.dot`), dessinée par l'hôte de la toile, plus par React Flow ; la grille du plan (20 unités, aimant)
  revient avec le mode édition (brique 6) ; DESIGN.md § Colors « Grid » corrigé ; la prop `dots` ajoutée à `Flow`
  est retirée (une seule touche au v1 reste : `onView`).
- **M4** : une espace avant le mot « comparée » dans le DOM.
- **M5** : la toile est le dernier enfant du DOM, sous les îlots par `z-index` : Tab atteint chaque îlot avant les
  cartes.
- **B1** : un jeton refusé sort la run de l'état « en lecture » (réducteur `token`).
- **B2** : le bouton des changements est la bascule v1 « montrer les changements sur la carte » (rail quand
  allumé, `diff=0` dans l'adresse quand éteint) ; test.
- **B3** : plus de touche annoncée sur un contrôle désactivé ; la puce `Ctrl K` passe en ink-4 avec l'icône
  (`Shortcut.css`, une seule définition de l'état désactivé).
- **B4** : `Select` reçoit `disabledReason` (infobulle) ; « Comparer avec… » dit « Aucune collecte antérieure à
  comparer » ou « Lecture de la collecte… » ; test.
- **B5** : un mode que la coquille ne montre pas encore (`#mode=control`, `journal`) se lit Diagramme et l'adresse
  est réécrite (`shownView`, jusqu'à la brique 7) ; test.
- **B6** : les en-têtes de `runs.ts` et `useDiagram.ts` disent ce que le code fait et l'écart avec la v1 ;
  `docs/a-juger-a-l-usage.md` le nomme.
- **B7** : clés mortes retirées (`notCompared`, `band.title`, `tools.*`) ; `state.loading` sert (M2) ; `openRun` et
  `stepRun` retirés des commandes.
- **B8** : jetons `layer-choice.width`, `zoom-word.width`, `run-band.compared-gap / dash / dash-gap` dans
  `DESIGN.md`, générés, employés.
- **B9** : le choix (`.ui-button-choice`) prend l'écart de 6 px de la maquette, l'îlot des vues le retrait
  `0 8 0 4` ; « Collectes » reste à 500 : DESIGN.md (label = 500) prime sur la maquette, qui le contredit.
- **B10** : un seul bouton utilisateur (`shell:user`, `shell:account`, `shell:accountSoon`) pour l'accueil et le
  diagramme ; les clés doublonnées retirées.

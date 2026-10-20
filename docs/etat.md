# État du projet

Une page, tenue à jour en fin de chaque session (skill `livraison`). Première lecture d'une session. Le détail d'une
ligne se trouve dans `docs/journal.md` par recherche sur sa date ou son titre.

**Dernière mise à jour : 2026-10-20** (refonte UI : brique 7, **la vue Journal (J1) livrée et revue** ; la vue Contrôle attend le choix d'Orhan parmi les trois directions du banc).

## Fait

- **Contrats** (`ld-contracts`) : RunBundle v1, Snapshot v1, Diff v1, Intent 1.6.0 (épingles, couleurs, groupes,
  annotations dont bloc de code, connecteurs ancrés). Générateur synthétique à graine. ~630 tests.
- **Backend** : ingestion, archive disque, B1 complet (R0 à R6, R1-bis, R2 forme HA), B3 diff à la demande, B4 intention
  (store, journal, purge, magasin d'images), placement mémorisé, API en huit groupes (`Problem` typé, erreurs en
  anglais), CLI `ld`, `/view` et `ld render` (pages de diagnostic, **gelées**). ~620 tests.
- **Application React v1** (`engine/src/app/`, servie à `/`) : toile React Flow, deux vues Diagramme / Contrôle, vue
  Journal, recherche, sélection mixte, presse-papiers, barre contextuelle, repères d'alignement, bloc de code,
  inspecteur, interface bilingue fr / en. Lots de `docs/11` livrés : 5, 1, 2, 3, 4, 13, 8, 16. **Le style de cette v1
  est rejeté en bloc par Orhan (2026-10-15) ; sa logique pure (`state/`, `canvas/*.ts`, `api/`) est à garder.**

## En cours

- **Refonte UI v2** (décidée le 2026-10-15). Socle : **0 gouvernance faite (45d2a21, hook de démarrage d89ee37)** →
  **1 `PRODUCT.md` validé** (en anglais ; tout ce que la v2 crée s'écrit en anglais) → **3 tour de directions fait et
  coquille validée le 2026-10-16** (base = le standard + la vivacité suisse ; îlots flottants, un accent cobalt ou
  encre en préférence, vert = état actif, rail fin pour « courant », icônes + infobulle noire, palette Ctrl+K, accueil
  à widgets, panneau à trois largeurs, mode édition avec barres contextuelles) → **4 `DESIGN.md` écrit et maquettes
  versionnées dans `design/` (fabd1ee)** → **2 squelette `app/` livré (d3937c3)** : paquet Vite, jetons générés de `DESIGN.md`, 15 primitives,
  page vivante `app/primitives.html`, gardes par mutation, mesure Playwright, route `/next/` ; **revue traitée**
  (`docs/revues/2026-10-16-squelette-app.md` : 4 hauts, 10 moyens faits ; contours sous 3:1 assumés) → **5 migration par
  briques, plan dans `docs/13-migration-plan.md`** : 1 accueil → 2 coquille du diagramme (toile v1 dedans) → 3 panneau →
  4 recherche → 5 réglages et langue → 6 édition → 7 vues Contrôle et Journal → 8 bascule de `/` et suppression de
  `engine/src/app/`. **Brique 1 accueil livrée le 2026-10-16** (route `GET /api/infrastructures`, quatre widgets sur
  l'archive réelle, primitives `Widget` / `Avatar` / `Mark` / `Link` ajoutées à `DESIGN.md` ; revue
  `docs/revues/2026-10-16-accueil.md` traitée, M5 parqué vers la brique 7 ; `docs/13` § Done ; retouche du même jour
  après le premier regard d'Orhan : tri, filtre par état, réglage par widget du nombre de lignes, `?recent=N` ; **règle :
  la page ne bride jamais l'utilisateur, un défaut n'est pas un plafond**). **Brique 2, la coquille du diagramme,
  livrée le 2026-10-16** (`/next/?infrastructure=…` : îlots contexte / vues et couches / outils, commandes de la
  toile, bande des collectes (`RunBand`), la toile v1 montée **en lecture** ; `state/` adresse, run, bande, zoom,
  diff et `api/` run, placement, images déplacés avec leurs tests ; `grid` / `minimap` dans `ld-prefs` ; Contrôle,
  Journal, L2, L3, Modifier, Exporter, Rechercher désactivés « en cours » ; grille fixe de la maquette ; revue
  `docs/revues/2026-10-16-diagramme.md` traitée en entier le jour même ; `docs/13` § Done ; six points dans
  `docs/a-juger-a-l-usage.md`). **Brique 3, le panneau, livrée le 2026-10-16** (la fiche de l'élément sélectionné
  aux trois largeurs de la maquette : compacte (À vérifier, Identité, Interfaces, Paire MLAG, Agrégats, HA, stack,
  changements), large (W, préférence `panel` de `ld-prefs` : mode et VLAN, description, identité sur deux colonnes),
  focus (Maj+F, un mode sur le scrim : bandeau de faits, toutes les colonnes, choix des colonnes ; Échap en sort, Échap
  ferme) ; **chaque fait du contrat sur une interface se lit**, le voisin est celui vu par LLDP / CDP (lien discret qui
  le sélectionne), la description brute en ink-3 ; **les alertes sont les contrôles de B1 en phrases**, une par code
  dans les deux langues, groupées par code, jamais le code ; fiches câble / agrégat / faisceau / grappe HA dans la même
  grammaire ; groupes, annotations, connecteurs attendent la brique 6 ; primitives `Facts` et `Alerts` ajoutées à
  `DESIGN.md` et à la page vivante ; logique dans `app/src/state/panel.ts`, composants `app/src/panel/` ; revue
  `docs/revues/2026-10-16-panel.md` (0 critique, 2 hauts, 11 moyens, 8 bas) traitée le jour même, deux points assumés
  (description lue par B1 et statut / sources d'un câble = vue Contrôle ; une ligne de focus grandit pour garder un
  fait entier), deux bas parqués (longueurs brutes, capacités LLDP) ; `docs/13` § Done ; six points dans
  `docs/a-juger-a-l-usage.md` ; retouche du même jour après le premier regard d'Orhan : le choix des colonnes s'ouvre
  sous sa barre, le tableau du focus glisse vers la droite à sa largeur naturelle, colonne Port et en-tête fixes, lignes
  à 44 px ; le redimensionnement du panneau à la souris est **parqué** (Orhan, 2026-10-16 : « plus tard ») ; le
  sélecteur de colonnes du focus, jugé « lourd, laid », a été tranché au banc (`bac-a-sable/colonnes/`, quatre
  directions) : une **liste à coches**, primitive `Checklist` ajoutée à `DESIGN.md` et à la page vivante).
  Suites : app check 162, e2e 46 ; engine check vert ; backend et contrats verts ; commité bc3ecff. **Brique 4, la
  recherche, livrée le 2026-10-16** (la palette Ctrl+K de la maquette, état `search`, sur le diagramme et sur
  l'accueil : 752 px sur un scrim qui couvre carte et îlots, champ nu, sept onglets avec comptes (Tout, Équipements,
  Ports, Groupes, **Notes** ajouté, Infrastructures, Actions), résultats groupés avec la partie trouvée en gras, ligne
  courante sur accent-weak, colonne de détail (tuile, nom, faits `snug`, première alerte en mots, « où mènent ses
  câbles », « Ouvrir la fiche », « Centrer la vue »), pied de raccourcis ; ↑ ↓ parcourent, Entrée ouvre sans bouger la
  vue, Maj+Entrée centre, Tab change d'onglet, Échap ferme et garde le texte ; une fenêtre par groupe (8 dans Tout,
  100 dans un onglet, « … et N de plus » page par page, jamais un plafond) ; `state/search.ts` déplacé de la v1 avec
  ses cas, étendu (infrastructures, actions de la coquille, détail) ; primitive `Palette` dans `DESIGN.md` et la page
  vivante ; rangée d'option unique `Select` / `Palette` (position clavier = accent-weak, écrit dans `DESIGN.md`) ;
  revue `docs/revues/2026-10-16-recherche.md` (0 critique, 1 haut, 7 moyens, 13 bas) traitée le jour même en entier
  (§ Traitement ; jauge 500 équipements : une lettre 5 s → 47 ms) ; `docs/13` § Done ; six points dans
  `docs/a-juger-a-l-usage.md` ; parqués : éclairer la toile à la frappe, Maj+Entrée « sélectionner les trouvés »,
  masquer / isoler, puces de champs). Suites : app check 193, e2e 58 ; engine, backend (643), contrats (637) verts ;
  **commité 9f93548, poussé**. **Brique 5, réglages et langue, livrée le 2026-10-16** (le popover du squelette comparé à la maquette
  `data-state="settings"` et trouvé **identique**, mesuré dans Chromium (`app/e2e/settings.spec.ts`) en clair, sombre,
  cobalt, encre, français, sur le diagramme et l'accueil ; bascule de langue de bout en bout (îlots, fiche, titre de
  l'onglet, `lang`, dates, toile v1), stockée, relue, suivie par les autres onglets ; rien de choisi ⇒ la langue du
  navigateur ; clavier complet ; audit des catalogues : clé morte `shell:map` retirée, « 100% » en anglais, **espaces
  insécables françaises** avant `: ; ! ? %` et dans « » (62 textes, défaut pur : la maquette et la v1 ont l'espace
  sécable), insécable entre nombre et unité, comptes en chiffres de la langue (`{{count, number}}`) ; corrigés en
  passant : la montée du popover à l'ouverture (maquette), Échap rend le focus sans infobulle, `app/public/boot.js`
  peint le thème stocké avant le chargement de l'application, les préférences n'écrivent que le champ changé et
  écoutent `storage` (jamais un choix périmé ni les défauts v2 sur ceux de la v1), un déclencheur de popover ne porte
  que `aria-expanded` (le rail) ; revue `docs/revues/2026-10-16-reglages.md` (0 critique, 0 haut, 5 moyens, 10 bas)
  traitée le jour même en entier, B9 parqué motivé ; `docs/13` § Done ; deux points dans `docs/a-juger-a-l-usage.md`
  (retour à la langue du navigateur, thème du système)). Suites : app check 195, e2e 68 ; moteur, backend (643), contrats
  (637) verts ; **commité f978c87, poussé (a87cae7)**. Orhan n'a pas encore jugé les planches du panneau (`.impeccable/planche-panneau/`),
  de la recherche (`.impeccable/planche-recherche/`) ni des réglages (`.impeccable/planche-reglages/`) : ses retours
  passent avant la brique 6.
  **Brique 6, le mode édition, livrée le 2026-10-16** (prise avant la poussée des briques 4 et 5, puis rebasée dessus :
  les états `edit` et `edit-note` de la maquette ; le crayon (M) entre et sort du mode, le panneau et la bande se
  cachent, la grille du plan et l'aimant de la v1 ; la palette à x = 16 (V, L « en cours », K, N, S, T, I, B, G, l'outil
  courant au rail, les touches dans les infobulles) ; la barre contextuelle 12 px au-dessus de l'élément, retournée
  sous les îlots du haut, cachée pendant un geste : barre d'équipement et barre de note de la maquette, forme,
  tableau, image, bloc de code, connecteur, groupe et sélection multiple dans la même grammaire, volets de teintes,
  de listes, d'alignement, menus ; le menu du clic droit de la v1 ; son clavier (Suppr, F2, Tab, flèches, Ctrl+Z / Y,
  Ctrl+A / C / X / V / D, Ctrl+Maj+V, Alt+lettres, P, H, Ctrl+B) ; **rien ne s'écrit sans nom**, que le bouton
  utilisateur prend désormais (popover, mots de la v1, jusqu'aux comptes) ; la recherche offre « Modifier le
  diagramme ». Logique dans `app/src/state/` (`diagram.ts`, `bars.ts`, `bar-place.ts`, `bar-actions.ts`,
  `edit-keys.ts`, `edit-commands.ts`, `author.ts`) testée sous Node ; les fabriques de commandes de la v1
  (`engine/src/app/state/{intent,clipboard,code,floating}-commands.ts`) réutilisées par injection (déplacées à la
  bascule) ; la toile monte les hôtes v1 (écrivain, intention, pile d'annulation) ; la v1 touchée une fois
  (`CodeContext` resserré). Primitives `Menu`, `Swatch`, `FileInput`, `Island` en colonne, `Popover` ancré au
  déclencheur, `opener` ; `DESIGN.md` et la page vivante à jour. Revue `docs/revues/2026-10-16-edition.md` (0 critique,
  4 hauts, 5 moyens, 7 bas) traitée le jour même (§ Traitement) ; **reste de la brique, pour une brique ultérieure** :
  la teinte d'un type (la palette des types de la v1), la description et le style du cadre d'un groupe, la courbure
  chiffrée d'un connecteur, réglages fins de l'inspecteur v1 à loger dans les fiches de groupe, d'annotation et de
  connecteur en mode édition. Douze points dans `docs/a-juger-a-l-usage.md` (dont la couleur de la grille du plan,
  choix de l'agent ui à faire juger, et l'estompage des cartes par la toile v1 quand une note est sélectionnée).
  Suites : app check 229, `e2e/edit.spec.ts` 10 ; la suite e2e entière verte sauf cinq écarts sous-pixel (16,2 et
  15,7 px du bord) que le Chromium 1194 de la machine de session donne aussi sur `origin/main` (Playwright 1.61
  attend le 1228 ; `LD_CHROMIUM=<chemin>` dans `app/playwright.config.ts` choisit le binaire) ; moteur et contrats
  verts ; backend 643 avec trois échecs propres à cette machine (Chromium cherché sous `~/.cache/ms-playwright`,
  Node 22.22 refusant `node --test <dossier>`, un motif `tests/js/*.test.js` passe). Captures
  `.impeccable/planche-edition/` (non versionnées : remises à Orhan). **Commitée 8a30e6f, poussée** sur
  `claude/keen-dirac-d907ei`. **Retouche du 2026-10-17** après le premier essai d'Orhan sur son archive (cinq
  points, tous traités) : **la lecture ne bouge rien** (option `movable` de la toile v1, fausse hors mode édition ; un
  glisser sur une fiche déplace la vue ; la décision « glisser local » de la brique 2 est remplacée) ; **Annuler /
  Rétablir** au pied de la palette (désactivés pile vide, Ctrl+Z / Ctrl+Y en infobulle ; point « à juger » tranché) ;
  **Équipements masqués** : bouton de la palette et menu (`app/src/state/hidden.ts` sur `keepByRules`) qui liste **une
  ligne par règle** (les noms d'un masquage à la main, l'expression avec son compte, l'isolement en dernier) ; la
  choisir lève la règle entière, « Tout afficher » lève tout ; **masquer par motif depuis la recherche** : l'action
  de requête « Masquer ces N équipements » quand l'expression désigne des équipements (l'expression devient la règle
  de vue, comme la v1 : `ADMIN` masque tout nom qui le contient), « Afficher les N équipements masqués » dès que
  quelque chose est masqué (la lecture a son retour) ; isoler et les chips restent parqués ; **le brouillon de code abandonné à l'ouverture** était le mode strict de React en dev seulement, les
  deux démontages de la v1 qui enregistrent (`code-edit.tsx`, `inline.tsx`) décident une micro-tâche plus tard. Au
  passage : la minimap passe en bas à droite en mode édition (la palette à douze outils la touchait ; la zone de la
  barre contextuelle la réserve), le simulateur d'API e2e fusionne le placement comme le backend (tempête d'écritures
  du simulateur corrigée), `Menu` ligne `verbatim`, infobulle périmée d'un ouvreur corrigée, bundle v1 `app.js`
  reconstruit ; `Menu` borné à 320 px avec ellipse (jeton `menu.max-width`). Suites : app check 243, `e2e/edit.spec.ts` 14,
  `e2e/search.spec.ts` 13 ; `measure.spec` : six écarts sous-pixel identiques sur
  `origin/main` avec le Chromium 1194 (environnement) ; moteur vert. Captures `.impeccable/planche-palette-foot/`
  remises à Orhan. **Commitée et poussée** à la demande d'Orhan. Orhan n'a pas
  encore jugé les planches du panneau, de la recherche, des réglages ni de l'édition : ses retours passent avant la
  brique 7.
  Serveur de test pour Orhan : `:8018/next/` sur `bac-a-sable/accueil-data/archive-six`, jeton `demo` (démarré à
  la main : `cd backend && LD_API_TOKEN=demo LD_ARCHIVE_DIR=../bac-a-sable/accueil-data/archive-six uv run uvicorn
  ld_backend.api:app_from_env --factory --host 0.0.0.0 --port 8018`, après `cd app && npm run build` ; il sert
  `app/dist` tel quel, un `npm run build` suffit à le mettre à jour). **Brique 7, Contrôle et Journal, au banc (2026-10-17)** : aucune maquette approuvée n'existait pour ces deux
  vues, donc banc avant tout code : `bac-a-sable/controle/` (gitignoré, sur la machine d'Orhan : il n'est pas dans un
  clone frais), cinq pages ; captures `.impeccable/planche-controle/` remises. Contrôle : **A** le registre, **B** la
  carte et un îlot de verdicts à gauche, **C** deux bandes de bascules sous la rangée du haut. Journal : **J1** le fil
  et ses facettes, **J2** le tableau filtré. **Orhan a tranché J1 le 2026-10-20** (« définitivement J1 ») avec deux
  remarques : « tout compacté à gauche, manque d'équilibre » ; une ligne Journal / Historique dans le menu contextuel
  de chaque élément. **Il regarde encore les prototypes de Contrôle.** **Brique 7, partie Journal, livrée le
  2026-10-20** (`/next/?infrastructure=…#mode=journal` ; l'onglet Journal actif, Contrôle toujours « en cours ») : les
  îlots Filtres (288) et Journal forment **une colonne de lecture centrée bornée à 1280 px** (réponse à la remarque
  d'équilibre, à juger sur la planche) ; le fil par jour, les lignes repliées « ×8 », les sessions, les positions en
  retrait, le verbe rouge d'une suppression, la ligne dépliée (faits, équipements, brut, « Copier le lien »,
  « Historique de … »), facettes, période et plage, recherche, CSV, aide, lien `jrev`, historique `jobj` ; la toile
  reste montée dessous (`inert`) ; **le menu du clic droit s'ouvre aussi en lecture** avec les lignes lecture de la v1
  et **« Historique » en tête** pour équipement, groupe, annotation, connecteur (Retour ramène au diagramme) ;
  l'accueil passe sur la primitive `Feed` et la grammaire du Journal (M5 de la revue de l'accueil) ; le panneau porte
  un bouton « Historique » (revue H3) ; « Ouvrir le
  journal » ouvre le Journal de toutes les infrastructures. Logique v1 portée dans `app/src/state/journal*.ts`,
  `useJournal.ts`, `api/journal.ts`, filtres dans l'adresse (`address.ts`, écrits en mode journal seulement) ;
  catalogue `journal` fr / en ; primitives `Facets` et `Feed` dans `DESIGN.md` et la page vivante, `Segmented` avec
  un segment qui ouvre un popover, jetons `journal.*`. Douze points dans `docs/a-juger-a-l-usage.md` (colonne 1200,
  menu en lecture, heures à la minute, grammaire de l'accueil, en-tête replié, points médians du sous-titre,
  toast du CSV, brut en Archivo, le toast sur le fil, élision « Historique de »). Revue
  `docs/revues/2026-10-20-journal.md` (0 critique, 3 hauts, 7 moyens, 14 bas) **traitée le jour même** (§ Traitement ;
  M3 à juger par Orhan sur les captures, B13 et B14 assumés) ; reste : un test de catalogue qui fige les espaces
  insécables, `Journal()` à découper (203 lignes), `/`, la lecture au bas du fil et le défilement gardé sans e2e
  (sondes de la revue vertes). Suites : app check 264, `e2e/journal.spec.ts` 7 ; e2e entière 78
  verts + 12 écarts sous-pixel connus de Chromium 1194 (`LD_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  sur cette machine) ; **test instable** : `e2e/edit.spec.ts:226` (P épingle, H masque, menu de groupe) échoue en suite
  complète, vert seul (1 échec sur 3 passages) ; moteur vert ; backend 98 % (un échec d'environnement :
  `test_the_viewer_passes_its_node_tests`, Node 22.22 refuse `node --test <dossier>` ; les tests Chromium passent avec
  un lien `~/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/chrome-headless-shell` vers le headless
  shell du conteneur) ; contrats 98 %. Captures `.impeccable/planche-journal/` (non versionnées, remises à Orhan). **Commité a0f36c0, poussé** sur
  `claude/inspiring-noether-darrm2` (branche partie de `claude/keen-dirac-d907ei`, la brique 6 et le banc).
  **Prochaine session : `/brique-ui controle`**, en commençant par le choix d'Orhan (A, B ou C) et ses remarques sur la
  planche du Journal : écrire d'abord dans `DESIGN.md` et la page vivante les primitives que la direction demande (puce
  `Code` réservée à Contrôle ; îlot gauche pour B ou bascules mot + compte pour C), un catalogue `control:codes` d'une
  phrase par code avec son compte (`panel:checks` parle par équipement), puis construire. À savoir : l'onglet Contrôle
  est désactivé dans `app/src/diagram/ViewsIsland.tsx` ; `SHOWN_MODES` de `app/src/state/diagram.ts` laisse passer
  `diagram` et `journal` ; `pushView` de `app/src/diagram/Canvas.tsx` force `control` à faux ; la v1 dessinait les
  statuts et les contrôles sur la toile en vue Contrôle (`toile.state.control`) ; le Journal montre comment une vue
  couvre la toile sans la démonter (`app/src/journal/Journal.tsx`, `Diagram.tsx`) ; `/view` reste gelé, ses onglets
  Contrôles, Qualité, Sources sont absorbés par la vue ; rien de nouveau côté API ; `npm run e2e` dure ~4 min. **La toile
  (cartes, câbles) est une autre surface** : tour de directions à part, en repartant des cartes v1. **Aucune fonctionnalité nouvelle pendant la
  refonte.**
- **Lots 16 bis et 4 bis, interrompus** (2026-10-15) : sur la branche `lots-16bis-4bis` (85f9b2b, poussée), jamais
  fusionnée ; suite complète et revue non faites. À reprendre après la refonte, sur le nouveau socle.

## À faire (après la refonte, dans cet ordre)

1. Lots `docs/11` restants : 16 bis + 4 bis (`Intent` 1.7.0), 7, 9 (ordre / verrou, 1.8.0), 10 styles, 11 export
   PNG / SVG, 12 multi-utilisateur (`expected_revision`), 15 texte riche. Le lot 14 (passe visuelle) est absorbé par
   la refonte.
2. `docs/10` §8 : épingles d'étiquettes, styles de câbles, masque par règle enregistré, câbles déclarés.
3. Gel du contrat d'entrée au premier bundle réel ingéré ; passage des docs, CLI et `CONTRAT.md` en anglais.
4. Niveau 3 du bouton d'actualisation (`collect + export`), après la V1.

## Parqué (décision écrite, pas de code)

- Table MAC `docs/06` (conçu, non validé, déprioritisé le 2026-10-04) ; ARP avec la vue L3.
- B2 Mongo (le disque suffit) ; H2 téléphones (deux câbles par téléphone IP) ; VSX ; statuts des tasks.
- Panneau redimensionnable à la souris (Orhan, 2026-10-16 : « on le note pour plus tard ») : interaction nouvelle, à
  prototyper au banc si les trois largeurs ne suffisent pas à l'usage.
- Lot 6 arrangements (couches, radial) : le placement est personnel et mémorisé ; seul « mettre en grille » a été gardé.
- Questions ouvertes consignées : `docs/05` §8 q6, `docs/07` §7, `docs/08` Q1-Q5, `docs/09` §6, `docs/10` §6.5,
  `docs/a-juger-a-l-usage.md`.

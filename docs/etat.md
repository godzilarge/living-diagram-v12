# État du projet

Une page, tenue à jour en fin de chaque session (skill `livraison`). Première lecture d'une session. Le détail d'une
ligne se trouve dans `docs/journal.md` par recherche sur sa date ou son titre.

**Dernière mise à jour : 2026-10-16** (refonte UI : brique 2, la coquille du diagramme, livrée et revue ; prochaine brique : le panneau).

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
  `docs/a-juger-a-l-usage.md`). Suites : app check 137, e2e 41 ; engine check vert ; backend et contrats verts.
  Serveur de test pour Orhan : `:8018/next/` sur `bac-a-sable/accueil-data/archive-six`, jeton `demo` (démarré à
  la main : `cd backend && LD_API_TOKEN=demo LD_ARCHIVE_DIR=../bac-a-sable/accueil-data/archive-six uv run uvicorn
  ld_backend.api:app_from_env --factory --host 0.0.0.0 --port 8018`, après `cd app && npm run build`). **Prochaine
  session : `/brique-ui panneau`** (brique 3 de `docs/13-migration-plan.md` : `design/comps/shell/index.html` avec sa
  fiche, états `panel-wide` et `panel-focus` ; chaque fait du contrat sur l'élément sélectionné, colonnes Voisin et
  Description, alertes en mots ; `state/` sélection, `canvas/neighbors.ts`, `format.ts` déplacés ; rien de nouveau
  côté API). À savoir : la sélection de la toile est déjà dans l'état et l'adresse (`state.selection`, `hosts`,
  `#node=`) ; le panneau se monte dans `app/src/diagram/Diagram.tsx` et réserve sa largeur dans les insets de la
  toile (`diagram/chrome.ts`, `right`) ; la primitive `Panel` existe (`app/src/ui/Panel.tsx`, trois largeurs à
  vérifier contre la maquette) ; la bulle au survol de la toile garde `role="tooltip"` (à juger) ; l'aimant, la
  grille du plan, le clic droit et toute écriture d'intention attendent la brique 6 (Orhan, 2026-10-16 : « rester
  sur le plan, ne pas dégrader ») ; `npm run e2e` dure ~1,5 min (série synthétique `app/e2e/fixtures/diagram/`) ;
  `cd engine && npm ci` est requis avant `cd app && npm run build` (polices de la toile v1). **La toile (cartes,
  câbles) est une autre surface** : tour de directions à part, en repartant des cartes v1. **Aucune fonctionnalité
  nouvelle pendant la refonte.**
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
- Lot 6 arrangements (couches, radial) : le placement est personnel et mémorisé ; seul « mettre en grille » a été gardé.
- Questions ouvertes consignées : `docs/05` §8 q6, `docs/07` §7, `docs/08` Q1-Q5, `docs/09` §6, `docs/10` §6.5,
  `docs/a-juger-a-l-usage.md`.

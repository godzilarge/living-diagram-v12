# État du projet

Une page, tenue à jour en fin de chaque session (skill `livraison`). Première lecture d'une session. Le détail d'une
ligne se trouve dans `docs/journal.md` par recherche sur sa date ou son titre.

**Dernière mise à jour : 2026-10-16** (refonte UI : socle complet, squelette `app/` livré et revu ; prochaine brique : l'accueil).

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
  `engine/src/app/`. **Prochaine session : `/brique-ui accueil`** (brique 1 de `docs/13-migration-plan.md` : `design/comps/shell/home.html`,
  widgets Infrastructures / Dernières modifications / Dernières collectes / emplacement libre, sur l'archive réelle ;
  seule route nouvelle admise : la liste des infrastructures avec dernière collecte, statut et comptes). À savoir :
  `app/` se lance par `cd app && npm ci && npm run dev` (proxy `/api` vers uvicorn sur 8000) ; `npm run check` et
  `npm run e2e` doivent rester verts ; la v1 à `/` reste intacte ; la toile n'est pas à redessiner. **La toile (cartes, câbles) est une autre surface** : tour de
  directions à part, en repartant des cartes v1. **Aucune fonctionnalité nouvelle pendant la refonte.**
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

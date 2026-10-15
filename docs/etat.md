# État du projet

Une page, tenue à jour en fin de chaque session (skill `livraison`). Première lecture d'une session. Le détail d'une
ligne se trouve dans `docs/journal.md` par recherche sur sa date ou son titre.

**Dernière mise à jour : 2026-10-15, nuit** (refonte UI : étapes 0, 1 et 3 faites ; choix de direction attendu).

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

- **Refonte UI v2** (décidée le 2026-10-15). Socle en étapes : **0 gouvernance (faite, 45d2a21)** → **1 entretien produit
  fait, `PRODUCT.md` validé (en anglais : tout ce que la v2 crée s'écrit en anglais)** ; références d'Orhan à
  recueillir → **3 tour de directions fait, quatre maquettes au banc (`bac-a-sable/directions/`, port 8016), en attente du choix
  d'Orhan** → 2 squelette `app/` (paquet séparé, Vite, moteur extrait de `engine/src/app/`, après le choix) → 4
  `DESIGN.md` + page vivante des primitives → 5 migration surface par surface (barre, toile et cartes, inspecteur, barre contextuelle, journal),
  chaque surface revue contre la maquette. **Aucune fonctionnalité nouvelle pendant la refonte.**
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

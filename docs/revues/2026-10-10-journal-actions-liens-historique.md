# Revue indépendante — Journal : filtre par action, lien vers une entrée, historique d'un objet (2026-10-10)

Périmètre : `journal.py`, `journal_index.py`, `journal_groups.py`, `journal_words.py`, `journal_replay.py`, la route
`get_intent_journal` d'`api.py`, `engine/src/app/state/journal*.ts`, `components/Journal.tsx`, `components/journal/*`,
`components/cards/shared.tsx` (`HistoryButton`) et les cinq fiches, tests associés. Hors périmètre : les fichiers d'une
autre session de travail en cours (`api.py` hors route du journal, `archive.py`, `diffs.py`, `intent.py`, `schemas.py`,
`bodies.py`, `openapi.py`).

Rapport consigné tel que rendu, avant toute correction. Sondes rejouables : `sondes-2026-10-10-journal-actions-liens/`
(`test_probes.py` depuis `backend/`, `probe_page.test.js` sous Node ; chaque sonde passe tant que le défaut est présent).

**Conclusion du relecteur** : brique solide (rejeu des noms intact après le déplacement, curseur et `start` bien combinés,
regroupements calculés une fois par signature de fichier, aucune valeur reçue renvoyée). 0 critique, 1 haut, 5 moyens,
10 bas.

## Haut

**H1. « Historique de… » sur une ligne d'une autre infrastructure** (`Row.tsx`, `journal-commands.ts`). `openHistory`
pose `infrastructure: ""` (celle du Diagramme) : en vue « Toutes », l'historique de `g3-1` d'une infrastructure B montre
le `g3-1` d'A (les identités sont par infrastructure), et un hostname de B donne une page vide. Correctif :
`openHistory(object, infrastructure)`.

## Moyens

- **M1.** Lien vers une révision purgée égale à celle de la trace de purge : la page atterrit sur la trace,
  `start_missing = false` (`journal.py`, `_start`). Une trace ne doit jamais satisfaire la correspondance exacte.
- **M2.** Lien vers une révision plus ancienne que tout : page vide qui dit « Aucune modification enregistrée ».
  Partir de la trace qui couvre la révision, sinon de la plus ancienne entrée ; la page dit « révision introuvable ».
- **M3.** `object` n'est pas lié à une infrastructure : sans `infrastructure`, `object=g1-1` mêle deux objets distincts ;
  changer d'infrastructure dans la page garde `object`. L'API doit exiger `infrastructure`, la page effacer `object`.
- **M4.** La recherche rate des mots affichés : pluriels des rafales (« équipements », « groupes »…), « membres »,
  « autres modifications », mots de la trace de purge (« entrées », « antérieures », catégories). Le test de dérive ne
  vérifie que le premier verbe des `case`.
- **M5.** L'export CSV d'une page ouverte par un lien omet les entrées plus récentes (`queryOf` pousse `start`).

## Bas

- **B1.** La page ne replie pas les accents comme le serveur : « supprime » trouvé mais ni surligné ni dit visible.
- **B2.** `start_missing` se perd à la page suivante (`merged` avec `more`).
- **B3.** `jrev` avec `jinfra=*` ignoré en silence ; la bande le dit quand même, et la cible est ambiguë.
- **B4.** L'identité d'un regroupement est le rang dans le fichier, qui change après une purge ; `s<révision>` serait
  stable.
- **B5.** Les deltas de purge figent les bouts de connecteur en phrases (formulation changée aujourd'hui).
- **B6.** « Historique de… » depuis une ligne remplace l'adresse du Journal : Retour ne ramène pas à la liste lue.
- **B7.** Description OpenAPI de la route inexacte (« l'infrastructure » cherchée, « sans la casse » seulement).
- **B8.** Compte trompeur sur une page ouverte par un lien (« Début du journal · 40 sur 120 »).
- **B9.** « Copier le lien » : statut jamais remis à zéro ; `entryLink` suppose l'application à la racine.
- **B10.** Historique incomplet d'un connecteur relu d'un 1.3.x (`a…` devenu `c…` : sa création manque).

## Vérifié sans défaut

Purge et `Replayer` après le déplacement ; curseur et `start` ; trace de même révision qu'une entrée présente ;
performance et cache ; `fold` (jamais deux regroupements fusionnés) ; facette Action ; sécurité (422 sans valeur ; lien
copié sans jeton) ; accessibilité des nouveaux contrôles ; bundles à jour.

## Suivi (2026-10-10, le jour même)

Tout traité sauf B5 (assumé, motivé). Sondes rejouées : P1, P2, P3, P4, P6, P6b et P8 échouent désormais (défauts
corrigés) ; P5, P9 et P10 restent vertes, sans défaut derrière (P5 interroge le lecteur sans infrastructure, désormais
refusé par lui comme par l'API ; P9 décrit un cas que l'adresse ne produit plus ; P10 teste `queryOf`, la correction est
dans `exportJournal`).

- **H1** : `openHistory(object, infrastructure)` ; la ligne passe son infrastructure, l'historique s'ouvre dans la
  sienne. Parcours Chromium : « Historique de Bord » depuis « Toutes » ouvre `jinfra=infra-b`, une ligne, et Retour
  ramène à « Toutes ».
- **M1, M2** : `_start` ne prend jamais une trace pour l'entrée ; sinon la trace de la purge qui couvre la révision
  (`first_revision ≤ R ≤ last_revision`), sinon la plus proche plus ancienne, sinon tout le journal ; la page dit « a été
  purgée : voici la purge qui l'a retirée » et ne cible jamais une trace. Test du store.
- **M3** : `object` exige `infrastructure` (422 dans l'API, `JournalScopeError` dans le lecteur) ; la page efface l'objet
  quand l'infrastructure change, et « Toutes » n'a ni historique ni lien.
- **M4** : vocabulaire étendu (pluriels des rafales, « membres », « autres modifications », mots et catégories de la
  purge) ; le test de dérive lit aussi la table `BATCH` de `journal-text.ts`. **Décision révisée** : la trace de purge se
  trouve par les mots que sa ligne affiche, catégories comprises (le test de la purge du matin disait l'inverse) ;
  l'archive, que la ligne n'affiche pas, reste introuvable.
- **M5** : l'export ignore le lien (`rev: null`).
- **B1** : `foldText` dans la page (même pli que le serveur, longueur conservée pour le surlignage).
- **B2** : `start_missing` gardé à la page suivante. **B3** : `jinfra=*` efface `jobj` et `jrev` à la lecture de
  l'adresse. **B4** : identité d'un regroupement = `s` / `r` + révision de sa première entrée. **B6** : `openHistory`
  pousse une entrée d'historique depuis le Journal aussi (Retour ramène aux filtres d'avant ; le défilement de la liste
  d'avant n'est pas rendu). **B7** : description OpenAPI corrigée. **B8** : pied « N lues à partir de rX · M en tout ».
  **B9** : « lien copié » s'efface après 4 s ; `entryLink` part de `origin + pathname`. **B10** : la création d'une ligne
  ou flèche 1.3.x compte dans l'historique du connecteur `c…` qu'elle est devenue.
- **B5, assumé** : les deltas d'une purge gardent le texte des bouts tel qu'il était rendu au moment de la purge ; seule une
  purge antérieure au changement de formulation du jour en est touchée (la purge date du même jour) ; changer le format
  des deltas (bouts bruts) coûterait une migration pour un écart de libellé.

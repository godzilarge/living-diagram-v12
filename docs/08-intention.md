# 08 — La couche d'intention B4, épingles d'abord : conception (2026-10-04)

**Statut : plan annoncé le 2026-10-04 après le « Go » d'Orhan sur la toile et B4 (session autonome) ; écrit puis codé le
même jour (contrat `Intent` v1, store, API, `ld intent`, page : glyphe, onglet Intentions, fiche, coquille avec le nom ;
test de bout en bout uvicorn + Chromium + glissé réel) ; revue indépendante consignée dans
`docs/revues/2026-10-04-b4-intention.md`. Les détails se corrigent au premier rendu sur une vraie infrastructure.
Intent 1.1.0 le 2026-10-07 : les couleurs ; 1.2.0 le même jour : les groupes ; dans `docs/10` (même mécanique, des listes de plus).**
En une phrase : **la couche d'intention est ce que l'humain veut en plus de ce que la collecte montre ; la première
intention est l'épingle, qui fixe la place d'un équipement sur le dessin et survit aux runs.**

Références : les quatre couches de `docs/00` §3 (C0 snapshot, C1 dérivé, C2 intention, C3 vue ;
`rendu = f(C0 ⊕ C2, C3)`, `diff = C0(A) ↔ C0(B)`, jamais C2) ; la toile `engine/README.md` ; le diff `docs/07`.

---

## 0. Ce que ce document décide

1. **Un quatrième contrat, `Intent` v1, dans `ld-contracts`** (`contracts/src/ld_contracts/intent/`, partie D de
   `CONTRAT.md`, `intent-v1.schema.json`, `validate --contract intent`), versionné indépendamment des trois autres.
   C'est un document **par infrastructure**, jamais par run : l'intention est longue, les runs passent.
2. **Les patchs sont keyés par identité stable, jamais par coordonnée ni par run** (`docs/00` §3). Une épingle est
   keyée par le `hostname` du nœud, exactement (à l'octet, comme l'identité du diff) ; sa valeur est une position en
   unités du dessin, entière.
3. **Une seule sorte de patch en V1 : l'épingle** (`pins`). Le document est fait pour en accueillir d'autres
   (masquage, note, correction de rôle : une liste par sorte, additive, mineure du contrat).
4. **Chaque patch porte son auteur et sa date.** Multi-utilisateur dès le départ : **dernier écrivain gagne, par
   épingle**, avec un journal d'audit (qui, quand, quoi) côté serveur. C'est la réponse V1 à la question 6 de
   `docs/00` §10 ; pas de collaboratif temps réel.
5. **Le document ne s'écrit que par opérations** (`pin`, `unpin`), jamais par remplacement entier : deux personnes
   qui épinglent deux équipements différents ne s'écrasent pas. Chaque requête acceptée incrémente `revision` et
   écrit une ligne de journal.
6. **Une épingle orpheline (son équipement n'est pas dans la run affichée) n'est jamais effacée en silence** : elle
   est listée, dite orpheline, et se retire d'un clic. Si l'équipement revient à une run suivante, l'épingle
   s'applique à nouveau. C'est le critère de `docs/00` §9 phase 5 : « une retouche survit à 3 runs ; conflit
   surfacé, jamais silencieux ».
7. **Le diff ne lit jamais l'intention** ; le snapshot non plus. Rien de C2 n'entre dans C0 ni dans B3.
8. **Le placement reste celui de la toile** (force-dirigé déterministe) ; les épingles sont des **contraintes dures**
   (`layout.run(ids, edges, pinned)`, déjà en place). Le placement seedé par la run N-1 reste en phase 3 :
   **limite connue**, seuls les équipements épinglés sont stables entre deux runs. *Levée le 2026-10-06 par le placement
   mémorisé (`docs/09`) : figé plutôt que seedé, les équipements non épinglés gardent aussi leur place.*

---

## 1. Position dans la chaîne

```
archive ── snapshot (run N) ───────────────┐
store   ── intent (infrastructure) ────────┤── page : rendu = f(snapshot ⊕ intent, vue)
                                           │
   pointeur (glisser-déposer) ── op pin ── API ── store (journal) ── intent (revision + 1) ── page (épingle enregistrée)
```

Le store d'intention vit à côté de l'archive, sur disque en V1, derrière une interface (`IntentStore`) que Mongo
pourra remplacer comme `BundleArchive`. Il n'est lu ni par B1 ni par B3.

---

## 2. Le contrat `Intent` v1

```
Intent
├─ intent_version   "1.0.0" — semver propre à l'intention
├─ infrastructure   celle du document (une épingle ne vaut que pour une infrastructure)
├─ revision         entier ≥ 0 ; 0 = jamais écrit ; +1 à chaque requête acceptée
├─ updated_at       date UTC de la dernière écriture ; null si et seulement si revision = 0
└─ pins             [Pin], triées par hostname, uniques (ordre canonique refusé par le type)
Pin
├─ hostname  identité stable du nœud (`nodes[].hostname` du snapshot), à l'octet
├─ x, y      entiers, unités du dessin, bornés à ±1 000 000
├─ author    qui a posé ou déplacé l'épingle (texte non vide, 80 caractères au plus)
└─ at        quand, date UTC écrite par le serveur
```

- Refus du contrat : `not_canonical_order` / `duplicate_identity` (pins), `revision_update_mismatch` (`revision` et
  `updated_at` ne vont pas ensemble), `intent_major_unsupported`, `extra_forbidden`, `missing`, types stricts
  (entiers stricts, dates ISO 8601 avec fuseau, jamais en nombre).
- Toutes les clés sont écrites, aucun défaut, pas d'`extras` : même règle que le snapshot et le diff.
- Sérialisation canonique : `ld_contracts.intent.serialize.canonical_json` (clés triées, indentation 2, fin de
  ligne), c'est la forme du fichier `intent.json` et de la réponse de l'API.
- Le document vide est valide : `{"intent_version": "1.0.0", "infrastructure": "X", "revision": 0, "updated_at": null,
  "pins": []}` ; c'est ce que l'API sert pour une infrastructure sans aucune épingle.

---

## 3. Les règles de B4

### I0 — Entrées

Un document `Intent` (celui du store, ou vide), une liste d'opérations `{author, ops: [...]}`, l'horloge du serveur.
Les opérations : `{"op": "pin", "hostname", "x", "y"}` et `{"op": "unpin", "hostname"}` ; une à cinq cents par
requête ; appliquées dans l'ordre (le même hostname deux fois : la dernière gagne, sans refus).

### I1 — Application

`pin` pose ou remplace l'épingle du hostname (`x`, `y`, `author`, `at` = maintenant) ; `unpin` la retire, ou ne fait
rien si elle n'existe pas. Après la liste : `revision + 1`, `updated_at` = maintenant, `pins` retriées. Une requête
acceptée est toujours journalisée, même si elle ne change rien (c'est l'audit, pas le diff).

### I2 — Concurrence

Lecture, application, écriture atomique (fichier temporaire puis renommage) sous un verrou **de fichier** (entre
processus, `fcntl`) **et de fil** (dans un processus) par infrastructure : deux requêtes simultanées s'appliquent l'une
après l'autre, aucune n'est perdue (testé à deux fils et à deux processus). Le journal est ouvert avant d'écrire le
document : un journal inaccessible refuse la requête sans rien changer. Dernier écrivain gagne **par épingle**, jamais
par document. Côté page, les envois sont **sérialisés** (une file dans l'écrivain) et une réponse plus ancienne que le
document déjà lu est ignorée.

### I3 — Réconciliation à l'affichage

La page croise les épingles avec les nœuds de la run affichée : une épingle dont le hostname n'est pas un nœud est
**orpheline**. Elle n'est pas dessinée (il n'y a rien à placer), elle est listée dans l'onglet Intentions avec sa
raison, et se retire d'un clic. Un nœud fantôme du diff (retiré depuis la run d'avant) n'est pas un nœud de la run :
son épingle est orpheline aussi, même si le fantôme se dessine à sa place.

### I4 — Qui écrit

Dans la page servie (`/view`), l'auteur est **le nom saisi dans la page** (gardé dans `localStorage` : une commodité,
pas un secret ; le jeton d'API reste dans `sessionStorage`). Sans nom, les déplacements restent locaux et la page le
dit. Dans la page autonome (`ld render`), il n'y a pas d'API : les épingles embarquées se lisent, les déplacements
restent locaux. V1 n'a pas de comptes utilisateur : l'auteur est déclaratif, le journal note ce qu'il déclare.

### I5 — Ce que le serveur refuse

Une opération sur une infrastructure qui n'a **aucune run archivée** (404 : rien à épingler) ; un corps au-delà de
`LD_MAX_INTENT_BYTES` (413, 1 Mo par défaut) ; un auteur vide ou trop long, une liste vide ou de plus de 500
opérations, un hostname vide ou de plus de 253 caractères, un caractère de contrôle dans l'un ou l'autre, une
coordonnée non entière ou hors borne, un document qui dépasserait 10 000 épingles (422, à la forme de l'API, jamais
une valeur dans un message) ; sans jeton (401). Un document `intent.json` corrompu sur disque est un 500 neutre, tracé
au journal du serveur, jamais écrasé en silence ; `ld render --infrastructure` et `/view` ouvrent alors la run sans
intention et le disent.

### I6 — Ce que B4 ne regarde pas

Le contenu des runs (B4 ne sait pas si un hostname existe : c'est la page qui réconcilie, I3) ; le diff ; le rendu.

---

## 4. Branchement

- **Store** : `backend/src/ld_backend/intent.py`, `IntentStore(root)`, `<archive>/_intent/<infra>/intent.json` et
  `journal.jsonl` (une ligne JSON par requête : `at`, `author`, `revision`, `ops`). Le dossier `_intent` ne peut pas
  entrer en collision avec une infrastructure : un nom sûr ne commence jamais par `_`, un nom haché porte un suffixe.
- **API** : `GET /api/intent?infrastructure=` → le document (vide si rien n'a été écrit) ;
  `POST /api/intent/patches?infrastructure=` avec `{author, ops}` → le document résultant (200). Réponses typées, dans
  OpenAPI (`Intent` du contrat, `IntentOps` de l'API).
- **CLI** : `ld intent --infrastructure X [--archive]` liste les épingles (lecture seule).
- **Page** : `ld render --infrastructure X --run-id Y` embarque le document (clé `intent`, lecture seule) ; en mode
  fichier (`ld render bundle.json`), pas d'intention (pas d'archive). `/view` lit `/api/intent` avec le snapshot.
  Dans la toile : les épingles alimentent `state.pinned` avant le premier placement ; un glyphe d'épingle sur le nœud
  épinglé ; glisser-déposer = `pin` (envoyé à la relâche quand la page a un auteur) ; onglet **Intentions** (liste,
  auteur, date, orphelines, retirer une, retirer les orphelines, retirer toutes avec confirmation dans la page) ; la
  fiche d'un équipement dit son épingle et la retire ; une pastille d'en-tête « n épingles » ouvre l'onglet. Le
  bouton « replacer » recalcule le placement en gardant les épingles enregistrées (il n'oublie que les déplacements
  locaux non enregistrés).

---

## 5. Hors périmètre, volontairement

Autres sortes de patch (masquer, annoter, corriger un rôle, câble manuel) ; comptes utilisateur et droits ;
collaboratif temps réel ; placement seedé N-1 (phase 3) ; vues nommées ; intention dans la page en mode fichier.

---

## 6. Plan et tests (TDD, chaque étape testée avant la suivante)

1. **Contrat** : modèles, ordre, sérialisation, codes, partie D du docgen, schéma, fixture `intent-skeleton.json`,
   `validate --contract intent` ; tests : document vide, deux épingles, ordre et doublon refusés, `revision` ↔
   `updated_at`, majeure, clé en trop ou absente, entiers stricts et bornes, aucun défaut, dérive du schéma et de
   `CONTRAT.md`, fixture à l'octet.
2. **Store** : document vide, pin, remplacement (dernier écrivain), unpin, journal, écriture atomique, document
   corrompu isolé, deux fils en concurrence (aucune écriture perdue), libellé avec `/`.
3. **API et CLI** : 401, 404 sans run, 422 à la forme, pin / unpin, deux auteurs, OpenAPI ; `ld intent`.
4. **Page** : le modèle indexe les épingles et les orphelines ; le graphe part des épingles et les marque ; un glissé
   relâché envoie `pin` quand il y a un auteur, reste local sinon ; onglet Intentions ; fiche ; la coquille lit
   `/api/intent` et envoie les opérations (fetch simulé) ; `ld render --infrastructure` embarque le document, le mode
   fichier non ; rendu réel vérifié en Chromium (glyphe, onglet, glissé réel par le pilote DevTools).
5. **Docs** : `CONTRAT.md` partie D, README contracts et backend, `QUICKSTART.md`, `CLAUDE.md`, artefacts.

---

## 7. Ouvert, comportement prudent choisi

- **Q1 — Casse du hostname.** Une épingle vise un hostname à l'octet ; le snapshot refuse deux nœuds qui ne diffèrent
  que par la casse, donc au plus une épingle s'applique. Un hostname réécrit avec une majuscule rend l'épingle
  orpheline (visible, pas perdue). Même choix que le diff (`docs/07` Q5).
- **Q2 — Épingle sur un voisin inconnu (stub).** Admise : un stub est un nœud. Son hostname (après `casefold`) peut
  changer si l'exportateur corrige un nom ; l'épingle devient orpheline, visible.
- **Q3 — Le nom de l'auteur est déclaratif.** Sans comptes, le journal note ce que la page déclare. Suffisant pour
  une V1 où tout le monde a le même jeton ; à revoir avec l'authentification.
- **Q4 — Le placement autour des épingles bouge encore entre deux runs** (force-dirigé non seedé) ; c'est la phase 3.
- **Q5 — Précondition de révision côté serveur.** Deux personnes qui déplacent le même équipement au même moment :
  aujourd'hui le dernier écrivain gagne, sans que l'autre soit prévenu (la page se réaligne sur la réponse). Une
  précondition `expected_revision` (409 si le document a bougé entre-temps) le signalerait ; proposée par la revue,
  **à trancher avec Orhan** : utile surtout à plusieurs mains sur la même infra en même temps.

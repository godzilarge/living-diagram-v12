# Revue indépendante — « la vue Journal » (`GET /api/intent/journal`, `#mode=journal`), 2026-10-09

Rapport rendu par un relecteur indépendant (agent, sans accès à la conversation), consigné tel quel. Le suivi est en fin
de document. Sonde rejouable du relecteur (M2, B2) : `sondes-2026-10-09-journal/probe.py` (`cd backend && uv run python
../docs/revues/sondes-2026-10-09-journal/probe.py`).

---

**Bilan.** Brique saine. Vérifié sans rien à redire : route protégée par le jeton, aucune écriture, 422 sans écho (curseur
compris) ; rejeu des identités `g/a/c<revision>-<n>` numéroté par sorte dans l'ordre, exactement comme
`intent._applied` ; rejeu des noms (`group_update.label`, `annotation_update.content`, `connector_update.label`, clés
nulles écrites) ; curseur stable quand une ligne s'ajoute entre deux pages ; facettes sans leur propre filtre ; ligne
partielle ni lue ni comptée ; courses de `loadJournal` neutralisées par `journalTurn` et `key` ; aucune injection côté
React ; tailles de fichiers et de fonctions, pas de `setTimeout` hors des composants. Tests : 15 Python, 13 Node.
Aucun critique ni haut ; trois moyens, cinq bas.

## Moyen

**M1. « Montrer » vers une autre infrastructure perd l'objet visé, ou montre celui de l'ancienne infrastructure.**
`engine/src/app/state/store.tsx` (`showFromJournal`) avec `components/Canvas.tsx` (résolution de `wanted`). En vue
« toutes », un clic sur `g3-1` d'infra-B pendant que la toile montre infra-A : `setView`, `want` et `connect` partent
dans le même lot, l'effet de `Canvas` cherche `g3-1` dans le modèle d'infra-A ; absent, `want` est remis à `null` et
infra-B s'ouvre sans sélection (voire avec l'ancienne, portée par `loading`) ; présent (les identités viennent des
révisions de chaque infra), c'est celui d'infra-A qui est révélé. Le test Chromium ne couvre que la même infra.
Correction : ne résoudre `wanted` que si le modèle appartient à `state.address.infrastructure` (ou poser `want` au
`loading`) ; une étape Chromium à deux infrastructures.

**M2. Document d'intention illisible : son journal disparaît de « toutes » et ses lignes illisibles sont comptées chez
les autres infrastructures.** `journal.py` (`_name`, `_all`). Sonde : infra A (1 ligne), B (2 lignes), `intent.json` de B
corrompu : filtre A → `entries 1, unreadable 2` ; toutes → `entries 1, unreadable 2`, B absente des facettes ; filtre B
→ `entries 2, unreadable 0`. Un document isolé par `IntentCorruptError` est un état prévu, et c'est là qu'on veut lire
le journal. Correction : n'ajouter les illisibles d'un dossier sans nom que si `wanted is None` ; en repli, un dossier
dont le nom ne commence pas par `_` **est** le nom de l'infra (`_segment(v) == v` pour un nom sûr) ; à terme, écrire
`infrastructure` dans chaque ligne. Au passage : ce chemin relit tout le fichier à chaque requête et compte une ligne
partielle.

**M3. « Plus ancien » sous une période : la borne `since` avance entre deux pages.** `state/journal.ts` (`queryOf`
rappelé avec `Date.now()` à chaque page). Période 24 h, 150 entrées, « plus ancien » dix minutes plus tard : `since`
décalé, les entrées les plus anciennes de la fenêtre exclues, `total` change. Correction : figer `since` avec `key` dans
`JournalState`.

## Bas

**B1. Un 401 laisse la vue bloquée** (`store.tsx`, `loadJournal`) : le jeton est vidé mais l'accueil ne s'ouvre pas ;
« réessayer » renvoie un jeton vide, en boucle. Correction : `dispatch({type: "connect", open: true})`.

**B2. Dates comparées comme des chaînes** (`journal.py`, bornes et clé de tri) : `10:00:00.5Z` est exclu par
`since=10:00:00Z` et inclus par `until=10:00:00Z` (`.` < `Z`). Latent (l'API tronque à la seconde). Correction :
comparer des `datetime` lus une fois.

**B3. Accessibilité** (`Journal.tsx`) : `role="radiogroup"` sans flèches ni arrêt unique (passer à `aria-pressed`) ;
libellé et compte d'une facette collés (« Positions1 ») ; `id` du détail répétable entre « a.b » et « a_b » à la même
révision en vue « toutes ».

**B4. `/` ou Ctrl+K du Journal ignore les dialogues ouverts** (`Journal.tsx`) : avec le menu ou la palette des types
ouverts, `/` sort le focus du dialogue. Correction : ne rien faire si `menuOpen`, `colorsOpen`, `connectOpen`.

**B5. Anciens connecteurs sans nom** (`journal.py`, `_entry`) : un connecteur issu de la montée 1.3.0 → 1.4.0 (`a5-1`
devient `c5-1`) n'a pas de nom rejoué ; ses entrées suivantes montrent l'identité brute. Correction : reprendre le nom
de `a<n>` pour un `c<n>` inconnu, ou accepter la perte (seul le document d'Orhan est concerné).

---

## Suivi (2026-10-09, même session) : tout traité

- **M1** : `Canvas.tsx` ne résout une sélection attendue que si la toile est celle de l'infrastructure de l'adresse ;
  sinon elle attend la toile suivante, que `loading` porte. Étape Chromium à deux infrastructures
  (`test_the_application_journal_in_a_browser`, groupe `g1-1` absent d'ici) ; **vérifiée par mutation** : sans la garde,
  l'autre infrastructure s'ouvrait sur l'ancien équipement (`['node', 'sw-core-01']`). Note : avec une identité présente
  des deux côtés, l'ancien chemin retombait juste par hasard (la sélection d'ici portée par `loading`).
- **M2** : un dossier au nom sûr est nommé par lui-même ; seul un dossier haché au document illisible reste sans nom,
  ses lignes (complètes, mises en cache) ne se comptent illisibles que dans « toutes ». Test
  `test_a_corrupt_intent_document_does_not_hide_its_journal`. La piste « écrire `infrastructure` dans chaque ligne »
  reste ouverte (changement du format écrit par `intent.py`, non nécessaire aujourd'hui).
- **M3** : `JournalState` porte `at`, l'instant de la première page ; les pages suivantes comptent la période depuis lui.
- **B1** : un 401 ouvre l'accueil.
- **B2** : clé de tri et bornes en `datetime` UTC ; une date sans fuseau rend la ligne illisible ; curseur en date.
  Test `test_dates_compare_as_dates_and_a_date_without_zone_is_unreadable`.
- **B3** : période en boutons `aria-pressed` ; séparateur lu entre libellé et compte (« Positions : 1 ») ; `id` du
  détail = révision + infrastructure encodée.
- **B4** : `/` et Ctrl+K du Journal ne font rien quand un dialogue est ouvert.
- **B5** : un connecteur `c<n>` inconnu reprend le nom de `a<n>` (ligne ou flèche d'un 1.3.x). Test
  `test_a_connector_read_from_a_legacy_line_keeps_its_name`.

État : backend 522 tests verts, `journal.py` à 96 %, `npm run check` à jour.

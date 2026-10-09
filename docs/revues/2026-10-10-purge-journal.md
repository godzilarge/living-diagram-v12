# Revue indépendante : la purge du journal d'intention (`ld journal prune`), 2026-10-10

Rapport rendu tel quel par l'agent de revue (Code Reviewer), consigné dès réception, avant correction. Sondes
rejouables : `sondes-2026-10-10-purge-journal/` (`probe_seed.py`, `probe_misc.py`, `probe_ls.py`, `conftest_mut.py`).
Le suivi est en fin de document.

## Verdict

Aucune perte de ligne sous concurrence (vérifié sur Linux). Trois défauts réels à corriger avant de livrer : un bug de
lecture qui fait disparaître des entrées de la vue Journal, des noms de sujets faux après une purge par catégorie, une
identité de trace en double. Deux tests aveugles sur la graine. 27 tests verts, ruff propre, `journal_prune.py` à 97 %.

## Critique

Aucun.

## Haut

**H1. Le lecteur coupe une ligne sur U+2028 / U+2029 / U+0085 : l'entrée disparaît de la vue Journal**
(`journal.py:313`, `complete.splitlines()`). `json.dumps(ensure_ascii=False)` n'échappe pas ces trois caractères ; le
contrat les accepte (`PRINTABLE` n'exclut que `\x00-\x1f\x7f`). Sonde `probe_ls.py` : un `group_create` de libellé
`"a b"` est accepté puis relu en 0 entrée, 2 lignes illisibles ; idem `\x85`, ` `. Antérieur à la purge,
aggravé par elle (`probe_misc.py` B) : `prune(author="ad min")` passe `_check`, la trace devient 2 lignes
illisibles (disparaît de la vue, graine perdue : le `group_delete` gardé n'a plus de nom). Correction :
`complete.split("\n")` dans `_parse` (comme `_split` de la purge) ; test U+2028 dans une note et dans l'auteur d'une purge.

## Moyen

**M1. La graine ne rejoue que les lignes retirées : un nom venu d'une ligne gardée est perdu**
(`journal_prune.py:175-177`, `_seed`). `probe_seed.py` cas 1 : purge `connectors` seuls ; le groupe `g1-1 "Coeur"` est
gardé, le `connector_create c2-1` (bout = `g1-1`) retiré ; `_seed` calcule `end_text` sans connaître `g1-1` ; le
`connector_update` gardé passe de « Coeur → sw-1 » à « g1-1 → sw-1 ». Correction : rejouer tout le fichier (lignes
gardées comprises) jusqu'à la dernière ligne retirée et prendre cet état comme graine.

**M2. Rafale mixte gardée entre deux lignes retirées : un nom périmé revient** (même endroit ; `setdefault` en tête,
`note()` qui écrase). `probe_seed.py` cas 2 : purge `groups` ; L0 = `group_create "X"` + `pin` (mixte, gardée), L1 =
`group_update "Y"` (retirée), L2 = `group_add` + `pin` (gardée). Avant : L2 lit « Y » ; après : « X » (la graine en tête
est réécrasée par L0). Correction exacte : une graine positionnelle (deltas `{after_revision, names…}` calculés en
rejouant tout le fichier, appliqués par affectation en passant la révision) ; à défaut, déclarer la limite et la signaler
au `--dry-run`. Sans catégorie, la graine est exacte (cas 3), à une réserve près : l'ordre du fichier n'est pas
strictement celui des dates (`now` pris avant le verrou dans l'API), négligeable.

**M3. La trace porte la révision maximale : l'identité `(infra, révision)` n'est plus unique.** Front : `keyOf = infra +
"\0" + revision` (`journal.ts:93`) : la trace et la dernière entrée réelle ont la même clé (clé React en double,
`ui.open.includes(key)` déplie les deux, id DOM et `aria-controls` en double). Le test fige le doublon (`[6, 6, 5, 4]`).
Serveur : deux purges dans la même seconde ⇒ même clé `(12:00:00Z, lab, 3)` (`at` tronqué à la seconde) ; avec
`limit=1`, la pagination saute une trace (`total=3`, 2 servies ; `probe_misc.py` D). Correction : `at` en microsecondes,
un quatrième élément au tri et au curseur du lecteur, et côté front `at` + nom d'opération dans `keyOf`.

**M4. Le journal réécrit perd son mode et change de propriétaire** (`_write_bytes`). `probe_misc.py` E : 0600 ressort en
0664 (umask) : un fichier d'audit devient lisible par d'autres. Sous `sudo ld journal prune`, `journal.jsonl` appartient
ensuite à root ; `IntentStore.apply` ouvre le journal en `"a"` avant d'écrire le document : toute écriture d'intention du
serveur est refusée jusqu'à intervention manuelle. Correction : `chmod` du temporaire au mode de l'original, `chown` sous
root, ou refuser si `geteuid() != st_uid`.

## Bas

- **B1** Aucun `fsync` des dossiers après les renommages : après coupure de courant, l'ordre « archive avant réécriture »
  n'est pas garanti. Un crash entre les deux ne perd rien, mais une nouvelle purge crée une seconde archive des mêmes
  lignes. Correction : `fsync` des répertoires (et éventuellement relire l'archive avant de réécrire).
- **B2** La dernière ligne incomplète est remise en fin de fichier sans fin de ligne : le prochain `apply` s'y colle et
  l'entrée acceptée devient illisible (défaut antérieur dans `apply`, mais la purge tient le verrou : elle peut terminer
  cette ligne par `\n`, octets conservés).
- **B3** L'auteur n'est pas validé comme dans le contrat : `_check` accepte `\x7f`, les C1, U+2028 (le contrat refuse
  `\x7f`). Réutiliser le type `Author`, et refuser en plus U+2028 / U+2029 / U+0085 tant que H1 n'est pas corrigé.
- **B4** La graine grossit sans fin : chaque trace recopie tous les sujets jamais nommés (supprimés compris) et les traces
  ne se purgent jamais : O(purges × sujets), contre l'objectif de volumétrie. Ne garder que les sujets cités par les
  lignes gardées (références des bouts comprises).
- **B5** La trace dit peu pour un audit : ni `first_revision` / `last_revision` retirées, ni `sha256` de l'archive.
- **B6** La trace pollue la recherche (ses `ops` entrent dans `_texts` : « positions » ou un fragment du chemin
  d'archive la trouve) et compte dans la facette `other`. La graine n'entre ni dans la recherche ni dans l'API (correct).
- **B7** Signature de cache sans `st_ino` (`journal.py:390`) : un remplacement à taille égale dans la même granularité de
  date sert un cache périmé.
- **B8** `except FileNotFoundError` trop large dans `_cmd_journal_prune` : « aucun journal » pour une erreur d'archive.
- **B9** Sans `fcntl` (hors cible), `_LOCAL` distinct de `IntentStore._local` : aucune exclusion dans un même processus.
  Un registre de verrous par dossier dans `files.py`.
- Petites remarques : « 1 octobre » au lieu de « 1er octobre » (`utcDay`) ; `_split` jette les lignes faites seulement
  d'espaces (plus « octet pour octet ») ; branche morte `moment is None` dans `_removable` ; `_write_bytes` duplique
  `files.write_atomically` ; imports privés (`_entry`, `_Replay`, `_valid`, `_moment`, `_segment`).

## Tests faibles (mutation)

Deux mutants survivent : `_Replay.seed` en affectation au lieu de `setdefault`, et `_is_trace` qui renvoie toujours
`False` (les deux graines du test 2 donnent le même « Cœur » ; l'ancienne trace reste et fournit le nom). Manquent : un
`apply` concurrent pendant la purge (sonde C à intégrer) ; un échec de la réécriture (archive présente, journal intact ;
lignes 99-101) ; une ligne JSON valide avec un octet non UTF-8 (retirée, archivée octet pour octet) ; un `before` en
+02:00 ; M1 et M2 ; une graine plus récente qui l'emporte quand elles divergent. Bon : sans la graine,
`test_the_kept_entries_still_name_subjects_created_in_purged_lines` échoue.

## Vérifié correct

`flock` sur deux descriptions distinctes s'exclut aussi dans un même processus (un `apply` d'un autre fil attend 0,5 s puis
s'ajoute au journal réécrit) ; pas de course avec `apply` (ouverture en `"a"` sous le verrou, remplacement sous le même
verrou ; le lecteur voit l'ancien ou le nouveau fichier) ; archive puis journal, chacun atomique ; rafale jamais coupée,
traces jamais purgées, illisibles gardées, archive octet pour octet ; graine absente de l'API et de la recherche ; refus
sans valeur ; chemins par `_segment` ; front testé sous Node ; fonctions < 50 lignes.

## Suivi (2026-10-10, même session : tout traité)

- **H1** corrigé : `_parse` découpe sur `\n` seul ; test U+2028 / U+2029 / U+0085 dans un libellé (3 entrées, 0 illisible).
- **M1, M2** corrigés exactement : la graine devient une liste de **deltas** attachés à une révision
  (`{at_revision, names, forms, ends}`, valeur nulle = retrait), calculés en rejouant côte à côte le journal d'origine et le
  journal purgé avec le même `journal.Replayer` que le lecteur ; le lecteur applique les deltas par affectation juste avant
  l'entrée visée (jamais avant une trace), les plus anciennes purges d'abord. Tests des deux sondes, plus deux purges
  successives qui divergent (« X », « Y », « Z » relus à l'identique).
- **M3** corrigé : un rang dans le fichier entre dans la clé du lecteur et dans le curseur (un curseur à trois éléments se
  lit au rang -1, comme avant) ; `at` de la trace par `utc_z` (microsecondes) ; côté front, `keyOf` ajoute la date. Test :
  pagination `limit=1` sur deux traces de même seconde et de même révision, rien de sauté ni de resservi.
- **M4** corrigé : `files.replace_bytes(…, like=)` donne au temporaire le mode de l'original, et son propriétaire sous root ;
  l'archive prend le mode du journal. Test 0600.
- **B1** `fsync` du dossier après chaque renommage (`files.fsync_dir`), et du dossier d'archive créé. **B2** la dernière ligne
  incomplète est gardée et terminée par `\n` (test : l'entrée suivante se lit). **B3** auteur : refus des catégories
  Unicode `Cc`, `Zl`, `Zp` (DEL, C1, U+2028 compris). **B4** un delta ne porte que les sujets que les entrées gardées citent.
  **B5** la trace porte `first_revision`, `last_revision`, `sha256` de l'archive (affichés dans le détail). **B6** la trace
  ne se trouve que par son auteur et « purge du journal » ; elle reste comptée dans « Autres » (c'est une entrée, voulu).
  **B7** inode dans la signature du cache. **B8** `JournalNotFoundError` dédiée. **B9** `files.folder_lock` : un verrou de
  fil par dossier pour tout le processus, pris par le store d'intention et par la purge.
- Petites remarques : « 1er octobre » ; `_split` garde toutes les lignes octet pour octet ; branche morte retirée ;
  `_write_bytes` remplacé par `files.replace_bytes` ; noms publics `Replayer`, `valid_line`, `moment_of`, `is_trace`,
  `created_ids`, `texts_of` (`_segment` reste importé comme ailleurs dans le backend).
- **Tests** : 27 tests de purge (concurrence avec un `apply` pendant la purge, réécriture échouée, octet non UTF-8 archivé,
  `before` en +02:00, mode, M1, M2, purges successives) ; mutants vérifiés tués : deltas appliqués d'emblée (1 échec),
  `is_trace` toujours faux (4 échecs). `journal_prune.py` à 100 %, backend 550 tests.

# Revue indépendante — B4, la couche d'intention, épingles d'abord (2026-10-04)

Rapport rendu tel quel ; le suivi des corrections est tenu à la fin du fichier.

---

**Périmètre.** Contrat `Intent` v1 : `contracts/src/ld_contracts/intent/` (`intent.py`, `codes.py`, `serialize.py`,
`__init__.py`), `docgen_intent.py`, les ajouts de `schema.py`, `validate.py`, `cli.py`, `docgen.py`,
`schema/intent-v1.schema.json`, `fixtures/intent-skeleton.json`, la partie D de `CONTRAT.md`, `contracts/tests/intent/`.
Store et API : `backend/src/ld_backend/intent.py` (`IntentStore`), `schemas.py` (`PinOp`, `UnpinOp`, `IntentOps`),
`api.py` (`GET /api/intent`, `POST /api/intent/patches`), `cli.py` (`ld intent`, `ld render --infrastructure`),
`render/build.py`, `render/page.py` ; `backend/tests/test_intent.py`, `test_api_intent.py`, `test_cli_intent.py`, les
ajouts de `test_render.py`, `test_view.py` (bout en bout : uvicorn, Chromium, glissé réel, POST), `tests/browser.py`.
La toile, ce que B4 y a ajouté : `engine/src/shell/intent.ts`, `engine/src/shell/apps.ts` (`Writer`, `Op`), les ajouts
de `engine/src/canvas/graph.ts` (épingles enregistrées, glyphe, `onPin`, `syncPins`, `unpin`, `resetPins`),
`engine/src/canvas/model.ts` (`applyIntent`, `pinByHost`, `orphanPins`), `engine/src/canvas/types.ts`,
`engine/src/shell/main.ts` (écrivain, onglet, pastille, ligne d'état, fiche), `engine/src/shell/shell.ts` (nom dans
`localStorage`, lecture de `/api/intent`, écrivain qui envoie), `engine/src/contracts/intent.ts` (généré),
`render/assets/viewer.css`, `page.html` ; `backend/tests/js/viewer.test.js` (section « la couche d'intention », six
tests), `fakedom.js`. Documentation : `docs/08-intention.md`, `CONTRAT.md` partie D, `QUICKSTART.md`, les deux README.
Lu en contexte, non revu : le reste du portage TypeScript de la toile (revue parallèle), `archive.py` (`_segment`),
`docs/00` §3, `common.py`, `snapshot/order.py`.

**État constaté.** Backend : les cinq fichiers demandés passent (`test_intent`, `test_api_intent`, `test_cli_intent`,
`test_render`, `test_view` : 44 tests verts, dont les deux rendus Chromium, le glissé réel dans la page servie et le test
de dérive de `viewer.js` contre `engine/src`) ; 441 tests collectés au total. Contracts : `tests/intent` et
`test_docgen` verts (28 tests) ; 601 collectés au total. `ruff check` propre des deux côtés ;
`npx tsc --noEmit` sans erreur ; 56 tests déclarés sous Node (50 avant la brique). Schéma `intent-v1.schema.json`,
`CONTRAT.md` et `contracts/intent.ts` sans dérive (`test_committed_intent_schema_matches_generated_schema`,
`test_committed_reference_matches_generated`, `types.mjs --check`). La fixture `intent-skeleton.json` est la forme canonique
à l'octet. Aucune ligne de `correlate/` ni de `diff/` ne lit l'intention (grep : deux docstrings qui disent qu'ils ne la
lisent pas).

**Sondes exécutées**, scripts dans `docs/revues/sondes-2026-10-04-b4-intention/` (rejouables, commande en tête de chaque
fichier) : `probe_store.py` (A : quatre processus en concurrence, journal inaccessible, `_segment`, bornes du contrat,
croissance du document), `probe_api.py` (B : ce qu'un client muni du jeton peut faire par `POST /api/intent/patches`),
`probe_pages.py` + `probe_viewer.js` (C : cinq pages avec intention, chaînes hostiles, fantôme du diff épinglé, stub
épinglé, 501 épingles, réponses dans le désordre, sous le faux DOM puis la page hostile dans Chromium sous sa CSP).

## Critique

Aucun. Les garanties structurantes tiennent : **aucune écriture acceptée n'est perdue** sous concurrence, entre fils
(test) et entre processus (sonde A1 : 4 processus × 25 épingles, `revision` 100, 100 épingles, 100 lignes de journal aux
révisions uniques et croissantes, le verrou `fcntl` fait son travail) ; **un document corrompu n'est jamais écrasé** (test,
relu) ; **aucune injection par chemin** : `infrastructure` passe par `_segment` (sonde A3 : `_intent` → `_intent-a87f…`,
`../x` → `_x-d6b9…`, le dossier `_intent` ne peut pas entrer en collision, comme `docs/08` §4 l'affirme), le `hostname` ne
sert jamais de chemin ; **la toile n'écrit jamais de HTML depuis une donnée** : `h()` ne connaît que `setAttribute` et les
nœuds texte (`dom.ts:20-32`), un hostname `</script><img src=x onerror=alert(1)>` et un auteur `<b onclick=…>` sont
rendus verbatim sans fabriquer d'élément, sous le faux DOM (sonde C1) et dans Chromium sous la CSP par empreinte (sonde
C-chromium : 0 élément étranger, 0 refus CSP, 0 erreur console) ; aucun style en ligne (grep `style` sur `engine/src` :
rien) ; le jeton ne touche jamais l'adresse (test de bout en bout) ; le diff et B1 ne lisent pas C2.

## Haut

**H1 — Les envois de la page ne sont ni sérialisés ni ordonnés : deux glissés rapprochés laissent la page et le serveur en
désaccord, et « replacer » renvoie l'équipement à l'ancienne place.** `main.ts:176-184` (`onPin`) envoie une requête par
relâchement et applique chaque réponse à son arrivée (`applyIntent(model, outcome.intent)` puis `syncPins()`), sans file
ni comparaison de `revision` ; `shell.ts:151-158` (`writer.save`) ouvre un `fetch` par appel. Deux glissés du même
équipement partent sur deux connexions ; si la première réponse arrive la seconde (connexion plus lente, c'est le cas
ordinaire d'un réseau d'entreprise), le modèle garde le document de révision n alors que le serveur est à n + 1. Sonde C2
(écrivain dont le serveur traite dans l'ordre d'envoi et répond dans l'autre) :
```
C2 deux glissés, réponses dans le désordre : page pinByHost (59, 95) révision 3 · serveur (138, 125) révision 4
   ligne d'état « épingle de sw-core-02 enregistrée (alice) »
C2 puis « replacer » : le nœud est placé à (59, 95)   (glissé 1 (59, 95), glissé 2 (138, 125))
```
La page dit « enregistrée », l'onglet Intentions affiche (59, 95) et la révision 3, « replacer » ramène l'équipement à sa
première place : l'utilisateur rejoue son glissé sans comprendre. Côté serveur, rien ne garantit non plus que la requête
partie la première soit appliquée la première (deux connexions, deux fils du pool, un seul verrou pris par le premier
arrivé) : dans ce cas c'est le **dernier glissé qui est perdu**, en silence ; plausible, non démontré par la sonde.
C'est précisément « conflit surfacé, jamais silencieux » (`docs/00` §3) qui est mis en défaut, par la page elle-même.
**Correction.** Dans l'écrivain (`shell.ts`) : une file, un envoi à la fois, les opérations suivantes attendent la réponse
(et se fusionnent par hostname : deux `pin` du même équipement en attente n'en font qu'un, le dernier) ; dans la page
(`main.ts`, `intent.ts`) : ignorer une réponse dont `intent.revision` est inférieure à celle déjà appliquée (`revision`
est monotone, c'est son rôle). Test Node avec un écrivain à réponses différées (la sonde C2 en est un). **À annoncer à
Orhan**, en option : une précondition `expected_revision` sur `POST /api/intent/patches` (409 si le document a bougé)
donnerait au serveur la même garantie ; `docs/08` décision 5 a choisi « dernier écrivain gagne, par épingle », la question
est de savoir si cela vaut aussi pour deux requêtes du **même** auteur.

**H2 — Rien ne borne le document d'intention : corps de requête illimité sur la route des patchs, `hostname` sans
longueur maximale, nombre d'épingles sans plafond, et chaque requête relit et réécrit tout.** `api.py:361` reçoit
`request: IntentOps` par Pydantic, sans passer par `_read_json_body` (`api.py:188-205`, la lecture en flux coupée à
`LD_MAX_BUNDLE_BYTES` que l'ingestion a reçue en revue) ; `contracts/common.py:67-68` : `Hostname = NonEmptyStr`, repris
par `intent/intent.py:29` et `schemas.py:107` ; `intent/intent.py:55` : `pins` sans `max_length` ; `intent.py:73-75` :
`load` puis `canonical_json(updated)` entier à chaque `apply`. Sondes A4, A5, B1, B5 :
```
A4 hostname de 1 000 000 caractères : accepté par le contrat
B1 hostname de 3 Mo (corps > LD_MAX_BUNDLE_BYTES = 200 000 ici) : 200 en 0.13 s · intent.json 3.0 Mo · GET /api/intent 3.0 Mo
B5 500 × 10 Ko : 200 en 0.17 s (5.1 Mo) · puis une épingle d'un octet : 200 en 0.11 s (réécriture entière)
A5 40 requêtes × 500 épingles : 20 000 épingles, 3.7 Mo · apply 1re 12 ms, 40e 215 ms · load 125 ms
```
Un client muni du jeton (unique et partagé, assumé) peut donc, au-delà de « poser des épingles », remplir le disque de la
zone à raison de 5 Mo par requête, et rendre chaque `GET /api/intent`, chaque `POST`, chaque `ld render` et chaque
ouverture de `/view` proportionnellement lents : le document entier est embarqué dans la page. Le même projet a jugé
utile de couper l'ingestion en flux : la nouvelle route d'écriture n'a pas cette garde. **Correction.** Lire le corps par
`_read_json_body` avec une limite propre (`LD_MAX_INTENT_BYTES`, quelques centaines de Ko suffisent à 500 opérations) et
413 ; borner `hostname` dans le contrat Intent et l'API (un nom de nœud du snapshot n'a pas de borne non plus, mais une
épingle n'a pas à en viser un de plus de 255 caractères : refus `string_too_long`, à cataloguer) ; plafonner `pins`
(`max_length`, refus `too_many_pins`, par exemple 10 000) de sorte que le store refuse une requête qui dépasserait ; tests
sur les trois bornes (413 sur la route, 422 sur le hostname, 422 sur le plafond). Le coût linéaire par requête (A5) est
acceptable sous ces bornes ; le noter dans `backend/README.md` § B4.

## Moyen

**M1 — Le journal s'écrit après le document, hors de toute atomicité : un journal inaccessible laisse une requête
appliquée, non journalisée, et répondue 500.** `intent.py:75` renomme le document, puis `:82-83` ouvre `journal.jsonl` en
ajout et écrit la ligne ; une erreur à l'ouverture (droits, disque plein, chemin pris) remonte en `OSError` après le
renommage, l'API répond « document d'intention corrompu » (`api.py:251-255`) et la page dit « non enregistrée » alors
que l'épingle l'est. Sonde A2 (`journal.jsonl` remplacé par un dossier) :
```
A2 journal inaccessible : apply lève IsADirectoryError, mais intent.json est déjà écrit : revision 1, pins 1 (acceptée sans journal)
```
`docs/08` I1 promet « une requête acceptée est toujours journalisée » ; c'est l'audit multi-utilisateur (décision 4), la
seule trace de qui a déplacé quoi. **Correction.** Ouvrir le journal en ajout **avant** d'appliquer (une ouverture qui
échoue refuse la requête sans rien écrire), écrire le document, puis la ligne, `flush` et `fsync` ; une ligne qui échoue
après le renommage est alors une panne disque, consignée au journal serveur (`log.error`), et I1 le dit (« sauf panne
d'écriture du journal, tracée »). Test : journal inaccessible ⇒ 500 **et** document inchangé.

**M2 — Un message 422 recopie la valeur reçue pour une opération inconnue.** `api.py:159-162` (`_query_problem`) promet
« la valeur reçue (`input`) n'est jamais renvoyée » et ne renvoie que `loc` et `msg` ; mais pour un discriminateur
Pydantic met la valeur **dans `msg`**. Sonde B2 :
```
B2 422 · valeur 'move' dans la réponse : True · {'path': 'body.ops.0', 'message': "Input tag 'move' found using 'op' does not match any of the expected tags: 'pin', 'unpin'"}
```
Les autres cas sont propres (auteur de 81 caractères, `1.5`, `10⁹` : aucune valeur). C'est la règle du projet (« jamais
une valeur dans un message d'erreur », `docs/08` I5) ; la valeur est celle du client, pas une donnée d'infrastructure,
mais la garantie est annoncée sans réserve et `test_invalid_operations_are_refused_in_the_shape_of_the_api`
(`test_api_intent.py:76`) ne cherche que `sw-core-01`, absent de ce corps. **Correction.** Dans `_query_problem`, un
message fixe par `type` d'erreur quand Pydantic y met la valeur (`union_tag_invalid` → « opération inconnue : `pin` ou
`unpin` attendu » ; vérifier `enum`, `literal_error`, `string_pattern_mismatch` qui font pareil) ; test avec un tag
distinctif.

**M3 — `syncPins` remplace la carte des épingles locales au lieu de la fusionner : la réponse d'un glissé efface l'épingle
locale d'un autre glissé en attente, et « replacer » pendant un envoi laisse un équipement marqué épinglé loin de son
épingle.** `graph.ts:501-504` : `state.pinned = savedPins()` ; `graph.ts:508` : `resetPins` repart des enregistrées.
Sondes C3 et C4bis :
```
C3 « replacer » pendant l'enregistrement : épingle enregistrée (59, 95) · nœud dessiné à (-20, 66) · state.pinned true · classe pinned true
C4bis réponse du 1er glissé pendant que le 2e attend : state.pinned a fw-edge-01 false · classe pinned false
C4bis puis le 2e échoue : state.pinned a fw-edge-01 false
```
Dans C3, le glyphe dit « épinglé » sur un équipement qui n'est pas à sa place enregistrée (jusqu'au prochain rendu). Dans
C4bis, le second glissé n'est plus ni enregistré (refusé) ni listé comme « déplacement local » : il a disparu de la
comptabilité de la page, l'équipement restera à sa place jusqu'au prochain rendu puis sautera. Le cas simple (un glissé
refusé, C4) est correct : le local est gardé et dit. **Correction.** `syncPins(hosts)` ne touche que les hostnames des
opérations répondues : remplace l'entrée locale par l'enregistrée (ou la retire si `unpin`), et déplace le nœud
(`moveNode` + `follow`) si la position dessinée diffère de l'épingle ; les autres entrées locales restent. Test Node : deux
glissés en attente, première réponse, le second reste local ; « replacer » pendant un envoi, puis réponse : l'équipement
est à son épingle. Même famille que H1 (la sonde C2 sert aux deux).

## Bas

**B1 — Contrat et API, ce qui passe encore (sondes A4, B3, B8).** `updated_at` antérieur à toutes les `pins[].at` est
accepté (le store ne le produit pas, le contrat ne le refuse pas : `pin_after_update`, à cataloguer) ; un auteur fait
d'un caractère invisible (`​`, `strip_whitespace` ne le retire pas), d'une séquence ESC (`\x1b[31m`) ou d'un
retour à la ligne est accepté par l'API et le contrat, de même qu'un `hostname` avec LF et BEL ; `ld intent`
(`cli.py:79`) les imprime bruts, l'ESC colore le terminal et le LF casse la ligne TSV (B3 : `['h', 'ligne2\t\x07\t0…']`).
Refuser les caractères de contrôle et de format (`\p{Cc}`, `\p{Cf}`) sur `author` et `hostname` des opérations ; dans la
CLI, écrire les identifiants échappés (`%r`, comme le journal d'ingestion).

**B2 — Un document corrompu n'est pas tracé côté serveur, et une panne disque est dite « corrompue ».** `intent.py:64`
lève `IntentCorruptError(str(path))`, `api.py:251-255` le traduit en 500 fixe **sans `log`** (aucun `log.` dans
`intent.py`, aucun dans `_intent_or_500`) : l'opérateur voit « intervention nécessaire » et ne sait pas quel fichier
regarder ; `OSError` (droits, disque plein) reçoit le même message « corrompu ». `log.error("document d'intention
illisible : %r", path)` à la source, et un message 500 distinct pour l'illisible. (`ArchiveCorruptError` suit déjà ce
schéma sans trace : même correction possible, hors périmètre.)

**B3 — Page, ce que les sondes C5 à C9 montrent.** (a) Un fantôme du diff épinglé est **dessiné à son épingle avec le
glyphe** (`graph.ts:222`, `state.pinned` le contient) alors que l'onglet le dit orphelin et que la fiche écrit « place
voulue » (C5) ; `docs/08` I3 l'admet (« même si le fantôme se dessine à sa place »), mais les deux signaux se
contredisent : ne pas poser le glyphe sur un fantôme, ou l'onglet dit « orpheline (fantôme dessiné à sa place) ».
(b) Après un enregistrement, `refreshIntent` (`main.ts:165-171`) reconstruit l'en-tête et remet `aria-pressed="true"`
sur toutes les pastilles de statut, y compris un statut masqué (C7 : avant `false`, après `true`, `hiddenStatuses`
contient `confirmed`) : appeler `status()` après `header()`, ou ne reconstruire que la pastille des intentions.
(c) « retirer toutes les épingles » envoie `pins.length` opérations en une requête (`intent.ts:99`) : à 501 épingles
l'API répond 422 et la page dit « l'API répond 422 » (C8) ; découper par 500, ou dire la limite. (d) « retirer »
(`intent.ts:48`, `:114`) reste cliquable pendant l'envoi : deux clics, deux requêtes, deux révisions pour la même
épingle (C9) ; désactiver le bouton jusqu'à la réponse. (e) Aucun `maxlength` sur les champs de nom (`intent.ts:36`,
`shell.ts:104`) : un nom de 100 caractères est gardé et envoyé, chaque glissé fait un 422 (C9bis) ; `maxlength=80` et
tronquer dans `setAuthor`. (f) `intent.ts:60` : `else ctx.graph.syncPins()` n'est jamais atteint (`apply` n'est appelé
qu'avec `removed` non vide) ; `unpin` d'une orpheline relance `render(true)` (`graph.ts:510`), un replacement complet
pour une épingle qui n'est pas dessinée. Le stub épinglé, masqué puis réaffiché, est correct (C6 : placé à son épingle
avec le glyphe, 0 orpheline).

**B4 — CSS mort.** `viewer.css:283` : `#t-author` ne correspond à aucun élément (le champ de l'onglet est `i-author`,
`intent.ts:36`, celui de la coquille `s-author`) : le champ de nom de l'onglet Intentions est sans style ;
`viewer.css:278` : `.pill.pin-local` n'est jamais produit (`pinRow` ne connaît que `present` et `orphan`).

**B5 — CLI et rendu.** `ld intent` (`cli.py:67-82`) écrit la date de révision en `2026-10-04 18:30:00+00:00` (repr
Python) et celle des épingles en `2026-10-04T18:30:00Z` deux lignes plus bas : une seule forme, celle du contrat
(`utc_z`). `ld render --infrastructure` (`build.py:86-90`) refuse **toute la page** sur un `intent.json` corrompu
(`EXIT_INVALID`, testé), alors que `/view` ouvre la run sans intention et le dit dans l'en-tête (`shell.ts:185-187`) :
la run reste lisible d'un côté, pas de l'autre ; rendre la page sans intention avec un avertissement, comme la coquille.

**B6 — Tests : ce qui manque ou ne teste pas ce qu'il dit.** `contracts/tests/intent/test_surface.py:54` :
`assert "revision_update_mismatch" in capsys.readouterr().out or True` ne teste rien (le `or True`) ;
`test_api_intent.py:76` ne cherche que `sw-core-01`, absent du corps `move` (M2 passe) ; aucun test de la concurrence
**entre processus** (seul verrou qui compte avec plusieurs workers uvicorn ; la sonde A1 en est un, à reprendre en
sous-processus comme le déterminisme) ; aucun test d'une réponse refusée après un glissé (C4, correct), ni de deux
glissés en attente (C2, C4bis), ni de « replacer » pendant un envoi (C3) ; aucune page de test qui combine diff et
intention (I3 sur un fantôme, C5) ni stub épinglé (C6) ; aucun test de taille de corps ni de longueur de hostname sur
la route (H2) ; « retirer toutes » n'est pas testé (seulement les orphelines) ; le journal inaccessible (M1) non plus.
`test_concurrent_writers_lose_nothing`, `test_a_corrupt_document_is_isolated_and_never_overwritten`,
`test_a_drag_in_the_served_page_pins_for_everyone_through_the_api` sont bien écrits et font ce qu'ils disent (vérifié).

**B7 — Code et documentation.** `boot()` (`main.ts:154-280`) passe à 126 lignes, dont 33 pour B4 (écrivain, `onPin`,
`refreshIntent`, `intentContext`, `nodeExtra`) ; le découpage de `create()` est parqué depuis le 2026-10-02, celui de
`boot()` s'y ajoute (un module `shell/pins.ts` qui porte `onPin`, `refreshIntent` et le contexte ferait une couture
propre). `schemas.py:104` strip l'auteur, `intent/intent.py:23` non : un document écrit par un autre outil peut porter
`" alice "`, deux écritures d'un même nom (harmoniser, ou dire que le store est le seul écrivain). `engine/README.md`
ne nomme ni `shell/intent.ts` ni `contracts/intent.ts` (« GÉNÉRÉS : snapshot.ts, diff.ts ») ni l'écrivain d'`apps.ts`.
`CLAUDE.md` n'a pas encore l'entrée B4 (à écrire avec le suivi de cette revue). `docs/08` §3 I2 parle d'un « verrou de
fichier par infrastructure » : c'est bien un verrou de fichier **et** un verrou de fils (`intent.py:51`, `:89`), à dire.

## Vérifié et trouvé correct

- **I0, I1.** Une à cinq cents opérations (`schemas.py:129`), appliquées dans l'ordre, la dernière gagne (testé) ;
  `unpin` d'une épingle absente ne fait rien et incrémente quand même `revision` avec sa ligne de journal (testé) ;
  `pins` retriées par `sorted()` sur le hostname, même ordre que `require_canonical` (comparaison de chaînes des deux
  côtés : jamais de `ValidationError` à l'écriture) ; `at` = `updated_at` = `now` du serveur, sans microseconde, écrit en
  `Z` (vérifié sur disque et dans la réponse).
- **I2.** Verrou de fils puis `flock` sur `lock` (libéré à la fermeture), lecture, application, écriture atomique
  (`tmp` + `fsync` + `replace`, temporaire effacé sur toute exception), tout sous le verrou ; `GET` lit hors verrou et ne
  voit que l'ancien ou le nouveau document (renommage atomique). Sonde A1 entre processus propre.
- **I3.** Orphelin si le hostname n'est pas un nœud de cette run **ou** est un fantôme (`model.ts:319`) ; jamais retiré
  sans un clic ; un stub est un nœud (épingle admise, Q2) ; réapplication à la run suivante par construction.
- **I4.** Nom dans `localStorage`, jeton dans `sessionStorage`, jamais dans l'adresse (test de bout en bout, `location.href`
  vérifié) ; sans nom, le glissé reste local et la ligne d'état dit quoi faire ; page autonome en lecture seule, qui
  distingue « générée sans serveur » et « fichier sans archive ».
- **I5.** 401 ; 404 sans run archivée, sans valeur ; 422 à la forme de l'API (sauf M2) ; 500 fixe sur document corrompu,
  document jamais réécrit (relu après le 500) ; `GET` d'une infrastructure inconnue sert le document vide sans rien
  créer (sonde B4 : aucun dossier) ; corps `text/plain` refusé (422).
- **I6.** `IntentStore` ne lit pas l'archive ; `api.py:362` ne regarde que l'existence d'une run.
- **Contrat.** Tous les champs requis, aucun défaut (test récursif) ; `revision ≥ 0` ↔ `updated_at` (testé dans les deux
  sens) ; majeure refusée, mineure acceptée ; entiers stricts et bornes ±1 000 000 (bornes incluses) ; dates numériques
  refusées (`datetime_numeric`), sans fuseau refusées ; `extra_forbidden` au premier niveau et dans `Pin` ; modèles gelés ;
  ordre et doublon refusés sans valeur dans le contexte ; catalogue couvert par le test de `test_docgen`. Types TS
  générés conformes au schéma (`revision: number`, `updated_at: string | null`, `pins: Pin[]`).
- **Page.** Épingles enregistrées = contraintes dures dès le premier placement (`graph.ts:60`, test) ; glyphe par classe
  CSS, vérifié en Chromium (`display: block`) ; un glissé réel du pilote DevTools épingle localement et, dans la page
  servie, pour tout le monde (`revision` 1, auteur `orhan` relu par l'API) ; « replacer » garde les enregistrées et oublie
  le local (test) ; retirer les orphelines demande la confirmation dans la page et n'envoie rien avant (test) ; la fiche
  dit l'épingle et la retire ; l'onglet et la pastille portent le compte, orphelines à part ; la coquille lit `/api/intent`
  avec le snapshot, ouvre la run sans lui s'il manque et le dit ; un 404 de l'API devient « non enregistré : … » sans
  valeur (test).
- **Documentation.** `QUICKSTART.md` (onglet, `ld intent`, `curl`), `backend/README.md` § B4, `contracts/README.md`
  § Le document Intent, `CONTRAT.md` partie D décrivent la brique telle qu'elle est, aux réserves de H2, M1 et B7 près.

## Synthèse

| Sévérité | Nombre | Points |
|---|---|---|
| Critique | 0 | — |
| Haut | 2 | H1 envois ni sérialisés ni ordonnés (page et serveur en désaccord, « replacer » revient en arrière) ; H2 document sans borne (corps illimité sur la route, `hostname` et `pins` sans plafond, réécriture entière) |
| Moyen | 3 | M1 journal après le document, requête appliquée mais 500 et non journalisée ; M2 valeur recopiée dans un 422 (`union_tag_invalid`) ; M3 `syncPins` écrase les épingles locales des autres glissés, « replacer » pendant un envoi |
| Bas | 7 | B1 contrôle / invisible dans auteur et hostname, `updated_at` libre, CLI brute ; B2 corruption sans trace serveur ; B3 fantôme avec glyphe, `aria-pressed`, 501 ops, double clic, `maxlength`, branche morte ; B4 CSS mort ; B5 deux formes de date, `ld render` refuse la page ; B6 tests (assertion vide, cas manquants) ; B7 `boot()`, strip, README, journal |

**Défauts purs (à corriger sans discussion)** : H2, M1, M2, M3, B1, B2, B3, B4, B5, B6, B7, et la file d'envoi de H1.
**À annoncer avant de corriger** : H1, la partie serveur (une précondition `expected_revision` ou non : décision 5 de
`docs/08` dit « dernier écrivain gagne, par épingle » ; vaut-elle entre deux requêtes du même auteur ?) ; B5, `ld render`
sans intention plutôt que refusé.

Appréciation. La brique tient ses promesses de fond : le store est correct sous concurrence, le contrat est fermé et
documenté, la page ne fabrique jamais de HTML et le chemin de bout en bout (glissé réel → API → document relu) est testé
dans un vrai navigateur. Ce qui manque est de la robustesse de bord : l'ordre des réponses et la fusion des épingles
locales côté page (H1, M3), et des bornes sur ce qu'un client peut écrire (H2). Rien ne touche au modèle ni au contrat ;
tout se corrige sans Orhan, sauf la question de la précondition de révision.

## Ce qui est bien et à garder

- Le store en 121 lignes qui dit tout dans son en-tête et le fait : lire ne crée rien, écrire est atomique sous verrou,
  un document corrompu est isolé et **jamais** écrasé, le journal est une ligne par requête acceptée.
- Le contrat qui réutilise `require_canonical` du snapshot et les types partagés (`UtcDatetime`, `SemVer`) : l'ordre
  canonique est refusé par le type, pas laissé au store ; `revision` ↔ `updated_at` vérifié par le modèle.
- La toile qui ne mélange pas les trois états d'une épingle (enregistrée, locale, orpheline) dans ce qu'elle affiche :
  la ligne d'état dit ce qui vient de se passer et pourquoi, l'onglet dit qui, quand, où, et ce qui n'est pas enregistré.
- Le test de bout en bout `test_a_drag_in_the_served_page_pins_for_everyone_through_the_api` : uvicorn, Chromium, un
  glissé de pointeur réel, l'API relue, le jeton absent de l'adresse ; et `tests/browser.py` qui a gagné `drag` et
  `navigate` sans dépendance.
- La page autonome qui reste en lecture seule et le dit, plutôt que de simuler une écriture.

---

## Suivi


Traitement le 2026-10-04 (soir), en une passe avec la revue de la toile. État après traitement : contracts 601 tests,
backend 450, 62 tests sous Node, `tsc` strict propre, schéma et `CONTRAT.md` régénérés, ruff propre.

- **H1 — traité pour la page ; précondition parquée.** L'écrivain de la coquille sérialise les envois (une file : deux
  glissés rapprochés partent l'un après l'autre, réponses dans l'ordre) ; une réponse dont `revision` est plus basse que
  le document déjà lu est ignorée. Tests Node : ordre des envois (fetch simulé bloquant), réponse périmée ignorée. La
  précondition `expected_revision` (409) est posée en question Q5 de `docs/08` §7, **à trancher par Orhan**.
- **H2 — traité.** `POST /api/intent/patches` lit son corps en flux avec la limite `LD_MAX_INTENT_BYTES` (1 Mo par
  défaut ; 413, 415, 400 comme pour un bundle), le corps est déclaré dans OpenAPI par `BODY_MODELS` ; le contrat borne
  `hostname` (253), `author` (80, blancs retirés), refuse les caractères de contrôle (`string_pattern_mismatch`) et
  plafonne `pins` à 10 000 (`too_long`) ; le store refuse avant d'écrire (`IntentLimitError` → 422) ; les opérations de
  l'API prennent les types du contrat (ce que le document refuse, la requête ne le laisse pas passer). Tests : corps de
  5 Ko refusé à 4 000 octets, hostname de 254, plafond (3 épingles par `monkeypatch`), remplacement sous le plafond.
- **M1 — traité.** Le journal est ouvert avant l'écriture du document ; la ligne est écrite, vidée et `fsync` après.
  Test : journal remplacé par un dossier ⇒ `OSError`, document inchangé, aucun temporaire. La fenêtre résiduelle
  (renommage fait, ligne non écrite sur disque plein) est documentée dans la docstring d'`apply`.
- **M2 — traité.** `_safe_message` : le discriminant inconnu est décrit par les valeurs attendues, jamais par la valeur
  reçue ; tout message où la valeur reçue apparaît est remplacé par le type. Appliqué aux corps et aux paramètres de
  requête. Test : `move`, `x` × 81 et le hostname absents de la réponse.
- **M3 — traité.** `syncPins` fusionne : les épingles enregistrées s'ajoutent, une épingle locale en attente ou refusée
  reste ; un nœud dessiné loin de son épingle la rejoint (`moveNode` + `follow`) sans replacer le reste. Tests Node :
  réponse refusée puis acceptée d'un autre glissé, « replacer » pendant un envoi.
- **B1 — traité.** `pin_after_update` (une épingle datée après `updated_at`), caractères de contrôle refusés dans
  `hostname` et `author`, blancs de bord retirés dans le contrat aussi ; `ld intent` ne peut plus être cassé par un
  retour à la ligne. Le zéro-largeur (`U+200B`) reste admis : refuser tout l'invisible Unicode est un autre sujet.
- **B2 — traité.** `IntentStore.load` journalise (`log.warning`, chemin en `%r`) un document hors contrat, illisible ou
  d'une autre infrastructure ; l'API distingue « corrompu » (`IntentCorruptError`) et « illisible » (`OSError`). Test sur
  `caplog`.
- **B3 — traité.** Un fantôme du diff épinglé n'est ni placé ni marqué (`savedPins` ignore les fantômes ; test sur la
  page diff + intention) ; l'en-tête n'est plus reconstruit après une écriture (la pastille est mise à jour en place,
  `aria-pressed` conservé, `status()` rejoué) ; « retirer toutes » envoie par paquets de 500 (test à 1 203 épingles) ;
  « retirer » se désactive au clic ; `maxlength` 80 sur les deux champs de nom ; branche morte retirée ; `unpin` d'une
  orpheline ne replace pas le graphe (seulement si un équipement dessiné est concerné). Stub masqué puis réaffiché :
  correct, inchangé.
- **B4 — traité.** `#i-author`, `.pill.pin-local` retiré.
- **B5 — traité.** `ld intent` écrit toutes les dates en `Z` (`utc_z`) ; `ld render --infrastructure` ouvre la run sans
  intention quand le document est corrompu et le dit dans l'origine de la page, comme `/view` (choix de cohérence,
  réversible ; test).
- **B6 — traité.** `assert … or True` remplacé par une assertion sur le message ; tests ajoutés : deux processus
  (`multiprocessing`, 60 écritures sans perte), réponse refusée, deux glissés en attente, « replacer » pendant un envoi,
  page diff + intention, taille du corps, « retirer toutes » par paquets, journal inaccessible, plafond.
- **B7 — traité pour l'essentiel.** `boot` a perdu le câblage de l'intention (`createIntentHost` dans `intent.ts`) ;
  `author` est débarrassé de ses blancs dans le contrat aussi ; `engine/README.md` cite `intent.ts`, `checks.ts`,
  `widgets.ts`, `format.ts`, `contracts/intent.ts` ; `CLAUDE.md` a son entrée B4 ; `docs/08` I2 dit « fichier et fil ».

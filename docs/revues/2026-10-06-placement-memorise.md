# Revue indépendante — « le placement mémorisé » (docs/09), 2026-10-06

Rapport rendu par un relecteur indépendant (agent, sans accès à la conversation), consigné tel quel. Le suivi est en fin de
document. Sondes rejouables rendues par le relecteur dans son dossier de travail (`scratchpad/review/` : série synthétique
`ld-contracts generate --seed rev --devices 24 --runs 3 --scenario device_added,device_removed`, pages `ld render`,
`probe1` à `probe6`) ; celles qui ont fixé une correction sont devenues des tests (voir le suivi).

---

Dépôt : `/home/otosun/development/applications/demo/living-diagram-v12-biturbo`. Aucun fichier du dépôt modifié. Sondes rejouables dans `scratchpad/review/` (série synthétique `serie/` = `ld-contracts generate --seed rev --devices 24 --runs 3 --scenario device_added,device_removed`, pages `page-run-0N.html` par `ld render`, `page-diff-02.html` = run-02 `--from` run-01, `viewer-head.js` = le bundle de HEAD). Chaque sonde se lance par `REPO=<dépôt> SP=<dossier> node probeN-….js` depuis ce dossier.

État constaté : backend 469 tests verts (`uv run pytest -q -p no:warnings`), tests Node verts, `tsc --noEmit` strict propre, `build.mjs --check` et `types.mjs --check` « à jour » (le `viewer.js` versionné est bien construit depuis ces sources), `ruff` propre.

---

## Haut

### H1 — Deux premières pages sur deux runs différentes : le document fusionne des places calculées sur deux dessins incompatibles, et ça reste (première place gagnante)

**Où** : `backend/src/ld_backend/placement.py:143-159` (`_applied` n'a aucune précondition de révision en mode non-`replace`), `engine/src/shell/placement.ts:37-49` (la page envoie ses places « fraîches » sans dire sur quelle révision elle les a calculées), `docs/09` §1.3.

**Ce qui se passe** : §1.3 promet « deux pages qui ouvrent la même run en même temps calculent la même chose ». C'est vrai pour la **même** run seulement. Page A ouvre run-01 et page B run-02 (un switch ajouté, un retiré), mémoire vide des deux côtés : chacune calcule un dessin neuf, **différent** pour tous les équipements communs (c'est le constat du §0 : 68 % bougent). A écrit la première ; B n'apporte que le switch nouveau, à la position qu'il avait **dans le dessin de B**. Le serveur l'accepte : le document contient désormais 24 places du repère de A et une du repère de B. Ni « replacer » automatique ni réalignement ne corrige : la première place reste, pour tout le monde, jusqu'à un « replacer » manuel.

**Sonde** : `probe1-cross-run-race.js`. Sortie obtenue :
```
écritures : [{"from":"A","sent":25,"entered":25},{"from":"B","sent":25,"entered":1}]
dc01-acc-20 : … nœud le plus proche = dc01-acc-19 à 0.00
```
Le switch nouveau `dc01-acc-20` est mémorisé **exactement sur** `dc01-acc-19` (superposition parfaite) : `dc01-acc-13` ayant disparu de run-02, `dc01-acc-20` a pris son rang dans la liste triée, même rang + même topologie (deux cœurs) ⇒ même position que `dc01-acc-19` dans le dessin de A. La page C qui ouvre ensuite run-02 dessine les deux l'un sur l'autre. Référence : si B avait complété le dessin de A, le switch se serait posé à 1,8 / 1,9 longueurs de ses cœurs, sans chevauchement.

**Fenêtre** : première ouverture d'une infrastructure (ou après `ld placement --forget` / « replacer ») par deux pages sur deux runs différentes dans la même seconde. Rare, mais la conséquence est persistée et partagée, et elle contredit la raison d'être de la brique. Après le premier dessin, la course se dégrade proprement (chaque page complète le même socle : les candidats sont tous « près des voisins »).

**Recommandation** (même réponse que la question Q5 de `docs/08`, mais ici c'est le mode **non-`replace`** qui en a besoin, parce que le serveur fusionne) : `PlacementWrite.base_revision: StrictInt` (la révision du document que la page a lu avant de dessiner) ; dans `_applied`, si `base_revision != current.revision` **et** que la requête apporterait quelque chose ⇒ refus `409` qui renvoie le document courant (rien d'écrit). Côté page (`placement.ts`) : sur 409, retirer de `state.placed` les hôtes refusés, `applyPlacement` + `syncPlaces` (ils sont replacés par `extend` autour du document désormais lu), renvoyer, avec une borne (trois essais, puis « non mémorisé : le document a changé »). Attention : sans retirer les hôtes refusés de `state.placed`, le re-rendu ne produirait rien de « frais » et rien ne repartirait. Le `replace` peut porter la même précondition (Q5 tranchée au passage), ou rester « dernier gagnant » si Orhan y tient.

---

## Moyen

### M1 — La mémoire de la page n'est jamais réconciliée avec le document : un envoi échoué n'est jamais rejoué, un `replace` d'une autre page ne retire rien

**Où** : `engine/src/canvas/graph.ts:465-479` (`place()` inscrit dans `state.placed` avant tout envoi ; ensuite l'hôte n'est plus jamais « frais »), `engine/src/shell/placement.ts:45-48` (l'échec n'est que noté), `graph.ts:556-563` (`syncPlaces` ajoute et remplace, ne retire jamais).

**Ce qui se passe** : si l'API ne répond pas au premier envoi, la page garde ses 25 places en mémoire locale, les dessine, et ne les renverra **jamais** : voisins inconnus, bascule du diff, « oublier les déplacements locaux », nouveaux rendus — rien ne repart, même une fois l'API revenue. Le document reste à la révision 0 tant que personne d'autre n'ouvre une page. Symétrique : après un `replace` fait ailleurs avec moins d'hôtes, la page conserve ses places locales pour les hôtes absents du document, sans les renvoyer.

**Sonde** : `probe2-failed-post-never-resent.js` :
```
après le premier dessin : [{"replace":false,"places":25,"down":true}] | … 25 équipements placés, non mémorisés : l'API ne répond pas
après trois redessins, API revenue : [{"replace":false,"places":25,"down":true}]
mémoire de la page : 25 places ; document connu de la page : révision 0 , 0 places
```

**Recommandation** : dans l'hôte de placement, un ensemble `pending` (hôte → place) alimenté à l'envoi et vidé à l'acceptation ; sur échec, le garder et le réinclure dans le prochain envoi (n'importe quel `onPlaced` suivant, ou un bouton « réessayer » dans la ligne d'état). Dans `syncPlaces`, après `applyPlacement`, les hôtes de `state.placed` absents du document et absents de `pending` sont ceux que quelqu'un d'autre a remplacés : à ré-envoyer (ils sont dessinés, donc « placés sans mémoire » au sens du document) ou à retirer de la mémoire. Un test Node : placer qui échoue une fois puis réussit ⇒ deuxième envoi avec les mêmes places.

### M2 — Un équipement retiré de la collecte survit en stub avec sa place mémorisée : il est dessiné ailleurs que sa place, et chaque écriture acceptée redessine tout le graphe pour rien

**Où** : `graph.ts:465-482` (`state.placed` n'est consulté que pour `infra` ; en phase 2 seules les épingles fixent un stub), `graph.ts:558-561` (`moved` parcourt tous les `nodeEls`, stubs compris, et compare à `state.placed`).

**Ce qui se passe** : `docs/07` §6 l'a appris, un switch retiré **survit en stub** (les descriptions des cœurs le citent encore). Sa place est dans le document (dessiné à la run d'avant). À la run suivante, voisins inconnus affichés : (1) le stub est placé librement près de ses voisins, pas à sa place mémorisée — l'œil le perd, alors que c'est exactement le cas où « rester où il était » parle ; (2) `syncPlaces` voit `place ≠ position` pour cet hôte ⇒ `render(true)` complet (0,75 s à la jauge, bulle cachée, DOM reconstruit) après **chaque** réponse acceptée, pour revenir au même dessin.

**Sonde** : `probe4-stub-with-place.js` :
```
dc01-acc-13 dans run-02 : stub ; place mémorisée : {"x":221,"y":170}
stub dc01-acc-13 dessiné à {"x":73,"y":19}
syncPlaces() a redessiné tout le graphe : true ; le stub est au même endroit après : true
sans les voisins inconnus, syncPlaces() redessine : false
```

**Recommandation** : décider et figer par un test. Option a (ma préférence, cohérente avec Q3 « un équipement retiré se dessine là où il était ») : en phase 2, fixer un stub à sa place mémorisée s'il en a une (`new Map([...base, ...placesOf(stubs), ...pinsOf(stubs)])`), sans jamais en mémoriser de nouvelle. Option b : exclure les stubs du test `moved`. Dans les deux cas le re-rendu parasite disparaît ; c'est une règle de rendu, donc à montrer à Orhan plutôt qu'à trancher en abstrait.

---

## Bas

### B1 — Un équipement épinglé est mémorisé à son épingle lors du premier dessin : la mémoire devient une copie de l'intention
`graph.ts:473-479` : `fresh` ne filtre ni les épingles enregistrées ni les locales. Premier dessin d'une infra dont `sw-core-01` est épinglé à (50, 50) ⇒ place mémorisée (50, 50). « Retirer l'épingle le rend à sa place mémorisée » (§1.4) ne change alors rien de visible, et si quelqu'un déplace l'épingle puis la retire, l'équipement revient à l'ancienne épingle, pas à une place calculée. Alternative : ne pas mémoriser les hôtes tenus par une épingle (ils ne sont pas « placés » par la page) ; à l'`unpin`, l'équipement est placé par `extend` près de ses voisins et mémorisé à ce moment. Question de modèle, à voir avec Orhan sur un rendu.

### B2 — « Replacer » pendant qu'un envoi est en vol : la page se réaligne un instant sur l'ancien document
`placement.ts:31-35` + `graph.ts:556-563`. Envoi W1 (places fraîches) en vol, « replacer » ⇒ W2. Réponses dans l'ordre : R1 (ancien dessin, rév. n+1) ⇒ `accept` ⇒ `syncPlaces` écrase `state.placed` par l'ancien dessin ⇒ rendu ; puis R2 ⇒ nouveau dessin. État final juste, un clignotement entre les deux. Une garde `if (replace en attente) ignorer les réponses non-replace` ou le `base_revision` de H1 règle ça.

### B3 — Écriture sous verrou dans le gestionnaire `async`
`api.py:477-490` : `placements.record` (ouverture de fichier, `flock`, `fsync`) et `store.list_runs` tournent **dans** la boucle d'événements, sans `run_in_threadpool`. Préexistant pour l'intention, mais le placement est écrit à chaque ouverture de page ; avec plusieurs workers uvicorn, un `flock` contesté bloque toute la boucle du worker. `await run_in_threadpool(placements.record, …)` suffit (le verrou de fil reste correct).

### B4 — Trous de tests (comportements promis par docs/09 que rien ne fige)
- P6 « une réponse plus ancienne que le document déjà lu est ignorée » : testé pour l'intention, pas pour le placement (`accept`, `placement.ts:32`).
- §1.4 « retirer l'épingle le rend à sa place mémorisée » : seul `resetPins` est testé sur la page de placement ; pas `unpin` d'une épingle enregistrée.
- §1.5 « un équipement injoignable ne saute plus sur l'étagère » : non testé (vérifié par `probe5-lonely-keeps-place.js` : `dc01-acc-05` garde (10, 328) sans câble avec mémoire, étagère (-335, 456) sans mémoire, jamais mémorisé depuis l'étagère).
- P5 « un fantôme … jamais mémorisé lui-même » : les fixtures et la série ne produisent que des fantômes **stubs** (`probe6` : `sep…`, `srv-dc01-22`, `srv-dc01-24`) ; un fantôme équipement (retiré et plus cité par personne) n'est jamais exercé.
- P2 « sous verrou de fichier » : le test de concurrence (`test_placement.py:123`) est entre fils d'un même processus ; le `flock` entre processus n'est testé nulle part (idem intention).
- H1 : aucun test à deux pages sur deux runs (il échouerait aujourd'hui, c'est le test à écrire avec la correction).

### B5 — Écarts de texte entre docs/09 et le code
- §1.3 « deux pages … calculent la même chose » : vrai pour la même run **et** la même adresse (`?from=`, `#diff`) ; le premier rendu applique le fragment avant de placer (`main.ts:262-271`), donc `#diff=0` sur une page avec `?from=` exclut les fantômes du premier temps. Sur la série testée l'écart est nul (fantômes = stubs seulement, `probe6` : 0 équipement déplacé), mais Q4 devrait le dire.
- P4 « un dessin neuf est celui d'avant, au centime près » : vrai voisins inconnus **masqués** (`probe3-fresh-drawing-unchanged.js` contre le `viewer.js` de HEAD : 25 nœuds, écart max 0,61 unité = arrondi). Voisins inconnus **affichés**, le dessin change par construction (deux temps) : 62/62 nœuds déplacés, écart max 1 552 unités pour l'ensemble, 844 pour l'infrastructure seule. Attendu, mais à écrire (les captures de référence avec stubs changent).

---

## Compte : 0 critique, 1 haut, 2 moyens, 5 bas.

## Vérifié sans rien trouver
- **Sécurité de l'API** : `infrastructure` passe par `_segment` (`archive.py:81-87`, `SAFE_SEGMENT = [A-Za-z0-9][A-Za-z0-9._-]{0,99}` en `fullmatch`, premier caractère alphanumérique ⇒ ni `..` ni `/` ni nom commençant par `_` ; sinon haché, tronqué à 40 + 12 hex) ; une infra nommée `_placement` ou `lock` ne peut pas entrer en collision avec le dossier du store ; aucun code n'itère la racine de l'archive comme liste d'infrastructures. Corps borné à `LD_MAX_INTENT_BYTES` (413 sur `content-length` puis en flux), 415, 400 JSON sans écho, 422 sans valeur (`_safe_message` ; vérifié sur `place_duplicate`, motif, longueur, bornes, `StrictInt`, `extra=forbid`), borne 10 000 à la requête (Pydantic) et à la fusion (`PlacementLimitError` sous verrou, rien d'écrit), jeton sur GET et POST, `credentials: "omit"` ⇒ pas de CSRF, `hostname` jamais utilisé comme chemin, `GET` sur une infra inconnue = document vide identique pour tout nom (rien à sonder).
- **Document corrompu** : JSON cassé, forme invalide, non trié, infra différente ⇒ `PlacementCorruptError` ; `record` charge sous verrou et lève avant toute écriture ; GET et POST 500 nommant `ld placement --forget` ; le fichier n'est jamais écrasé ; `--forget` le retire lisible ou non ; `ld render` et `/view` ouvrent la run sans mémoire avec la mention en en-tête.
- **Écriture** : temporaire + `fsync` + `replace` atomique, verrou de fil puis `flock`, `forget` sous le même verrou ; identité d'objet (`updated is not current`) ⇒ ni fichier ni révision quand rien n'entre ; `replace` ⇒ révision + 1 même à l'identique (P2) ; tri serveur par `hostname` (l'ordre de la requête est indifférent, l'ordre JS `<` ne compte pas) ; sortie canonique (`sort_keys`, UTF-8, `\n`).
- **Fuites** : journaux = chemin (segment) + type d'exception, jamais le contenu ; messages API sans valeur ; la CLI imprime le document par conception (comme `ld intent`).
- **Toile** : `place()` tient pins > places (Map, les épingles écrasent), locales > enregistrées ; `extend` seulement avec mémoire non vide ⇒ dessin neuf identique à l'ancien (arrondi) même avec épingles ; `!free[i] && !free[j]` ne change rien aux nœuds libres ; positions entières pour tout ce qui est mémorisé (`-0` sans effet : `0 !== -0` est faux, JSON écrit `0`) ; `seedNear` déterministe (ordre trié, rang global), nœud sans chemin vers un fixé garde sa spirale ; `wired` = même filtre que `run` (arêtes de cluster comprises) ; phase 2 tient toute l'infrastructure fixée, étagère comprise ⇒ afficher les voisins inconnus ne bouge rien (test + `probe3`) ; stubs jamais mémorisés ; fantôme (stub) jamais mémorisé (`probe6`) ; `replaceAll` vide la mémoire et le document perd ses orphelines et ses fantômes ; `resetPins` rend à la mémoire sans replacer ; aucune boucle `syncPlaces → render → onPlaced` (rien de frais après un réalignement) ; file d'envoi sérialisée, réponse plus ancienne ignorée ; sans document lu, pas d'écrivain, rien ne part ; mode fichier : aucune clé `placement`, aucune mémoire.
- **Embarquement** : le document passe par le bloc JSON échappé (`<`, `>`, `&`, U+2028/9) ; les hostnames sont rendus par la fabrique DOM, jamais en HTML.
- **Dérive** : `viewer.js` versionné = sources (`build.mjs --check`), types à jour, `tsc` strict propre ; `QUICKSTART.md`, `backend/README.md`, `engine/README.md` mentionnent déjà la commande, la route et les modules.

---

## Suivi (2026-10-06, même session)

Tout traité, aucune correction parquée. Backend 472 tests, 73 tests Node, `tsc` strict propre, bundle à jour.

| Point | Fait |
|---|---|
| **H1** | `PlacementWrite.base_revision` (requis, `StrictInt ≥ 0`) ; `_applied` refuse (`PlacementStaleError`, qui porte le document courant) toute requête qui apporterait quelque chose sur une autre révision, `record` comme `replace` (Q5 de `docs/09` tranchée) ; API **409** dont le corps est le document courant, déclaré dans OpenAPI. Page : l'hôte envoie la révision lue ; sur 409, adopte le document (`syncPlaces` : le document **est** la mémoire), ce qui replace les nouveaux venus par `extend` autour de lui et renvoie ; trois fois au plus, puis la page s'arrête et le dit ; un « replacer » refusé adopte et dit « replacer à nouveau si besoin ». Tests : store (`test_a_page_only_completes_the_document_it_has_read`), API (`…gets_409_and_the_current_document`), Node (« deux premières pages sur deux runs… », « la place déjà enregistrée ailleurs gagne »). |
| **M1** | Hôte avec `pending` (placé, pas encore accepté) et file d'envoi : un envoi échoué garde ses places et les renvoie au prochain dessin ; `syncPlaces` remplace la mémoire de la page par le document (un `replace` fait ailleurs retire ce qu'il a retiré ; ce qui est dessiné sans place est replacé et renvoyé). Garde-fou ajouté au passage : une API qui dit oui sans retenir ce qu'on lui envoie ne fait pas tourner la page en rond (trois réalignements, puis la mémoire de la page reste la sienne). Tests Node « un envoi échoué est renvoyé au prochain dessin… », « une API qui dit oui sans retenir… ». |
| **M2** | Option a : en phase 2, un voisin inconnu qui a une place y est fixé (`of(stubs, state.placed)`), jamais mémorisé ; le réalignement ne redessine plus rien pour lui. Test Node « un voisin inconnu qui a une place se dessine là où il était… ». Règle écrite dans `docs/09` §1.5 et Q3. |
| **B1** | Un équipement tenu par une épingle n'est pas mémorisé (`place()` saute `state.pinned`) ; à l'`unpin`, il est placé par `extend` et mémorisé alors. `docs/09` §1.4 réécrit. Test Node « un équipement épinglé n'est pas mémorisé à son épingle… » (son pair HA, attiré vers l'épingle au premier dessin, y reste : c'est le dessin qui a été mémorisé). |
| **B2** | `replacing` dans l'hôte : pendant qu'un « replacer » attend sa réponse, les réponses des envois d'avant adoptent le document sans réaligner la page. |
| **B3** | `list_runs` et `record` sous `run_in_threadpool` dans `post_placement`. |
| **B4** | Tests ajoutés : réponse plus ancienne ignorée (P6), `unpin` d'une épingle enregistrée (B1), nœud sans câble qui garde sa place (`layout.run` avec un fixé isolé), fantôme d'équipement jamais mémorisé (fantôme construit dans la page de diff), verrou entre processus (`test_concurrent_processes_lose_nothing`, `fork`, deux processus × 30 places, chacun relit et renvoie sur 409 comme une page), deux pages sur deux runs (H1). |
| **B5** | `docs/09` : §1.3 (même run et même adresse), Q4 (`?from=` sans `#diff=0`), P4 (voisins inconnus affichés : le dessin change par construction). |

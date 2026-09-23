# Revue indépendante : pages de lecture `ld render` (2026-09-20)

Rapport consigné tel que rendu par le relecteur (agent indépendant, lecture seule), avant toute correction. Une première
tentative de cette revue a été coupée par la limite de session sans rien rendre ; celle-ci est la seconde. Périmètre :
`backend/src/ld_backend/render/` (Python et visualiseur JavaScript), `ld render` dans `cli.py`, `delivery_payload` /
`error_payload`, `load_snapshot`, et leurs tests. Hors périmètre : `correlate/`, `snapshots.py`. Les chemins de source
sont relatifs à `backend/`. Sonde rejouable : `docs/revues/sondes-2026-09-20-pages/sonde_pages.py`
(`cd backend && PYTHONPATH=. uv run python ../docs/revues/sondes-2026-09-20-pages/sonde_pages.py`) ; les captures et
les DOM cités (`<S>/…`) étaient dans le scratchpad de la session et n'ont pas été conservés. Suivi en fin de fichier.

---

**Verdict.** Mettable entre les mains d'Orhan après correction du constat 1 et, de préférence, des constats 2 à 5. La
sécurité tient : vérifiée dans Chromium, sans violation de CSP. Ce qui reste à corriger relève de la fidélité à la
donnée : la page attribue à un câble des contrôles qui ne le concernent pas, et deux phrases de la page affirment plus
que le snapshot.

## a. Sécurité : aucun constat CRITIQUE ni HAUT

Sonde : `sonde_pages.py`, pages `hostile.html` et `hostile_title.html`. Le bundle hostile porte cette charge dans une
description, dans `neighbor` et `neighbor_interface` LLDP, dans `origin` et dans `infrastructure` :

`</script><script>document.title="PWNED"</script><img src=x onerror=…>` + U+2028 + `<!--<script>`

Le port LLDP porte aussi `"onmouseover="x`, et le voisin `javascript:alert(1)`.

- **Rien ne s'exécute.** Les `--dump-dom` montrent un `<title>` intact. « PWNED » n'apparaît que comme texte échappé.
  Le DOM contient exactement 2 `<script>` et aucun `<img>`.
- **Aucune violation de CSP.** `--enable-logging=stderr` ne donne aucune ligne `CONSOLE`, `Refused` ni CSP.
- **Le script s'exécute bien sous `file://`.** Le DOM contient le graphe, et la charge s'affiche comme texte dans
  l'en-tête.
- **Le bloc JSON ne peut pas être fermé.** `<`, `>` et `&` sont échappés, et les gabarits sont remplacés en une seule
  passe.
- **Le fragment d'URL est bien traité**, sauf le constat 4 : `link=99`, `link=abc`, `link=-1`, `node=inconnu`,
  `view=zzz`, `__proto__=x` donnent tous une page intacte sur la vue d'ensemble.

## Constats

**1. HAUT : un contrôle visant un port est attribué à tous les câbles de ce port** (`render/assets/js/model.js:69-83`,
`checksOfLink`)

- **Scénario.** Port à deux voisins, sur la fabrique `hub` de `test_review.py` : `sw-core-01 · Ethernet1/5` voit `srv-a`
  et `sw-core-02 · Ethernet1/4`.
- **Preuve.** `<S>/hub_link6.png` et `hub_link6.dom.html`. Le câble `sw-core-01·Ethernet1/5 ↔ sw-core-02·Ethernet1/4`
  affiche dans « Contrôles liés » :
  - `neighbor_unknown neighbor: srv-a`, alors que ce câble n'a aucun voisin inconnu ;
  - les deux `multiple_observed_neighbors`, dont celui dont la référence `link` désigne l'autre câble
    (`srv-a ↔ sw-core-01`).
- **Conséquence.** La colonne « contrôles » de la vue Sources, la pastille sur le tracé et `link.worst` sont gonflés
  d'autant. C'est précisément le cas que l'outil doit aider à lire.
- **Correction proposée.**
  - Si un contrôle porte une référence `link`, ne l'accrocher qu'à ce lien.
  - Pour un contrôle qui ne vise qu'un port, regarder `details` : s'il désigne un bout (`neighbor`, `observed`,
    `documented`), ne l'accrocher qu'aux câbles dont l'autre bout correspond.
  - Sinon, l'afficher dans une section séparée « contrôles du port (partagés par N câbles) », et ne pas le compter dans
    la pastille du câble.

**2. MOYEN : « les deux concordent » est affirmé sur un câble qui porte `description_disagrees_with_observed`**
(`inspect.js:70`)

- **Preuve.** `<S>/fidelite_link5.png`, page de la fixture avec `#link=5`. Le câble
  `sw-core-01 Ethernet1/2 ↔ sw-core-02 Ethernet1/2` affiche « Observé (LLDP) et documenté par une description : les deux
  concordent. »
- **Ce que dit le snapshot.** Quinze lignes plus bas, le warning indique que la description de `sw-core-02·Ethernet1/2`
  cite `sw-core-01·Ethernet1/9`. Le contrat dit seulement « `confirmed` = observé et documenté ». La concordance est
  une glose de la page, vraie pour une description et fausse pour l'autre.
- **Correction proposée.** Construire la phrase à partir des évidences : « documenté par la description de `<témoin>` ».
  Quand un contrôle de désaccord est lié au câble, l'ajouter : « la description de `<observed_at>` cite un autre port
  (voir contrôle) ». Ne jamais écrire « concordent » sans condition.

**3. MOYEN : un rapport d'ingestion absent est présenté comme « aucun constat : la livraison respecte le contrat sans
réserve »** (`render/build.py:48-49`, `tables.js:68-70`)

- **Cause.** `archive.load_report(...) or {}` produit `ingest = {"summary": None, "findings": []}`. La page ne peut plus
  distinguer « pas de rapport » de « rapport sans constat ». La branche « Rapport d'ingestion non disponible » n'est
  jamais atteinte par le chemin archive.
- **Preuve.** Archive de test, `report.json` écarté, page `sans_rapport.html#view=quality`. Le `--dump-dom` contient la
  cellule « aucun constat : la livraison respecte le contrat sans réserve ».
- **Correction proposée.** Passer `ingest=None` quand `load_report` rend `None`. Rendre `findings` obligatoire quand le
  rapport existe. Ajouter un test sur ce cas.

**4. MOYEN : un `%` mal formé dans le fragment tue toute la page** (`main.js:57-63`)

- **Scénario.** `decodeURIComponent` n'est pas protégé. Un lien partagé tronqué au milieu d'un `%XX` suffit.
- **Preuve.** `page.html#node=%E0%A4%A` donne « La page n'a pas pu s'afficher : URI malformed », avec 0 nœud dessiné
  (`Uncaught URIError`).
- **Cas voisin.** `#link=` (valeur vide) sélectionne le câble 0, parce que `Number("") === 0`.
- **Correction proposée.** Un `try/catch` par paramètre, avec une valeur illisible ignorée. Pour `link`, exiger
  `/^\d+$/`.

**5. MOYEN : `link=<index>` n'est pas stable d'un rendu à l'autre, alors que la boucle documentée est « corriger,
relancer, rafraîchir »** (`main.js:72` et `:123`)

- **Cause.** L'index est le rang dans `snapshot.links`. Ajouter un seul voisin LLDP décale tout.
- **Preuve.** Listings des pages `page.html` et `hub.html` :
  - `link=2` = `rt-wan-01 ↔ sw-core-01` dans la fixture, `srv-a ↔ sw-core-01·Ethernet1/5` dans `hub` ;
  - `link=1` = `fw-edge-01·x2 ↔ sw-core-02` dans la fixture, `rt-wan-01 ↔ sw-core-01` dans `hub`.
- **Conséquence.** Après un rafraîchissement, la même URL montre un autre câble, sans avertissement. `node=` utilise
  l'identité (le hostname), pas `link=`.
- **Correction proposée.** Encoder la clé naturelle, déjà disponible dans `linkId` :
  `link=<a.host>|<a.if>|<b.host>|<b.if>` passé par `encodeURIComponent`. Une clé inconnue ramène à la vue d'ensemble.
  Mettre à jour le README, qui documente `#link=3`.

**6. BAS : deux traces Python au lieu d'un message** (`cli.py:78-80` et `:98`)

- Un bundle non UTF-8 lève `UnicodeDecodeError`, qui est un `ValueError` et échappe au
  `except (OSError, JSONDecodeError)`. Cas typique : une redirection `>` de PowerShell 5 écrit en UTF-16.
- `--out` vers un dossier inexistant lève `FileNotFoundError` sans message.
- Correction proposée : attraper `UnicodeDecodeError` à la lecture et `OSError` à l'écriture, avec sortie 1 et un
  message.
- Détail : la taille annoncée, `len(page) // 1024`, compte des caractères et non des octets (91 Ko annoncés pour
  94 400 octets).

**7. BAS : les noms de ports s'empilent dès que les câbles sont parallèles ou courts** (`graph.js:25`)

- **Cause.** `inset = min(0.42, (78 + index·26)/longueur)` sature à 0,42 dès le deuxième ou troisième câble parallèle.
  Toutes les étiquettes tombent alors au même point.
- **Preuve.** `fidelite_link5.png` : les deux « Ethernet1/2 » se chevauchent sur la fixture elle-même.
  `parallel40.png` : l'amas est illisible.
- **Pourquoi ça compte.** Les agrégats de 2 à 8 membres sont le cas nominal, notamment pour les firewalls.
- **Correction proposée.** Placer l'étiquette le long de la courbe déjà décalée, à `t` fixe. Ou n'afficher les ports que
  pour le câble sélectionné ou survolé quand `pairCount > 2`.

**8. BAS : `reveal` ne centre pas sur l'élément choisi** (`graph.js:209-219`)

- **Preuve.** `ring400_node.png` (`#node=sw-200`, 400 nœuds) : le nœud sélectionné fait quelques pixels, et le reste du
  graphe est estompé, donc l'écran paraît vide.
- **Conséquence.** Même effet en venant d'une table de contrôles.
- **Correction proposée.** Après `select`, centrer la vue sur le nœud, ou sur le milieu du câble, avec un zoom minimum
  lisible (k ≥ 0,8).

**9. BAS : la colonne « statut · sources » de l'inspecteur est coupée pour « documenté seul »** (`viewer.css:63` et
`:96`)

- **Preuve.** `iface400_node.png`. Le panneau fait 400 px, et la pastille reste accessible par défilement horizontal
  dans `.table-wrap`.
- **Pourquoi ça compte.** « documenté seul » est le statut de tous les câbles de firewall.
- **Correction proposée.** Empiler les pastilles sous « en face », ou laisser `td` revenir à la ligne.

**10. BAS : aucun écouteur `hashchange`.** Modifier le fragment à la main dans une page ouverte ne fait rien avant un
rechargement, alors que le principe est « l'URL est l'état de vue ».

## c. Robustesse

Rien à corriger hors constats 7 à 9.

| Page | Contenu | Poids de la page | Ouverture dans Chromium |
|---|---|---|---|
| `ring400` | 400 devices, 1 200 câbles, 3 600 contrôles | 2,7 Mo | 0,9 s pour le graphe ; 1,75 s avec sélection ; 1,96 s pour la vue Contrôles (3 600 lignes) |
| `iface400` | équipement à 406 interfaces et 404 câbles | 817 Ko | 1,17 s, fiche lisible |

- Génération de `ring400` : 1,07 s.
- Aucun gel de la page. Le placement sur tableaux typés tient la charge.
- À 400 nœuds, la structure est visible mais les noms ne sont pas lisibles au zoom d'ajustement, ce qui est attendu.
- Snapshot sans câble : pas d'erreur, les nœuds sont rangés sur l'étagère.
- Hostname de 40 caractères : le nom déborde sur le voisin, et l'inspecteur le coupe proprement.
- Hors périmètre, pour mémoire : `_ring` n'est pas réciproque malgré sa docstring. `n:k` pointe vers `n+k:k`, qui pointe
  à son tour vers `n+2k`. D'où 1 200 `one_way_observation` et 2 400 `multiple_observed_neighbors`.

## d. Ergonomie pour mettre au point un exportateur

1. **Dire ce qui est masqué, et pourquoi.** « 5 nœuds et 5 câbles affichés » ne l'indique pas. Proposer « 1 câble
   masqué : voisin inconnu » ou « statut filtré », à côté de l'en-tête qui annonce 6.
2. **Signaler les ports sans câble dans la fiche d'un équipement.** La table des interfaces ne distingue pas les ports
   qui portent un câble. Une colonne « câble » et un filtre « up sans câble » suffisent. C'est une simple jointure sur le
   snapshot, rien n'est inventé. C'est la question que se pose l'auteur d'un exportateur : « pourquoi ce port up
   n'a-t-il rien en face ? ». Souvent, la réponse est un LLDP absent de l'export.
3. **Centrer sur la sélection** (constat 8). Sans cela, passer de la table Contrôles au graphe est inutilisable au-delà
   d'une cinquantaine de nœuds.
4. **Stabiliser `link=`** (constat 5). C'est la condition pour garder un onglet ouvert sur le câble qu'on est en train
   de corriger.
5. **Filtrer la vue Sources par équipement.** Un champ texte, comme dans Contrôles. Aujourd'hui, 1 200 lignes ne se
   filtrent que par combinaison de sources.

## e. Tests

- **Le chemin « URL = état » n'est jamais exécuté sous Node.** Le contexte `vm` de `tests/js/fakedom.js:87` ne fournit
  ni `location` ni `history`. `readHash` rend donc toujours `{}`, et `writeHash` sort immédiatement. Les constats 4 et 5
  ne peuvent être vus par aucun test. Correction : injecter un faux `location.hash` et un faux `history.replaceState`
  dans `load()`.
- **Deux assertions qui passent même si le code est faux.** `viewer.test.js:19-20` : la somme d'un `countBy` vaut
  toujours `links.length`, quelle que soit la clé utilisée. Des statuts mal comptés ou des combinaisons fausses
  passeraient. Mieux : vérifier `{confirmed: 4, documented_only: 2}` et les combinaisons attendues.
- **Le défaut du constat 1 est inscrit dans un test.** `viewer.test.js:24` pose « un contrôle sur un port remonte au
  câble » sans cas de port à deux câbles. Ajouter la fabrique `hub` : le câble vers `sw-core-02` ne doit pas porter
  `neighbor_unknown srv-a`.
- **Ce que le faux DOM ne peut pas attraper :**
  - l'application réelle de la CSP : une empreinte fausse donne une page blanche, et le test Python ne fait que
    recalculer la même empreinte sur le même texte ;
  - les chevauchements et la lisibilité ;
  - la capture de pointeur ;
  - l'effet de `hidden` avec la feuille de style ;
  - le rendu du namespace SVG.
- **Test de fumée proposé.** Un seul test Chromium, avec `skipif` quand le binaire est absent. Il fait un `--dump-dom`
  de la page de la fixture et vérifie : pas de `.fatal` hors `noscript`, 5 nœuds, aucune ligne `CONSOLE` sur stderr. Une
  vingtaine de lignes couvrent tout ce qui précède.
- **Le grep anti-`innerHTML`** (`test_render.py:66-69`) ne liste pas `createContextualFragment`, `DOMParser`, `srcdoc`,
  `setAttribute("href"` ni `setTimeout("…")`. Le risque est faible, puisque la CSP bloque les scripts en ligne, mais la
  liste se complète en une ligne.

## Ce qui est bien fait

- Les trois garde-fous de sécurité sont réels, et tiennent sous un bundle hostile dans un vrai navigateur.
- Le remplacement des gabarits se fait en une seule passe, et les balises fermantes sont refusées dans les sources.
- Le placement est déterministe et sans hasard : arêtes triées, nœuds sans câble rangés sur une étagère.
- La performance est mesurée, pas supposée.
- Les voisins inconnus sont masqués par défaut, et se rallument automatiquement quand on ouvre un câble vers l'un d'eux.
- Le README dit que la page est aussi sensible que le bundle, et renvoie vers `anonymize`.
- Un échec de démarrage produit un message lisible.
- Le chemin fichier ne touche pas l'archive.

**Non reproduit, non testé :** le glisser-déposer réel et la molette, impossibles sans pilotage du navigateur ; le
comportement sous Firefox ; `ArchiveCorruptError` sur un `report.json` corrompu dans `page_from_archive` (trace Python
probable, non vérifiée).

---

## Traitement

Tout est traité le 2026-09-20, sans arbitrage d'Orhan : défauts purs et améliorations de lecture. Backend : 235 tests,
99 %, ruff propre ; 14 tests du visualiseur sous Node ; un test dans le vrai Chromium. Rendu final vérifié par captures
sur la fixture `hub` (câble du port partagé, fiche d'équipement).

| # | Constat | Traitement |
|---|---|---|
| 1 | contrôle d'un port attribué à tous ses câbles | `model.js`, `distributeChecks` : un contrôle qui nomme un câble ne va qu'à lui ; un contrôle de port va au câble unique du port, ou, si le port en porte plusieurs, aux seuls câbles que ses détails désignent (bout résolu, ou nom annoncé par le témoin) ; sinon il est montré à part (« contrôles d'un port partagé »), compté sur aucun câble. Test sur la fabrique `hub` |
| 2 | « les deux concordent » | `inspect.js`, `whyText` : la phrase cite qui a observé et quelle description documente, et signale un désaccord lié au câble ; le mot « concordent » a disparu (test) |
| 3 | rapport absent présenté comme « aucun constat » | `build.py` : `ingest = None` sans `report.json` ; rapport corrompu ⇒ message et sortie 1, pas de trace. Test |
| 4 | `%` mal formé fatal | `readHash` : un paramètre illisible est ignoré ; test sur huit fragments hostiles ou hors bornes |
| 5 | `link=<index>` instable | un câble s'adresse par son identité : `link=` porte ses deux bouts (JSON encodé) ; clé inconnue ⇒ vue d'ensemble. README mis à jour |
| 6 | traces Python | `UnicodeDecodeError` à la lecture (`ld render` et `ld ingest`), `OSError` à l'écriture : message et sortie 1 ; taille annoncée en octets |
| 7 | noms de ports empilés | l'étiquette suit la courbe de son câble et s'ancre du côté où elle s'écarte ; au-delà de deux câbles parallèles, les noms ne s'affichent que pour le câble choisi |
| 8 | sélection non centrée | `centerOn` : un élément ouvert depuis une table, l'inspecteur ou l'adresse est amené au centre, zoom ≥ 0,8 |
| 9 | colonne coupée dans l'inspecteur | statut et sources empilés sous « en face », deux colonnes |
| 10 | pas de `hashchange` | `applyHash` au démarrage et à chaque changement d'adresse. Défaut trouvé en l'écrivant : l'adresse était réécrite avant d'être lue |
| d.1 | dire ce qui est masqué | « 5 nœuds sur 7 et 5 câbles sur 7 affichés · 2 voisins inconnus masqués · statuts masqués : … » |
| d.2 | ports sans câble | fiche d'équipement : colonne « câble vers » et filtre « ports physiques up sans câble (N) » |
| d.5 | filtrer les sources | champ « équipement ou port » dans la vue Sources |
| e | tests | faux `location` / `history` / `window` dans le faux DOM (le chemin URL s'exécute) ; comptes exacts au lieu de sommes ; cas `hub` ; **test de fumée dans Chromium** (`skipif` sans binaire) : DOM rendu sous la CSP, aucune ligne `CONSOLE` ; liste d'interdits complétée |

Non traité : le comportement sous Firefox et le glisser-déposer réel (pas de pilotage de navigateur ici) ; `_ring` non
réciproque malgré sa docstring (hors périmètre, fabrique de test de B1 : à corriger avec B1 étape 2).

# Revue indépendante : branchement de B1 (backend, 2026-09-20)

Rapport consigné tel que rendu par le relecteur (agent indépendant, lecture seule), avant toute correction.
Périmètre : `snapshots.py`, ajouts de `archive.py`, `ingest.py`, `schemas.py`, `api.py` (`GET /api/snapshot`,
`_contract_schemas`), `cli.py` (`ld correlate`), leurs tests, `backend/README.md` § Le branchement. B1 lui-même
(`correlate/`) était hors périmètre. Sondes rejouables : `docs/revues/sondes-2026-09-20-branchement/`
(`cd backend && PYTHONPATH=. uv run python ../docs/revues/sondes-2026-09-20-branchement/<sonde>.py`).
Le suivi est en fin de fichier (§ Traitement).

---

**Verdict.** La brique est propre, mais deux défauts réels sont à corriger avant le premier bundle réel. Le snapshot
rangé par l'ingestion peut porter l'enveloppe d'une autre livraison que celle archivée, ce qui casse le déterminisme.
Et `ld correlate` s'arrête sur la première entrée corrompue. 208 tests passent, ruff est propre, `snapshots.py` et
`ingest.py` sont couverts à 100 %. Aucun constat CRITIQUE.

Je n'ai modifié aucun fichier du dépôt. Seul `backend/.coverage` a été réécrit par `pytest --cov`. Mes premières
sondes ont laissé quelques dossiers `tmp*` dans `/tmp` ; je les ai ensuite redirigées vers le scratchpad.

## HAUT

### 1. Le snapshot de l'ingestion est calculé sur la livraison reçue, pas sur le bundle archivé
- **Emplacement :** `backend/src/ld_backend/snapshots.py:50-54` et `backend/src/ld_backend/ingest.py:114-115`.
- **Cause :** `Snapshot.source` recopie `produced_at` et `exporter_version`. Ces deux champs sont hors empreinte, donc
  ils diffèrent d'un ré-export à l'autre. Quand la run existe déjà sans snapshot, `correlate_if_missing` corrèle le
  modèle reçu avec l'empreinte du bundle archivé.
- **Scénario :** c'est celui que le README recommande (l. 202, « la même livraison renvoyée »).
  1. La 1re livraison arrive (`produced_at` 02:20:11Z, exporteur 0.1.0), B1 échoue.
  2. Après correction, l'exportateur ré-exporte la run (`produced_at` 08:30, exporteur 9.9.9). Réponse : 200
     `already_present`, `correlation=created`.
- **Mauvais résultat :** `snapshot.json` annonce le `bundle_sha256` de l'archive avec l'enveloppe d'une livraison qui
  n'a jamais été archivée. `ld correlate` sur la même run donne d'autres octets.
- **Règles enfreintes :** « même bundle ⇒ même snapshot à l'octet » (CLAUDE.md) et « Même bundle, même code ⇒ mêmes
  octets (testé) » (README l. 207).
- **Preuve :** `sonde_determinisme.py`.
  ```
  snapshot.source : {'bundle_sha256': '89c68c…', 'produced_at': '2026-09-12T08:30:00Z', 'exporter_version': '9.9.9'}
  bundle archivé  : {'sha256': '89c68c…', 'produced_at': '2026-09-10T02:20:11Z', 'exporter_version': '0.1.0'}
  mêmes octets entre l'ingestion et `ld correlate` sur la même run archivée ? False
  ```
- **Variante non reproduite séparément :** deux POST simultanés de deux exports de la même run.
  `sonde_concurrence.py` montre que B1 tourne deux fois et que les deux écrivent. Le dernier `replace` gagne, donc
  possiblement l'enveloppe du perdant de l'archive.
- **Correction :** dans `_store`, quand `created` est faux et que le snapshot manque, passer par le chemin de
  `recorrelate` (relire et valider le bundle archivé). Ne corréler le modèle reçu que quand `created` est vrai. Ajouter
  le test : B1 en échec, ré-export avec une autre enveloppe, octets identiques à ceux de `recorrelate`.

### 2. `ld correlate` plante sur une entrée corrompue et abandonne les runs suivantes
- **Emplacement :** `backend/src/ld_backend/snapshots.py:59-60` et `backend/src/ld_backend/cli.py:55-61`.
- **Cause :** `find_run` et `load_bundle` lèvent `ArchiveCorruptError`. Ni `recorrelate` ni `_cmd_correlate` ne la
  rattrapent.
- **Cas non couvert par `list_runs` :** `list_runs` écarte un `meta.json` cassé, mais pas un `bundle.json` dont
  l'empreinte ne colle plus.
- **Scénario :** trois runs, `bundle.json` de run-2 abîmé, `ld correlate --infrastructure infra-lab`.
- **Mauvais résultat :** run-1 est recalculée, puis la commande sort en traceback Python. run-3 garde son ancien
  snapshot sans qu'aucune ligne le dise. Après une correction de B1, la timeline mélange alors des snapshots d'ancien
  et de nouveau code, et le diff N-1 verra de fausses différences.
- **Règle enfreinte :** celle de `archive.py` (« une entrée corrompue est isolée, jamais fatale pour les autres
  runs »). Le README l. 209-210 n'annonce que « run inconnue » et « B1 a échoué ».
- **Preuve :** `sonde_erreurs.py`, sections 1 et 2.
  ```
  run-1	created	6 nœuds	6 câbles	error=0 warning=1 info=4
  EXCEPTION NON RATTRAPÉE dans la CLI : ArchiveCorruptError - …/archive/infra-lab/run-2
  run-3 recalculée ? False
  ```
  Même traceback avec `--run-id` sur un `meta.json` cassé.
- **Correction :** rattraper `ArchiveCorruptError` par run dans `_cmd_correlate`, ou rendre un statut dédié depuis
  `recorrelate`. Afficher une ligne `run-2	archive corrompue`, continuer, sortir en 1. Un test avec trois runs dont
  une corrompue.

## MOYEN

### 3. La trace de `log.exception` emporte des valeurs du bundle au journal
- **Emplacement :** `backend/src/ld_backend/snapshots.py:45` et `:66`.
- **Scénario :** B1 produit un snapshot que le contrat de sortie refuse. Le `str()` de la `ValidationError` Pydantic
  cite `input_value=…`. Aucun `hide_input_in_errors` n'existe dans le dépôt.
- **Preuve :** `sonde_journal.py`, avec une description `CRIT|SECRET-VOISIN-42|Eth9/9|client-banque-x` posée dans le
  bundle.
  ```
  réponse contient la valeur : False
  journal contient la valeur : … 'client-banque-x' : True
  interfaces.5.admin_status … input_value={'cassé': 'CRIT|SECRET-V...Eth9/9|client-banque-x'}
  ```
- **Portée :** la réponse HTTP est propre, c'est testé. La valeur est tronquée par Pydantic mais présente. La ligne 66
  (bundle archivé hors contrat) a le même défaut. Une exception ordinaire de B1, par exemple
  `KeyError('sw-core-01')`, a le même effet.
- **Est-ce acceptable ?** Dans la zone, oui : le journal vit à côté d'une archive qui contient tout le bundle. Deux
  points restent à traiter :
  - Le README l. 83-85 promet un journal « sans valeur du bundle autre que les deux identifiants », ce qui n'est plus
    vrai quand B1 échoue. Le test `test_each_ingestion_is_logged_without_bundle_values` ne regarde que le logger
    `ld_backend.ingest`.
  - Cette trace est précisément ce qu'Orhan collera dans un échange pour faire corriger B1. C'est le seul chemin de la
    brique par lequel une donnée réelle peut sortir de l'infra.
- **Correction :**
  - Pour `ValidationError`, journaliser `exc.errors(include_input=False, include_url=False)`, plus la pile sans le
    message. L'alternative est `hide_input_in_errors=True` sur les modèles du contrat.
  - Écrire dans le README que la trace d'un échec de B1 peut citer des valeurs et ne sort pas de la zone sans
    relecture.

### 4. La largeur du « parapluie » de la décision 1 n'est gardée par aucun test
- **Emplacement :** `backend/tests/test_snapshots.py:46`.
- **Preuve :** `mutants/run_mutants.sh`. Le mutant M1 remplace `except Exception:` par `except RuntimeError:`, et les 96
  tests du périmètre passent. Les quatre autres mutants sont tués.
- **Cause :** tous les tests d'échec lèvent un `RuntimeError`.
- **Cas annoncés et non testés :** les deux cas que le README l. 200 cite, « contrat de sortie » et « disque ».
  - `archive.py:195-197` (nettoyage du temporaire sur échec) n'est pas couvert.
  - Le test `…leaves_no_temp_file` ne vérifie que le chemin heureux.
- **Le comportement réel est pourtant correct.** `sonde_disque_et_rapport.py` (1) simule un `ENOSPC` au `replace`.
  ```
  created / failed | dossier : ['bundle.json', 'meta.json', 'report.json']
  ```
- **Correction :** deux tests.
  - `correlate` lève une vraie `ValidationError` du contrat Snapshot.
  - `Path.replace` lève `OSError`.
  - Dans les deux cas, attendre `failed` et aucun `.tmp-*` restant.

### 5. Un `snapshot.json` vide ou tronqué est servi en 200 et jamais réparé par une livraison
- **Emplacement :** `backend/src/ld_backend/archive.py:186-203`, `backend/src/ld_backend/api.py:228-233`,
  `backend/src/ld_backend/snapshots.py:52`.
- **Asymétrie :** le bundle est vérifié par `bytes_sha256` à chaque lecture, le snapshot par rien. `store_snapshot` ne
  fait pas de `fsync` avant `replace`.
- **Cause réaliste :** coupure de courant juste après la première création. La protection d'ext4 sur renommage
  (`auto_da_alloc`) ne couvre que le remplacement d'un fichier existant, donc pas ce cas.
- **Preuve :** `sonde_erreurs.py`, section 4.
  ```
  GET snapshot   → 200 application/json corps = b''
  POST identique → 200 {'status': 'already_present', …}
  GET tronqué    → 200 '{"contract_version": "1.0.0", "nodes": ['
  ```
- **Mauvais résultat :** la page de visualisation reçoit un 200 illisible. Seul `ld correlate` répare, et rien ne le
  dit.
- **Correction :**
  - Ajouter un `fsync` du temporaire avant `replace`.
  - Ajouter un contrôle gratuit partagé par le GET et par `correlate_if_missing` : fichier non vide, finissant par
    `}\n` (la forme canonique finit toujours ainsi). En cas d'échec, 404 « sans snapshot » pour le GET, recalcul pour
    l'ingestion.
  - Je ne propose pas d'empreinte latérale : `ld correlate` suffit comme réparation.

### 6. La lecture de présence est hors du parapluie et lit tout le fichier
- **Emplacement :** `backend/src/ld_backend/snapshots.py:52` et `backend/src/ld_backend/api.py:230`.
- **Cause :** `correlate_if_missing` appelle `load_snapshot_bytes` hors de tout `try`. Un `OSError` remonte jusqu'à
  Starlette.
- **Origine plausible de l'`OSError` :** `ld correlate` lancé sous un autre compte avec umask 077, en zone durcie.
- **Preuve :** `sonde_erreurs.py`, section 3.
  ```
  POST identique → 500 'Internal Server Error'
  GET snapshot   → 500 'Internal Server Error'
  ```
  Le corps est en texte brut, hors de la forme de l'API. Le POST échoue alors que le bundle est archivé, ce qui
  contredit la décision 1 à la lettre.
- **Coût annexe :** tester la présence lit 22 à 90 Mo en mémoire à chaque livraison identique.
- **Note :** `ArchiveCorruptError` n'est atteignable ici que par une course, `store` venant de relire `meta.json`. Non
  reproduit.
- **Correction :**
  - Ajouter un `BundleArchive.has_snapshot()` (`is_file`, sans lecture), appelé sous le parapluie.
  - Côté GET, passer `load_snapshot_bytes` par `_archived` et y traiter `OSError` en 500 neutre.

## BAS

### 7. Coût de B1 dans la requête : les chiffres du README sont périmés
- **Emplacement :** `backend/README.md:87-91`.
- **Mesures :** `sonde_cout.py`, LLDP réciproque, et `sonde_concurrence.py` pour la santé.

  | Cas | Ingestion | dont `correlate` | dont `canonical_json` | Pic RSS | `snapshot.json` |
  |---|---|---|---|---|---|
  | 512 devices, 24 576 interfaces, 1 536 câbles (19 Mo) | 4,1 s | 1,1 s | 0,6 s | 378 Mo | 22 Mo |
  | 12 288 câbles | 7,1 s | 3,2 s | 1,0 s | 543 Mo | 35 Mo |
  | Dégénéré : LLDP non réciproque, 24 000 câbles, 72 000 warnings | 17,4 s | 11,9 s | 2,4 s | 937 Mo | 90 Mo |

  - Sur cette machine, la validation et l'archivage seuls prennent environ 2 s.
  - `/api/health` pendant une ingestion : médiane 180 ms, maximum 866 ms. Le README dit « < 120 ms ».
  - Deux POST simultanés de la même run exécutent B1 deux fois, avec le même résultat. Bénin, mais le pic mémoire
    double.
- **Conséquence :** un client HTTP à timeout court, comme httpx à 5 s par défaut, abandonnera alors que le bundle est
  archivé. Sa relance rejoue le constat 1.
- **Correction :** mettre à jour les chiffres du README et y recommander un timeout client d'au moins 60 s. Rien à
  changer dans le code tant qu'aucun vrai bundle n'a été vu.

### 8. Un temporaire orphelin n'est jamais nettoyé
- **Emplacement :** `backend/src/ld_backend/archive.py:191`.
- **Preuve :** `sonde_concurrence.py`, fin. `ld correlate` tué avant le `replace` laisse `.tmp-snapshot.json-<uuid>`
  dans le dossier de run. Le `ld correlate` suivant ne le retire pas.
- **Effet :** aucun sur `list_runs`, qui itère le dossier d'infrastructure, ni sur la lecture du snapshot. C'est
  seulement de la place disque, 22 Mo ou plus par orphelin.
- **Correction :** purger les `.tmp-snapshot.json-*` du dossier de run au début de `store_snapshot`, ou le documenter.

### 9. OpenAPI : pas de régression, un risque latent
- **Emplacement :** `backend/src/ld_backend/api.py:145-151`.
- **Preuve de non-régression :** `sonde_openapi.py`.
  - Les 36 schémas du bundle gardent le même nom et le même contenu qu'avec `RunBundle.model_json_schema` + `$defs`.
  - Aucun nom du snapshot n'est renommé.
  - Les 20 types partagés sont identiques des deux côtés.
  - Aucun schéma de l'API n'est écrasé : la garde `clashes` lève une erreur et elle est testée.
  - `openapi-spec-validator` répond `OK` sur le document en 3.1.0.
- **Risque latent :** le jour où les deux contrats auront deux classes homonymes, Pydantic renommera les deux en
  `ld_contracts__…__Nom`. Les noms du bundle, donc les types TS générés, changeront alors sans qu'aucun test le voie,
  sauf pour `Device` et `Interface`.
- **Correction :** un test d'une ligne, aucun nom de `components.schemas` ne contient `__`.

### 10. Points mineurs
- `IngestReport.correlation` est le seul champ non requis du schéma. Les types TS donneront `correlation?:`. C'est
  justifié par la relecture des rapports d'avant le branchement, vérifiée par `sonde_disque_et_rapport.py` (2) : 200,
  `correlation = None`. Le choix mérite une phrase de commentaire.
- La `description` de l'application et les textes 201 / 200 de `POST_RESPONSES` ne mentionnent pas la corrélation.
- `logging.basicConfig` dans `_cmd_correlate` ne fait rien si le logger racine est déjà configuré. La trace sort bien
  sur stderr en CLI réelle (sonde (3) : `trace sur stderr : True`), mais aucun test ne le garde.

## Les deux tests modifiés
Aucun n'est affaibli. J'ai retrouvé les anciennes versions dans la transcription de la session.
- **`test_openapi_uses_a_bearer_security_scheme…` :** l'ancienne règle était « sécurité exigée si le chemin commence
  par `/api/ingest`, sinon interdite ». La nouvelle est « seule `/api/health` est sans jeton, tout le reste l'exige ».
  C'est un renforcement : toute route future doit être protégée par défaut.
- **`test_openapi_types_the_responses` :** l'ensemble exact des chemins gagne `/api/snapshot`. L'égalité stricte est
  conservée.

## Écarts entre le README et le code
- **L. 202 et 207 :** voir le constat 1. « La même livraison renvoyée » et « mêmes octets (testé) » ne tiennent qu'à
  enveloppe identique.
- **L. 209-210 :** voir le constat 2. Une archive corrompue donne un traceback, pas une sortie en 1.
- **L. 83-85 :** voir le constat 3.
- **L. 200 :** voir le constat 4. Le cas « disque » est annoncé mais non testé.
- **L. 87-91 :** voir le constat 7.
- **Conformes :** les comptes de tests (208 au total, 104 pour `correlate/`), l'arborescence et le tableau des routes.

## Ce qui est bien fait
- La réponse HTTP ne contient jamais un mot de la trace, c'est testé aux deux niveaux. Le journal utilise `%r`.
- L'écriture du snapshot se fait par temporaire à nom unique puis `replace`. Deux POST simultanés donnent un état
  cohérent sans reste : B1 s'exécute deux fois, le résultat est identique, le dossier est propre.
- Le rapport archivé reste muet sur la corrélation : l'état de celle-ci est la présence du fichier.
- Les deux 404 du GET sont distincts, et un libellé contenant `/` est testé.
- `test_the_same_delivery_does_not_recompute…` est un bon test : s'il y avait recalcul, il donnerait `failed` et non
  `already_present`.
- La garde de collision OpenAPI lève une erreur au lieu d'écraser en silence.
- Les fichiers et fonctions restent courts, les modèles sont `frozen`. `snapshots.py` fait 68 lignes et se lit d'une
  traite.

## Sondes
| Fichier | Constats |
|---|---|
| `sonde_determinisme.py` | 1 |
| `sonde_erreurs.py` | 2, 5, 6 |
| `sonde_journal.py` | 3 |
| `mutants/run_mutants.sh` | 4 (un dossier neuf par mutant, M0 à M5) |
| `sonde_disque_et_rapport.py` | 4, 10 |
| `sonde_cout.py <devices> <ports> <liens>` | 7 (exemples : `512 48 6`, `512 48 48`) |
| `sonde_concurrence.py` | 1 (variante), 7, 8 |
| `sonde_openapi.py` | 9 |

---

## Traitement

Tout est traité le 2026-09-20, sans arbitrage d'Orhan : ce sont des défauts purs. Backend : 220 tests, 99 %, ruff
propre. Les sondes 1, 2, 3, 5 et 6 rejouées après correction donnent le résultat attendu.

| # | Constat | Traitement |
|---|---|---|
| 1 | snapshot calculé sur la livraison reçue | `correlate_if_missing(..., created=)` : la livraison n'est corrélée que si elle vient d'être archivée ; sinon, snapshot manquant ⇒ `recorrelate` depuis `bundle.json`. Test `test_h1_…` (ré-export avec une autre enveloppe, octets identiques à `ld correlate`). Couvre aussi la variante des deux POST simultanés : le perdant relit l'archive |
| 2 | `ld correlate` s'arrête sur une entrée corrompue | `_recorrelate_line` rattrape `ArchiveCorruptError` et `OSError` par run : une ligne, snapshot inchangé, runs suivantes recalculées, sortie 1. Test à trois runs |
| 3 | valeurs du bundle dans la trace | journal en deux lignes : la première sans valeur (type, fichier, ligne) ; la seconde avec le détail, marquée « à relire avant de sortir de la zone ». `ValidationError` : `errors()` sans `input`, sans `ctx`. Écart assumé avec le relecteur : pour une exception ordinaire de B1, le message est gardé (un `KeyError('sw-core-01')` sans son message ne se corrige pas) ; le README le dit |
| 4 | parapluie non gardé | deux tests : vraie `ValidationError` du contrat Snapshot, `Path.replace` en `ENOSPC` ; `failed`, aucun temporaire |
| 5 | snapshot vide ou tronqué servi en 200 | `fsync` avant `replace` ; `has_snapshot` juge la présence sans lire (non vide, fini par `}` + fin de ligne) ; GET ⇒ 404 « sans snapshot », livraison suivante ⇒ recalcul. Tests paramétrés |
| 6 | présence testée hors parapluie, fichier lu en entier | `has_snapshot` (lecture de deux octets) sous `try` dans `correlate_if_missing` ; côté GET, `OSError` ⇒ 500 neutre à la forme de l'API. Livraison identique à 512 devices : ne relit plus les 22 Mo |
| 7 | chiffres du README périmés | remesuré (4,1 s à 512 devices / 1 536 câbles, confirmé), README mis à jour, timeout client ≥ 60 s recommandé |
| 8 | temporaire orphelin | purge à l'écriture suivante, **seulement au-delà d'une heure** : un temporaire récent peut être l'écriture en cours d'un autre processus (écart assumé avec la proposition « purger au début ») |
| 9 | renommage silencieux de schémas | test : aucun nom de `components.schemas` ne contient `__` |
| 10 | points mineurs | commentaire sur le défaut de `correlation` ; textes 201 / 200 et description de l'application mentionnent la corrélation ; `ld correlate` configure le journal par `_show_backend_log` (plus de `basicConfig`) |

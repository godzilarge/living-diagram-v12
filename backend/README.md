# ld-backend — guide de démarrage

## Ce que c'est, ce que ce n'est pas

`ld-backend` est **la porte d'entrée de Living Diagram** : il reçoit un bundle (le document
défini par `contracts/CONTRAT.md`), le valide avec `ld-contracts`, l'archive tel quel et
renvoie un rapport. C'est le début de B2 (archive des runs). **Depuis le 2026-09-20, la corrélation B1 est
branchée** : après l'archivage, le snapshot est calculé et rangé à côté du bundle.

- **C'est** : une API REST (une route d'écriture, quatre de lecture), une archive sur disque
  derrière une interface, une ligne de commande qui suit exactement le même chemin de
  code que l'API, et un générateur de **pages HTML de lecture** (`ld render`). Pas à pas condensé :
  `QUICKSTART.md` à la racine du dépôt.
- **Ce n'est pas** : le contrat (voir `contracts/`), ni le diagramme.

```
 exportateur B0 ──POST /api/ingest/bundles──▶ [valider : ld-contracts] ─▶ [archiver : B2] ─▶ [corréler : B1] ─▶ rapport
                                                     │ invalide : 422 + erreurs         │ 201 créé            │ snapshot.json
                                                     │                                  │ 200 déjà présent    │ échec de B1 : le bundle
                                                     │                                  │ 409 contenu différent  reste archivé, 201
                 ──ld ingest bundle.json───────────▶  même chemin de code, sans serveur
```

## Entrée et sortie

| | Quoi | Forme |
|---|---|---|
| **Entrée** | un bundle par (run, infrastructure) | le **corps JSON** du `POST` (l'API ne reçoit pas de fichier : `--data-binary @fichier` n'est qu'un moyen pour curl de remplir ce corps), ou un fichier pour `ld ingest` |
| **Sortie** | rapport d'ingestion (`IngestReport`, typé dans OpenAPI) | JSON : `status`, `infrastructure`, `run_id`, `summary` (comptes par section ; `null` si le bundle n'a pas été lu), `errors` (chemin, message, localisateurs), `findings` (constats du contrat : `code`, `message`, `hostname`, `ref`, et `details`, forme structurée sans valeur, par exemple `{field, occurrences, devices}` pour `nullable_key_absent`), `conflict` (sur un 409 : les deux empreintes et la date de la première ingestion), `correlation` (quand le bundle est archivé : `status` = `created` / `already_present` / `failed`, et `nodes`, `links`, `checks` par sévérité, `null` si rien n'a été calculé). Les `findings` décrivent **la livraison reçue** : sur un 200 « déjà présent », ils peuvent différer de `GET /api/ingest/report`, qui rend le rapport de la première livraison, celle qui est archivée. Aucun chemin d'archive n'est annoncé : le couple (`infrastructure`, `run_id`) adresse une run |
| **Archive** | le bundle brut, son rapport, son snapshot | `archive/<infrastructure>/<run_id>/{bundle.json, report.json, meta.json}`, écrits atomiquement (dossier temporaire puis renommage), puis `snapshot.json` (sortie de B1, forme canonique), **seul fichier remplaçable** : c'est un produit dérivé, recalculable depuis le bundle ; un libellé qui n'est pas un nom de dossier sûr (`DC/Paris`, `../x`) est rangé sous un nom haché. `meta.json` : empreintes, `run_start` / `run_end` / `run_status` de la collecte, `produced_at` (export), `stored_at` (ingestion), en UTC avec `Z` |

Codes de réponse du `POST` :

| Code | `status` | Sens |
|---|---|---|
| 201 | `created` | bundle valide, archivé pour la première fois |
| 200 | `already_present` | même run, même infrastructure, **données** identiques : non-événement. L'empreinte ignore l'enveloppe (`produced_at`, `exporter_version`) : ré-exporter la même run reste idempotent |
| 409 | `conflict` | même run, même infrastructure, données **différentes** : refusé, l'archive ne change jamais en silence ; `conflict` donne `received_sha256`, `archived_sha256`, `archived_stored_at` |
| 500 | `archive_error` | entrée d'archive illisible pour cette run ; les autres runs restent servies ; intervention nécessaire |
| 422 | `invalid` | contrat violé ; `errors` liste chemin, règle et localisation (`section`, `index`), jamais de valeur du bundle : la réponse peut être collée dans un échange sans rien divulguer |
| 400 | | corps qui n'est pas du JSON |
| 415 | | `Content-Type` qui n'est pas `application/json` (ou `application/…+json`) |
| 413 | | corps au-delà de `LD_MAX_BUNDLE_BYTES`, y compris en transfert par morceaux : la lecture s'arrête dès le dépassement |
| 401 | | jeton absent ou invalide |

Routes de lecture (même jeton). **Une run s'adresse par paramètres de requête, jamais par le chemin** :
`infrastructure` est un libellé libre et `run_id` vient de l'amont ; avec `/` dans l'un des deux, une run
archivée était listée mais illisible (404, test de bout en bout du 2026-09-19).

| Route | Réponse |
|---|---|
| `GET /api/ingest/bundles?infrastructure=…` | `RunList` : les runs archivées, **triées par début de collecte** (`run_start`, puis `run_id`), avec `run_end`, `run_status`, `produced_at`, `stored_at`, `sha256`. C'est l'ordre de la timeline et du diff N-1 ; un ré-export tardif ne déplace pas une run |
| `GET /api/ingest/bundle?infrastructure=…&run_id=…` | le bundle archivé, forme canonique, octets vérifiés par empreinte |
| `GET /api/ingest/report?infrastructure=…&run_id=…` | `IngestReport` de la première ingestion (`correlation` y est toujours `null` : il décrit l'ingestion) |
| `GET /api/snapshot?infrastructure=…&run_id=…` | le `Snapshot` v1 de la run (`contracts/CONTRAT.md` partie B), octets archivés. 404 « run inconnue » ou 404 « run archivée sans snapshot : lancer `ld correlate` » |

Paramètre manquant ou vide : 422 `{"detail": "paramètres de requête invalides", "errors": [{path, message}]}`,
sans écho de la valeur reçue. Run inconnue : 404. Entrée d'archive corrompue : 500 neutre.

## Démarrer

```
cd backend
uv sync                                                                             # Python 3.14, FastAPI, ld-contracts (dépendance locale)
uv run ld ingest ../contracts/fixtures/bundle-minimal.json --archive ./archive      # sans serveur
uv run ld runs --infrastructure infra-lab --archive ./archive
uv run ld correlate --infrastructure infra-lab --archive ./archive                  # recalcule et remplace les snapshots (--run-id pour une seule run)
uv run ld render ../contracts/fixtures/bundle-minimal.json --out page.html          # une page HTML autonome, sans archive ni serveur

export LD_API_TOKEN='un-jeton-long-et-secret'                                       # obligatoire : le service refuse de démarrer sans
export LD_ARCHIVE_DIR=./archive                                                     # défaut ./archive
export LD_MAX_BUNDLE_BYTES=52428800                                                 # défaut 50 Mo
uv run ld serve --host 127.0.0.1 --port 8000

curl -s -X POST http://127.0.0.1:8000/api/ingest/bundles \
     -H "Authorization: Bearer $LD_API_TOKEN" -H "Content-Type: application/json" \
     --data-binary @../contracts/fixtures/bundle-minimal.json | python3 -m json.tool
curl -s "http://127.0.0.1:8000/api/ingest/bundles?infrastructure=infra-lab" -H "Authorization: Bearer $LD_API_TOKEN"
curl -s -G http://127.0.0.1:8000/api/ingest/report -H "Authorization: Bearer $LD_API_TOKEN" \
     --data-urlencode "infrastructure=infra-lab" --data-urlencode "run_id=66db3f0e9a1c2b0012f4a7d1"
curl -s -G http://127.0.0.1:8000/api/snapshot -H "Authorization: Bearer $LD_API_TOKEN" \
     --data-urlencode "infrastructure=infra-lab" --data-urlencode "run_id=66db3f0e9a1c2b0012f4a7d1" -o snapshot.json
```

`ld serve` écrit une ligne par ingestion, sans valeur du bundle autre que les deux identifiants (en `%r` : un
saut de ligne dans un `run_id` ne forge pas de ligne). **Exception : un échec de B1** écrit deux lignes de plus, la
première sans valeur (type d'exception, fichier, ligne), la seconde avec le détail utile à la correction, qui **peut
citer des valeurs du bundle** (un hostname dans un `KeyError`) : à relire avant de la sortir de la zone. Pour un refus
du contrat de sortie, les valeurs d'entrée sont retirées du détail. Ligne d'ingestion :
`INFO:     ld_backend.ingest - ingestion infra='infra-lab' run='66db…' status=created correlation=created findings=7 errors=0 duree_ms=9`.

Ordres de grandeur mesurés **avec B1 dans la requête** (2026-09-20, `docs/revues/sondes-2026-09-20-branchement/sonde_cout.py`,
512 devices, 24 576 interfaces, bundle de 19 Mo) : ingestion en 4,1 s avec 1 536 câbles (dont 1,1 s de corrélation et
0,6 s de sérialisation ; la validation et l'archivage seuls prennent environ 2 s), 7,1 s avec 12 288 câbles, 17 s dans
un cas dégénéré (24 000 câbles vus d'un seul côté, 72 000 contrôles, snapshot de 90 Mo). Pic de mémoire résidente :
380 Mo, 540 Mo et 940 Mo. `snapshot.json` pèse 22 à 35 Mo. `/api/health` pendant une ingestion : 180 ms en médiane,
jusqu'à 0,9 s. **Régler le timeout du client à 60 s au moins** : un client qui abandonne à 5 s (défaut de httpx) laisse
un bundle archivé et corrélé, sa relance reçoit `already_present`. À dimensionner si le service tourne dans un
conteneur contraint.

Le corps est envoyé en JSON non compressé en V1 (`Content-Encoding: gzip` n'est pas décodé) ; la CLI
et l'API lisent la même racine d'archive, `LD_ARCHIVE_DIR`.

### Depuis `/docs`

La documentation interactive (OpenAPI) est servie sur `/docs`. Cette page charge Swagger UI depuis
`cdn.jsdelivr.net` : sans accès à ce CDN, elle reste blanche (les routes, elles, fonctionnent) ; le
document brut reste lisible sur `/openapi.json`. Le processus serveur, lui, n'ouvre jamais de connexion
sortante : seul le navigateur qui affiche la page va chercher ces fichiers, et le document OpenAPI n'est
jamais envoyé au CDN. **Décision du 2026-09-10 : comportement conservé tel quel pour l'instant.** Les deux
options écartées, à reprendre si la zone l'exige :

1. *Embarquer Swagger UI dans le paquet* : copier `swagger-ui-bundle.js` et `swagger-ui.css` d'une version
   épinglée de `swagger-ui-dist` dans `src/ld_backend/static/`, créer l'application avec `docs_url=None,
   redoc_url=None`, monter `StaticFiles` sur `/static` et servir `/docs` par `get_swagger_ui_html(...,
   swagger_js_url="/static/swagger-ui-bundle.js", swagger_css_url="/static/swagger-ui.css")`. Zéro dépendance
   réseau, page identique, environ 1,5 Mo de fichiers statiques à tenir à jour.
2. *Désactiver `/docs` et `/redoc`* (`docs_url=None, redoc_url=None`) et ne garder que `/openapi.json`, à
   ouvrir avec l'outil de son choix (Bruno, Insomnia, Swagger Editor hors ligne).

Le jeton se saisit une fois pour toutes
les routes par le bouton **Authorize** (cadenas) : coller la valeur de `LD_API_TOKEN` seule, sans le mot
`Bearer`. Le `POST` y présente un éditeur de corps dérivé du contrat : coller le contenu d'un bundle,
par exemple `contracts/fixtures/bundle-skeleton.json` (le plus petit bundle valide) ou
`contracts/fixtures/bundle-minimal.json`. Les schémas affichés sont ceux de `ld-contracts`,
la référence lisible reste `contracts/CONTRAT.md`.

## Depuis votre exportateur

```python
import httpx

with httpx.Client(base_url="http://ld.internal:8000", headers={"Authorization": f"Bearer {token}"}) as client:
    response = client.post("/api/ingest/bundles", json=bundle, timeout=60)
    report = response.json()
    if response.status_code == 409:
        raise RuntimeError(f"cette run est déjà archivée avec un autre contenu : {report['conflict']}")
    if response.status_code == 422:
        for error in report["errors"]:
            print(error["path"], error["message"])
        raise SystemExit(1)
    for finding in report["findings"]:
        print(finding["code"], finding["message"])      # message : sans valeur ; hostname / ref restent dans la zone
```

`json=bundle` envoie **le dict que vous avez produit**, jamais la forme canonique (`model_dump_json()`), qui
écrit toutes les clés et efface donc les absences que `nullable_key_absent` doit compter
(`contracts/README.md` § Utiliser le paquet).

Validez avec `ld-contracts` **avant** d'envoyer : le même validateur tourne des deux côtés, le
rapport local suffit à corriger sans aller-retour.

## Arborescence

```
backend/
├── pyproject.toml            paquet ld-backend, Python ≥ 3.14, FastAPI, ld-contracts (chemin ../contracts)
├── README.md                 ce guide
├── src/ld_backend/
│   ├── config.py             Settings lus dans l'environnement, vérifiés au démarrage (ConfigError)
│   ├── archive.py            BundleArchive : dossier par (infrastructure, run), empreinte SHA-256,
│   │                         idempotence, ArchiveConflictError, noms de dossiers sûrs
│   ├── ingest.py             ingest_bundle : valider → archiver → corréler → IngestResult ; result_payload (JSON) ; une ligne de journal
│   ├── snapshots.py          branchement de B1 : correlate_if_missing (ingestion), recorrelate (ld correlate) ; un échec est journalisé, jamais propagé
│   ├── schemas.py            formes de réponse typées (IngestReport, RunList…) et `utc_z` : une seule forme de date
│   ├── api.py                create_app : schéma de sécurité Bearer, OpenAPI porté par le contrat, POST bundles, GET bundles / bundle / report / snapshot (par paramètres de requête), /api/health
│   ├── cli.py                ld ingest | runs | correlate | render | serve
│   ├── render/               pages HTML de lecture d'un snapshot (2026-09-20), un fichier autonome par run
│   │   ├── page.py           assemblage : gabarit + style + visualiseur + données ; JSON échappé, CSP par empreinte
│   │   ├── build.py          deux chemins : fichier bundle (sans archive), run archivée
│   │   └── assets/           page.html, viewer.css, js/ : model (index), layout (placement), dom, graph, inspect, tables, main
│   └── correlate/            B1 corrélation (étape 1 le 2026-09-20) : correlate(bundle, bundle_sha256) -> Snapshot
│       ├── context.py        index immuables sur le bundle (devices, interfaces, MAC, IP, couverture, appartenances, descriptions parsées)
│       ├── checkbuild.py     fabrique des contrôles : référence repliée sur le nœud si le port est inconnu, sévérité unique exigée
│       ├── identity.py       R0 : résolution ordonnée des voisins → device, external ou stub
│       ├── cisco.py          formes courte / longue Cisco, équivalence de formes
│       ├── ifnames.py        R1 : expansion Cisco, port en MAC
│       ├── aggregates.py     R1-bis : port distant annoncé par le nom d'un agrégat → membre
│       ├── descriptions.py   R2 : grammaire `criticité|voisin|port|options` (V1, isolée)
│       ├── claims.py         R2 : évidences → claims résolus + contrôles R0 / R1 / R2
│       ├── merge.py          R3 : claims → câbles ; désaccords, deux voisins, réciprocité, documenté seul
│       └── assemble.py       R6 : nœuds, interfaces, contrôles (dont ceux du contrat), couverture, rapport, tris
└── tests/                    235 tests : API, archive, service, CLI, config, branchement de B1, pages (131) ; correlate/ (104) ;
                              js/ : 14 tests du visualiseur sous Node (faux DOM), lancés par pytest ; un test dans Chromium : grammaire, noms
                              d'interfaces, identité, fusion, scénarios 1-2-4-5-6-7 de docs/05, assemblage, déterminisme,
                              test_review.py et test_review2.py (une sonde de revue = un test)
```

## B1, la corrélation — étape 1

```python
from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot.serialize import canonical_json

from ld_backend.archive import fingerprint
from ld_backend.correlate import correlate

bundle = RunBundle.model_validate(doc)                 # doc : le bundle validé (dict)
snapshot = correlate(bundle, fingerprint(bundle)[1])  # l'empreinte du bundle archivé est une entrée
text = canonical_json(snapshot)                       # les octets à archiver : même bundle ⇒ mêmes octets
```

Entrée : un `RunBundle` valide et l'empreinte SHA-256 de son archivage. Sortie : un `Snapshot` valide au sens
du contrat de sortie (`contracts/CONTRAT.md` partie B), qui refuse tout snapshot incohérent à la construction.
Fonction pure : aucune horloge, aucune lecture disque, aucun identifiant synthétique ; les listes sont
triées par les clés du contrat. L'étape 1 produit les nœuds (device, external, stub), les interfaces, les câbles
avec leurs évidences et les contrôles R0 à R3, la couverture et le rapport ; `aggregates`, `mlag_domains`,
`ha_clusters` et les contrôles R4 / R5 arrivent à l'étape 2.

### Le branchement (2026-09-20)

`ingest.py` appelle `snapshots.correlate_if_missing` après `archive.store`. Deux décisions :

1. **Un échec de B1 ne fait jamais échouer l'ingestion.** Le bundle est la donnée irremplaçable, B1 est du code qui
   bouge. Toute exception (B1, contrat de sortie, disque) est écrite au journal avec sa trace ; le POST répond 201
   avec `correlation.status = "failed"`, sans un mot de la trace ; `GET /api/snapshot` répond alors 404 « run
   archivée sans snapshot ». Après correction : `ld correlate`, ou la même run renvoyée (une run sans snapshot
   reçoit le sien au passage). Le parapluie couvre aussi le test de présence : un `snapshot.json` illisible ne fait
   pas échouer un POST.
2. **Le snapshot est un produit dérivé, donc remplaçable**, à l'inverse du bundle. Une livraison identique ne le
   recalcule pas (`already_present`) ; `ld correlate` le recalcule depuis le bundle archivé et l'écrase (remplacement
   atomique d'un seul fichier). C'est ce qui permet de corriger une règle de B1 après avoir regardé de vraies données,
   sans ré-ingérer. Même bundle, même code ⇒ mêmes octets (testé).
3. **Le snapshot se calcule toujours sur le bundle archivé** (revue du 2026-09-20). L'enveloppe (`produced_at`,
   `exporter_version`) est hors empreinte mais recopiée dans `snapshot.source` : un ré-export de la même run est
   « identique » pour l'archive, pas pour le snapshot. La livraison reçue n'est corrélée que lorsqu'elle vient d'être
   archivée ; une run existante sans snapshot est recalculée depuis son `bundle.json`.
4. **Un snapshot vide ou tronqué compte comme absent** : le fichier est synchronisé sur disque avant le renommage, et
   sa présence se juge sans le lire (non vide, fini par `}` et une fin de ligne, comme toute forme canonique). Le GET
   répond alors 404 « sans snapshot », la livraison suivante ou `ld correlate` le recalcule. Les temporaires orphelins
   de plus d'une heure sont retirés à l'écriture suivante.

`ld correlate` écrit une ligne par run (`run_id`, statut, nœuds, câbles, contrôles par sévérité) et sort en 1 si une
run est inconnue, si B1 a échoué (trace sur stderr) ou si une entrée d'archive est corrompue : celle-ci a sa ligne,
son snapshot reste inchangé, **les runs suivantes sont quand même recalculées**. Dans OpenAPI, les modèles des deux contrats sont générés en une
seule passe (`models_json_schema`) : un type partagé par le bundle et le snapshot n'apparaît qu'une fois ; un test
refuse tout nom de schéma préfixé par son module, signe que deux classes des deux contrats portent le même nom.

Revue indépendante du branchement : `docs/revues/2026-09-20-branchement-b1.md` (aucun critique, 2 hauts, 4 moyens,
4 bas, tous traités le jour même ; sondes rejouables à côté).

## Les pages de lecture : `ld render`

Un **outil de lecture de B1**, pas le moteur de diagramme : voir ce que la corrélation a produit sur un bundle,
comprendre d'où vient chaque câble, et corriger l'exportateur ou les données. Mode d'emploi : `QUICKSTART.md`.

| Entrée | Sortie |
|---|---|
| `ld render bundle.json --out page.html` | valide, corrèle, écrit la page ; **ne touche ni archive ni serveur** (boucle de mise au point : ré-exporter la même run corrigée ne rencontre pas le 409 de l'archive). Bundle hors contrat : sortie 1, erreurs listées, aucune page |
| `ld render --infrastructure X --run-id Y --out page.html` | la page du snapshot et du rapport **tels qu'archivés** ; sortie 1 si la run est inconnue ou sans snapshot |

La page est un seul fichier (environ 60 Ko de visualiseur, plus les données : 90 Ko pour la fixture), ouvrable par
double-clic, sans réseau. Quatre vues : **graphe** (nœuds par sorte, câbles par statut, deux câbles entre les mêmes
équipements tracés séparément, clic ⇒ sources, contrôles, ports), **contrôles**, **qualité des données** (couverture
device × topic, constats d'ingestion, descriptions non lues, voisins non résolus, normalisations), **sources**
(câbles par combinaison de sources, filtrables par équipement). L'état de vue vit dans le fragment d'URL
(`#view=quality`, `#node=sw-core-01`, `#stubs=1`, `#ports=1`, et `#link=` qui porte **l'identité** du câble, ses deux
bouts, jamais son rang : l'adresse reste juste quand un export corrigé ajoute un voisin). Un paramètre illisible est
ignoré. Un contrôle posé sur un port qui porte plusieurs câbles n'est compté que sur le câble que ses détails désignent.
La fiche d'un équipement dit quels ports ont un câble et lesquels sont up sans rien en face.

Décisions (validées par Orhan le 2026-09-20 avant le code) :

1. **Aucune librairie, aucune ressource externe** : la zone peut ne pas avoir d'accès Internet, et rien n'est à faire
   entrer. Un test refuse toute URL dans la page (hors l'identifiant d'espace de noms SVG, jamais chargé).
2. **Placement force-dirigé écrit à la main, déterministe** (`layout.js`) : positions initiales tirées de l'ordre des
   hostnames, itérations fixes, aucun hasard, arêtes triées ; répulsion bornée en distance ; les équipements sans
   aucun câble sont rangés en ligne sous le graphe au lieu d'être chassés au loin. Un équipement glissé garde sa
   place. Mesuré : 0,2 s à 500 nœuds, 0,7 s à 1 500, 1,5 s à 3 000 (boucle sur tableaux numériques). Les voisins
   inconnus (stubs) sont masqués par défaut.
3. **Chaînes hostiles** (une description est du texte libre, un voisin LLDP annonce ce qu'il veut) : les données
   voyagent dans un bloc `application/json` où `<`, `>`, `&` sont échappés ; le visualiseur n'écrit jamais de HTML
   (`textContent` et `setAttribute` seulement : un test sur ses sources interdit `innerHTML` et consorts) ; une CSP par
   empreinte n'autorise que le script et la feuille de style de la page. Même entrée ⇒ même page, à l'octet.
4. **La page est aussi sensible que le bundle** : elle embarque hostnames, IP et descriptions. Pour sortir une
   capture : `ld-contracts anonymize`, puis `ld render` sur le bundle anonymisé.
5. **Le front n'invente rien** : la page lit le snapshot. Les seuls calculs sont des comptes et le placement.

Tests : `tests/test_render.py` (assemblage, CSP, échappement, hors-ligne, CLI) et `tests/js/` (modèle, placement,
démarrage complet de la page dans un faux DOM, sélection, tables, chaîne hostile), lancés par `uv run pytest` si Node
est présent (dépendance de test seulement). Le faux DOM ne rend rien : un test de fumée ouvre la page dans un Chromium
headless quand il en trouve un (`~/.cache/ms-playwright/`), et vérifie le DOM rendu sous la CSP, sans erreur de console.
Revue indépendante : `docs/revues/2026-09-20-pages-ld-render.md` (sécurité validée sous bundle hostile dans un vrai
navigateur ; 1 haut, 4 moyens, 5 bas, tous traités). Mesuré par la revue : 400 équipements, 1 200 câbles, 3 600
contrôles ⇒ page de 2,7 Mo, ouverte en 0,9 s. À venir : la page servie par le backend (`/view`, jeton saisi dans la page), puis l'incrément B
(agrégats et clusters HA, ce qui tire une partie de R4 dans B1).

## Vérifier et faire évoluer

```
uv run pytest --cov=ld_backend      # couverture attendue ≥ 80 %
uv run ruff check src tests
```

L'archive sur disque est une implémentation ; `BundleArchive` en est l'interface. Une
archive Mongo la remplacera sans toucher à `ingest.py` ni à `api.py`.

Décisions de B1, étape 1 (2026-09-20, validées par Orhan avant le code) : seules les interfaces `physical` et
`management` produisent des claims de câble (la description d'un port-channel est parsée, jamais dessinée) ;
grammaire V1 des descriptions isolée dans `descriptions.py` (champ 2 obligatoire, forme hostname ; un libellé
sans espace finit en stub visible) ; vue HA par membre (étape 2) ; fixtures dédiées construites en mémoire dans
les tests ; pas de version du corrélateur dans le snapshot (le rejeu se compare à l'octet). Le tri des évidences
et des bouts de lien est celui du contrat : `cdp` < `description` < `lldp`, bouts par (hostname, nom naturel).

Revue indépendante de l'étape 1 (2026-09-20) : rapport et suivi dans `docs/revues/2026-09-20-b1-etape-1.md`.
Lot 1 appliqué : B1 ne lève plus d'exception sur un bundle valide (port local inconnu, topic `interfaces` en
échec, port qui s'observe lui-même ⇒ `self_observation`), réciprocité linéaire (fusion à 9 600 claims : 46 s → 1,2 s),
contrôles de hub déterministes, IP comparées sur leur valeur, `vendor` Cisco sans la casse, repli d'agrégat quand le
topic n'est pas en `success`. Lot 2, tranché par Orhan puis codé : une description est placée par rapport aux câbles
observés à ses deux bouts (l'observé gagne toujours, un port ne porte qu'un câble), elle ne confirme que s'il y a un
seul candidat, et `description_unparseable` ne vise que les ports `physical` / `management`.

Contre-revue du même jour (`docs/revues/2026-09-20-b1-etape-1-contre-revue.md`, sondes rejouables à côté) : aucune
correction fausse, deux incomplètes. Corrigé : port local sous deux écritures équivalentes, alias de topic lus dans un
ordre écrit (le snapshot dépendait de `PYTHONHASHSEED`), hostname en forme d'adresse, port muet vu par deux témoins.
M1 et M2 tranchés : deux refus ajoutés au contrat d'entrée, IP en double retirée par B1. 187 tests, tous verts.
Reste ouvert : H2 (deux observations d'un même câble dont l'une en MAC), proposé pour `docs/06`.

**Ordre révisé le 2026-09-20 (voir avant de trancher).** L'étape 3 passe avant l'étape 2 : brancher B1
(`snapshot.json` à côté du bundle, `ld correlate`, `GET` du snapshot : **fait**), puis des pages HTML de visualisation hors
ligne qui montrent les nœuds, les câbles par statut, et pour chaque élément les sources qui l'ont tracé. Un premier
bundle réel suffit avec `devices`, `tasks`, `interfaces`, `lldp`, `cdp` (`aggregates`, `system`, `ha` vides acceptés).

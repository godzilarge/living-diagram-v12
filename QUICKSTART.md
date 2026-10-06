# Living Diagram v12 — démarrage rapide

Ce qui marche aujourd'hui (2026-10-03) : valider un bundle, l'archiver, le corréler (B1 : nœuds, câbles, agrégats,
clusters avec leurs sources), **générer une page HTML** qui montre le résultat, et **générer des topologies synthétiques**
sur plusieurs runs pour tout essayer sans donnée réelle. Tout tourne hors ligne. Détails : `backend/README.md`,
`contracts/README.md`, format du bundle : `contracts/CONTRAT.md`.

## 0. Une fois

```
cd contracts && uv sync && cd ../backend && uv sync        # Python 3.14 et dépendances, via uv
```

Toutes les commandes `ld …` se lancent depuis `backend/` avec `uv run`. Bundle d'exemple (synthétique) :
`contracts/fixtures/bundle-minimal.json` ; pour plus gros et plusieurs runs, § 1 bis.

## 1. Le plus court : un bundle → une page

```
cd backend
uv run ld render ../contracts/fixtures/bundle-minimal.json --out page.html
uv run ld diff bundle-avant.json bundle-apres.json          # ce qui a changé entre deux exports (B3), sans archive
uv run ld render bundle-apres.json --out page.html --from bundle-avant.json   # la page avec les changements, onglet Diff
xdg-open page.html                                          # ou double-clic : aucun serveur, aucun réseau
```

`ld render <bundle.json>` valide le bundle, le corrèle et écrit la page, **sans toucher l'archive**. C'est la boucle
de mise au point d'un exportateur : corriger l'export, relancer la commande, rafraîchir la page.

- Bundle hors contrat : la commande sort en 1 et liste les erreurs (chemin, règle), aucune page n'est écrite.
- Le snapshot JSON sans rien archiver : `uv run ld correlate mon-bundle.json --out snapshot.json` (mêmes octets que
  l'archive rangerait ; c'est aussi ce qui régénère `contracts/fixtures/snapshot-minimal.json`, le snapshot de référence).
- `ld diff` et `--from` acceptent **deux sortes de fichiers** : un **bundle** (l'export, validé puis corrélé à la
  volée) ou un **snapshot** (celui de `ld correlate --out`, ou `archive/<infra>/<run>/snapshot.json`). La commande
  reconnaît un snapshot à sa clé `snapshot_version`, qu'un bundle n'a pas ; chaque côté est lu pour lui-même : un
  bundle d'un côté et un snapshot de l'autre donnent le même diff.
- Valider sans dessiner : `cd contracts && uv run ld-contracts validate mon-bundle.json`
  (`--show-values` pour voir les hostnames dans le rapport, `--strict-findings` pour échouer aussi sur les constats :
  à mettre dans les tests de l'exportateur).

## 1 bis. Fabriquer des bundles de test : `ld-contracts generate`

`ld render` consomme un bundle ; `ld-contracts generate` en **fabrique**. Il invente une infrastructure plausible et écrit
un bundle par run, avec des pannes connues d'une run à l'autre : de quoi essayer B1, les pages et bientôt le diff (B3)
sans attendre un bundle réel ni en écrire à la main. Outil de test uniquement, rien en production n'en dépend.

```
cd contracts
uv run ld-contracts generate --seed demo --devices 24 --runs 3 --out ../serie-demo
uv run ld-contracts generate --seed s --devices 10 --runs 4 --scenario cable_moved,ha_failover --out ../serie-s
uv run ld-contracts generate --seed f --devices 30 --runs 2 --firewall-uplinks single-core --out ../serie-f
cd ../backend && uv run ld render ../serie-demo/run-03.json --out page.html
```

Un site complet par ~25 devices (deux cœurs NX-OS en vPC, accès Catalyst double-attachés, cluster FortiGate
actif-passif sans LLDP, routeur WAN vers une autre infrastructure, serveurs et téléphones en stubs). La première run
est la référence ; chacune des suivantes applique des mutations (device retiré ou injoignable, câble déplacé ou tombé,
description réécrite, bascule HA, membre d'agrégat suspendu, vitesse dégradée…), listées avec leur sujet dans
`manifest.json`. `--scenario` impose les mutations ; `--firewall-uplinks` change le raccordement du cluster FortiGate
(`vpc` par défaut, `dual-vpc`, `per-core`, `single-core` : deux port-channels par membre). Même graine ⇒ mêmes octets ;
chaque bundle est valide à zéro constat. Détail et catalogue :
`contracts/README.md` § Générer des bundles synthétiques. `ld ingest` les archive comme n'importe quel bundle (un
`run_id` différent par run).

## 2. Lire la page

| Onglet | Ce qu'on y voit |
|---|---|
| **Graphe** | Un nœud par équipement, un tracé par câble. **Glisser un équipement l'épingle** (B4) : dans `/view` avec un nom saisi, l'épingle s'enregistre pour tout le monde et survit aux runs ; un glyphe d'épingle marque les équipements épinglés. **Les autres équipements gardent aussi leur place d'une run à l'autre** (placement mémorisé, `docs/09` : la première place d'un équipement est celle qui reste, une nouvelle run ne place que les nouveaux) ; « replacer » recalcule tout autour des épingles et, dans `/view`, remplace le placement mémorisé pour tout le monde (confirmation dans la page). Vert = confirmé (observé et documenté), bleu = observé seul (LLDP / CDP), orange pointillé = documenté seul (descriptions). **Cliquer un câble : ses sources** (qui témoigne, ce qu'il annonce, comment le nom a été résolu), ses contrôles, ses deux ports avec leur description brute et lue. Cliquer un équipement : sa fiche, sa couverture de collecte, ses câbles, ses interfaces. Glisser déplace, la molette zoome. Les voisins inconnus (stubs) sont masqués par défaut. **Survoler un câble** : vitesse, duplex, média et état des deux bouts, tels que lus ; survoler un équipement : sa fiche courte. Chaque équipement porte l'icône de son type et son nom ; un membre de cluster HA porte son rôle tel qu'enregistré (fond teinté s'il forwarde, grisé s'il attend, rouge si down). Les pastilles de l'en-tête sont des boutons : « 2 error » ouvre les contrôles filtrés, un statut se masque. Bouton « légende » pour afficher ou replier la carte de légende. Tab parcourt les éléments, Entrée sélectionne. |
| **Intentions** | La couche d'intention (B4, `docs/08`) : les épingles enregistrées (qui, quand, où), les orphelines (équipement absent de cette run : dites telles, jamais effacées en silence), retirer une ou toutes (confirmation dans la page), votre nom. En page générée : lecture seule. |
| **Contrôles** | Tout ce que B1 signale (désaccord description / LLDP, voisin inconnu, vu d'un seul côté…), filtrable ; cliquer une cible l'ouvre dans le graphe. |
| **Qualité des données** | Ce qui sert à corriger l'exportateur : couverture par équipement et par topic, constats du contrat d'entrée (clés oubliées, interface locale inconnue…), descriptions non lues, voisins non résolus, normalisations. |
| **Sources** | Combien de câbles par combinaison de sources (LLDP + description, description seule…), et la liste de tous les câbles. |

L'adresse porte l'état de vue : `page.html#view=quality`, `#node=sw-core-01`, `#stubs=1&ports=1`.

**La page contient les données du bundle** (hostnames, IP, descriptions) : elle est aussi sensible que lui et ne sort
pas de la zone. Pour montrer une capture à l'extérieur, anonymiser d'abord :

```
cd contracts && LD_CONTRACTS_SEED='une-graine-secrete' uv run ld-contracts anonymize mon-bundle.json anonyme.json
cd ../backend && uv run ld render ../contracts/anonyme.json --out page-anonyme.html
```

## 3. Avec l'archive, en ligne de commande

```
cd backend
uv run ld ingest mon-bundle.json --archive ./archive                 # valide, archive, corrèle : écrit snapshot.json
uv run ld runs --infrastructure <infra> --archive ./archive          # les runs archivées, par début de collecte
uv run ld render --infrastructure <infra> --run-id <run> --archive ./archive --out page.html
uv run ld correlate --infrastructure <infra> --archive ./archive     # recalcule les snapshots (après une correction de B1)
uv run ld diff --infrastructure <infra> --archive ./archive          # ce qui a changé à la dernière run (B3) ; --from / --to, --out diff.json
uv run ld render --infrastructure <infra> --run-id <run> --from <run d'avant> --archive ./archive --out page.html   # la page avec les changements
uv run ld intent --infrastructure <infra> --archive ./archive        # les épingles de la couche d'intention (B4), lecture seule
uv run ld placement --infrastructure <infra> --archive ./archive     # le placement mémorisé (docs/09) ; --forget le retire, il se recalcule au prochain dessin
```

Une run archivée ne change jamais : renvoyer le même bundle = `already_present`, un bundle **différent pour la même
run = refus** (409 côté API). Pour itérer sur un export, utiliser `ld render <fichier>` (§ 1), ou un autre `run_id`,
ou un autre dossier `--archive`.

## 4. Avec l'API

```
cd backend
export LD_API_TOKEN='un-jeton-long-et-secret'      # obligatoire
export LD_ARCHIVE_DIR=./archive
uv run ld serve --host 127.0.0.1 --port 8000       # documentation interactive : http://127.0.0.1:8000/docs
```

Dans un autre terminal :

```
H="Authorization: Bearer $LD_API_TOKEN"
# 1. envoyer le bundle : 201 created · 200 already_present · 409 conflict · 422 invalid (liste des erreurs)
curl -s -X POST http://127.0.0.1:8000/api/ingest/bundles -H "$H" -H "Content-Type: application/json" \
     --data-binary @mon-bundle.json | python3 -m json.tool
# 2. lister les runs, relire le rapport d'ingestion, récupérer le snapshot
curl -s -G http://127.0.0.1:8000/api/ingest/bundles -H "$H" --data-urlencode "infrastructure=<infra>"
curl -s -G http://127.0.0.1:8000/api/ingest/report  -H "$H" --data-urlencode "infrastructure=<infra>" --data-urlencode "run_id=<run>"
curl -s -G http://127.0.0.1:8000/api/snapshot       -H "$H" --data-urlencode "infrastructure=<infra>" --data-urlencode "run_id=<run>" -o snapshot.json
# 2 bis. ce qui a changé entre deux runs (B3) : calculé à la demande, jamais archivé
curl -s -G http://127.0.0.1:8000/api/diff           -H "$H" --data-urlencode "infrastructure=<infra>" --data-urlencode "from=<run d'avant>" --data-urlencode "to=<run>" -o diff.json
# 2 ter. la couche d'intention (B4) : lire, puis épingler ou retirer (dernier écrivain gagne, par épingle ; journalisé)
curl -s -G http://127.0.0.1:8000/api/intent         -H "$H" --data-urlencode "infrastructure=<infra>"
curl -s -X POST "http://127.0.0.1:8000/api/intent/patches?infrastructure=<infra>" -H "$H" -H "Content-Type: application/json" \
     -d '{"author": "orhan", "ops": [{"op": "pin", "hostname": "<hostname>", "x": 120, "y": -40}]}'
# 2 quater. le placement mémorisé (docs/09) : lu et écrit par la page /view elle-même ; lisible ici
curl -s -G http://127.0.0.1:8000/api/placement      -H "$H" --data-urlencode "infrastructure=<infra>"
# 3. dessiner la run archivée (même dossier d'archive que le serveur) ; --from <run d'avant> pour y peindre les changements
uv run ld render --infrastructure <infra> --run-id <run> --archive ./archive --out page.html
# 4. ou la lire dans le navigateur, sans rien générer : la page servie par l'API
#    http://127.0.0.1:8000/view?infrastructure=<infra>&run_id=<run>
#    http://127.0.0.1:8000/view?infrastructure=<infra>&run_id=<run>&from=<run d'avant>     (avec le diff ; la liste des runs propose « avec la précédente »)
#    puis, dans la page, la bande des runs sous l'en-tête : ← → passent de run en run, le diff suit (comparée à la run qu'on quitte)
```

Dans la réponse du POST, `correlation` dit ce que B1 a fait : `created` (avec le nombre de nœuds, de câbles et de
contrôles), `already_present`, ou `failed`. Un échec de B1 ne fait pas échouer l'ingestion : le bundle est archivé, la
trace est dans le journal du serveur, `ld correlate` rattrape après correction. Régler le timeout du client à 60 s.

`GET /view` sert la **même page que `ld render`, sans donnée** : elle se sert sans jeton, comme `/docs`, et lit le
snapshot, le rapport et la couche d'intention par l'API. **Le jeton se saisit dans la page** ; il reste dans l'onglet
(`sessionStorage`) et n'entre jamais dans l'adresse. **Votre nom**, saisi à côté (gardé dans `localStorage`), signe
les épingles que vous posez en glissant un équipement ; sans nom, les déplacements restent locaux. Sans `run_id`, la
page liste les runs de l'infrastructure. L'adresse (`/view?infrastructure=&run_id=#view=graph&node=…`) se partage :
elle porte la run et l'état de vue, pas le jeton. **La bande des runs**, sous l'en-tête, passe de run en run (clic,
← →, ou les flèches au clavier depuis la bande) : la sélection, l'onglet et les bascules restent, chaque équipement
garde sa place, et le diff suit (→ compare à la run qu'on quitte, « comparer à » choisit n'importe quelle run
antérieure, ou aucune) ; l'adresse porte toujours `from` quand un diff est peint.

## 5. Un premier bundle réel

Suffisent pour voir quelque chose : `devices`, `tasks`, `interfaces`, `lldp`, `cdp`. Les sections `aggregates`,
`system`, `ha` peuvent être des listes vides ; avec `aggregates` et `ha`, la page montre aussi les **agrégats** (bandes
sous les câbles, étiquetées peer-link ou MLAG), les **domaines vPC / MLAG** et les **clusters HA** (cadre autour des
membres), onglet **Structures** (depuis le 2026-09-26). Ce que B1 ne fait pas encore : comparer l'état des deux bouts
d'un câble (R5), lire une table MAC (les câbles des firewalls, sans LLDP, n'existent donc que par les descriptions :
ils sortent en orange pointillé).

## 6. Vérifier le code

```
cd contracts && uv run pytest --cov=ld_contracts && uv run ruff check src tests
cd backend   && uv run pytest --cov=ld_backend   && uv run ruff check src tests    # inclut les tests de la toile (Node requis, sinon ignorés)
cd engine    && npm ci && npm run typecheck && npm run build                       # seulement pour modifier la toile : viewer.js se versionne
```

La page est **la toile** (`engine/`, TypeScript, `engine/README.md`) construite en un seul fichier embarqué par le
backend : Python n'a jamais besoin de Node pour fonctionner.

## Aide-mémoire

| Je veux… | Commande |
|---|---|
| valider un bundle | `ld-contracts validate bundle.json` (dans `contracts/`) |
| voir un bundle, sans rien archiver | `ld render bundle.json --out page.html` |
| son snapshot JSON, sans rien archiver | `ld correlate bundle.json --out snapshot.json` |
| archiver et corréler | `ld ingest bundle.json --archive ./archive` ou `POST /api/ingest/bundles` |
| lister les runs | `ld runs --infrastructure X` ou `GET /api/ingest/bundles?infrastructure=X` |
| récupérer le snapshot (JSON) | `GET /api/snapshot?infrastructure=X&run_id=Y`, ou `archive/X/Y/snapshot.json` |
| épingler un équipement (B4) | glisser dans `/view` avec un nom saisi ; ou `POST /api/intent/patches?infrastructure=X` `{"author","ops":[{"op":"pin","hostname","x","y"}]}` |
| lire les épingles | `ld intent --infrastructure X`, `GET /api/intent?infrastructure=X`, onglet **Intentions** |
| lire ou oublier le placement mémorisé (`docs/09`) | `ld placement --infrastructure X [--forget]`, `GET /api/placement?infrastructure=X` ; « replacer » dans `/view` |
| dessiner une run archivée | `ld render --infrastructure X --run-id Y --out page.html` |
| la lire dans le navigateur, serveur lancé | `http://127.0.0.1:8000/view?infrastructure=X&run_id=Y` (jeton saisi dans la page) |
| recalculer après une correction de B1 | `ld correlate --infrastructure X [--run-id Y]` |
| comparer deux runs (B3) | `ld diff --infrastructure X [--from A] [--to B] [--out diff.json]`, `ld diff bundle-avant.json bundle-apres.json` (bundles ou snapshots, § 1), ou `GET /api/diff?infrastructure=X&from=A&to=B` |
| dessiner une run avec ses changements | `ld render … --from <fichier ou run d'avant>` ; dans le navigateur, `/view?…&from=A` |
| passer de run en run dans le navigateur | la bande des runs sous l'en-tête de `/view` : clic, ← →, flèches du clavier ; « comparer à » pour le diff |
| valider un snapshot | `ld-contracts validate --contract snapshot snapshot.json` |
| valider un diff | `ld-contracts validate --contract diff diff.json` |
| partager sans fuite | `ld-contracts anonymize in.json out.json`, puis `ld render out.json` |
| fabriquer des bundles de test, N runs, pannes connues | `ld-contracts generate --seed X --devices 24 --runs 3 --out DIR` (dans `contracts/`) |

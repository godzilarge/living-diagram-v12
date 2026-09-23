# Living Diagram v12 — démarrage rapide

Ce qui marche aujourd'hui (2026-09-20) : valider un bundle, l'archiver, le corréler (B1 : nœuds et câbles avec leurs
sources), et **générer une page HTML** qui montre le résultat. Tout tourne hors ligne. Détails : `backend/README.md`,
`contracts/README.md`, format du bundle : `contracts/CONTRAT.md`.

## 0. Une fois

```
cd contracts && uv sync && cd ../backend && uv sync        # Python 3.14 et dépendances, via uv
```

Toutes les commandes `ld …` se lancent depuis `backend/` avec `uv run`. Bundle d'exemple (synthétique) :
`contracts/fixtures/bundle-minimal.json`.

## 1. Le plus court : un bundle → une page

```
cd backend
uv run ld render ../contracts/fixtures/bundle-minimal.json --out page.html
xdg-open page.html                                          # ou double-clic : aucun serveur, aucun réseau
```

`ld render <bundle.json>` valide le bundle, le corrèle et écrit la page, **sans toucher l'archive**. C'est la boucle
de mise au point d'un exportateur : corriger l'export, relancer la commande, rafraîchir la page.

- Bundle hors contrat : la commande sort en 1 et liste les erreurs (chemin, règle), aucune page n'est écrite.
- Valider sans dessiner : `cd contracts && uv run ld-contracts validate mon-bundle.json`
  (`--show-values` pour voir les hostnames dans le rapport, `--strict-findings` pour échouer aussi sur les constats :
  à mettre dans les tests de l'exportateur).

## 2. Lire la page

| Onglet | Ce qu'on y voit |
|---|---|
| **Graphe** | Un nœud par équipement, un tracé par câble. Vert = confirmé (observé et documenté), bleu = observé seul (LLDP / CDP), orange pointillé = documenté seul (descriptions). **Cliquer un câble : ses sources** (qui témoigne, ce qu'il annonce, comment le nom a été résolu), ses contrôles, ses deux ports avec leur description brute et lue. Cliquer un équipement : sa fiche, sa couverture de collecte, ses câbles, ses interfaces. Glisser déplace, la molette zoome. Les voisins inconnus (stubs) sont masqués par défaut. |
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
# 3. dessiner la run archivée (même dossier d'archive que le serveur)
uv run ld render --infrastructure <infra> --run-id <run> --archive ./archive --out page.html
```

Dans la réponse du POST, `correlation` dit ce que B1 a fait : `created` (avec le nombre de nœuds, de câbles et de
contrôles), `already_present`, ou `failed`. Un échec de B1 ne fait pas échouer l'ingestion : le bundle est archivé, la
trace est dans le journal du serveur, `ld correlate` rattrape après correction. Régler le timeout du client à 60 s.
La page n'est pas encore servie par l'API : elle se génère avec `ld render`.

## 5. Un premier bundle réel

Suffisent pour voir quelque chose : `devices`, `tasks`, `interfaces`, `lldp`, `cdp`. Les sections `aggregates`,
`system`, `ha` peuvent être des listes vides. Ce que B1 ne fait pas encore : reconstruire les agrégats, les vPC et les
clusters HA, comparer l'état des deux bouts d'un câble, lire une table MAC (les câbles des firewalls, sans LLDP,
n'existent donc que par les descriptions : ils sortent en orange pointillé).

## 6. Vérifier le code

```
cd contracts && uv run pytest --cov=ld_contracts && uv run ruff check src tests
cd backend   && uv run pytest --cov=ld_backend   && uv run ruff check src tests    # inclut les tests du visualiseur (Node requis, sinon ignorés)
```

## Aide-mémoire

| Je veux… | Commande |
|---|---|
| valider un bundle | `ld-contracts validate bundle.json` (dans `contracts/`) |
| voir un bundle, sans rien archiver | `ld render bundle.json --out page.html` |
| archiver et corréler | `ld ingest bundle.json --archive ./archive` ou `POST /api/ingest/bundles` |
| lister les runs | `ld runs --infrastructure X` ou `GET /api/ingest/bundles?infrastructure=X` |
| récupérer le snapshot (JSON) | `GET /api/snapshot?infrastructure=X&run_id=Y`, ou `archive/X/Y/snapshot.json` |
| dessiner une run archivée | `ld render --infrastructure X --run-id Y --out page.html` |
| recalculer après une correction de B1 | `ld correlate --infrastructure X [--run-id Y]` |
| valider un snapshot | `ld-contracts validate --contract snapshot snapshot.json` |
| partager sans fuite | `ld-contracts anonymize in.json out.json`, puis `ld render out.json` |

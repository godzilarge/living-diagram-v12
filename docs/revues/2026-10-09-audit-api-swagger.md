# Audit de l'API et de son Swagger — 2026-10-09

Demande d'Orhan : « le swagger me semble un peu le bazar, aucune organisation, hiérarchie ; l'auditer pour qu'il soit
clean, voir s'il y a des bugs, des soucis de performance ». Audit sur le code (`backend/src/ld_backend/api.py`) et sur
le document généré (`/openapi.json`, 18 opérations, 179 schémas, 184 Ko). « Go pour A, B et C » le même jour.

## Constats

### Organisation (la cause du « bazar »)

| # | Constat | Suite |
|---|---|---|
| O1 | Aucun tag : les 18 routes dans « default » | huit groupes dans l'ordre du pipeline |
| O2 | `operationId` générés (`get_intent_journal_api_intent_journal_get`) | identifiants courts, testés |
| O3 | Titre « Living Diagram — ingestion », description arrêtée au diff | « Living Diagram API », description du pipeline, du jeton, des erreurs, des pages ; version du paquet |
| O4 | Pages HTML `/` et `/view` présentées comme des opérations | hors du document, citées dans la description |
| O5 | Résumé de `POST /api/intent/patches` = 14 noms d'opérations, sans les trois `connector_*` | résumé court ; description générée depuis l'union `IntentOp` (un oubli fait échouer un test) |

### Le document ne disait pas ce que l'API répond

| # | Constat | Suite |
|---|---|---|
| D1 | 422 documenté au format FastAPI (`HTTPValidationError`), servi `{detail, errors[{path, message}]}` | schéma `Problem`, `HTTPValidationError` disparu |
| D2 | 404 / 409 / 500 sans schéma | `Problem` partout, sauf quatre refus qui portent un document (rapport d'ingestion, placement courant), dits route par route |
| D3 | 401 documenté sur une route sur quinze | routeur protégé : 401 et 422 déclarés une fois pour toutes |
| D4 | `GET bundle` / `report` sans 404 ni 500 | ajoutés |
| D5 | 200 sans schéma : `GET bundle` (`{}`), `GET assets` (image), `health` (type anonyme) ; `POST assets` 200 sans modèle, corps image non déclaré | `RunBundle`, `image/*` binaire, `Health`, `AssetReceipt`, corps image déclaré |
| D6 | 413 « bundle trop volumineux » pour une image ou une intention | « corps trop volumineux » |
| D7 | Une erreur imprévue rendait un 500 `text/plain` | gestionnaire global : `Problem` neutre, cause au journal du serveur |

### Bugs et performances

| # | Constat | Gravité | Suite |
|---|---|---|---|
| B1 | `POST /api/intent/patches` (asynchrone) appliquait verrou `fcntl`, `fsync` et journal **dans la boucle d'événements** : pendant un `ld journal prune` ou une écriture lente, toute l'API se figeait. Même défaut corrigé pour le placement le 2026-10-06, pas pour l'intention | haute | validation et application en fil ; test : une écriture qui attend le verrou n'empêche pas `/api/health` de répondre (échoue sur l'ancien code) |
| B2 | La garde « au moins une run archivée » de chaque écriture appelait `list_runs` (lit et trie tous les `meta.json`) | moyenne | `BundleArchive.has_runs` : s'arrête à la première run lisible, en fil |
| B3 | `GET /api/diff` ≈ 3,2 s à la jauge, recalculé à chaque appel, alors que l'application en fait un à chaque ouverture de run et chaque pas de la bande | moyenne | `DiffCache` (C, `docs/07` Q6 tranchée) |
| B4 | `DELETE /api/intent/assets` : « aucune annotation ne la cite » puis suppression, sans verrou ; une annotation écrite entre les deux citait une image disparue | basse | `IntentStore.release_asset` sous le verrou de `apply` ; test |
| B5 | Deux lecteurs de corps copie conforme | basse | un seul (`bodies.read_body`), le JSON s'appuie dessus |

## Ce qui a été fait

- `api.py` (700 → ~510 lignes) ne déclare plus que les routes, regroupées par famille sur un routeur protégé ;
  `openapi.py` (nouveau) dit ce qu'elles répondent ; `bodies.py` (nouveau) lit les corps et forme les refus.
- `schemas.py` : `Problem`, `ProblemField`, `Health`. `archive.py` : `has_runs`, `snapshot_stamp`. `intent.py` :
  `release_asset`, `AssetInUseError`. `diffs.py` : `DiffCache` (64 Mo, LRU, sûr entre fils).
- Le cache du diff revérifie l'existence des deux runs à chaque appel : la première version servait un diff d'une run
  dont l'entrée venait d'être abîmée (rattrapé par `test_a_label_with_a_slash_and_a_corrupt_run`).
- **Aucun chemin changé** : l'exportateur, l'application et `/view` sont intacts.
- Tests : `tests/test_openapi.py` (dix règles du document), `tests/test_api_audit.py` (B1 à B4, C, D6, D7),
  `tests/test_diff_cache.py` ; les nouveaux tests échouent sur l'ancien `api.py` (vérifié), passent sur le nouveau.
  Backend : 573 tests, 98 %. Capture de `/docs` vérifiée dans Chromium.

## Non fait, motivé

- **Renommer les chemins** (`GET /api/ingest/bundles` liste des runs, singulier / pluriel mêlés) : casserait
  l'exportateur d'Orhan et les adresses du front pour un gain de forme ; les groupes le rendent lisible. À reprendre au
  gel du contrat si Orhan y tient.
- `POST /api/intent/assets` écrit le fichier hors du verrou de l'intention : un envoi et un retrait simultanés de la
  même image peuvent rendre une empreinte aussitôt retirée ; l'annotation qui la citerait est alors refusée
  (`unknown_asset`), rien d'incohérent n'est écrit.
- Deux appels simultanés du même diff calculent deux fois (mêmes octets).

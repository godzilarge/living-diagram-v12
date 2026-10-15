---
paths:
  - "backend/**"
---

# Le backend (`ld-backend`)

FastAPI, Python 3.14 via `uv`. La porte d'entrée (ingestion), B1, B3, B4, l'archive, le journal, la CLI `ld`, et les
pages `/`, `/view`.

- **B1 est une fonction pure** sur le bundle archivé : `correlate/` couvert à 100 %, règles R0 à R6 dans `docs/05`,
  un seul fabricant de contrôles (`checkbuild.py`). Un échec de B1 ne fait jamais échouer une ingestion. Le snapshot
  est un produit dérivé, remplaçable, toujours calculé sur le bundle archivé. Le golden
  `contracts/fixtures/snapshot-minimal.json` ne s'édite **jamais** : il se régénère par `ld correlate … --out`.
- **L'API** : une run s'adresse par paramètres de requête, jamais par le chemin. Toute erreur a la forme `Problem`
  (`code`, `params`, `errors[]`) écrite dans `problems.py` ; **aucun `HTTPException(` à la main** dans `api.py` ou
  `bodies.py` (testé). Messages en anglais, **jamais une valeur reçue dans un message**. Jeton `LD_API_TOKEN`
  obligatoire ; `/docs`, `/openapi.json`, `/`, `/view` servis sans jeton. Les réponses sont typées (`schemas.py`)
  pour OpenAPI et les types TS.
- **Écriture** : atomique sous verrou (`files.py`), hors de la boucle d'événements ; dernier écrivain gagne par clé ;
  journal `journal.jsonl` écrit avant le document ; document corrompu isolé, jamais écrasé ; bornes `LD_MAX_*`.
- Les pages servies lisent leurs fichiers **à la requête** (liste de noms qui fait foi, `ETag`), CSP `'self'`, aucune
  URL externe (testé). Python n'a jamais besoin de Node.
- Tests : `uv run pytest --cov=ld_backend`, ≥ 80 % ; les parcours Chromium (`tests/browser.py`, pilote DevTools sans
  dépendance) et les tests Node (`tests/js/`) en font partie ; un test instable sous charge se note dans
  `docs/etat.md`, il ne se désactive pas. Mesurer avant d'affirmer un coût.
- `QUICKSTART.md` et `backend/README.md` suivent chaque commande ou route nouvelle.

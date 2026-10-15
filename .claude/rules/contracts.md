---
paths:
  - "contracts/**"
---

# Les contrats (`ld-contracts`)

La brique fondamentale : RunBundle (entrée), Snapshot (sortie de B1), Diff, Intent. Pydantic strict et `frozen`,
champs inconnus refusés, entiers stricts. **`contracts/CONTRAT.md` est généré** (`ld-contracts docs --out`), le JSON
Schema aussi (`ld-contracts schema --out`) : un test de dérive refuse un modèle modifié sans régénération.

- **Le contrat demande ce que B1 consomme**, jamais ce qu'un producteur possède. Un champ entre avec sa règle et son
  test, pas comme donnée « utile à l'avenir ». Premier niveau si le concept est agnostique, le type normalisé et B1 le
  consomme ; sinon `extras`, jamais lu hors clés déclarées.
- **`null` n'affirme jamais un fait.** Un fait s'écrit avec une valeur (`"never"`, `"default"`, `false`) ; deux
  écritures d'un même fait sont refusées. Clé nullable absente = `null`, comptée dans le rapport d'ingestion
  (`nullable_key_absent`), jamais dans le snapshot.
- **Refus** (le document n'entre pas) ou **constat** (compté, le document entre) : un désaccord entre sources n'est
  jamais un refus, c'est un contrôle de B1. **Ce que le contrat de sortie refuse, celui d'entrée ne le laisse pas
  passer.** L'ordre canonique est refusé par le type (`snapshot/order.py`).
- **Versions** : semver par contrat, indépendantes ; un ajout est une mineure additive avec `upgraded()` qui relit les
  mineures antérieures ; une majeure se prévoit, ne s'improvise pas. Le contrat d'entrée 1.0.0 se modifie en place
  jusqu'au gel au premier bundle réel ingéré.
- Chaque décision de contrat tient en une ligne datée dans `contracts/README.md` § Décisions, avec son motif.
- Les rapports de validation ne contiennent aucune valeur sans `--show-values` ; l'anonymiseur conserve les absences
  et protège les jetons réservés.
- Le générateur synthétique (`synth/`) est l'oracle de B3 et de la jauge de performance : même octets entre
  processus, zéro constat strict, invariants du monde vérifiés après chaque run.
- Tests : `uv run pytest --cov=ld_contracts && uv run ruff check src tests`.

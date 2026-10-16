# Living Diagram v12

Application web de diagrammes de topologie **physique (L1)** d'infrastructures réseau (Cisco IOS-XE / NX-OS, Fortinet,
Checkpoint), nourrie par une base MongoDB de collecte amont : historique entre runs (snapshots + diff), retouches
persistantes (« couche d'intention »), placement mémorisé. **Codée à 100 % par Claude Code** : ce fichier et ce qu'il
pointe sont la direction globale de toute session, humaine ou agent.

## Lire d'abord, écrire en dernier

1. **`docs/etat.md`** : fait / en cours / à faire / parqué. Première lecture d'une session, dernière écriture.
2. La règle de la zone touchée, chargée automatiquement : `.claude/rules/{app,engine,backend,contracts}.md`.
3. Le document de conception de la brique (`docs/NN-*.md` ; la refonte : `docs/12-app-skeleton.md`,
   `docs/13-migration-plan.md`) et, pour l'interface, `PRODUCT.md`, `DESIGN.md` et `design/comps/shell/`.
4. `docs/journal.md` : l'histoire des décisions (2026-08 → aujourd'hui), à consulter par recherche, jamais à relire.

Une session = **un lot**. Elle finit par le skill `livraison` (suites, captures, docs, entrée de journal, `etat.md`).

## Règles non négociables

- **Annoncer avant de coder, documenter en finissant.** Quoi, où, quelles décisions non triviales ; Orhan valide chaque
  brique avant la suivante. Une remarque de fond d'Orhan sur le modèle ou le contrat passe avant tout code en cours.
- **Être synthétique.** Une réponse commence par ce que la chose fait, en une phrase répétable, puis le strict
  nécessaire. Vaut pour les docs : README = ce que c'est, lancer, tester, sur un écran ; une décision = une ligne.
- **Échanger en français**, avec rigueur et confrontation : pas de complaisance. Orhan tranche le visuel en comparant.
  **Tout ce que la v2 crée s'écrit en anglais** (`PRODUCT.md`, `DESIGN.md`, `app/` : code, commentaires, README,
  tests, entrées de journal de la refonte) ; l'existant reste en français jusqu'à la passe prévue après la refonte.
- **Voir avant de trancher.** Aucune décision de design sans rendu sous les yeux ; les cas limites abstraits ne lui
  sont pas soumis : défaut pur ⇒ corrigé sans lui, règle douteuse ⇒ `docs/a-juger-a-l-usage.md`, comportement prudent.
- **Le contrat est le standard** (`contracts/CONTRAT.md`). Il demande ce que B1 consomme, jamais ce qu'un producteur
  possède. `null` n'affirme jamais un fait. Ce que le contrat de sortie refuse, celui d'entrée ne laisse pas passer.
- **Le front n'invente rien, tout vient de la donnée.** Jamais de câble inventé, jamais de désaccord résolu en
  silence : un désaccord devient un contrôle visible. Un lien ajouté à la main est une intention, jamais un fait.
- **Périmètre V1 : l'infrastructure, jamais les endpoints.** B1 ne filtre rien, les pages masquent.
- **Aucun bundle réel, jamais**, même anonymisé. Tests sur fixtures synthétiques et sur le générateur à graine.
- **Déterminisme** : même bundle ⇒ même snapshot à l'octet, testé entre processus.
- **Regard neuf** : `../living-diagram` (v11) n'est pas une base ; on garde des idées, jamais du code.
- **Une revue indépendante par brique**, consignée dans `docs/revues/` dès sa remise, traitée dans la foulée ; aucune
  pour une règle de quelques lignes ; **une recommandation de revue est une hypothèse** à confronter à l'usage.
- **L'interface se construit sur un monde visuel choisi** (`DESIGN.md`), jamais au goût de l'agent du jour : skill
  `brique-ui`, agent `ui`, prototype au banc pour toute interaction nouvelle, revue contre la maquette, pas contre un score.

## Architecture

```
MongoDB amont ─ B0 exportateur (chez Orhan) → RunBundle JSON (contrat v1)
  → POST /api/ingest/bundles ─ B1 corrélation (fonction pure) → snapshot + contrôles ─ B2 archive disque
  → B3 diff (calculé à la demande) · B4 intention (patchs keyés identité) · placement mémorisé
  → API FastAPI (un contrat JSON versionné, types TS générés)
  → engine/ : moteur de diagramme TypeScript pur (modèle, placement, géométrie)
  → application React (React Flow) servie à `/` · /view + ld render : page de diagnostic, gelée
```

Quatre couches : C0 snapshot (immuable, par run) · C1 dérivé · C2 intention (jamais une coordonnée de run) · C3 vue
(adresse). `rendu = f(C0 ⊕ C2, C3)` ; `diff = C0(A) ↔ C0(B)`, jamais C2. Détail : `docs/00-analyse-fondation.md`,
artefact <https://claude.ai/code/artifact/630b787d-6862-4e3c-8e1c-7d40fd373e3c>.

## Carte du dépôt

| Dossier | Quoi | Tester |
|---|---|---|
| `contracts/` | `ld-contracts` : modèles Pydantic, JSON Schema, `CONTRAT.md` généré, générateur synthétique, CLI | `cd contracts && uv run pytest --cov=ld_contracts && uv run ruff check src tests` |
| `backend/` | `ld-backend` : API FastAPI, B1, B3, B4, archive, journal, CLI `ld`, `/view` | `cd backend && uv run pytest --cov=ld_backend` (Chromium et Node compris) |
| `engine/` | la toile : moteur pur `src/canvas/`, coquille `/view` `src/shell/`, application `src/app/` (v1, à remplacer) | `cd engine && npm ci && npm run check` |
| `docs/` | conception (`NN-*.md`), revues, `etat.md`, `journal.md`, `a-juger-a-l-usage.md` | — |
| `bac-a-sable/` | prototypes hors projet, gitignoré, servis sur `0.0.0.0:8016` | — |
| `QUICKSTART.md` | un bundle → une page, en CLI et par l'API ; à jour à chaque commande ou route nouvelle | — |

Python 3.14 via `uv`, Pydantic strict et `frozen` ; Node ≥ 20 seulement pour construire la toile, jamais en production.

## Conventions

Immutabilité (jamais de mutation d'entrée) · fichiers ~400 lignes, jusqu'à 600 si la cohésion le justifie, découpés sur
une vraie couture · fonctions < 50 lignes · erreurs explicites, jamais une valeur reçue dans un message · validation aux
frontières · TDD, couverture ≥ 80 % (`correlate/` et `diff/` à 100 %) · commits conventionnels en français (`feat:`,
`fix:`, `docs:`, `chore:`), un lot par commit, **sans ligne d'attribution** · jamais de commit ni de push sans demande.

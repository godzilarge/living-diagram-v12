"""Partie C de `CONTRAT.md` : le contrat de comparaison, Diff v1."""

from pathlib import Path

from ld_contracts.diff import DIFF_VERSION
from ld_contracts.diff.codes import DIFF_ERROR_TYPES, DIFF_SHARED_ERROR_TYPES
from ld_contracts.docgen_render import render_reference
from ld_contracts.schema import generate_schema

DIFF_SKELETON_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "diff-skeleton.json"
SHARED_LABEL = "Types partagés avec le RunBundle et le Snapshot, définis en parties A et B"

DIFF_RULES = [
    "### Règles transverses",
    "",
    "Vérifiées à la validation d'un diff, au-delà des types de chaque champ. Un diff qui les viole est **refusé** :",
    "un diff incohérent est un bug de B3 (`docs/07`).",
    "",
    "- **Toutes les clés sont écrites**, comme pour le snapshot ; aucun défaut, pas d'`extras`.",
    "- **Une identité par entité, celle du snapshot, à l'octet** : `hostname` d'un nœud ; `(hostname, name)` d'une",
    "  interface ou d'un agrégat ; paire triée des bouts d'un lien ; `(mlag_id, membres)` d'un domaine MLAG ; membres",
    "  d'un cluster HA ; `(code, refs)` d'un contrôle (les `details` décrivent, ils n'identifient pas) ; `hostname`",
    "  d'une couverture. La casse compte : un nom réécrit avec une majuscule est retiré puis ajouté (`docs/07` Q5).",
    "- **Trois sortes par section, une identité dans une seule** : `added` et `removed` portent l'entité complète,",
    "  telle qu'elle est dans `after` ou était dans `before` ; `changed` porte la référence typée et les champs",
    "  `(path, before, after)`, `path` en identifiants séparés par des points, une liste se comparant en bloc (jamais",
    "  un indice). Une identité ne figure que dans une part (`identity_in_several_parts`). Les contrôles ont leurs",
    "  mots : `appeared`, `resolved`, `persisted` (compte), `appeared` et `resolved` disjoints.",
    "- **Deux champs volatils déclarés**, exclus de `changed` (`field_change_volatile`) et comptés dans",
    "  `summary.volatile_changes` : `nodes[].uptime_seconds` et `interfaces[].last_change_age_seconds`. `source` et",
    "  `report` ne sont jamais comparés : ce sont les cartes d'identité des runs, recopiées dans `before` et `after`.",
    "- **Les événements lisent les volatils** : `rebooted` quand l'uptime dans `after` est plus court que",
    "  `elapsed_seconds` ; `flapped` quand l'âge du dernier changement dans `after` est plus court que",
    "  `elapsed_seconds` alors que `oper_status` est le même aux deux runs, **sur un nœud qui n'a pas redémarré** (le",
    "  redémarrage explique ses ports montés au démarrage). Détails typés par sorte, fenêtre recopiée et vérifiée ;",
    "  rien si `elapsed_seconds` ≤ 0 (refusé sinon).",
    "- **Ordre canonique, vérifié par le type** : `added` / `removed` dans l'ordre de leur section dans le snapshot",
    "  (R6) ; `changed` par (sorte, identité) de la référence ; `events` par (`kind`, référence) ; `fields` par",
    "  `path`.",
    "- **Le résumé et l'écart sont vérifiés** : chaque compte égale la taille de sa liste ; `elapsed_seconds` égale",
    "  l'écart entre les deux `start_datetime`, signé.",
    "- **Sérialisation canonique** : `ld_contracts.diff.serialize.canonical_json`, même forme que le snapshot.",
    "",
]


def diff_part(shared: frozenset[str], snapshot_error_types: dict[str, str]) -> list[str]:
    """Partie C ; `shared` = noms définis en parties A et B, `snapshot_error_types` = le catalogue de la partie B."""
    schema = generate_schema("diff")
    return [
        f"## Partie C — Comparaison : Diff v{DIFF_VERSION}",
        "",
        "Le diff dit ce qui a changé entre deux snapshots d'une même infrastructure : c'est ce que B3 produit, ce que",
        "la timeline résume et ce que le moteur de diagramme peint (câbles ajoutés, retirés, changés). Il parle en",
        "entités du snapshot, ne lit jamais la couche d'intention ni le rendu, se calcule à la demande et n'est jamais",
        "archivé. Déterministe : mêmes snapshots ⇒ mêmes octets. Sa version suit son propre semver.",
        "",
        *render_reference(schema, level=3, shared=shared, shared_label=SHARED_LABEL),
        *DIFF_RULES,
        "### Erreurs de contrat (bloquantes)",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in DIFF_ERROR_TYPES.items()],
        "",
        "Hérités des types partagés avec la partie B (ordre des listes, bouts d'un lien) ; les entités ajoutées ou",
        "retirées sont validées par leurs propres types, dont tous les refus de la partie B s'appliquent :",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {snapshot_error_types[k]} |" for k in DIFF_SHARED_ERROR_TYPES],
        "",
        "### Exemple : le plus petit diff qui dit quelque chose",
        "",
        "`fixtures/diff-skeleton.json` : entre les deux runs du squelette, le câble est tombé (deux ports `down`, le",
        "câble `down`, un contrôle `link_down` apparu), en forme canonique :",
        "",
        "```json",
        DIFF_SKELETON_PATH.read_text(encoding="utf-8").rstrip(),
        "```",
        "",
        "Le JSON Schema équivalent est `src/ld_contracts/schema/diff-v1.schema.json`.",
        "",
    ]

"""Partie B de `CONTRAT.md` : le contrat de sortie, Snapshot v1."""

from pathlib import Path

from ld_contracts.docgen_render import render_reference
from ld_contracts.schema import generate_schema
from ld_contracts.snapshot import SNAPSHOT_VERSION
from ld_contracts.snapshot.codes import CATALOGUE, SHARED_ERROR_TYPES, SNAPSHOT_ERROR_TYPES

SNAPSHOT_SKELETON_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "snapshot-skeleton.json"

SNAPSHOT_RULES = [
    "### Règles transverses",
    "",
    "Vérifiées à la validation d'un snapshot, au-delà des types de chaque champ. Un snapshot qui les viole est",
    "**refusé** : un bundle incohérent est de la donnée à signaler, un snapshot incohérent est un bug de B1.",
    "",
    "- **Toutes les clés sont écrites.** Aucun champ n'a de défaut ; une clé absente est une erreur (`missing`),",
    "  même pour un champ nullable. `null` garde le sens « pas de valeur ». Il n'y a pas d'`extras`.",
    "- **Ordre canonique (R6), vérifié par le type.** `nodes` par (sorte, hostname) ; `interfaces` et `aggregates`",
    "  par (hostname, nom naturel : `Ethernet1/2` avant `Ethernet1/10`) ; `links` par paire d'endpoints ;",
    "  `mlag_domains` par (`mlag_id`, membres) ; `ha_clusters` par membres ; `checks` par (code, références,",
    "  détails) ; `coverage` par hostname. Les listes internes de même : évidences, membres, câbles, rôles,",
    "  capacités, `allowed_vlans` (intervalles triés, disjoints, adjacents fusionnés), adresses IP. Un doublon ou",
    "  un désordre est refusé (`duplicate_identity`, `not_canonical_order`). La clé naturelle est",
    "  `ld_contracts.snapshot.order.natural_key`, partagée avec B1.",
    "- **Un lien n'a pas d'identifiant** : sa clé est la paire d'endpoints `(a, b)`, `a` strictement avant `b`.",
    "- **Toute référence désigne un élément du document** : hostname d'une interface, d'un agrégat, d'un bout de",
    "  lien, d'un membre HA ou d'un `downstream` → `nodes` ; câble d'un agrégat ou d'un heartbeat → `links` ;",
    "  membres et `peer_link` d'un domaine MLAG → `aggregates` ; chaque `refs[]` d'un contrôle → sa section.",
    "  Exception voulue : `interfaces[].aggregate` peut citer un agrégat absent d'`aggregates[]` (appartenance",
    "  lue dans `interfaces[].members` faute de topic). Un bout de lien peut désigner une interface absente",
    "  (device injoignable, stub, externe) : le nœud doit exister, pas l'interface.",
    "- **`coverage` liste exactement les nœuds `device`**, et `report.counts` la taille de chaque section.",
    "- **Le statut d'un lien se déduit de ses évidences** ; le témoin de chaque évidence est l'un des deux bouts.",
    "- **Sérialisation canonique** : `ld_contracts.snapshot.serialize.canonical_json` (clés triées, UTF-8 sans",
    "  échappement, indentation 2, fin de ligne unique). Deux snapshots égaux sont égaux à l'octet.",
    "",
]


def _catalogue_table() -> list[str]:
    lines = [
        "### Codes de contrôle",
        "",
        "Catalogue fermé : `code` est une énumération, `severity` doit être admise pour le code, `origin` vaut",
        "`correlation` (émis par B1, règle R0 à R5 de docs/05) ou `bundle` (constat du contrat d'entrée recopié).",
        "`nullable_key_absent` n'est jamais recopié : il décrit la livraison, pas le contenu (rapport d'ingestion).",
        "",
        "| Code | Sévérité | Origine | Règle | Signification |",
        "|---|---|---|---|---|",
    ]
    for code, spec in CATALOGUE.items():
        severities = " / ".join(sorted(s.value for s in spec.severities))
        lines.append(f"| `{code.value}` | {severities} | {spec.origin.value} | {spec.rule} | {spec.meaning} |")
    return [*lines, ""]


def snapshot_part(shared: frozenset[str], bundle_error_types: dict[str, str]) -> list[str]:
    """Partie B ; `shared` = noms définis en partie A, `bundle_error_types` = son catalogue d'erreurs."""
    schema = generate_schema("snapshot")
    return [
        f"## Partie B — Sortie : Snapshot v{SNAPSHOT_VERSION}",
        "",
        "Le snapshot est le graphe d'une run : ce que B1 produit à partir d'un RunBundle, ce que l'archive (B2)",
        "range, ce que le diff (B3) compare, ce que l'API sert et ce que le moteur de diagramme dessine. Tout ce qu'il",
        "contient vient du bundle ou d'une règle déterministe : aucun horodatage propre à B1, aucun identifiant",
        "synthétique, aucune coordonnée. Sa version suit son propre semver, indépendant de celui du RunBundle.",
        "",
        *render_reference(schema, level=3, shared=shared),
        *SNAPSHOT_RULES,
        *_catalogue_table(),
        "### Erreurs de contrat (bloquantes)",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in SNAPSHOT_ERROR_TYPES.items()],
        "",
        "Hérités des types partagés avec la partie A (`IpAddress`, `VlanRange`, dates, règle VLAN / mode) :",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {bundle_error_types[k]} |" for k in SHARED_ERROR_TYPES],
        "",
        "### Exemple : le plus petit snapshot qui dit quelque chose",
        "",
        "`fixtures/snapshot-skeleton.json`, deux devices reliés par un câble confirmé, écrit en forme canonique :",
        "",
        "```json",
        SNAPSHOT_SKELETON_PATH.read_text(encoding="utf-8").rstrip(),
        "```",
        "",
        "Le JSON Schema équivalent est `src/ld_contracts/schema/snapshot-v1.schema.json`. Le snapshot de référence",
        "de `bundle-minimal.json` sera produit par B1 (golden, test de dérive).",
        "",
    ]

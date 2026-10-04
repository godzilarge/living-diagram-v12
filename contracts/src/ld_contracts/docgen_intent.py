"""Partie D de `CONTRAT.md` : la couche d'intention, Intent v1."""

from pathlib import Path

from ld_contracts.docgen_render import render_reference
from ld_contracts.intent import INTENT_VERSION
from ld_contracts.intent.codes import INTENT_ERROR_TYPES
from ld_contracts.schema import generate_schema

INTENT_SKELETON_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "intent-skeleton.json"

INTENT_RULES = [
    "### Règles transverses",
    "",
    "Vérifiées à la validation d'une intention, au-delà des types de chaque champ. Un document qui les viole est",
    "**refusé** (`docs/08`).",
    "",
    "- **Un document par infrastructure, jamais par run** : l'intention est longue, les runs passent. Il ne porte",
    "  aucun `collector_run_id`.",
    "- **Les patchs sont keyés par identité stable, jamais par coordonnée ni par run** : une épingle vise le",
    "  `hostname` d'un nœud, à l'octet ; sa valeur est une position entière en unités du dessin. Un nœud absent de la",
    "  run affichée rend son épingle **orpheline** : elle est listée, jamais effacée en silence (règle I3).",
    "- **Toutes les clés sont écrites** ; aucun défaut, pas d'`extras` ; entiers stricts, dates ISO 8601 avec fuseau.",
    "- **Ordre canonique vérifié par le type** : `pins` triées par `hostname`, uniques.",
    "- **`revision` compte les requêtes d'écriture acceptées** ; `updated_at` est null si et seulement si `revision`",
    "  vaut 0. Le document ne s'écrit que par opérations (`pin`, `unpin`) : dernier écrivain gagne par épingle, chaque",
    "  requête est journalisée côté serveur (qui, quand, quoi).",
    "- **Ni B1 ni B3 ne lisent ce document** : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.",
    "- **Sérialisation canonique** : `ld_contracts.intent.serialize.canonical_json`, même forme que le snapshot.",
    "",
]


def intent_part(shared: frozenset[str]) -> list[str]:
    """Partie D ; `shared` = noms déjà définis dans les parties précédentes (aucun type n'est partagé en V1)."""
    schema = generate_schema("intent")
    return [
        f"## Partie D — Intention : Intent v{INTENT_VERSION}",
        "",
        "L'intention est ce que l'humain veut en plus de ce que la collecte montre : des patchs keyés par identité",
        "stable, qui survivent aux runs. V1 ne connaît qu'une sorte de patch, l'épingle (la place voulue d'un",
        "équipement sur le dessin). D'autres sortes viendront comme des listes à côté, sans rien changer à celle-ci.",
        "Ce document est écrit par l'API de Living Diagram (`POST /api/intent/patches`) et lu par la toile ; il ne",
        "concerne pas l'exportateur. Sa version suit son propre semver.",
        "",
        *render_reference(schema, level=3, shared=shared),
        *INTENT_RULES,
        "### Erreurs de contrat (bloquantes)",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in INTENT_ERROR_TYPES.items()],
        "",
        "### Exemple : deux épingles",
        "",
        "`fixtures/intent-skeleton.json`, en forme canonique :",
        "",
        "```json",
        INTENT_SKELETON_PATH.read_text(encoding="utf-8").rstrip(),
        "```",
        "",
        "Le JSON Schema équivalent est `src/ld_contracts/schema/intent-v1.schema.json`.",
        "",
    ]

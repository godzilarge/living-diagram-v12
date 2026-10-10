"""Ce qu'une entrée du journal permet de filtrer, au-delà de sa catégorie (2026-10-10, demande d'Orhan).

En une phrase : **l'action d'une entrée (créé, modifié, supprimé) et les objets qu'elle cite, pour le filtre par action
et l'historique d'un objet.**
- **action** : `*_create` = créé ; `*_delete` et la trace d'une purge = supprimé (un auditeur qui cherche ce qui a
  disparu doit voir aussi qu'on a purgé des traces) ; tout le reste = modifié (retirer une épingle ou une couleur ne
  supprime rien : l'équipement reste, il perd un réglage). Une requête qui mêle des actions les porte toutes.
- **objets cités** : un équipement (`hostname`, membre d'un groupe, ancrage ou bout de connecteur sur lui), un groupe,
  une annotation, un connecteur (son identité, celle qu'une création attribue, un ancrage ou un bout qui le vise). C'est
  l'historique d'un objet : tout ce qui l'a touché ou l'a cité, dans l'ordre du journal.
"""

from collections.abc import Iterable, Iterator
from typing import Any, Literal

Action = Literal["created", "modified", "deleted"]
ACTIONS: tuple[Action, ...] = ("created", "modified", "deleted")
_PRUNE_OP = "journal_prune"


def action_of(op: str) -> Action:
    if op.endswith("_create"):
        return "created"
    if op.endswith("_delete") or op == _PRUNE_OP:
        return "deleted"
    return "modified"


def actions_of(ops: Iterable[dict[str, Any]]) -> list[Action]:
    """Les actions d'une entrée, dans l'ordre fixe de `ACTIONS`, sans doublon."""
    found = {action_of(str(op.get("op", ""))) for op in ops}
    return [action for action in ACTIONS if action in found]


def _refs(op: dict[str, Any]) -> Iterator[str]:
    for key in ("hostname", "id"):
        if isinstance(op.get(key), str) and op[key]:
            yield op[key]
    members = op.get("members")
    if isinstance(members, list):
        yield from (m for m in members if isinstance(m, str) and m)
    for key in ("anchor", "start", "end"):
        target = op.get(key)
        if isinstance(target, dict) and isinstance(target.get("ref"), str) and target["ref"]:
            yield target["ref"]


def _legacy_connector(op: dict[str, Any]) -> bool:
    """Une ligne ou une flèche d'un 1.3.x : une annotation devenue connecteur (`c…` au lieu de `a…`, même numéro)."""
    content = op.get("content")
    return isinstance(content, dict) and content.get("kind") == "shape" and content.get("shape") in ("line", "arrow")


def refs_of(ops: list[dict[str, Any]], created: list[str]) -> frozenset[str]:
    """Les objets qu'une entrée cite (hostnames et identités), pour l'historique d'un objet ; la création d'une ligne
    ou d'une flèche d'un 1.3.x cite aussi le connecteur qu'elle est devenue (revue, B10)."""
    creations = [op for op in ops if str(op.get("op", "")).endswith("_create")]
    pairs = zip(creations, created, strict=False)
    legacy = [f"c{cid[1:]}" for op, cid in pairs if cid[:1] == "a" and _legacy_connector(op)]
    return frozenset([*created, *legacy, *(ref for op in ops for ref in _refs(op))])

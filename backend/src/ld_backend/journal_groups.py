"""Les regroupements du journal : sessions de positions et répétitions d'un même geste (revue Impeccable du 2026-10-10).

En une phrase : **une entrée appartient à un regroupement calculé une fois, sur le journal entier de son
infrastructure, jamais sur ce qu'un filtre laisse voir.** Calculés dans la page, sur la liste filtrée, les regroupements
changeaient avec le filtre (« 5 équipements ×4 » sans filtre, « 7 ×13 » avec `core`) : une ligne d'audit doit garder son
identité pour être citée et retrouvée. La page replie les entrées voisines d'un même regroupement ; un filtre peut en
cacher une partie, jamais en fusionner deux. Règles, dans l'ordre du fichier :
- **session** : une suite d'entrées voisines qui ne touchent que des positions, d'un même auteur, sans trou de plus de
  `SESSION_GAP`, dès `SESSION_MIN` entrées ;
- **répétition** : parmi les autres, une suite d'entrées voisines d'une seule opération, même auteur, même opération
  sur le même objet (ni création ni suppression), à moins de `REPEAT_GAP` l'une de l'autre, dès deux.
Une trace de purge n'est jamais regroupée.
"""

from collections.abc import Callable, Sequence
from datetime import datetime, timedelta
from typing import Literal

from pydantic import Field

from ld_backend.schemas import ApiModel

SESSION_GAP = timedelta(minutes=15)
SESSION_MIN = 3
REPEAT_GAP = timedelta(minutes=10)


class JournalGroup(ApiModel):
    """Le regroupement d'une entrée : la page replie les entrées voisines qui le partagent."""

    id: str = Field(description="Identité dans son infrastructure : `s` ou `r` et la révision de sa première entrée.")
    kind: Literal["session", "repeat"] = Field(description="Session de positions, ou répétition d'un même geste.")
    size: int = Field(description="Nombre d'entrées du regroupement dans le journal entier (un filtre peut en cacher).")


class Item:
    """Ce que les règles lisent d'une entrée ; `revision` nomme le regroupement (stable après une purge, revue B4)."""

    __slots__ = ("at", "author", "ops", "positions", "revision", "trace")

    def __init__(self, at: datetime, author: str, ops: list[dict], positions: bool, revision: int, trace: bool) -> None:
        self.at, self.author, self.ops, self.positions = at, author, ops, positions
        self.revision, self.trace = revision, trace


def _target(op: dict) -> str:
    for key in ("hostname", "id", "type"):
        if isinstance(op.get(key), str) and op[key]:
            return op[key]
    return ""


def _same_session(a: Item, b: Item) -> bool:
    return a.positions and b.positions and a.author == b.author and abs(b.at - a.at) <= SESSION_GAP


def _same_repeat(a: Item, b: Item) -> bool:
    if len(a.ops) != 1 or len(b.ops) != 1 or a.author != b.author or abs(b.at - a.at) > REPEAT_GAP:
        return False
    x, y = a.ops[0], b.ops[0]
    name = str(x.get("op", ""))
    creates = name.endswith("_create") or name.endswith("_delete")
    return name == y.get("op") and not creates and _target(x) != "" and _target(x) == _target(y)


def _runs(items: Sequence[Item], free: Callable[[int], bool], same: Callable[[Item, Item], bool]) -> list[list[int]]:
    """Les suites d'indices voisins (dans l'ordre du fichier) que `same` relie, parmi les indices `free`."""
    runs: list[list[int]] = []
    for i, item in enumerate(items):
        if not free(i) or item.trace:
            continue
        if runs and runs[-1][-1] == i - 1 and same(items[i - 1], item):
            runs[-1].append(i)
        else:
            runs.append([i])
    return runs


def groups_of(items: Sequence[Item]) -> list[JournalGroup | None]:
    """Le regroupement de chaque entrée (dans l'ordre du fichier, la plus ancienne d'abord), ou None."""
    out: list[JournalGroup | None] = [None] * len(items)
    for run in _runs(items, lambda i: items[i].positions, _same_session):
        if len(run) >= SESSION_MIN:
            group = JournalGroup(id=f"s{items[run[0]].revision}", kind="session", size=len(run))
            for i in run:
                out[i] = group
    for run in _runs(items, lambda i: out[i] is None, _same_repeat):
        if len(run) >= 2:
            group = JournalGroup(id=f"r{items[run[0]].revision}", kind="repeat", size=len(run))
            for i in run:
                out[i] = group
    return out

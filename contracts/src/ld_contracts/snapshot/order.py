"""Ordre canonique (R6) : une seule définition, partagée par les validateurs du snapshot et par B1.

Le contrat refuse une liste hors de cet ordre : le déterminisme « même bundle ⇒ mêmes octets » est
une propriété vérifiée par le type, pas une discipline laissée à B1.
"""

import re
from collections.abc import Callable, Iterable
from typing import Any

from pydantic_core import PydanticCustomError

_CHUNKS = re.compile(r"(\d+)")
_NUMBER, _TEXT = 0, 1


def natural_key(text: str) -> tuple[tuple[tuple[int, int | str], ...], str]:
    """`Ethernet1/2` avant `Ethernet1/10` : les nombres se comparent par valeur, le texte par octets.

    Un nombre passe avant du texte à la même position ; le texte brut termine la clé, pour que deux noms
    différents (`Eth01`, `Eth1`) n'aient jamais la même clé.
    """
    parts = _CHUNKS.split(text)  # les indices impairs sont exactement ce que `\d+` a capturé
    chunks = tuple((_NUMBER, int(chunk)) if index % 2 else (_TEXT, chunk) for index, chunk in enumerate(parts) if chunk)
    return chunks, text


def require_canonical(items: Iterable[Any], *, key: Callable[[Any], Any], section: str) -> None:
    """Refuse une liste qui n'est pas strictement croissante selon `key` : doublon ou désordre.

    Le contexte situe la faute (section, index) sans citer de valeur.
    """
    previous: Any = None
    for index, item in enumerate(items):
        current = key(item)
        if index and current == previous:
            raise PydanticCustomError(
                "duplicate_identity", "identité en double dans la section", {"section": section, "index": index}
            )
        if index and current < previous:
            raise PydanticCustomError(
                "not_canonical_order", "liste hors de l'ordre canonique", {"section": section, "index": index}
            )
        previous = current


def identity(value: Any) -> Any:
    return value

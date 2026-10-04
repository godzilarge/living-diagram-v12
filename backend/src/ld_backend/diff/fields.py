"""D2 : comparaison champ à champ de deux entités de même identité.

L'entité est sérialisée en JSON et parcourue en chemins pointés ; une liste se compare en bloc ; les chemins volatils,
déclarés par le contrat (`VOLATILE_PATHS`), sont retirés avant comparaison et comptés.
"""

from ld_contracts.diff.changes import VOLATILE_PATHS, FieldChange
from pydantic import BaseModel

VOLATILE = VOLATILE_PATHS  # déclarés par le contrat, qui refuse un `FieldChange` qui les contredit
NO_VOLATILE: frozenset[str] = frozenset()


def compare(
    before: BaseModel, after: BaseModel, volatile: frozenset[str] = NO_VOLATILE
) -> tuple[tuple[FieldChange, ...], int]:
    """Champs qui diffèrent, triés par chemin, et nombre de différences volatiles ignorées."""
    changes: list[FieldChange] = []
    ignored = _walk(before.model_dump(mode="json"), after.model_dump(mode="json"), "", volatile, changes)
    return tuple(sorted(changes, key=lambda c: c.path)), ignored


def _walk(before: dict, after: dict, prefix: str, volatile: frozenset[str], out: list[FieldChange]) -> int:
    ignored = 0
    for key in sorted(set(before) | set(after)):
        path = f"{prefix}{key}"
        b, a = before.get(key), after.get(key)
        if path in volatile:
            ignored += int(b != a)
        elif isinstance(b, dict) and isinstance(a, dict):
            ignored += _walk(b, a, f"{path}.", volatile, out)
        elif b != a:
            out.append(FieldChange(path=path, before=b, after=a))
    return ignored

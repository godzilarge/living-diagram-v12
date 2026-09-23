"""Clés nullables absentes : lues comme `null`, jamais en silence.

Un champ `X | null` absent du bundle prend `null` (défaut des modèles). L'oubli n'affirme rien : `null` veut
dire « pas de valeur » (non lu, sans objet, non fourni). Il est compté ici, un constat par champ, avec le nombre
d'occurrences et de devices : un compte égal à tous les documents d'un constructeur désigne un driver incomplet.
Comme `residual_normalizations`, ce compte doit tendre vers zéro.

Le message ne porte aucune valeur (chemin du champ et comptes seulement) ; les hostnames vont dans ``ref``.
"""

from collections.abc import Iterator
from functools import cache
from typing import Any, get_args

from pydantic import BaseModel

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import ABSENT_CODE, Finding

HOSTNAMES_SHOWN = 10


@cache
def _nullable_defaults(model: type[BaseModel]) -> frozenset[str]:
    """Champs dont le défaut est `null` ; `extras` et les autres conteneurs libres (default_factory) n'en sont pas."""
    return frozenset(name for name, info in model.model_fields.items() if info.default is None)


def _models_in(annotation: Any) -> Iterator[type[BaseModel]]:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        yield annotation
    for arg in get_args(annotation):
        yield from _models_in(arg)


@cache
def _model_fields(model: type[BaseModel]) -> tuple[tuple[str, tuple[type[BaseModel], ...]], ...]:
    """Champs dont le type porte un modèle, dans l'ordre de déclaration. `extras` (libre, jamais lu) n'en est pas :
    on n'y descend pas, quelle que soit sa profondeur."""
    found = ((name, tuple(_models_in(info.annotation))) for name, info in model.model_fields.items())
    return tuple((name, models) for name, models in found if models)


def nested_models(model: type[BaseModel]) -> tuple[type[BaseModel], ...]:
    """Modèles que `model` peut contenir directement."""
    return tuple(child for _, models in _model_fields(model) for child in models)


def _children(value: object, path: str) -> Iterator[tuple[BaseModel, str]]:
    if isinstance(value, BaseModel):
        yield value, path
    elif isinstance(value, tuple | list):
        for item in value:
            yield from _children(item, f"{path}[]")
    elif isinstance(value, dict):
        for item in value.values():
            yield from _children(item, f"{path}{{}}")


def _walk(model: BaseModel, path: str, hostname: str | None) -> Iterator[tuple[str, str | None]]:
    """(chemin du champ absent, hostname du document qui le porte), en profondeur."""
    hostname = getattr(model, "hostname", hostname)
    prefix = f"{path}." if path else ""
    for name in _nullable_defaults(type(model)) - model.model_fields_set:
        yield f"{prefix}{name}", hostname
    for name, _ in _model_fields(type(model)):
        for child, child_path in _children(getattr(model, name), f"{prefix}{name}"):
            yield from _walk(child, child_path, hostname)


def _hostnames_ref(hostnames: set[str]) -> str | None:
    if not hostnames:
        return None
    ordered = sorted(hostnames)
    shown, rest = ordered[:HOSTNAMES_SHOWN], len(ordered) - HOSTNAMES_SHOWN
    return ", ".join([*shown, f"… (+{rest})"] if rest > 0 else shown)


def absent_nullable_keys(bundle: RunBundle) -> list[Finding]:
    """Un constat par champ nullable absent, trié par chemin : indépendant de l'ordre des documents."""
    occurrences: dict[str, int] = {}
    hostnames: dict[str, set[str]] = {}
    for path, hostname in _walk(bundle, "", None):
        occurrences[path] = occurrences.get(path, 0) + 1
        seen = hostnames.setdefault(path, set())
        if hostname is not None:
            seen.add(hostname)
    found = []
    for path in sorted(occurrences):
        devices = f", {len(hostnames[path])} device(s)" if hostnames[path] else ""
        message = f"{path} : clé absente, lue comme null ({occurrences[path]} occurrence(s){devices})"
        details = {"field": path, "occurrences": occurrences[path], "devices": len(hostnames[path])}
        found.append(Finding(ABSENT_CODE, message, None, _hostnames_ref(hostnames[path]), details))
    return found


def _strip(value: object, dumped: Any) -> Any:
    if isinstance(value, BaseModel):
        return without_absent_keys(value, dumped)
    if isinstance(value, tuple | list):
        return [_strip(item, out) for item, out in zip(value, dumped, strict=True)]
    if isinstance(value, dict):
        return {key: _strip(value[key], out) for key, out in dumped.items()}
    return dumped


def without_absent_keys(model: BaseModel, dumped: dict[str, Any]) -> dict[str, Any]:
    """Copie de `dumped` (même forme que `model.model_dump()`) sans les clés nullables absentes de `model`.

    La forme canonique écrit toutes les clés, donc efface les absences. Un dérivé du bundle qui doit les
    reproduire (le bundle anonymisé, seul à sortir de l'infra) repasse par ici. L'entrée n'est pas modifiée.
    """
    absent = _nullable_defaults(type(model)) - model.model_fields_set
    bearing = {name for name, _ in _model_fields(type(model))}
    return {
        key: _strip(getattr(model, key), value) if key in bearing else value
        for key, value in dumped.items()
        if key not in absent
    }

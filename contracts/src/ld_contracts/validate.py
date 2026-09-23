"""Validation d'un bundle : erreurs structurelles (contrat) + constats (clés nullables absentes, référentiel).

Les messages sont sans valeur ; les valeurs identifiantes vont dans ``Issue.detail`` et
``Finding.hostname`` / ``Finding.ref``, affichés seulement sur demande.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import Finding, check_bundle
from ld_contracts.defaults import absent_nullable_keys
from ld_contracts.snapshot import Snapshot


@dataclass(frozen=True, slots=True)
class Issue:
    path: str
    message: str
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ValidationReport:
    ok: bool
    errors: tuple[Issue, ...] = ()
    findings: tuple[Finding, ...] = ()
    bundle: RunBundle | None = field(default=None, repr=False)
    snapshot: Snapshot | None = field(default=None, repr=False)


def _path(loc: tuple, ctx: dict[str, Any]) -> str:
    """Chemin du champ fautif. Une règle du bundle entier n'a pas de `loc` : son contexte situe le document."""
    if loc:
        return ".".join(str(p) for p in loc)
    if "section" not in ctx:
        return "$"
    return f"{ctx['section']}.{ctx['index']}.hostname" if "index" in ctx else str(ctx["section"])


def _issue(error: dict[str, Any]) -> Issue:
    detail = {k: v for k, v in (error.get("ctx") or {}).items() if k != "error"}
    return Issue(_path(error["loc"], detail), error["msg"], detail)


def validate_dict(data: object) -> ValidationReport:
    if not isinstance(data, dict | RunBundle):
        return ValidationReport(ok=False, errors=(Issue("$", "un objet JSON est attendu à la racine du bundle"),))
    try:
        bundle = RunBundle.model_validate(data)
    except ValidationError as exc:
        return ValidationReport(ok=False, errors=tuple(_issue(e) for e in exc.errors()))
    findings = (*absent_nullable_keys(bundle), *check_bundle(bundle))
    return ValidationReport(ok=True, findings=findings, bundle=bundle)


def _snapshot_path(loc: tuple, ctx: dict[str, Any]) -> str:
    if loc:
        return ".".join(str(p) for p in loc)
    if "section" not in ctx:
        return "$"
    return f"{ctx['section']}.{ctx['index']}" if "index" in ctx else str(ctx["section"])


def validate_snapshot_dict(data: object) -> ValidationReport:
    """Un snapshot n'a pas de constats : il est valide ou refusé."""
    if not isinstance(data, dict | Snapshot):
        return ValidationReport(ok=False, errors=(Issue("$", "un objet JSON est attendu à la racine du snapshot"),))
    try:
        snapshot = Snapshot.model_validate(data)
    except ValidationError as exc:
        issues = []
        for error in exc.errors():
            detail = {k: v for k, v in (error.get("ctx") or {}).items() if k != "error"}
            issues.append(Issue(_snapshot_path(error["loc"], detail), error["msg"], detail))
        return ValidationReport(ok=False, errors=tuple(issues))
    return ValidationReport(ok=True, snapshot=snapshot)


def _read_json(path: Path) -> tuple[object, ValidationReport | None]:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")), None
    except (OSError, json.JSONDecodeError) as exc:
        issue = Issue("$", "fichier illisible ou JSON invalide", {"reason": str(exc)})
        return None, ValidationReport(ok=False, errors=(issue,))


def validate_file(path: Path) -> ValidationReport:
    data, failure = _read_json(path)
    return failure if failure is not None else validate_dict(data)


def validate_snapshot_file(path: Path) -> ValidationReport:
    data, failure = _read_json(path)
    return failure if failure is not None else validate_snapshot_dict(data)

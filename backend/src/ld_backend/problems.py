"""Les refus de l'API : un code stable, une phrase en anglais, les valeurs qui l'écrivent (2026-10-10, lot 7).

L'API répond en anglais, le standard (décision d'Orhan) ; la page écrit son propre texte dans sa langue d'après le code
(`common:http.problem.<code>` et `common:http.field.<code>` dans `engine/src/i18n/locales/`), un test tient les deux
alignés. Les valeurs (`params`) sont celles du serveur, jamais une valeur reçue : le côté d'un diff, une limite, une
ligne. Les messages du validateur du contrat (rapport d'ingestion, règles des modèles) restent dans la langue du
contrat, en français pour l'instant, comme `CONTRAT.md` et la CLI.
"""

from typing import Any

from fastapi import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException

# Le code d'un refus et sa phrase anglaise ; `{nom}` = une valeur de `params`.
PROBLEMS: dict[str, str] = {
    "token_invalid": "missing or invalid API token",
    "internal_error": "internal error: administrator action needed",
    "archive_corrupt": "corrupt archive entry: administrator action needed",
    "archive_inconsistent": "the two snapshots do not compare (inconsistent archive): administrator action needed",
    "run_unknown": "unknown run for this infrastructure",
    "snapshot_missing": "archived run without a snapshot: run `ld correlate`",
    "diff_run_unknown": "run `{side}`: unknown run for this infrastructure",
    "diff_snapshot_missing": "run `{side}`: archived run without a snapshot: run `ld correlate`",
    "diff_snapshot_invalid": "run `{side}`: archived snapshot outside the contract: run `ld correlate`",
    "no_archived_run": "no archived run for this infrastructure: nothing to {action}",
    "intent_corrupt": "corrupt intent document: administrator action needed",
    "intent_unreadable": "unreadable intent document: administrator action needed",
    "placement_corrupt": "corrupt placement document: `ld placement --forget` removes it, the placement is recomputed",
    "placement_unreadable": "unreadable placement document: administrator action needed",
    "journal_unreadable": "unreadable log: administrator action needed",
    "asset_unknown": "unknown image for this infrastructure",
    "asset_unreadable": "unreadable store file: administrator action needed",
    "asset_in_use": "image cited by an annotation: delete the annotation first",
    "file_unknown": "unknown file",
    "body_too_large": "body too large (limit {limit} bytes)",
    "body_incomplete": "connection closed before the end of the body",
    "json_expected": "body expected as application/json",
    "json_invalid": "invalid JSON: {reason} (line {line})",
    "image_expected": "`Content-Type` expected: image/png, image/jpeg or image/webp",
    "invalid_query": "invalid query parameters",
    "invalid_body": "invalid request body",
    "asset_rejected": "file rejected",
    # un refus du cadre (route inconnue, méthode non permise) : le code vient du statut
    "not_found": "not found",
    "method_not_allowed": "method not allowed",
    "http_error": "request refused",
}

# Les codes d'un champ fautif que l'API écrit elle-même (`errors[].code`), avec leur phrase anglaise ; les autres
# codes d'un 422 sont ceux de Pydantic (`missing`, `string_too_short`…) ou du contrat (`patch_after_update`…).
FIELD_CODES: dict[str, str] = {
    "unknown_group": "unknown group: deleted in the meantime, reload the document",
    "group_without_member": "a group keeps at least one member: delete it instead",
    "unknown_annotation": "unknown annotation: deleted in the meantime, reload the document",
    "annotation_kind_change": "an annotation keeps its kind: create another one",
    "unknown_asset": "image unknown to this infrastructure's store: upload it first",
    "unknown_connector": "unknown connector: deleted in the meantime, reload the document",
    "too_many_pins": "more than {limit} pins for one infrastructure",
    "too_many_device_colors": "more than {limit} device colours for one infrastructure",
    "too_many_groups": "more than {limit} groups for one infrastructure",
    "too_many_annotations": "more than {limit} annotations for one infrastructure",
    "too_many_connectors": "more than {limit} connectors for one infrastructure",
    "too_many_places": "more than {limit} placed devices for one infrastructure",
    "asset_unrecognized": "neither PNG, JPEG nor WebP according to its leading bytes, or an unreadable header",
    "cursor": "unreadable cursor: start again from the first page",
    "missing_infrastructure": "{name} requires an infrastructure (unique within its own only)",
}

STATUS_CODES = {404: "not_found", 405: "method_not_allowed"}


class ApiError(HTTPException):
    """Un refus de l'API : statut, code de `PROBLEMS`, valeurs ; la phrase anglaise s'écrit ici, jamais à l'appel."""

    def __init__(self, status: int, code: str, headers: dict[str, str] | None = None, **params: str | int) -> None:
        super().__init__(status_code=status, detail=PROBLEMS[code].format(**params), headers=headers)
        self.code = code
        self.params = params


def field_message(code: str, **params: Any) -> str:
    return FIELD_CODES[code].format(**params)


def body(code: str, detail: str, params: dict[str, Any] | None = None, errors: list | None = None) -> dict[str, Any]:
    """Le corps `Problem` : `params` et `errors` seulement quand ils disent quelque chose (`errors` sur un 422)."""
    out: dict[str, Any] = {"code": code, "detail": detail}
    if params:
        out["params"] = params
    if errors is not None:
        out["errors"] = errors
    return out


def http_body(exc: StarletteHTTPException) -> dict[str, Any]:
    """Le corps d'un `HTTPException`, de l'API (`ApiError`) ou du cadre (code tiré du statut)."""
    if isinstance(exc, ApiError):
        return body(exc.code, str(exc.detail), exc.params)
    code = STATUS_CODES.get(exc.status_code, "http_error")
    return body(code, PROBLEMS[code])

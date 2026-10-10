"""Les corps de requête lus à la main (en flux, bornés) et la forme commune des refus de l'API (`Problem`)."""

import json
import re
from typing import Any

from fastapi import HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.requests import ClientDisconnect

JSON_MEDIA_TYPE = re.compile(r"application/(?:[\w.-]+\+)?json", re.IGNORECASE)
IMAGE_MEDIA_TYPE = re.compile(r"image/(png|jpeg|webp)", re.IGNORECASE)


def too_large(max_bytes: int) -> HTTPException:
    """Le même mot pour tous les corps (bundle, intention, placement, image) : la limite dit lequel."""
    return HTTPException(status_code=413, detail=f"corps trop volumineux (limite {max_bytes} octets)")


def require_json(request: Request) -> None:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
    if not JSON_MEDIA_TYPE.fullmatch(media_type):
        raise HTTPException(status_code=415, detail="corps attendu en application/json")


async def read_body(request: Request, max_bytes: int) -> bytes:
    """Le corps brut, en flux, coupé dès que la limite est dépassée : jamais tout en mémoire d'abord."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > max_bytes:
        raise too_large(max_bytes)
    chunks: list[bytes] = []
    total = 0
    try:
        async for chunk in request.stream():
            total += len(chunk)
            if total > max_bytes:
                raise too_large(max_bytes)
            chunks.append(chunk)
    except ClientDisconnect as exc:
        raise HTTPException(status_code=400, detail="connexion fermée avant la fin du corps") from exc
    return b"".join(chunks)


async def read_json_body(request: Request, max_bytes: int) -> Any:
    """Le corps JSON : type vérifié, lu en flux et borné, décodé hors de la boucle d'événements."""
    require_json(request)
    raw = await read_body(request, max_bytes)
    try:
        return await run_in_threadpool(json.loads, raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"JSON invalide : {exc.msg} (ligne {exc.lineno})") from exc


def safe_message(error: dict[str, Any]) -> str:
    """Le message d'une erreur de validation, sans la valeur reçue : Pydantic la recopie dans certains messages (le
    discriminant d'une union, par exemple), la règle de l'API l'interdit (revue B4, M2)."""
    if error["type"] == "union_tag_invalid":
        expected = (error.get("ctx") or {}).get("expected_tags", "")
        return f"valeur inconnue pour le discriminant ; attendu : {expected}"
    received = error.get("input")
    if isinstance(received, str) and received and received in error["msg"]:
        return error["type"]
    return error["msg"]


def problem(detail: str, errors: list[dict[str, Any]]) -> JSONResponse:
    """Un 422 à la forme `Problem` : chemin et règle de chaque champ fautif, jamais la valeur."""
    listed = [{"path": ".".join(str(p) for p in e["loc"]), "message": safe_message(e)} for e in errors]
    return JSONResponse(status_code=422, content={"detail": detail, "errors": listed})


def one_problem(detail: str, path: str, code: str, message: str) -> JSONResponse:
    return problem(detail, [{"loc": (path,), "type": code, "msg": message}])


def query_problem(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Même forme que le reste de l'API ; la valeur reçue (`input`) n'est jamais renvoyée."""
    return problem("paramètres de requête invalides", list(exc.errors()))

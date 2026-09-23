"""API REST : la porte d'entrée de Living Diagram."""

import hmac
import json
import re
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot
from pydantic.json_schema import models_json_schema
from starlette.requests import ClientDisconnect

from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.config import Settings
from ld_backend.ingest import ingest_bundle, result_payload
from ld_backend.schemas import IngestReport, RunEntry, RunList

# Une run s'adresse par paramètres de requête, jamais par le chemin : `infrastructure` est un libellé libre et
# `run_id` vient de l'amont ; un `/` dans l'un ou l'autre rendait la run archivée illisible (404).
BUNDLES = "/api/ingest/bundles"
BUNDLE = "/api/ingest/bundle"
REPORT = "/api/ingest/report"
SNAPSHOT = "/api/snapshot"
JSON_MEDIA_TYPE = re.compile(r"application/(?:[\w.-]+\+)?json", re.IGNORECASE)
BUNDLE_SCHEMA_NAME = RunBundle.__name__
SCHEMA_REF_TEMPLATE = "#/components/schemas/{model}"
CONTRACT_MODELS = (RunBundle, Snapshot)

_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="bearerAuth",
    description="Valeur de `LD_API_TOKEN`, envoyée en `Authorization: Bearer <jeton>`. Dans `/docs`, "
    "bouton « Authorize » : coller le jeton seul, sans le mot Bearer.",
)

POST_RESPONSES: dict[int | str, dict[str, Any]] = {
    201: {
        "model": IngestReport,
        "description": "bundle archivé (`created`) ; `correlation` dit ce que B1 en a fait : un échec de B1 "
        "(`failed`) laisse le bundle archivé et ne change pas ce code",
    },
    200: {
        "model": IngestReport,
        "description": "run déjà archivée avec des données identiques (`already_present`) ; `findings` décrit la "
        "livraison reçue, le rapport archivé reste celui de la première ; le snapshot n'est pas recalculé, sauf "
        "s'il manquait : il l'est alors depuis le bundle archivé",
    },
    409: {
        "model": IngestReport,
        "description": "run déjà archivée avec des données différentes (`conflict`) : l'archive ne change pas, "
        "`conflict` donne les deux empreintes",
    },
    422: {
        "model": IngestReport,
        "description": "bundle hors contrat (`invalid`) : `errors` liste chemin, règle et localisation "
        "(section, index), jamais de valeur du bundle",
    },
    415: {"description": "`Content-Type` qui n'est pas `application/json`"},
    400: {"description": "corps qui n'est pas du JSON, ou connexion fermée avant la fin du corps"},
    401: {"description": "jeton d'API absent ou invalide"},
    413: {"description": "corps au-delà de `LD_MAX_BUNDLE_BYTES`"},
    500: {"description": "entrée d'archive illisible pour cette run (`archive_error`) : intervention nécessaire"},
}


SNAPSHOT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Snapshot v1 tel qu'archivé, forme canonique ; référence : `contracts/CONTRAT.md`, partie B.",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Snapshot.__name__)}}},
    },
    404: {"description": "run inconnue, ou run archivée sans snapshot (B1 a échoué : `ld correlate` après correction)"},
    500: {"description": "entrée d'archive illisible pour cette run : intervention nécessaire"},
}

Label = Annotated[str, Query(min_length=1)]


def _unauthorized() -> HTTPException:
    """Une instance neuve à chaque refus : une exception partagée accumulerait les tracebacks et leurs requêtes."""
    return HTTPException(
        status_code=401, detail="jeton d'API absent ou invalide", headers={"WWW-Authenticate": "Bearer"}
    )


def _bearer_guard(settings: Settings) -> Callable[..., None]:
    expected = settings.api_token.encode("utf-8")

    def guard(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> None:
        if credentials is None or not hmac.compare_digest(credentials.credentials.encode("utf-8"), expected):
            raise _unauthorized()

    return guard


def _too_large(max_bytes: int) -> HTTPException:
    return HTTPException(status_code=413, detail=f"bundle trop volumineux (limite {max_bytes} octets)")


def _require_json(request: Request) -> None:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
    if not JSON_MEDIA_TYPE.fullmatch(media_type):
        raise HTTPException(status_code=415, detail="corps attendu en application/json")


def _query_problem(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Même forme que le reste de l'API ; la valeur reçue (`input`) n'est jamais renvoyée."""
    errors = [{"path": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "paramètres de requête invalides", "errors": errors})


def _archived(load: Callable[[], Any]) -> Any:
    """Lecture d'archive : corruption ou fichier illisible = 500 neutre, run inconnue = 404."""
    try:
        found = load()
    except (ArchiveCorruptError, OSError) as exc:
        raise HTTPException(status_code=500, detail="entrée d'archive corrompue, intervention nécessaire") from exc
    if found is None:
        raise HTTPException(status_code=404, detail="run inconnue pour cette infrastructure")
    return found


async def _read_json_body(request: Request, max_bytes: int) -> Any:
    """Lit le corps en flux et coupe dès que la limite est dépassée : jamais tout en mémoire d'abord."""
    _require_json(request)
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > max_bytes:
        raise _too_large(max_bytes)
    chunks: list[bytes] = []
    total = 0
    try:
        async for chunk in request.stream():
            total += len(chunk)
            if total > max_bytes:
                raise _too_large(max_bytes)
            chunks.append(chunk)
    except ClientDisconnect as exc:
        raise HTTPException(status_code=400, detail="connexion fermée avant la fin du corps") from exc
    try:
        return await run_in_threadpool(json.loads, b"".join(chunks))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"JSON invalide : {exc.msg} (ligne {exc.lineno})") from exc


def _contract_schemas() -> dict[str, Any]:
    """Modèles des deux contrats sous `components.schemas`, références réécrites pour le document OpenAPI.

    Une seule génération pour les deux : les types partagés (bundle et snapshot) n'apparaissent qu'une fois.
    """
    _, top = models_json_schema([(model, "validation") for model in CONTRACT_MODELS], ref_template=SCHEMA_REF_TEMPLATE)
    return top["$defs"]


def _with_contract(base: dict[str, Any]) -> dict[str, Any]:
    """Nouveau document : schémas du contrat fusionnés et corps du POST déclaré. `base` n'est pas modifié."""
    components = base.get("components", {})
    schemas = components.get("schemas", {})
    contract = _contract_schemas()
    clashes = sorted(name for name in contract if name in schemas and schemas[name] != contract[name])
    if clashes:
        raise RuntimeError(f"collision de schémas OpenAPI entre l'API et le contrat : {clashes}")
    body = {
        "required": True,
        "description": "RunBundle v1 : la référence est `contracts/CONTRAT.md`.",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=BUNDLE_SCHEMA_NAME)}}},
    }
    post = {**base["paths"][BUNDLES]["post"], "requestBody": body}
    return {
        **base,
        "components": {**components, "schemas": {**schemas, **contract}},
        "paths": {**base["paths"], BUNDLES: {**base["paths"][BUNDLES], "post": post}},
    }


class IngestApp(FastAPI):
    """FastAPI dont le document OpenAPI porte le contrat : le corps du POST est lu à la main, pas déclaré."""

    def openapi(self) -> dict[str, Any]:
        cached = self.openapi_schema
        base = super().openapi()
        if base is not cached:
            self.openapi_schema = _with_contract(base)
        return self.openapi_schema


def create_app(settings: Settings, archive: BundleArchive | None = None) -> FastAPI:
    store = archive or BundleArchive(settings.archive_dir)
    app = IngestApp(
        title="Living Diagram — ingestion",
        version="0.1.0",
        description="Porte d'entrée de Living Diagram : reçoit un RunBundle, le valide, l'archive, le corrèle (B1) "
        "et sert le snapshot.",
    )
    app.add_exception_handler(RequestValidationError, _query_problem)
    guard = Depends(_bearer_guard(settings))

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(BUNDLES, dependencies=[guard], status_code=201, responses=POST_RESPONSES, summary="Ingérer un RunBundle")
    async def post_bundle(request: Request) -> JSONResponse:
        data = await _read_json_body(request, settings.max_bundle_bytes)
        result = await run_in_threadpool(ingest_bundle, data, store)
        return JSONResponse(status_code=result.http_status, content=result_payload(result))

    @app.get(BUNDLES, dependencies=[guard], summary="Lister les runs archivées d'une infrastructure")
    def list_runs(infrastructure: Label) -> RunList:
        runs = store.list_runs(infrastructure)
        entries = [RunEntry(**{name: getattr(r, name) for name in RunEntry.model_fields}) for r in runs]
        return RunList(infrastructure=infrastructure, runs=entries)

    @app.get(BUNDLE, dependencies=[guard], summary="Relire un bundle archivé (forme canonique)")
    def get_bundle(infrastructure: Label, run_id: Label) -> Response:
        raw = _archived(lambda: store.load_bundle_bytes(infrastructure, run_id))
        return Response(content=raw, media_type="application/json")

    @app.get(REPORT, dependencies=[guard], summary="Relire le rapport de la première ingestion")
    def get_report(infrastructure: Label, run_id: Label) -> IngestReport:
        return IngestReport.model_validate(_archived(lambda: store.load_report(infrastructure, run_id)))

    @app.get(
        SNAPSHOT,
        dependencies=[guard],
        response_class=Response,
        responses=SNAPSHOT_RESPONSES,
        summary="Relire le snapshot d'une run (sortie de B1)",
    )
    def get_snapshot(infrastructure: Label, run_id: Label) -> Response:
        _archived(lambda: store.find_run(infrastructure, run_id))
        raw = _archived(lambda: store.load_snapshot_bytes(infrastructure, run_id) or b"")
        if not raw:
            raise HTTPException(status_code=404, detail="run archivée sans snapshot : lancer `ld correlate`")
        return Response(content=raw, media_type="application/json")

    return app


def app_from_env() -> FastAPI:
    """Fabrique pour `uvicorn ld_backend.api:app_from_env --factory`."""
    return create_app(Settings.from_env())

"""API REST : la porte d'entrée de Living Diagram."""

import hmac
import json
import re
from collections.abc import Callable
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from ld_contracts.bundle import RunBundle
from ld_contracts.diff import Diff
from ld_contracts.diff.serialize import canonical_json as diff_json
from ld_contracts.intent import Intent
from ld_contracts.intent.serialize import canonical_json as intent_json
from ld_contracts.snapshot import Snapshot
from pydantic import ValidationError
from pydantic.json_schema import models_json_schema
from starlette.requests import ClientDisconnect

from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.assets import AssetStore, AssetTypeError, AssetUnknownError
from ld_backend.config import Settings
from ld_backend.diff import DiffError, diff
from ld_backend.diffs import SnapshotUnavailableError, load_archived_snapshot
from ld_backend.ingest import ingest_bundle, result_payload
from ld_backend.intent import IntentCorruptError, IntentGroupError, IntentLimitError, IntentStore
from ld_backend.placement import (
    Placement,
    PlacementCorruptError,
    PlacementLimitError,
    PlacementStaleError,
    PlacementStore,
    PlacementWrite,
    placement_json,
)
from ld_backend.render import render_shell
from ld_backend.render.app import APP_ASSET_PREFIX, APP_CSP, APP_ROUTE, read_app_asset, render_app
from ld_backend.schemas import AssetReceipt, IngestReport, IntentOps, RunEntry, RunList

# Une run s'adresse par paramètres de requête, jamais par le chemin : `infrastructure` est un libellé libre et
# `run_id` vient de l'amont ; un `/` dans l'un ou l'autre rendait la run archivée illisible (404).
BUNDLES = "/api/ingest/bundles"
BUNDLE = "/api/ingest/bundle"
REPORT = "/api/ingest/report"
SNAPSHOT = "/api/snapshot"
DIFF = "/api/diff"
INTENT = "/api/intent"
INTENT_PATCHES = "/api/intent/patches"
INTENT_ASSETS = "/api/intent/assets"
IMAGE_MEDIA_TYPE = re.compile(r"image/(png|jpeg|webp)", re.IGNORECASE)
PLACEMENT = "/api/placement"
VIEW = "/view"
APP_ASSET = APP_ASSET_PREFIX + "{name:path}"
JSON_MEDIA_TYPE = re.compile(r"application/(?:[\w.-]+\+)?json", re.IGNORECASE)
SCHEMA_REF_TEMPLATE = "#/components/schemas/{model}"
CONTRACT_MODELS = (RunBundle, Snapshot, Diff, Intent, IntentOps, Placement, PlacementWrite)
# Les corps lus à la main (en flux, avec une limite) sont déclarés dans OpenAPI ici, pas par FastAPI.
BODY_MODELS = {
    BUNDLES: (RunBundle, "RunBundle v1 : la référence est `contracts/CONTRAT.md`."),
    INTENT_PATCHES: (
        IntentOps,
        "Une requête d'écriture de la couche d'intention : auteur et opérations, dans l'ordre.",
    ),
    PLACEMENT: (
        PlacementWrite,
        "Les places des équipements qu'une page vient de placer sans mémoire ; `replace` pour « replacer ».",
    ),
}

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

DIFF_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Diff v1 entre les snapshots des runs `from` et `to`, calculé à la demande, jamais archivé ; "
        "référence : `contracts/CONTRAT.md`, partie C.",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Diff.__name__)}}},
    },
    404: {"description": "run `from` ou `to` inconnue, ou sans snapshot (`ld correlate`) ; le détail nomme le côté"},
    500: {"description": "entrée d'archive illisible, ou snapshot archivé hors contrat : intervention nécessaire"},
}

INTENT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Intent v1 de l'infrastructure, forme canonique ; le document vide (`revision` 0) si rien n'a "
        "jamais été écrit. Référence : `contracts/CONTRAT.md`, partie D.",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Intent.__name__)}}},
    },
    500: {"description": "document d'intention illisible ou incohérent sur disque : intervention nécessaire"},
}

PATCHES_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "le document résultant, `revision` incrémentée, opérations appliquées dans l'ordre (dernier "
        "écrivain gagne, par épingle) ; une ligne de journal par requête acceptée",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Intent.__name__)}}},
    },
    404: {"description": "infrastructure sans aucune run archivée : rien à épingler"},
    413: {"description": "corps au-delà de `LD_MAX_INTENT_BYTES`"},
    415: {"description": "`Content-Type` qui n'est pas `application/json`"},
    422: {
        "description": "corps hors forme (auteur vide, liste vide, coordonnée non entière ou hors borne, opération "
        "inconnue), ou document qui dépasserait 10 000 épingles ; `errors` liste chemin et règle, jamais une valeur"
    },
    500: {"description": "document d'intention illisible ou incohérent sur disque : intervention nécessaire"},
}

PLACEMENT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Le placement mémorisé de l'infrastructure : une place par équipement déjà dessiné ; le "
        "document vide (`revision` 0) si rien n'a jamais été dessiné. Donnée dérivée et jetable (`docs/09`).",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Placement.__name__)}}},
    },
    500: {"description": "document de placement illisible ou incohérent sur disque : `ld placement --forget`"},
}

PLACEMENT_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "le document résultant : sans `replace`, seuls les équipements sans place mémorisée entrent "
        "(la première place reste) et rien n'est écrit si la requête n'apporte rien ; avec `replace`, le document "
        "devient exactement `places`",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Placement.__name__)}}},
    },
    404: {"description": "infrastructure sans aucune run archivée : rien à placer"},
    409: {
        "description": "la page a dessiné sur un document qui a changé depuis (`base_revision` ≠ `revision`) et la "
        "requête apporterait quelque chose : rien n'est écrit, le corps est le document courant, à partir duquel "
        "redessiner",
        "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=Placement.__name__)}}},
    },
    413: {"description": "corps au-delà de `LD_MAX_INTENT_BYTES` (même borne que l'intention)"},
    415: {"description": "`Content-Type` qui n'est pas `application/json`"},
    422: {
        "description": "corps hors forme (coordonnée non entière ou hors borne, équipement nommé deux fois, "
        "`replace` absent), ou document qui dépasserait 10 000 équipements ; `errors` liste chemin et règle, "
        "jamais une valeur"
    },
    500: {"description": "document de placement illisible ou incohérent sur disque : `ld placement --forget`"},
}

Label = Annotated[str, Query(min_length=1)]
FromLabel = Annotated[str, Query(min_length=1, alias="from", description="run de départ")]
ToLabel = Annotated[str, Query(min_length=1, alias="to", description="run d'arrivée")]


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


def _safe_message(error: dict[str, Any]) -> str:
    """Le message d'une erreur de validation, sans la valeur reçue : Pydantic la recopie dans certains messages (le
    discriminant d'une union, par exemple), la règle de l'API l'interdit (revue B4, M2)."""
    if error["type"] == "union_tag_invalid":
        expected = (error.get("ctx") or {}).get("expected_tags", "")
        return f"valeur inconnue pour le discriminant ; attendu : {expected}"
    received = error.get("input")
    if isinstance(received, str) and received and received in error["msg"]:
        return error["type"]
    return error["msg"]


def _problem(detail: str, errors: list[dict[str, Any]]) -> JSONResponse:
    listed = [{"path": ".".join(str(p) for p in e["loc"]), "message": _safe_message(e)} for e in errors]
    return JSONResponse(status_code=422, content={"detail": detail, "errors": listed})


def _query_problem(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Même forme que le reste de l'API ; la valeur reçue (`input`) n'est jamais renvoyée."""
    return _problem("paramètres de requête invalides", list(exc.errors()))


def _archived(load: Callable[[], Any]) -> Any:
    """Lecture d'archive : corruption ou fichier illisible = 500 neutre, run inconnue = 404."""
    try:
        found = load()
    except (ArchiveCorruptError, OSError) as exc:
        raise HTTPException(status_code=500, detail="entrée d'archive corrompue, intervention nécessaire") from exc
    if found is None:
        raise HTTPException(status_code=404, detail="run inconnue pour cette infrastructure")
    return found


def _archived_snapshot(store: BundleArchive, infrastructure: str, run_id: str, side: str) -> Snapshot:
    """Un des deux snapshots du diff : 404 qui nomme le côté (`from` / `to`), 500 neutre sinon."""
    try:
        return load_archived_snapshot(store, infrastructure, run_id, side)
    except SnapshotUnavailableError as exc:
        if exc.reason == "invalid":
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ArchiveCorruptError, OSError) as exc:
        raise HTTPException(status_code=500, detail="entrée d'archive corrompue, intervention nécessaire") from exc


ASSET_POST_RESPONSES: dict[int | str, dict[str, Any]] = {
    201: {"description": "fichier rangé sous son empreinte (`asset`), type reconnu aux octets, dimensions lues"},
    200: {"description": "fichier déjà présent : la même empreinte"},
    404: {"description": "infrastructure sans run archivée"},
    413: {"description": "corps au-delà de `LD_MAX_ASSET_BYTES` (4 Mo par défaut)"},
    415: {"description": "`Content-Type` qui n'est pas `image/png`, `image/jpeg` ou `image/webp`"},
    422: {
        "description": "octets de tête qui ne sont ni PNG, ni JPEG, ni WebP (`asset_unrecognized`) : un SVG est refusé"
    },
}
ASSET_GET_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {"description": "les octets du fichier, `Content-Type` vérifié à la lecture, `nosniff`, cache immuable"},
    404: {"description": "empreinte inconnue pour cette infrastructure"},
}
ASSET_DELETE_RESPONSES: dict[int | str, dict[str, Any]] = {
    204: {"description": "fichier retiré"},
    404: {"description": "empreinte inconnue pour cette infrastructure"},
    409: {"description": "une annotation cite encore ce fichier (`asset_in_use`)"},
}


async def _read_bytes_body(request: Request, max_bytes: int) -> bytes:
    """Le corps brut, en flux, coupé dès que la limite est dépassée (un fichier d'image)."""
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
    return b"".join(chunks)


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
    """Modèles des trois contrats sous `components.schemas`, références réécrites pour le document OpenAPI.

    Une seule génération pour les trois : les types partagés (bundle, snapshot, diff) n'apparaissent qu'une fois.
    """
    _, top = models_json_schema([(model, "validation") for model in CONTRACT_MODELS], ref_template=SCHEMA_REF_TEMPLATE)
    return top["$defs"]


def _with_contract(base: dict[str, Any]) -> dict[str, Any]:
    """Nouveau document : schémas du contrat fusionnés et corps des POST lus à la main déclarés. `base` n'est pas
    modifié."""
    components = base.get("components", {})
    schemas = components.get("schemas", {})
    contract = _contract_schemas()
    clashes = sorted(name for name in contract if name in schemas and schemas[name] != contract[name])
    if clashes:
        raise RuntimeError(f"collision de schémas OpenAPI entre l'API et le contrat : {clashes}")
    paths = dict(base["paths"])
    for route, (model, description) in BODY_MODELS.items():
        body = {
            "required": True,
            "description": description,
            "content": {"application/json": {"schema": {"$ref": SCHEMA_REF_TEMPLATE.format(model=model.__name__)}}},
        }
        paths[route] = {**paths[route], "post": {**paths[route]["post"], "requestBody": body}}
    return {**base, "components": {**components, "schemas": {**schemas, **contract}}, "paths": paths}


class IngestApp(FastAPI):
    """FastAPI dont le document OpenAPI porte le contrat : le corps du POST est lu à la main, pas déclaré."""

    def openapi(self) -> dict[str, Any]:
        cached = self.openapi_schema
        base = super().openapi()
        if base is not cached:
            self.openapi_schema = _with_contract(base)
        return self.openapi_schema


def _intent_or_500(load: Callable[[], Intent]) -> Intent:
    try:
        return load()
    except IntentCorruptError as exc:
        raise HTTPException(status_code=500, detail="document d'intention corrompu, intervention nécessaire") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="document d'intention illisible, intervention nécessaire") from exc


def _placement_or_500(load: Callable[[], Placement]) -> Placement:
    try:
        return load()
    except PlacementCorruptError as exc:
        detail = "document de placement corrompu : `ld placement --forget` le retire, le placement se recalcule"
        raise HTTPException(status_code=500, detail=detail) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="document de placement illisible, intervention nécessaire") from exc


def create_app(settings: Settings, archive: BundleArchive | None = None) -> FastAPI:
    store = archive or BundleArchive(settings.archive_dir)
    assets = AssetStore(settings.archive_dir)
    intents = IntentStore(settings.archive_dir, asset_exists=assets.exists)
    placements = PlacementStore(settings.archive_dir)
    app = IngestApp(
        title="Living Diagram — ingestion",
        version="0.1.0",
        description="Porte d'entrée de Living Diagram : reçoit un RunBundle, le valide, l'archive, le corrèle (B1), "
        "sert le snapshot et compare deux runs (B3).",
    )
    app.add_exception_handler(RequestValidationError, _query_problem)
    guard = Depends(_bearer_guard(settings))

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    shell = render_shell()  # une fois : la coquille ne dépend d'aucune run

    @app.get(
        VIEW,
        response_class=HTMLResponse,
        summary="Page de lecture d'une run archivée (le jeton se saisit dans la page)",
        description="La coquille du visualiseur, sans donnée, servie sans jeton comme `/docs`. Elle lit le snapshot "
        "et le rapport par l'API avec le jeton saisi dans la page, gardé dans l'onglet. Adresse partageable : "
        "`/view?infrastructure=&run_id=#view=graph` ; avec `&from=<run_id>`, la page lit aussi le diff depuis cette "
        "run (`/api/diff`) et peint les changements ; le jeton n'y entre jamais.",
    )
    def view() -> HTMLResponse:
        return HTMLResponse(shell)

    application = render_app()  # une fois : la page ne dépend d'aucune run ; ses fichiers, eux, sont lus à la requête

    @app.get(
        APP_ROUTE,
        response_class=HTMLResponse,
        summary="L'application (le jeton se saisit dans la page)",
        description="La face utilisateur de Living Diagram : le diagramme est la page. Servie sans jeton, sans "
        "donnée ; elle charge `/assets/app/app.js` et `/assets/app/app.css` depuis sa propre origine (CSP "
        "`'self'`, aucune ressource externe) et lit la run par l'API avec le jeton saisi dans la page. Adresse "
        "partageable : `/?infrastructure=&run_id=&from=#node=…` ; le jeton n'y entre jamais.",
    )
    def application_page() -> HTMLResponse:
        return HTMLResponse(application, headers={"Content-Security-Policy": APP_CSP, "Cache-Control": "no-cache"})

    @app.get(APP_ASSET, include_in_schema=False)
    def application_asset(name: str, request: Request) -> Response:
        found = read_app_asset(name)
        if found is None:
            raise HTTPException(status_code=404, detail="fichier inconnu")
        content, media_type, etag = found
        headers = {"ETag": etag, "Cache-Control": "no-cache"}
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        return Response(content=content, media_type=media_type, headers=headers)

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

    @app.get(
        DIFF,
        dependencies=[guard],
        response_class=Response,
        responses=DIFF_RESPONSES,
        summary="Comparer deux runs archivées (sortie de B3)",
    )
    def get_diff(infrastructure: Label, from_run: FromLabel, to_run: ToLabel) -> Response:
        before = _archived_snapshot(store, infrastructure, from_run, "from")
        after = _archived_snapshot(store, infrastructure, to_run, "to")
        try:
            result = diff(before, after)
        except DiffError as exc:  # deux snapshots d'une même entrée d'archive qui ne se comparent pas
            detail = f"{exc} : archive incohérente, intervention nécessaire"
            raise HTTPException(status_code=500, detail=detail) from exc
        return Response(content=diff_json(result), media_type="application/json")

    @app.get(
        INTENT,
        dependencies=[guard],
        response_class=Response,
        responses=INTENT_RESPONSES,
        summary="Lire la couche d'intention d'une infrastructure (B4 : épingles ; docs/10 : couleurs)",
    )
    def get_intent(infrastructure: Label) -> Response:
        intent = _intent_or_500(lambda: intents.load(infrastructure))
        return Response(content=intent_json(intent), media_type="application/json")

    @app.post(
        INTENT_PATCHES,
        dependencies=[guard],
        response_class=Response,
        responses=PATCHES_RESPONSES,
        summary="Appliquer des opérations à la couche d'intention (pin, unpin, color, uncolor, color_type, "
        "uncolor_type, group_create, group_update, group_add, group_remove, group_delete, annotation_create, "
        "annotation_update, annotation_delete)",
        description="Le document ne s'écrit que par opérations : poser ou remplacer une épingle (`pin`), la retirer "
        "(`unpin`) ; colorer un équipement d'une teinte nommée (`color`) ou lui rendre celle de son type (`uncolor`) ; "
        "colorer un type (`color_type`) ou lui rendre sa teinte par défaut (`uncolor_type`) ; créer, modifier, "
        "étoffer, réduire ou supprimer un groupe (`group_create`, `group_update`, `group_add`, `group_remove`, "
        "`group_delete` ; docs/10 §5) ; créer, modifier ou supprimer une annotation (note, forme, tableau, image ; "
        "`annotation_create`, `annotation_update`, `annotation_delete` ; docs/10 §6). Appliquées dans l'ordre, "
        "journalisées (auteur, date, opérations). Une infrastructure sans run archivée est refusée (404).",
    )
    async def post_intent_patches(infrastructure: Label, request: Request) -> Response:
        if not store.list_runs(infrastructure):
            detail = "aucune run archivée pour cette infrastructure : rien à épingler"
            raise HTTPException(status_code=404, detail=detail)
        data = await _read_json_body(request, settings.max_intent_bytes)  # borné, comme un bundle (revue B4, H2)
        try:
            ops = IntentOps.model_validate(data)
        except ValidationError as exc:
            return _problem("corps de requête invalide", list(exc.errors()))
        now = datetime.now(UTC).replace(microsecond=0)
        try:
            intent = _intent_or_500(lambda: intents.apply(infrastructure, ops, now))
        except IntentLimitError as exc:
            return _problem("corps de requête invalide", [{"loc": ("ops",), "type": "too_long", "msg": str(exc)}])
        except IntentGroupError as exc:
            return _problem("corps de requête invalide", [{"loc": ("ops",), "type": exc.code, "msg": str(exc)}])
        except ValidationError as exc:  # une annotation incohérente une fois assemblée (ligne de rappel sans ancre)
            return _problem("corps de requête invalide", list(exc.errors()))
        return Response(content=intent_json(intent), media_type="application/json")

    @app.post(
        INTENT_ASSETS,
        dependencies=[guard],
        status_code=201,
        responses=ASSET_POST_RESPONSES,
        summary="Envoyer une image pour une annotation (PNG, JPEG, WebP ; jamais SVG), rangée sous son empreinte",
        description="Le corps est le fichier brut, `Content-Type` image ; reconnu à ses octets de tête, jamais à son "
        "nom ni à son type déclaré ; borné par `LD_MAX_ASSET_BYTES` (4 Mo). Un fichier déjà présent répond 200 avec "
        "la même empreinte. L'empreinte se cite ensuite dans `annotation_create` (`content.kind` = `image`).",
    )
    async def post_intent_asset(infrastructure: Label, request: Request, response: Response) -> AssetReceipt:
        if not await run_in_threadpool(store.list_runs, infrastructure):
            raise HTTPException(status_code=404, detail="aucune run archivée pour cette infrastructure")
        declared = request.headers.get("content-type", "")
        if not IMAGE_MEDIA_TYPE.match(declared):
            raise HTTPException(status_code=415, detail="`Content-Type` attendu : image/png, image/jpeg ou image/webp")
        data = await _read_bytes_body(request, settings.max_asset_bytes)
        try:
            info, created = await run_in_threadpool(assets.put, infrastructure, data)
        except AssetTypeError as exc:
            return _problem("fichier refusé", [{"loc": ("body",), "type": "asset_unrecognized", "msg": str(exc)}])  # type: ignore[return-value]
        response.status_code = 201 if created else 200
        return AssetReceipt(**asdict(info))

    @app.get(
        INTENT_ASSETS,
        dependencies=[guard],
        response_class=Response,
        responses=ASSET_GET_RESPONSES,
        summary="Lire une image du magasin d'une infrastructure, par son empreinte",
    )
    def get_intent_asset(infrastructure: Label, asset: Label) -> Response:
        try:
            data, media_type = assets.get(infrastructure, asset)
        except AssetUnknownError as exc:
            raise HTTPException(status_code=404, detail="image inconnue pour cette infrastructure") from exc
        except AssetTypeError as exc:
            raise HTTPException(
                status_code=500, detail="fichier du magasin illisible : intervention nécessaire"
            ) from exc
        headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable"}
        return Response(content=data, media_type=media_type, headers=headers)

    @app.delete(
        INTENT_ASSETS,
        dependencies=[guard],
        status_code=204,
        response_class=Response,
        responses=ASSET_DELETE_RESPONSES,
        summary="Retirer une image du magasin ; refusé tant qu'une annotation la cite (`asset_in_use`)",
    )
    def delete_intent_asset(infrastructure: Label, asset: Label) -> Response:
        intent = _intent_or_500(lambda: intents.load(infrastructure))
        cited = any(a.content.kind == "image" and a.content.asset == asset for a in intent.annotations)
        if cited:
            raise HTTPException(
                status_code=409, detail="image citée par une annotation : supprimez l'annotation d'abord"
            )
        try:
            assets.delete(infrastructure, asset)
        except AssetUnknownError as exc:
            raise HTTPException(status_code=404, detail="image inconnue pour cette infrastructure") from exc
        return Response(status_code=204)

    @app.get(
        PLACEMENT,
        dependencies=[guard],
        response_class=Response,
        responses=PLACEMENT_RESPONSES,
        summary="Lire le placement mémorisé d'une infrastructure (la place de chaque équipement déjà dessiné)",
    )
    def get_placement(infrastructure: Label) -> Response:
        doc = _placement_or_500(lambda: placements.load(infrastructure))
        return Response(content=placement_json(doc), media_type="application/json")

    @app.post(
        PLACEMENT,
        dependencies=[guard],
        response_class=Response,
        responses=PLACEMENT_WRITE_RESPONSES,
        summary="Mémoriser les places que la page vient de calculer (première place gagnante), ou tout replacer",
        description="La page `/view` envoie, après chaque dessin, les équipements qu'elle a placés sans mémoire : "
        "la première place d'un équipement est celle qui reste, une seconde page ne déplace rien. `replace` "
        "remplace tout le document (« replacer » dans la page). Aucun nom requis : c'est une donnée dérivée, les "
        "épingles de l'intention gagnent toujours sur elle. Une infrastructure sans run archivée est refusée (404).",
    )
    async def post_placement(infrastructure: Label, request: Request) -> Response:
        if not await run_in_threadpool(store.list_runs, infrastructure):
            raise HTTPException(status_code=404, detail="aucune run archivée pour cette infrastructure : rien à placer")
        data = await _read_json_body(request, settings.max_intent_bytes)
        try:
            write = PlacementWrite.model_validate(data)
        except ValidationError as exc:
            return _problem("corps de requête invalide", list(exc.errors()))
        now = datetime.now(UTC).replace(microsecond=0)
        try:  # le verrou de fichier et le fsync hors de la boucle d'événements (revue, B3)
            doc = await run_in_threadpool(_placement_or_500, lambda: placements.record(infrastructure, write, now))
        except PlacementLimitError as exc:
            return _problem("corps de requête invalide", [{"loc": ("places",), "type": "too_long", "msg": str(exc)}])
        except PlacementStaleError as exc:
            return Response(status_code=409, content=placement_json(exc.current), media_type="application/json")
        return Response(content=placement_json(doc), media_type="application/json")

    return app


def app_from_env() -> FastAPI:
    """Fabrique pour `uvicorn ld_backend.api:app_from_env --factory`."""
    return create_app(Settings.from_env())

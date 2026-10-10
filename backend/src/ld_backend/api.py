"""API REST : la porte d'entrée de Living Diagram.

Ce module déclare les routes ; `openapi.py` dit ce qu'elles répondent (groupes, réponses, schémas des contrats) et
`bodies.py` lit les corps et met les refus à la forme `Problem`. Toute route sauf `/api/health` passe par le routeur
protégé : jeton exigé, 401 et 422 documentés une fois pour toutes.
"""

import hmac
from collections.abc import Callable
from dataclasses import asdict
from datetime import UTC, datetime
from functools import partial
from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from ld_contracts.diff.serialize import canonical_json as diff_json
from ld_contracts.intent.serialize import canonical_json as intent_json
from ld_contracts.snapshot import Snapshot
from pydantic import AwareDatetime, ValidationError

from ld_backend import __version__
from ld_backend import openapi as doc
from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.assets import AssetStore, AssetTypeError, AssetUnknownError
from ld_backend.bodies import IMAGE_MEDIA_TYPE, one_problem, problem, query_problem, read_body, read_json_body
from ld_backend.config import Settings
from ld_backend.diff import DiffError, diff
from ld_backend.diffs import CacheKey, DiffCache, SnapshotUnavailableError, load_archived_snapshot
from ld_backend.ingest import ingest_bundle, result_payload
from ld_backend.intent import AssetInUseError, IntentCorruptError, IntentGroupError, IntentLimitError, IntentStore
from ld_backend.journal import MAX_LIMIT, Category, JournalCursorError, JournalPage, JournalQuery, JournalReader
from ld_backend.journal_index import Action
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
from ld_backend.schemas import AssetReceipt, Health, IngestReport, IntentOps, RunEntry, RunList

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
INTENT_JOURNAL = "/api/intent/journal"
PLACEMENT = "/api/placement"
VIEW = "/view"
APP_ASSET = APP_ASSET_PREFIX + "{name:path}"
CORRUPT = "entrée d'archive corrompue, intervention nécessaire"

_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="bearerAuth",
    description="Valeur de `LD_API_TOKEN`, envoyée en `Authorization: Bearer <jeton>`. Dans `/docs`, bouton "
    "« Authorize » : coller le jeton seul, sans le mot Bearer.",
)

Label = Annotated[str, Query(min_length=1)]
InfraLabel = Annotated[str, Query(min_length=1, description="libellé de l'infrastructure, tel que dans `devices`")]
RunLabel = Annotated[str, Query(min_length=1, description="`collector_run_id` de la run")]
FromLabel = Annotated[str, Query(min_length=1, alias="from", description="run de départ")]
ToLabel = Annotated[str, Query(min_length=1, alias="to", description="run d'arrivée")]
AssetLabel = Annotated[str, Query(min_length=1, description="empreinte SHA-256 rendue par l'envoi")]


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


def _server_error(_: Request, __: Exception) -> JSONResponse:
    """Une erreur imprévue garde la forme `Problem`, sans rien dire de sa cause ; le serveur la journalise."""
    return JSONResponse(status_code=500, content={"detail": "erreur interne, intervention nécessaire"})


def _archived(load: Callable[[], Any]) -> Any:
    """Lecture d'archive : corruption ou fichier illisible = 500 neutre, run inconnue = 404."""
    try:
        found = load()
    except (ArchiveCorruptError, OSError) as exc:
        raise HTTPException(status_code=500, detail=CORRUPT) from exc
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
        raise HTTPException(status_code=500, detail=CORRUPT) from exc


def _known_run(store: BundleArchive, infrastructure: str, run_id: str, side: str) -> None:
    """La run existe et son entrée se lit : vérifié avant le cache, qui ne doit pas masquer une archive abîmée."""
    try:
        found = store.find_run(infrastructure, run_id)
    except (ArchiveCorruptError, OSError) as exc:
        raise HTTPException(status_code=500, detail=CORRUPT) from exc
    if found is None:
        raise HTTPException(status_code=404, detail=str(SnapshotUnavailableError("unknown", side)))


def _diff_key(store: BundleArchive, infrastructure: str, from_run: str, to_run: str) -> CacheKey | None:
    """La clé du cache : les deux runs et l'identité de leurs fichiers snapshot ; `None` = ne pas garder."""
    try:
        before, after = store.snapshot_stamp(infrastructure, from_run), store.snapshot_stamp(infrastructure, to_run)
    except OSError:
        return None
    if before is None or after is None:
        return None
    return infrastructure, from_run, to_run, before, after


def _intent_or_500[T](load: Callable[[], T]) -> T:
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


async def _require_runs(store: BundleArchive, infrastructure: str, what: str) -> None:
    """Une écriture n'a de sens que pour une infrastructure archivée ; vérifié hors de la boucle d'événements."""
    if not await run_in_threadpool(store.has_runs, infrastructure):
        raise HTTPException(status_code=404, detail=f"aucune run archivée pour cette infrastructure : rien à {what}")


def _json(payload: str | bytes, status_code: int = 200) -> Response:
    return Response(content=payload, status_code=status_code, media_type="application/json")


def _pages(app: FastAPI) -> None:
    """Les deux pages et les fichiers de l'application : servis sans jeton, hors du document OpenAPI."""
    shell = render_shell()  # une fois : la coquille ne dépend d'aucune run
    application = render_app()  # une fois : la page ne dépend d'aucune run ; ses fichiers, eux, sont lus à la requête

    @app.get(VIEW, response_class=HTMLResponse, include_in_schema=False)
    def view() -> HTMLResponse:
        return HTMLResponse(shell)

    @app.get(APP_ROUTE, response_class=HTMLResponse, include_in_schema=False)
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


def _ingestion_routes(router: APIRouter, store: BundleArchive, settings: Settings) -> None:
    @router.post(
        BUNDLES,
        tags=[doc.INGESTION],
        operation_id="ingest_bundle",
        status_code=201,
        responses=doc.INGEST_RESPONSES,
        summary="Ingérer un RunBundle : valider, archiver, corréler",
    )
    async def post_bundle(request: Request) -> JSONResponse:
        data = await read_json_body(request, settings.max_bundle_bytes)
        result = await run_in_threadpool(ingest_bundle, data, store)
        return JSONResponse(status_code=result.http_status, content=result_payload(result))


def _run_routes(router: APIRouter, store: BundleArchive) -> None:
    @router.get(BUNDLES, tags=[doc.RUNS], operation_id="list_runs", summary="Lister les runs archivées")
    def list_runs(infrastructure: InfraLabel) -> RunList:
        """Triées par début de collecte (ordre de la timeline et du diff N-1) ; liste vide si rien n'est archivé."""
        runs = store.list_runs(infrastructure)
        entries = [RunEntry(**{name: getattr(r, name) for name in RunEntry.model_fields}) for r in runs]
        return RunList(infrastructure=infrastructure, runs=entries)

    @router.get(
        BUNDLE,
        tags=[doc.RUNS],
        operation_id="get_bundle",
        response_class=Response,
        responses=doc.BUNDLE_RESPONSES,
        summary="Relire un bundle archivé (forme canonique)",
    )
    def get_bundle(infrastructure: InfraLabel, run_id: RunLabel) -> Response:
        return _json(_archived(lambda: store.load_bundle_bytes(infrastructure, run_id)))

    @router.get(
        REPORT,
        tags=[doc.RUNS],
        operation_id="get_report",
        responses=doc.REPORT_RESPONSES,
        summary="Relire le rapport de la première ingestion",
    )
    def get_report(infrastructure: InfraLabel, run_id: RunLabel) -> IngestReport:
        return IngestReport.model_validate(_archived(lambda: store.load_report(infrastructure, run_id)))

    @router.get(
        SNAPSHOT,
        tags=[doc.RUNS],
        operation_id="get_snapshot",
        response_class=Response,
        responses=doc.SNAPSHOT_RESPONSES,
        summary="Relire le snapshot d'une run (sortie de B1)",
    )
    def get_snapshot(infrastructure: InfraLabel, run_id: RunLabel) -> Response:
        _archived(lambda: store.find_run(infrastructure, run_id))
        raw = _archived(lambda: store.load_snapshot_bytes(infrastructure, run_id) or b"")
        if not raw:
            raise HTTPException(status_code=404, detail="run archivée sans snapshot : lancer `ld correlate`")
        return _json(raw)


def _diff_routes(router: APIRouter, store: BundleArchive, cache: DiffCache) -> None:
    @router.get(
        DIFF,
        tags=[doc.DIFF],
        operation_id="get_diff",
        response_class=Response,
        responses=doc.DIFF_RESPONSES,
        summary="Comparer deux runs archivées (sortie de B3)",
    )
    def get_diff(infrastructure: InfraLabel, from_run: FromLabel, to_run: ToLabel) -> Response:
        _known_run(store, infrastructure, from_run, "from")
        _known_run(store, infrastructure, to_run, "to")
        key = _diff_key(store, infrastructure, from_run, to_run)
        payload = cache.get(key) if key is not None else None
        if payload is None:
            before = _archived_snapshot(store, infrastructure, from_run, "from")
            after = _archived_snapshot(store, infrastructure, to_run, "to")
            try:
                result = diff(before, after)
            except DiffError as exc:  # deux snapshots d'une même entrée d'archive qui ne se comparent pas
                raise HTTPException(
                    status_code=500, detail=f"{exc} : archive incohérente, intervention nécessaire"
                ) from exc
            payload = diff_json(result).encode("utf-8")
            if key is not None:
                cache.put(key, payload)
        return _json(payload)


def _intent_routes(router: APIRouter, store: BundleArchive, intents: IntentStore, settings: Settings) -> None:
    @router.get(
        INTENT,
        tags=[doc.INTENT],
        operation_id="get_intent",
        response_class=Response,
        responses=doc.INTENT_RESPONSES,
        summary="Lire la couche d'intention d'une infrastructure",
    )
    def get_intent(infrastructure: InfraLabel) -> Response:
        return _json(intent_json(_intent_or_500(lambda: intents.load(infrastructure))))

    @router.post(
        INTENT_PATCHES,
        tags=[doc.INTENT],
        operation_id="apply_intent_ops",
        response_class=Response,
        responses=doc.PATCHES_RESPONSES,
        summary="Appliquer des opérations à la couche d'intention",
        description=doc.patches_description(),
    )
    async def post_intent_patches(infrastructure: InfraLabel, request: Request) -> Response:
        await _require_runs(store, infrastructure, "modifier")
        data = await read_json_body(request, settings.max_intent_bytes)  # borné, comme un bundle (revue B4, H2)
        try:
            ops = await run_in_threadpool(IntentOps.model_validate, data)
        except ValidationError as exc:
            return problem("corps de requête invalide", list(exc.errors()))
        now = datetime.now(UTC).replace(microsecond=0)
        try:  # verrou de fichier, `fsync` et journal hors de la boucle d'événements (audit de l'API, 2026-10-09)
            intent = await run_in_threadpool(_intent_or_500, lambda: intents.apply(infrastructure, ops, now))
        except IntentLimitError as exc:
            return one_problem("corps de requête invalide", "ops", "too_long", str(exc))
        except IntentGroupError as exc:
            return one_problem("corps de requête invalide", "ops", exc.code, str(exc))
        except ValidationError as exc:  # une annotation incohérente une fois assemblée (ligne de rappel sans ancre)
            return problem("corps de requête invalide", list(exc.errors()))
        return _json(intent_json(intent))


def _asset_routes(
    router: APIRouter, store: BundleArchive, assets: AssetStore, intents: IntentStore, settings: Settings
) -> None:
    @router.post(
        INTENT_ASSETS,
        tags=[doc.IMAGES],
        operation_id="upload_asset",
        status_code=201,
        responses=doc.ASSET_POST_RESPONSES,
        summary="Envoyer une image (PNG, JPEG, WebP ; jamais SVG)",
        description="Le corps est le fichier brut, `Content-Type` image ; borné par `LD_MAX_ASSET_BYTES` (4 Mo). Un "
        "fichier déjà présent répond 200 avec la même empreinte. L'empreinte se cite ensuite dans "
        "`annotation_create` (`content.kind` = `image`).",
    )
    async def post_intent_asset(infrastructure: InfraLabel, request: Request, response: Response) -> AssetReceipt:
        await _require_runs(store, infrastructure, "illustrer")
        if not IMAGE_MEDIA_TYPE.match(request.headers.get("content-type", "")):
            raise HTTPException(status_code=415, detail="`Content-Type` attendu : image/png, image/jpeg ou image/webp")
        data = await read_body(request, settings.max_asset_bytes)
        try:
            info, created = await run_in_threadpool(assets.put, infrastructure, data)
        except AssetTypeError as exc:
            return one_problem("fichier refusé", "body", "asset_unrecognized", str(exc))  # type: ignore[return-value]
        response.status_code = 201 if created else 200
        return AssetReceipt(**asdict(info))

    @router.get(
        INTENT_ASSETS,
        tags=[doc.IMAGES],
        operation_id="get_asset",
        response_class=Response,
        responses=doc.ASSET_GET_RESPONSES,
        summary="Lire une image par son empreinte",
    )
    def get_intent_asset(infrastructure: InfraLabel, asset: AssetLabel) -> Response:
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

    @router.delete(
        INTENT_ASSETS,
        tags=[doc.IMAGES],
        operation_id="delete_asset",
        status_code=204,
        response_class=Response,
        responses=doc.ASSET_DELETE_RESPONSES,
        summary="Retirer une image que plus aucune annotation ne cite",
    )
    def delete_intent_asset(infrastructure: InfraLabel, asset: AssetLabel) -> Response:
        try:
            _intent_or_500(
                lambda: intents.release_asset(infrastructure, asset, partial(assets.delete, infrastructure, asset))
            )
        except AssetInUseError as exc:
            detail = "image citée par une annotation : supprimez l'annotation d'abord"
            raise HTTPException(status_code=409, detail=detail) from exc
        except AssetUnknownError as exc:
            raise HTTPException(status_code=404, detail="image inconnue pour cette infrastructure") from exc
        return Response(status_code=204)


def _journal_routes(router: APIRouter, journal: JournalReader) -> None:
    @router.get(
        INTENT_JOURNAL,
        tags=[doc.JOURNAL],
        operation_id="get_journal",
        responses=doc.JOURNAL_RESPONSES,
        summary="Lire le journal des modifications, le plus récent d'abord",
        description="Une entrée par requête acceptée par `POST /api/intent/patches` : auteur déclaré, date, révision, "
        "catégories (`positions`, `colors`, `groups`, `annotations`, `connectors`, `other`), identités créées, "
        "sujets cités avec leur nom d'alors, opérations telles que reçues. Sans `infrastructure`, toutes les "
        "infrastructures. Filtres combinés : `author` et `category` répétables (l'un ou l'autre), `q` (chaque mot, "
        "sans la casse ni les accents, sur l'auteur, les noms, les mots des phrases de la page et le contenu des "
        "opérations ; jamais le nom de l'infrastructure), `since` inclus, "
        "`until` exclu, `action` répétable (`created`, `modified`, `deleted`), `object` (l'historique d'un objet : "
        "hostname ou identité, tout ce qui le cite ; avec `infrastructure`). Pagination par `before` = le `next` "
        "de la page précédente ; "
        "`start` (avec `infrastructure`) fait commencer la première page à une révision (le lien vers une entrée). "
        "Lecture seule ; une ligne illisible est sautée et comptée (`unreadable`).",
    )
    def get_intent_journal(
        infrastructure: Annotated[str | None, Query(min_length=1, description="absent = toutes")] = None,
        author: Annotated[list[str] | None, Query(description="répétable")] = None,
        category: Annotated[list[Category] | None, Query(description="répétable")] = None,
        q: Annotated[str, Query(max_length=200, description="mots cherchés, sans la casse")] = "",
        since: Annotated[AwareDatetime | None, Query(description="inclus, avec fuseau")] = None,
        until: Annotated[AwareDatetime | None, Query(description="exclu, avec fuseau")] = None,
        before: Annotated[str | None, Query(max_length=400, description="le `next` de la page précédente")] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 100,
        action: Annotated[list[Action] | None, Query(description="répétable")] = None,
        object: Annotated[str | None, Query(min_length=1, max_length=253, description="hostname ou identité")] = None,  # noqa: A002
        start: Annotated[int | None, Query(ge=0, description="révision, avec `infrastructure`")] = None,
    ) -> JournalPage:
        # une révision, comme une identité `g…` / `a…` / `c…`, n'est unique que dans son infrastructure (revue, M3)
        for name, given in (("start", start), ("object", object)):
            if given is not None and infrastructure is None:
                detail = f"{name} demande une infrastructure (unique dans la sienne seulement)"
                return one_problem("paramètres de requête invalides", name, "missing_infrastructure", detail)  # type: ignore[return-value]
        query = JournalQuery(
            infrastructure=infrastructure,
            authors=tuple(author or ()),
            categories=tuple(category or ()),
            q=q,
            since=since,
            until=until,
            before=before,
            limit=limit,
            actions=tuple(action or ()),
            object=object,
            start=start,
        )
        try:
            return journal.page(query)
        except JournalCursorError as exc:
            return one_problem("paramètres de requête invalides", "before", "cursor", str(exc))  # type: ignore[return-value]
        except OSError as exc:
            raise HTTPException(status_code=500, detail="journal illisible, intervention nécessaire") from exc


def _placement_routes(router: APIRouter, store: BundleArchive, placements: PlacementStore, settings: Settings) -> None:
    @router.get(
        PLACEMENT,
        tags=[doc.PLACEMENT],
        operation_id="get_placement",
        response_class=Response,
        responses=doc.PLACEMENT_RESPONSES,
        summary="Lire le placement mémorisé d'une infrastructure",
    )
    def get_placement(infrastructure: InfraLabel) -> Response:
        return _json(placement_json(_placement_or_500(lambda: placements.load(infrastructure))))

    @router.post(
        PLACEMENT,
        tags=[doc.PLACEMENT],
        operation_id="record_placement",
        response_class=Response,
        responses=doc.PLACEMENT_WRITE_RESPONSES,
        summary="Mémoriser les places calculées par une page, ou tout replacer",
        description="Une page envoie, après chaque dessin, les équipements qu'elle a placés sans mémoire : la "
        "première place d'un équipement est celle qui reste, une seconde page ne déplace rien. `replace` remplace "
        "tout le document (« replacer »). Aucun nom requis : c'est une donnée dérivée, les épingles de l'intention "
        "gagnent toujours sur elle.",
    )
    async def post_placement(infrastructure: InfraLabel, request: Request) -> Response:
        await _require_runs(store, infrastructure, "placer")
        data = await read_json_body(request, settings.max_intent_bytes)
        try:
            write = PlacementWrite.model_validate(data)
        except ValidationError as exc:
            return problem("corps de requête invalide", list(exc.errors()))
        now = datetime.now(UTC).replace(microsecond=0)
        try:  # le verrou de fichier et le fsync hors de la boucle d'événements (revue, B3)
            placed = await run_in_threadpool(_placement_or_500, lambda: placements.record(infrastructure, write, now))
        except PlacementLimitError as exc:
            return one_problem("corps de requête invalide", "places", "too_long", str(exc))
        except PlacementStaleError as exc:
            return _json(placement_json(exc.current), status_code=409)
        return _json(placement_json(placed))


def create_app(settings: Settings, archive: BundleArchive | None = None) -> FastAPI:
    store = archive or BundleArchive(settings.archive_dir)
    assets = AssetStore(settings.archive_dir)
    intents = IntentStore(settings.archive_dir, asset_exists=assets.exists)
    app = doc.DocumentedApp(
        title="Living Diagram API", version=__version__, description=doc.DESCRIPTION, openapi_tags=doc.TAGS
    )
    app.request_bodies = doc.request_bodies(BUNDLES, INTENT_PATCHES, PLACEMENT, INTENT_ASSETS)
    app.add_exception_handler(RequestValidationError, query_problem)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _server_error)

    @app.get("/api/health", tags=[doc.SYSTEM], operation_id="health", summary="Le service répond")
    def health() -> Health:
        return Health(status="ok")

    _pages(app)
    protected = APIRouter(dependencies=[Depends(_bearer_guard(settings))], responses=doc.PROTECTED)
    _ingestion_routes(protected, store, settings)
    _run_routes(protected, store)
    _diff_routes(protected, store, DiffCache())
    _intent_routes(protected, store, intents, settings)
    _asset_routes(protected, store, assets, intents, settings)
    _placement_routes(protected, store, PlacementStore(settings.archive_dir), settings)
    _journal_routes(protected, JournalReader(settings.archive_dir))
    app.include_router(protected)
    return app


def app_from_env() -> FastAPI:
    """Fabrique pour `uvicorn ld_backend.api:app_from_env --factory`."""
    return create_app(Settings.from_env())

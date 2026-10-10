"""Le document OpenAPI (`/openapi.json`, `/docs`) : groupes, réponses déclarées, schémas des contrats.

Les routes vivent dans `api.py` ; ce module ne dit que ce qu'elles répondent. Toute erreur a la forme `Problem`
(sauf quatre refus qui portent un document, dits route par route) ; un test vérifie qu'aucune route n'y échappe.
"""

from typing import Any

from fastapi import FastAPI
from ld_contracts.bundle import RunBundle
from ld_contracts.diff import Diff
from ld_contracts.intent import Intent
from ld_contracts.snapshot import Snapshot
from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from ld_backend.placement import Placement, PlacementWrite
from ld_backend.schemas import AssetReceipt, IngestReport, IntentOp, IntentOps, Problem

SCHEMA_REF_TEMPLATE = "#/components/schemas/{model}"
CONTRACT_MODELS = (RunBundle, Snapshot, Diff, Intent, IntentOps, Placement, PlacementWrite)
IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp")
BINARY = {"type": "string", "format": "binary"}

INGESTION, RUNS, DIFF, INTENT, IMAGES, PLACEMENT, JOURNAL, SYSTEM = (
    "Ingestion",
    "Runs",
    "Diff",
    "Intention",
    "Images",
    "Placement",
    "Journal",
    "Système",
)
# Dans l'ordre du pipeline : ce qui entre, ce qui est rangé, ce qui se compare, ce que les utilisateurs ajoutent.
TAGS: list[dict[str, str]] = [
    {"name": INGESTION, "description": "Recevoir un RunBundle (contrat v1) : valider, archiver, corréler (B1)."},
    {"name": RUNS, "description": "Les runs archivées d'une infrastructure : liste, bundle, rapport, snapshot."},
    {"name": DIFF, "description": "Comparer deux runs archivées (B3), calculé à la demande."},
    {
        "name": INTENT,
        "description": "La couche d'intention d'une infrastructure (B4) : épingles, couleurs, groupes, annotations, "
        "connecteurs ; écrite par opérations seulement.",
    },
    {"name": IMAGES, "description": "Le magasin d'images des annotations, une empreinte par fichier."},
    {"name": PLACEMENT, "description": "Le placement mémorisé : la place de chaque équipement déjà dessiné."},
    {"name": JOURNAL, "description": "Le journal des modifications de l'intention : qui, quand, quoi."},
    {"name": SYSTEM, "description": "État du service, sans jeton."},
]

DESCRIPTION = """\
L'API de Living Diagram : diagrammes de topologie physique (L1) nourris par la collecte.

**Pipeline.** *Ingestion* reçoit un RunBundle et l'archive avec son snapshot (B1) ; *Runs* relit l'archive ; \
*Diff* compare deux runs ; *Intention*, *Images*, *Placement* portent ce que les utilisateurs ajoutent au \
diagramme ; *Journal* dit qui a modifié l'intention. Référence des données : `contracts/CONTRAT.md`.

**Adressage.** Une run s'adresse par paramètres de requête (`infrastructure`, `run_id`), jamais par le chemin : \
les deux sont des libellés libres venus de l'amont.

**Jeton.** Toutes les routes sauf `/api/health` exigent `Authorization: Bearer <LD_API_TOKEN>` ; ici, bouton \
« Authorize », coller le jeton seul.

**Erreurs.** Un refus a la forme `Problem` (`detail`, et `errors` sur un 422 : chemin et règle, jamais la valeur \
reçue).

**Pages.** Hors de ce document, servies sans jeton et sans donnée : l'application (`/`) et la page de lecture \
de B1 (`/view`) ; le jeton s'y saisit dans la page et n'entre jamais dans l'adresse.
"""


def ref(model: type[BaseModel] | str) -> dict[str, Any]:
    name = model if isinstance(model, str) else model.__name__
    return {"$ref": SCHEMA_REF_TEMPLATE.format(model=name)}


def json_of(model: type[BaseModel], description: str) -> dict[str, Any]:
    return {"description": description, "content": {"application/json": {"schema": ref(model)}}}


def problems(described: dict[int, str]) -> dict[int | str, dict[str, Any]]:
    return {code: {"model": Problem, "description": text} for code, text in described.items()}


# Posées sur toutes les routes protégées (le routeur) ; une route peut les redéfinir.
PROTECTED: dict[int | str, dict[str, Any]] = problems(
    {
        401: "jeton d'API absent ou invalide",
        422: "paramètre de requête invalide ; `errors` liste chemin et règle, sans écho de la valeur",
    }
)
CORRUPT_RUN = "entrée d'archive illisible pour cette run : intervention nécessaire"
NO_RUN = "infrastructure sans aucune run archivée"
BODY_ERRORS = {
    400: "corps qui n'est pas du JSON, ou connexion fermée avant la fin du corps",
    415: "`Content-Type` qui n'est pas `application/json`",
}

HEALTH_RESPONSES: dict[int | str, dict[str, Any]] = {}

INGEST_RESPONSES: dict[int | str, dict[str, Any]] = {
    **problems({**BODY_ERRORS, 413: "corps au-delà de `LD_MAX_BUNDLE_BYTES`"}),
    201: json_of(
        IngestReport,
        "bundle archivé (`created`) ; `correlation` dit ce que B1 en a fait : un échec de B1 (`failed`) laisse le "
        "bundle archivé et ne change pas ce code",
    ),
    200: json_of(
        IngestReport,
        "run déjà archivée avec des données identiques (`already_present`) ; `findings` décrit la livraison reçue, "
        "le rapport archivé reste celui de la première ; le snapshot n'est recalculé que s'il manquait",
    ),
    409: json_of(
        IngestReport,
        "run déjà archivée avec des données différentes (`conflict`) : l'archive ne change pas, `conflict` donne "
        "les deux empreintes",
    ),
    422: json_of(
        IngestReport,
        "bundle hors contrat (`invalid`) : `errors` liste chemin, règle et localisation (section, index), jamais de "
        "valeur du bundle",
    ),
    500: json_of(IngestReport, "entrée d'archive illisible pour cette run (`archive_error`) : intervention nécessaire"),
}

BUNDLE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(RunBundle, "le bundle tel qu'archivé, forme canonique, vérifié par empreinte"),
    **problems({404: "run inconnue pour cette infrastructure", 500: CORRUPT_RUN}),
}
REPORT_RESPONSES = problems({404: "run inconnue pour cette infrastructure", 500: CORRUPT_RUN})

SNAPSHOT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(Snapshot, "Snapshot v1 tel qu'archivé, forme canonique ; référence : `CONTRAT.md`, partie B"),
    **problems(
        {
            404: "run inconnue, ou run archivée sans snapshot (B1 a échoué : `ld correlate` après correction)",
            500: CORRUPT_RUN,
        }
    ),
}

DIFF_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(
        Diff,
        "Diff v1 entre les snapshots des runs `from` et `to`, calculé à la demande et gardé en mémoire tant que les "
        "deux snapshots ne changent pas ; référence : `CONTRAT.md`, partie C",
    ),
    **problems(
        {
            404: "run `from` ou `to` inconnue, ou sans snapshot (`ld correlate`) ; le détail nomme le côté",
            500: "entrée d'archive illisible, ou snapshot archivé hors contrat : intervention nécessaire",
        }
    ),
}

INTENT_CORRUPT = "document d'intention illisible ou incohérent sur disque : intervention nécessaire"
INTENT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(
        Intent,
        "Intent v1 de l'infrastructure, forme canonique ; le document vide (`revision` 0) si rien n'a jamais été "
        "écrit ; référence : `CONTRAT.md`, partie D",
    ),
    **problems({500: INTENT_CORRUPT}),
}

PATCHES_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(
        Intent,
        "le document résultant, `revision` incrémentée, opérations appliquées dans l'ordre (dernier écrivain gagne, "
        "par clé) ; une ligne de journal par requête acceptée",
    ),
    **problems(
        {
            **BODY_ERRORS,
            404: f"{NO_RUN} : rien à modifier",
            413: "corps au-delà de `LD_MAX_INTENT_BYTES`",
            422: "corps hors forme (auteur vide, liste vide, coordonnée hors borne, opération inconnue), identité "
            "inconnue (`unknown_group`, `unknown_annotation`, `unknown_connector`), image absente du magasin "
            "(`unknown_asset`) ou borne du document dépassée ; `errors` liste chemin et règle, jamais une valeur",
            500: INTENT_CORRUPT,
        }
    ),
}

PLACEMENT_CORRUPT = "document de placement illisible ou incohérent sur disque : `ld placement --forget`"
PLACEMENT_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(
        Placement,
        "une place par équipement déjà dessiné ; le document vide (`revision` 0) si rien n'a jamais été dessiné. "
        "Donnée dérivée et jetable (`docs/09`)",
    ),
    **problems({500: PLACEMENT_CORRUPT}),
}

PLACEMENT_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: json_of(
        Placement,
        "le document résultant : sans `replace`, seuls les équipements sans place mémorisée entrent (la première "
        "place reste) et rien n'est écrit si la requête n'apporte rien ; avec `replace`, le document devient "
        "exactement `places`",
    ),
    409: json_of(
        Placement,
        "la page a dessiné sur un document qui a changé depuis (`base_revision` ≠ `revision`) et la requête "
        "apporterait quelque chose : rien n'est écrit, le corps est le document courant, à partir duquel redessiner",
    ),
    **problems(
        {
            **BODY_ERRORS,
            404: f"{NO_RUN} : rien à placer",
            413: "corps au-delà de `LD_MAX_INTENT_BYTES` (même borne que l'intention)",
            422: "corps hors forme (coordonnée non entière ou hors borne, équipement nommé deux fois, `replace` "
            "absent), ou document qui dépasserait 10 000 équipements ; `errors` liste chemin et règle",
            500: PLACEMENT_CORRUPT,
        }
    ),
}

ASSET_POST_RESPONSES: dict[int | str, dict[str, Any]] = {
    201: json_of(AssetReceipt, "fichier rangé sous son empreinte (`asset`), type reconnu aux octets, dimensions lues"),
    200: json_of(AssetReceipt, "fichier déjà présent : la même empreinte"),
    **problems(
        {
            400: "connexion fermée avant la fin du corps",
            404: NO_RUN,
            413: "corps au-delà de `LD_MAX_ASSET_BYTES` (4 Mo par défaut)",
            415: "`Content-Type` qui n'est pas `image/png`, `image/jpeg` ou `image/webp`",
            422: "octets de tête qui ne sont ni PNG, ni JPEG, ni WebP (`asset_unrecognized`) : un SVG est refusé",
        }
    ),
}
ASSET_GET_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "les octets du fichier, `Content-Type` vérifié à la lecture, `nosniff`, cache immuable",
        "content": {media: {"schema": BINARY} for media in IMAGE_TYPES},
    },
    **problems(
        {
            404: "empreinte inconnue pour cette infrastructure",
            500: "fichier du magasin illisible : intervention nécessaire",
        }
    ),
}
ASSET_DELETE_RESPONSES: dict[int | str, dict[str, Any]] = {
    204: {"description": "fichier retiré"},
    **problems(
        {
            404: "empreinte inconnue pour cette infrastructure",
            409: "une annotation cite encore ce fichier (`asset_in_use`)",
            500: INTENT_CORRUPT,
        }
    ),
}

JOURNAL_RESPONSES = problems(
    {
        422: "paramètre invalide (catégorie inconnue, date sans fuseau, curseur illisible), sans écho",
        500: "journal illisible : intervention nécessaire",
    }
)


def op_names() -> list[str]:
    """Les noms d'opérations d'intention, lus dans l'union du contrat : la description ne peut pas en oublier."""
    return [member.model_fields["op"].annotation.__args__[0] for member in IntentOp.__origin__.__args__]


def _family(prefix: str) -> str:
    return ", ".join(f"`{name}`" for name in op_names() if name.startswith(prefix))


def patches_description() -> str:
    return (
        "Le document ne s'écrit que par opérations, appliquées dans l'ordre et journalisées (auteur, date, "
        "opérations) :\n\n"
        "- épingles : `pin`, `unpin` ;\n"
        "- couleurs : `color`, `uncolor` (un équipement), `color_type`, `uncolor_type` (un type) ;\n"
        f"- groupes (docs/10 §5) : {_family('group_')} ;\n"
        f"- annotations (docs/10 §6) : {_family('annotation_')} ;\n"
        f"- connecteurs (docs/10 §6.6) : {_family('connector_')}.\n\n"
        "Une infrastructure sans run archivée est refusée (404)."
    )


# Les corps lus à la main (en flux, avec une limite) : FastAPI ne les voit pas, ils sont déclarés ici.
def _json_body(model: type[BaseModel], description: str) -> dict[str, Any]:
    return {"required": True, "description": description, "content": {"application/json": {"schema": ref(model)}}}


def request_bodies(bundles: str, patches: str, placement: str, assets: str) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (bundles, "post"): _json_body(RunBundle, "RunBundle v1 : la référence est `contracts/CONTRAT.md`."),
        (patches, "post"): _json_body(
            IntentOps, "Une requête d'écriture de la couche d'intention : auteur et opérations, dans l'ordre."
        ),
        (placement, "post"): _json_body(
            PlacementWrite,
            "Les places des équipements qu'une page vient de placer sans mémoire ; `replace` pour « replacer ».",
        ),
        (assets, "post"): {
            "required": True,
            "description": "Le fichier brut ; reconnu à ses octets de tête, jamais à son nom ni à son type déclaré.",
            "content": {media: {"schema": BINARY} for media in IMAGE_TYPES},
        },
    }


def contract_schemas() -> dict[str, Any]:
    """Modèles des contrats sous `components.schemas`, références réécrites pour le document OpenAPI.

    Une seule génération pour tous : les types partagés (bundle, snapshot, diff) n'apparaissent qu'une fois.
    """
    _, top = models_json_schema([(model, "validation") for model in CONTRACT_MODELS], ref_template=SCHEMA_REF_TEMPLATE)
    return top["$defs"]


def with_contract(base: dict[str, Any], bodies: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any]:
    """Nouveau document : schémas du contrat fusionnés et corps lus à la main déclarés. `base` n'est pas modifié."""
    components = base.get("components", {})
    schemas = components.get("schemas", {})
    contract = contract_schemas()
    clashes = sorted(name for name in contract if name in schemas and schemas[name] != contract[name])
    if clashes:
        raise RuntimeError(f"collision de schémas OpenAPI entre l'API et le contrat : {clashes}")
    paths = dict(base["paths"])
    for (route, method), body in bodies.items():
        paths[route] = {**paths[route], method: {**paths[route][method], "requestBody": body}}
    return {**base, "components": {**components, "schemas": {**schemas, **contract}}, "paths": paths}


class DocumentedApp(FastAPI):
    """FastAPI dont le document OpenAPI porte les contrats et les corps lus à la main ; construit une fois."""

    request_bodies: dict[tuple[str, str], dict[str, Any]] = {}

    def openapi(self) -> dict[str, Any]:
        cached = self.openapi_schema
        base = super().openapi()
        if base is not cached:
            self.openapi_schema = with_contract(base, self.request_bodies)
        return self.openapi_schema

"""Formes de réponse de l'API : typées, donc présentes dans OpenAPI et dans les types TS générés.

Aucune de ces formes ne porte de valeur du bundle, à l'exception de `hostname` et `ref` d'un constat, qui ne
quittent pas la zone. Les dates écrites par le backend sont en UTC, forme du contrat (`Z`).
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from ld_contracts.enums import DeviceType
from ld_contracts.intent.annotations import (
    Anchor,
    AnnotationContent,
    AnnotationId,
    ShapeLabel,
    Size,
    TextAlign,
    TextValign,
    ZOrder,
)
from ld_contracts.intent.connectors import BEND_BOUND, ConnectorEnd, ConnectorId, Head, Heads, LineStyle, Route
from ld_contracts.intent.intent import (
    Author,
    Coordinate,
    GroupDescription,
    GroupId,
    GroupLabel,
    GroupShape,
    Hue,
    LabelColor,
    LabelFont,
    LabelPlacement,
    LabelPosition,
    LabelWeight,
    PinHostname,
    StrokeStyle,
)
from pydantic import BaseModel, ConfigDict, Field

Status = Literal["created", "already_present", "invalid", "conflict", "archive_error"]


def utc_z(moment: datetime) -> str:
    """ISO 8601 en UTC avec `Z` : une seule forme pour tout ce que le backend écrit lui-même."""
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class IngestError(ApiModel):
    path: str = Field(description="Chemin du champ ou du document fautif (`interfaces.0.duplex`, `lldp.0.hostname`).")
    message: str = Field(description="La règle enfreinte, sans valeur du bundle.")
    detail: dict[str, str | int] = Field(description="Localisateurs seulement : `section`, `index`.")


class IngestFinding(ApiModel):
    code: str
    message: str = Field(description="Texte lisible, sans valeur du bundle.")
    hostname: str | None = Field(description="Device concerné ; null pour un constat agrégé.")
    ref: str | None = Field(description="Objet concerné (interface, membre, liste de devices).")
    details: dict[str, str | int] = Field(
        description="Forme structurée du message, sans valeur : `nullable_key_absent` donne `field`, "
        "`occurrences`, `devices`."
    )


class IngestSummary(ApiModel):
    contract_version: str
    produced_at: str
    run_status: str
    devices: int
    devices_in_scope: int
    tasks: int
    interfaces: int
    aggregates: int
    lldp: int
    cdp: int
    system: int
    ha: int
    residual_normalizations: dict[str, int]


class IngestConflict(ApiModel):
    """Pourquoi un 409 : la run est archivée avec d'autres données. L'archive ne change pas."""

    received_sha256: str = Field(description="Empreinte des données reçues, hors enveloppe.")
    archived_sha256: str = Field(description="Empreinte des données archivées.")
    archived_stored_at: str = Field(description="Date de la première ingestion, celle qui fait foi.")


CorrelationStatus = Literal["created", "already_present", "failed"]


class CorrelationSummary(ApiModel):
    """Ce que B1 a fait de la livraison. Les comptes sont null quand rien n'a été calculé."""

    status: CorrelationStatus = Field(
        description="`created` : snapshot calculé et rangé ; `already_present` : la run avait déjà le sien, non "
        "recalculé ; `failed` : B1 a échoué, le bundle reste archivé, la trace est au journal du serveur."
    )
    nodes: int | None
    links: int | None
    checks: dict[str, int] | None = Field(description="Nombre de contrôles par sévérité (`error`, `warning`, `info`).")


class IngestReport(ApiModel):
    """Rapport d'ingestion : la réponse du POST, et le document archivé à côté du bundle."""

    status: Status
    infrastructure: str | None
    run_id: str | None
    summary: IngestSummary | None = Field(description="Comptes par section ; null si le bundle n'a pas été lu.")
    errors: list[IngestError]
    findings: list[IngestFinding] = Field(
        description="Constats de la livraison reçue. Sur un 200, ils peuvent différer du rapport archivé."
    )
    conflict: IngestConflict | None = Field(description="Renseigné sur un 409 seulement.")
    # Seul champ à défaut : les rapports archivés avant le branchement de B1 n'ont pas la clé et doivent se relire.
    correlation: CorrelationSummary | None = Field(
        default=None,
        description="Renseigné quand le bundle est archivé (201, 200). Toujours null dans le rapport archivé : il "
        "décrit l'ingestion, et l'état de la corrélation est la présence du snapshot, qui se recalcule.",
    )


# La couche d'intention (B4, docs/08) s'écrit par opérations, jamais par remplacement du document : deux personnes
# qui épinglent deux équipements différents ne s'écrasent pas. Les types des valeurs sont **ceux du contrat Intent**
# (bornes, caractères admis) : ce que le document refuse, la requête ne le laisse pas passer (revue B4, H2).


class PinOp(ApiModel):
    """Poser ou remplacer l'épingle d'un équipement : sa place voulue, en unités du dessin."""

    op: Literal["pin"]
    hostname: PinHostname = Field(description="Identité stable du nœud (`nodes[].hostname`), à l'octet.")
    x: Coordinate
    y: Coordinate


class UnpinOp(ApiModel):
    """Retirer l'épingle d'un équipement ; sans effet si elle n'existe pas."""

    op: Literal["unpin"]
    hostname: PinHostname


class ColorOp(ApiModel):
    """Colorer un équipement : une teinte nommée, qui l'emporte sur celle de son type (docs/10)."""

    op: Literal["color"]
    hostname: PinHostname
    hue: Hue


class UncolorOp(ApiModel):
    """Rendre un équipement à la couleur de son type ; sans effet s'il n'en avait pas en propre."""

    op: Literal["uncolor"]
    hostname: PinHostname


class ColorTypeOp(ApiModel):
    """Colorer tous les équipements d'un type (la palette des types de l'infrastructure)."""

    op: Literal["color_type"]
    type: DeviceType
    hue: Hue


class UncolorTypeOp(ApiModel):
    """Rendre un type à sa teinte par défaut (celle du moteur) ; sans effet s'il n'en avait pas."""

    op: Literal["uncolor_type"]
    type: DeviceType


class GroupStylePatch(ApiModel):
    """Un style partiel (docs/10 §5) : chaque clé est facultative ; absente = inchangée (ou le défaut à la création)."""

    shape: GroupShape | None = None
    radius: Annotated[int, Field(strict=True, ge=0, le=80)] | None = None
    hue: Hue | None = None
    fill_opacity: Annotated[int, Field(strict=True, ge=0, le=100)] | None = None
    stroke_width: Annotated[int, Field(strict=True, ge=0, le=8)] | None = None
    stroke_style: StrokeStyle | None = None
    padding: Annotated[int, Field(strict=True, ge=0, le=300)] | None = None
    label_position: LabelPosition | None = None
    label_placement: LabelPlacement | None = None
    label_size: Annotated[int, Field(strict=True, ge=8, le=64)] | None = None
    label_weight: LabelWeight | None = None
    label_font: LabelFont | None = None
    label_color: LabelColor | None = None


Members = Annotated[list[PinHostname], Field(min_length=1, max_length=10_000)]


class GroupCreateOp(ApiModel):
    """Créer un groupe (docs/10 §5) : un libellé, des membres ; description et style facultatifs (défauts sinon).
    Le serveur attribue l'identité `g<revision>-<n>`."""

    op: Literal["group_create"]
    label: GroupLabel
    members: Members
    description: GroupDescription = ""
    style: GroupStylePatch = Field(default_factory=GroupStylePatch)


class GroupUpdateOp(ApiModel):
    """Modifier un groupe : libellé, description, liste des membres, style, chacun facultatif (absent = inchangé)."""

    op: Literal["group_update"]
    id: GroupId
    label: GroupLabel | None = None
    description: GroupDescription | None = None
    members: Members | None = None
    style: GroupStylePatch | None = None


class GroupAddOp(ApiModel):
    """Ajouter des membres à un groupe sans réécrire sa liste (deux ajouts simultanés ne s'écrasent pas)."""

    op: Literal["group_add"]
    id: GroupId
    members: Members


class GroupRemoveOp(ApiModel):
    """Retirer des membres d'un groupe ; retirer le dernier est refusé (supprimer le groupe, explicitement)."""

    op: Literal["group_remove"]
    id: GroupId
    members: Members


class GroupDeleteOp(ApiModel):
    """Supprimer un groupe ; refusé si l'`id` est inconnu (supprimé entre-temps)."""

    op: Literal["group_delete"]
    id: GroupId


class AnnotationStylePatch(ApiModel):
    """Un style d'annotation partiel (docs/10 §6) : chaque clé facultative ; absente = inchangée (ou le défaut de la
    sorte à la création)."""

    hue: Hue | None = None
    fill_opacity: Annotated[int, Field(strict=True, ge=0, le=100)] | None = None
    stroke_width: Annotated[int, Field(strict=True, ge=0, le=8)] | None = None
    stroke_style: StrokeStyle | None = None
    radius: Annotated[int, Field(strict=True, ge=0, le=80)] | None = None
    opacity: Annotated[int, Field(strict=True, ge=10, le=100)] | None = None
    text_size: Annotated[int, Field(strict=True, ge=8, le=64)] | None = None
    text_weight: LabelWeight | None = None
    text_font: LabelFont | None = None
    text_color: LabelColor | None = None
    text_align: TextAlign | None = None
    text_valign: TextValign | None = None


def _free_anchor() -> Anchor:
    return Anchor(kind="free", ref=None)  # type: ignore[arg-type]


class AnnotationCreateOp(ApiModel):
    """Créer une annotation (docs/10 §6) : un contenu (note, forme, tableau, image) ; ancrage, boîte, plan, verrou,
    ligne de rappel et style facultatifs (libre, taille de la sorte, devant, déverrouillée, sans rappel, défauts du
    style). Le serveur attribue l'identité `a<revision>-<n>`."""

    op: Literal["annotation_create"]
    content: AnnotationContent
    anchor: Anchor = Field(default_factory=_free_anchor)
    x: Coordinate = 0
    y: Coordinate = 0
    w: Size | None = None
    h: Size | None = None
    z: ZOrder = ZOrder.FRONT
    locked: Annotated[bool, Field(strict=True)] = False
    leader: Annotated[bool, Field(strict=True)] = False
    style: AnnotationStylePatch = Field(default_factory=AnnotationStylePatch)


class AnnotationUpdateOp(ApiModel):
    """Modifier une annotation : chaque champ facultatif (absent = inchangé) ; le contenu se remplace en entier et
    garde sa sorte (`annotation_kind_change`)."""

    op: Literal["annotation_update"]
    id: AnnotationId
    content: AnnotationContent | None = None
    anchor: Anchor | None = None
    x: Coordinate | None = None
    y: Coordinate | None = None
    w: Size | None = None
    h: Size | None = None
    z: ZOrder | None = None
    locked: Annotated[bool, Field(strict=True)] | None = None
    leader: Annotated[bool, Field(strict=True)] | None = None
    style: AnnotationStylePatch | None = None


class AnnotationDeleteOp(ApiModel):
    """Supprimer une annotation ; refusé si l'`id` est inconnu (supprimée entre-temps)."""

    op: Literal["annotation_delete"]
    id: AnnotationId


class ConnectorStylePatch(ApiModel):
    """Un style de connecteur partiel (docs/10 §6, 1.4.0) : chaque clé facultative ; absente = inchangée (ou le
    défaut à la création)."""

    hue: Hue | None = None
    stroke_width: Annotated[int, Field(strict=True, ge=1, le=8)] | None = None
    stroke_style: LineStyle | None = None
    opacity: Annotated[int, Field(strict=True, ge=10, le=100)] | None = None
    text_size: Annotated[int, Field(strict=True, ge=8, le=64)] | None = None
    text_weight: LabelWeight | None = None
    text_font: LabelFont | None = None
    text_color: LabelColor | None = None


def _default_heads() -> Heads:
    return Heads(start=Head.NONE, end=Head.ARROW)


class ConnectorCreateOp(ApiModel):
    """Créer un connecteur (docs/10 §6) : ses deux bouts obligatoires (libres, ou attachés à un équipement, un groupe,
    une annotation) ; pointes (une flèche à l'arrivée), tracé (droit), courbure (0), étiquette, plan (devant), verrou
    et style facultatifs. Le serveur attribue l'identité `c<revision>-<n>`."""

    op: Literal["connector_create"]
    start: ConnectorEnd
    end: ConnectorEnd
    heads: Heads = Field(default_factory=_default_heads)
    route: Route = Route.STRAIGHT
    bend: Annotated[int, Field(strict=True, ge=-BEND_BOUND, le=BEND_BOUND)] = 0
    label: ShapeLabel = ""
    z: ZOrder = ZOrder.FRONT
    locked: Annotated[bool, Field(strict=True)] = False
    style: ConnectorStylePatch = Field(default_factory=ConnectorStylePatch)


class ConnectorUpdateOp(ApiModel):
    """Modifier un connecteur : chaque champ facultatif (absent = inchangé) ; un bout se remplace en entier."""

    op: Literal["connector_update"]
    id: ConnectorId
    start: ConnectorEnd | None = None
    end: ConnectorEnd | None = None
    heads: Heads | None = None
    route: Route | None = None
    bend: Annotated[int, Field(strict=True, ge=-BEND_BOUND, le=BEND_BOUND)] | None = None
    label: ShapeLabel | None = None
    z: ZOrder | None = None
    locked: Annotated[bool, Field(strict=True)] | None = None
    style: ConnectorStylePatch | None = None


class ConnectorDeleteOp(ApiModel):
    """Supprimer un connecteur ; refusé si l'`id` est inconnu (supprimé entre-temps)."""

    op: Literal["connector_delete"]
    id: ConnectorId


IntentOp = Annotated[
    PinOp
    | UnpinOp
    | ColorOp
    | UncolorOp
    | ColorTypeOp
    | UncolorTypeOp
    | GroupCreateOp
    | GroupUpdateOp
    | GroupAddOp
    | GroupRemoveOp
    | GroupDeleteOp
    | AnnotationCreateOp
    | AnnotationUpdateOp
    | AnnotationDeleteOp
    | ConnectorCreateOp
    | ConnectorUpdateOp
    | ConnectorDeleteOp,
    Field(discriminator="op"),
]


class IntentOps(ApiModel):
    """Une requête d'écriture : qui, et quelles opérations, appliquées dans l'ordre (la dernière gagne)."""

    author: Author = Field(description="Nom déclaré dans la page, 80 caractères au plus ; écrit sur chaque patch posé.")
    ops: list[IntentOp] = Field(
        min_length=1, max_length=500, description="Une à cinq cents opérations, appliquées dans l'ordre."
    )


class AssetReceipt(ApiModel):
    """Un fichier d'image rangé dans le magasin d'une infrastructure (docs/10 §6) : son empreinte (à citer dans une
    annotation `image`), son type reconnu aux octets, sa taille, ses dimensions."""

    asset: str = Field(description="SHA-256 hexadécimal du fichier : l'identité à citer dans `ImageContent.asset`.")
    media_type: Literal["image/png", "image/jpeg", "image/webp"]
    bytes: int
    width: int
    height: int


class RunEntry(ApiModel):
    run_id: str
    run_start: str = Field(description="Début de la collecte : clé de tri de la liste et de la timeline.")
    run_end: str | None
    run_status: str
    produced_at: str = Field(description="Date d'export du bundle archivé.")
    stored_at: str = Field(description="Date d'ingestion.")
    sha256: str = Field(description="Empreinte des données, hors enveloppe.")


class RunList(ApiModel):
    infrastructure: str
    runs: list[RunEntry] = Field(description="Triées par début de collecte, puis par `run_id`.")


class ProblemField(ApiModel):
    path: str = Field(description="Chemin du paramètre ou du champ fautif, en identifiants pointés (`ops.0.x`).")
    message: str = Field(description="La règle enfreinte, jamais la valeur reçue.")


class Problem(ApiModel):
    """Le corps de toute erreur de l'API : un détail lisible, et pour un 422 la liste des champs fautifs."""

    detail: str = Field(description="Ce qui ne va pas, en une phrase, sans valeur reçue.")
    errors: list[ProblemField] | None = Field(default=None, description="Présent sur un 422 seulement.")


class Health(ApiModel):
    status: Literal["ok"]

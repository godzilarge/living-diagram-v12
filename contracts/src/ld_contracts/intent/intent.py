"""Intent v1 : ce que l'humain veut en plus de ce que la collecte montre, pour une infrastructure (docs/08, docs/10).

Un document par infrastructure, jamais par run. Trois sortes de patch, chacune dans sa liste, keyées par une identité
stable (le `hostname` du nœud, le `type` du contrat d'entrée, l'`id` d'un groupe ou d'une annotation), jamais par une
coordonnée ni par une run : l'épingle (1.0.0), la couleur d'un type et la couleur d'un équipement (1.1.0), le groupe
(1.2.0, docs/10 §5), l'annotation (1.3.0, docs/10 §6 : note, forme, tableau, image, libre ou attachée ;
`annotations.py`), le connecteur (1.4.0 : une ligne ou une flèche à deux bouts, libres ou attachés ; `connectors.py`).
D'autres sortes viendront comme des listes à côté (additif, mineure). Toutes les clés sont écrites, aucun défaut, pas
d'`extras` ; l'ordre de chaque liste est refusé par le type, comme dans le snapshot.
"""

from enum import StrEnum

from pydantic import Field, StrictInt, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, NonEmptyStr, SemVer, UtcDatetime
from ld_contracts.enums import DeviceType
from ld_contracts.intent.annotations import MAX_ANNOTATIONS, Annotation
from ld_contracts.intent.base import (
    AUTHOR_MAX_LENGTH,
    COORDINATE_BOUND,
    DESCRIPTION_MAX_LENGTH,
    HOSTNAME_MAX_LENGTH,
    LABEL_MAX_LENGTH,
    MAX_GROUPS,
    MAX_PINS,
    PRINTABLE,
    Author,
    Coordinate,
    GroupDescription,
    GroupId,
    GroupLabel,
    Hue,
    LabelColor,
    LabelFont,
    LabelWeight,
    PinHostname,
    StrokeStyle,
)
from ld_contracts.intent.connectors import DEFAULT_CONNECTOR_STYLE, MAX_CONNECTORS, Connector
from ld_contracts.snapshot.order import require_canonical

INTENT_VERSION = "1.5.0"
INTENT_MAJOR = int(INTENT_VERSION.split(".")[0])
__all__ = [
    "AUTHOR_MAX_LENGTH",
    "COORDINATE_BOUND",
    "DESCRIPTION_MAX_LENGTH",
    "HOSTNAME_MAX_LENGTH",
    "LABEL_MAX_LENGTH",
    "MAX_GROUPS",
    "MAX_PINS",
    "PRINTABLE",
    "Author",
    "Coordinate",
    "GroupDescription",
    "GroupId",
    "GroupLabel",
    "Hue",
    "LabelColor",
    "LabelFont",
    "LabelWeight",
    "PinHostname",
    "StrokeStyle",
    "INTENT_VERSION",
    "INTENT_MAJOR",
    "Pin",
    "TypeColor",
    "DeviceColor",
    "GroupShape",
    "LabelPosition",
    "LabelPlacement",
    "GroupStyle",
    "DEFAULT_GROUP_STYLE",
    "Group",
    "Intent",
    "empty_intent",
    "upgraded",
]


class Pin(ContractModel):
    """Une épingle : la place voulue d'un équipement sur le dessin, par qui, quand."""

    hostname: PinHostname = Field(
        description="Identité stable du nœud épinglé (`nodes[].hostname` du snapshot), à l'octet ; 253 caractères au "
        "plus, sans caractère de contrôle."
    )
    x: Coordinate = Field(description="Abscisse en unités du dessin, entière, bornée à ±1 000 000.")
    y: Coordinate = Field(description="Ordonnée en unités du dessin, entière, bornée à ±1 000 000.")
    author: Author = Field(
        description="Qui a posé ou déplacé l'épingle (nom déclaré dans la page), 80 caractères au plus, blancs de bord "
        "retirés, sans caractère de contrôle."
    )
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")


class TypeColor(ContractModel):
    """La couleur voulue pour tous les équipements d'un type (la palette des types de l'infrastructure), par qui,
    quand."""

    type: DeviceType = Field(description="Type du contrat d'entrée (`devices[].type`) ; un seul patch par type.")
    hue: Hue = Field(description="Teinte nommée, parmi les douze du contrat.")
    author: Author = Field(description="Qui a choisi la teinte, 80 caractères au plus, sans caractère de contrôle.")
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")


class DeviceColor(ContractModel):
    """La couleur voulue d'un équipement, qui l'emporte sur celle de son type, par qui, quand."""

    hostname: PinHostname = Field(description="Identité stable du nœud (`nodes[].hostname` du snapshot), à l'octet.")
    hue: Hue = Field(description="Teinte nommée, parmi les douze du contrat.")
    author: Author = Field(description="Qui a choisi la teinte, 80 caractères au plus, sans caractère de contrôle.")
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")


class GroupShape(StrEnum):
    RECTANGLE = "rectangle"
    ELLIPSE = "ellipse"


class LabelPosition(StrEnum):
    TOP_LEFT = "top_left"
    TOP = "top"
    TOP_RIGHT = "top_right"
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM = "bottom"
    BOTTOM_RIGHT = "bottom_right"


class LabelPlacement(StrEnum):
    INSIDE = "inside"
    OUTSIDE = "outside"


class GroupStyle(ContractModel):
    """Le style d'un groupe (docs/10 §5) : toutes clés écrites ; le serveur complète avec les défauts à la création."""

    shape: GroupShape = Field(description="Rectangle (coins `radius`) ou ellipse circonscrite à la boîte des membres.")
    radius: StrictInt = Field(ge=0, le=80, description="Rayon des coins du rectangle, en unités du dessin.")
    hue: Hue = Field(description="Teinte nommée du cadre (remplissage, bordure, étiquette si `label_color` = hue).")
    fill_opacity: StrictInt = Field(ge=0, le=100, description="Opacité du remplissage, en pourcent.")
    stroke_width: StrictInt = Field(ge=0, le=8, description="Épaisseur de la bordure, en unités du dessin.")
    stroke_style: StrokeStyle = Field(description="Trait de la bordure : plein, tirets, pointillés, aucun.")
    padding: StrictInt = Field(ge=0, le=300, description="Marge entre les cartes des membres et le cadre.")
    label_position: LabelPosition = Field(description="Où l'étiquette s'ancre sur le cadre (neuf positions).")
    label_placement: LabelPlacement = Field(description="Étiquette à l'intérieur ou à l'extérieur du cadre.")
    label_size: StrictInt = Field(ge=8, le=64, description="Taille de l'étiquette, en pixels du dessin.")
    label_weight: LabelWeight = Field(description="Graisse de l'étiquette.")
    label_font: LabelFont = Field(description="Police de l'étiquette : sans (Inter) ou mono (JetBrains Mono).")
    label_color: LabelColor = Field(description="Couleur de l'étiquette : la teinte du cadre, ou l'encre du thème.")


DEFAULT_GROUP_STYLE: dict[str, object] = {
    "shape": "rectangle",
    "radius": 16,
    "hue": "slate",
    "fill_opacity": 8,
    "stroke_width": 2,
    "stroke_style": "dashed",
    "padding": 24,
    "label_position": "top_left",
    "label_placement": "inside",
    "label_size": 12,
    "label_weight": "semibold",
    "label_font": "sans",
    "label_color": "hue",
}


class Group(ContractModel):
    """Un groupe (docs/10 §5) : des membres et un style ; le cadre se calcule depuis les membres, jamais stocké."""

    id: GroupId = Field(description="Identité stable attribuée par le serveur à la création : `g<revision>-<n>`.")
    label: GroupLabel = Field(description="Le nom du groupe, 1 à 80 caractères, modifiable sans changer l'identité.")
    description: GroupDescription = Field(description="Texte libre, 500 caractères au plus (retours à la ligne admis).")
    members: tuple[PinHostname, ...] = Field(
        min_length=1, max_length=MAX_PINS, description="Les membres, par `hostname`, triés, uniques, un au moins."
    )
    style: GroupStyle
    author: Author = Field(description="Qui a créé ou modifié le groupe en dernier.")
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")

    @model_validator(mode="after")
    def _members_sorted(self) -> Group:
        require_canonical(self.members, key=lambda member: member, section="members")
        return self


class Intent(ContractModel):
    """La couche d'intention d'une infrastructure : ses patchs keyés par identité stable, avec leur auteur et leur date.

    Le document ne s'écrit que par opérations (`pin`, `unpin`, `color`, `uncolor`, `color_type`, `uncolor_type`,
    `group_create`, `group_update`, `group_add`, `group_remove`, `group_delete`, `annotation_create`,
    `annotation_update`, `annotation_delete`, `connector_create`, `connector_update`, `connector_delete`) ; chaque
    requête acceptée incrémente
    `revision`. Il n'est lu ni par B1 ni par B3 : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.
    """

    intent_version: SemVer = Field(
        description="Version semver du contrat Intent, indépendante des trois autres contrats."
    )
    infrastructure: NonEmptyStr = Field(description="Infrastructure du document : une épingle ne vaut que pour elle.")
    revision: StrictInt = Field(ge=0, description="Nombre de requêtes d'écriture acceptées ; 0 = jamais écrit.")
    updated_at: UtcDatetime | None = Field(
        description="Date UTC de la dernière écriture ; null si et seulement si `revision` vaut 0."
    )
    pins: tuple[Pin, ...] = Field(
        max_length=MAX_PINS, description="Les épingles, triées par `hostname`, uniques ; 10 000 au plus (`too_long`)."
    )
    type_colors: tuple[TypeColor, ...] = Field(
        max_length=len(DeviceType),
        description="La palette des types : une couleur par type au plus, triées par `type`, uniques (docs/10).",
    )
    device_colors: tuple[DeviceColor, ...] = Field(
        max_length=MAX_PINS,
        description="Les couleurs par équipement, triées par `hostname`, uniques ; 10 000 au plus (`too_long`).",
    )
    groups: tuple[Group, ...] = Field(
        max_length=MAX_GROUPS, description="Les groupes (docs/10 §5), triés par `id`, uniques ; 1 000 au plus."
    )
    annotations: tuple[Annotation, ...] = Field(
        max_length=MAX_ANNOTATIONS,
        description="Les annotations (docs/10 §6 : notes, formes, tableaux, images), triées par `id`, uniques ; "
        "2 000 au plus.",
    )
    connectors: tuple[Connector, ...] = Field(
        max_length=MAX_CONNECTORS,
        description="Les connecteurs (docs/10 §6 : lignes et flèches à deux bouts), triés par `id`, uniques ; "
        "2 000 au plus.",
    )

    @field_validator("intent_version")
    @classmethod
    def _major_is_supported(cls, value: str) -> str:
        major = int(value.split(".")[0])
        if major != INTENT_MAJOR:
            raise PydanticCustomError(
                "intent_major_unsupported",
                "version majeure de l'intention non supportée",
                {"received": major, "expected": INTENT_MAJOR},
            )
        return value

    @model_validator(mode="after")
    def _consistent(self) -> Intent:
        require_canonical(self.pins, key=lambda pin: pin.hostname, section="pins")
        require_canonical(self.type_colors, key=lambda color: color.type, section="type_colors")
        require_canonical(self.device_colors, key=lambda color: color.hostname, section="device_colors")
        require_canonical(self.groups, key=lambda group: group.id, section="groups")
        require_canonical(self.annotations, key=lambda annotation: annotation.id, section="annotations")
        require_canonical(self.connectors, key=lambda connector: connector.id, section="connectors")
        if (self.revision == 0) != (self.updated_at is None):
            raise PydanticCustomError(
                "revision_update_mismatch",
                "`updated_at` est null si et seulement si `revision` vaut 0",
                {"revision": self.revision, "updated_at_is_null": self.updated_at is None},
            )
        # Un patch n'est jamais plus récent que la dernière écriture du document qui le porte.
        for section, patches in (
            ("pins", self.pins),
            ("type_colors", self.type_colors),
            ("device_colors", self.device_colors),
            ("groups", self.groups),
            ("annotations", self.annotations),
            ("connectors", self.connectors),
        ):
            for index, patch in enumerate(patches):
                if self.updated_at is not None and patch.at > self.updated_at:
                    raise PydanticCustomError(
                        "patch_after_update",
                        "un patch est daté après `updated_at`",
                        {"section": section, "index": index},
                    )
        return self


def empty_intent(infrastructure: str) -> Intent:
    """Le document d'une infrastructure où rien n'a été écrit : ce que l'API sert avant la première épingle."""
    return Intent(
        intent_version=INTENT_VERSION,
        infrastructure=infrastructure,
        revision=0,
        updated_at=None,
        pins=(),
        type_colors=(),
        device_colors=(),
        groups=(),
        annotations=(),
        connectors=(),
    )


def upgraded(data: dict) -> dict:
    """Un document d'une mineure antérieure relu dans la mineure courante : les listes qu'il ignore, vides
    (docs/10, décision 7 ; 1.0.x sans couleurs, 1.1.x sans groupes, 1.2.x sans annotations, 1.3.x sans connecteurs,
    1.4.x sans ancre sur les bouts attachés : `side` = `auto`, le contour vers l'autre bout, ce qu'ils dessinaient).

    En 1.3.x, une ligne ou une flèche était une forme dans sa boîte : elle devient un connecteur (`c<revision>-<n>`,
    mêmes numéros que l'annotation), ses bouts aux coins de la boîte ; attachée, son bout de départ reste attaché à
    son ancre et le bout d'arrivée est posé libre au point relatif lu tel quel (à replacer). Un tableau reçoit des
    colonnes et des lignes égales, sans fusion. Rien n'est effacé.

    Pour le store, qui relit ce qu'il a écrit avant la mineure ; la validation d'un fichier reste stricte. Tout autre
    document est rendu tel quel.
    """
    version = data.get("intent_version")
    if not isinstance(version, str) or not version.startswith("1."):
        return data
    minor = version.split(".")[1]
    if not minor.isdigit() or int(minor) >= int(INTENT_VERSION.split(".")[1]):
        return data
    added: dict[str, object] = {}
    if int(minor) < 4:
        added.update(_annotations_upgraded(data.get("annotations")))
    if int(minor) < 5:
        added["connectors"] = _connectors_upgraded(added.get("connectors", data.get("connectors")))
    if int(minor) < 3:
        added.update({"annotations": [], "connectors": []})
    if int(minor) < 2:
        added["groups"] = []
    if int(minor) < 1:
        added.update({"type_colors": [], "device_colors": []})
    return {**data, "intent_version": INTENT_VERSION, **added}


def _annotations_upgraded(annotations: object) -> dict[str, object]:
    """Les annotations d'un 1.3.x relues en 1.4.0 : formes `line` / `arrow` → connecteurs, tableaux complétés."""
    if not isinstance(annotations, list):
        return {}
    kept: list[object] = []
    connectors: list[object] = []
    for raw in annotations:
        if not isinstance(raw, dict) or not isinstance(raw.get("content"), dict):
            kept.append(raw)
            continue
        content = raw["content"]
        if content.get("kind") == "table":
            kept.append({**raw, "content": {"widths": None, "heights": None, "merges": [], **content}})
        elif content.get("kind") == "shape" and content.get("shape") in ("line", "arrow"):
            connectors.append(_connector_from_shape(raw, content))
        elif content.get("kind") == "shape":
            kept.append({**raw, "content": {k: v for k, v in content.items() if k != "direction"}})
        else:
            kept.append(raw)
    return {"annotations": kept, "connectors": connectors}


def _connectors_upgraded(connectors: object) -> list[object]:
    """Les connecteurs d'un 1.4.x relus en 1.5.0 : un bout attaché sans ancre part du contour (`auto`)."""
    if not isinstance(connectors, list):
        return []
    out: list[object] = []
    for raw in connectors:
        if not isinstance(raw, dict):
            out.append(raw)
            continue
        ends = {
            k: {"side": "auto", **raw[k]}
            for k in ("start", "end")
            if isinstance(raw.get(k), dict) and raw[k].get("kind") != "free"
        }
        out.append({**raw, **ends})
    return out


def _connector_from_shape(raw: dict, content: dict) -> dict:
    up = content.get("direction") == "up"
    x, y, w, h = (raw.get(k, 0) for k in ("x", "y", "w", "h"))
    anchor = raw.get("anchor") if isinstance(raw.get("anchor"), dict) else {"kind": "free"}
    start: dict[str, object] = {"kind": "free", "x": x, "y": y + h if up else y}
    if anchor.get("kind") in ("device", "group") and anchor.get("ref"):
        start = {"kind": anchor["kind"], "ref": anchor["ref"]}
    style = raw.get("style") if isinstance(raw.get("style"), dict) else {}
    keys = ("hue", "stroke_width", "opacity", "text_size", "text_weight", "text_font", "text_color")
    picked = {k: style[k] for k in keys if k in style}
    if style.get("stroke_style") in ("solid", "dashed", "dotted"):
        picked["stroke_style"] = style["stroke_style"]
    if picked.get("stroke_width") == 0:
        picked["stroke_width"] = 1
    return {
        "id": "c" + str(raw.get("id", "a0-0"))[1:],
        "start": start,
        "end": {"kind": "free", "x": x + w, "y": y if up else y + h},
        "heads": {"start": "none", "end": "arrow" if content.get("shape") == "arrow" else "none"},
        "route": "straight",
        "bend": 0,
        "label": content.get("label", ""),
        "z": raw.get("z", "front"),
        "locked": raw.get("locked", False),
        "style": {**DEFAULT_CONNECTOR_STYLE, **picked},
        "author": raw.get("author"),
        "at": raw.get("at"),
    }

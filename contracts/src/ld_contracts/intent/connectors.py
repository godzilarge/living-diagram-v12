"""Les connecteurs (docs/10 §6, 1.4.0 ; ancres 1.5.0) : une ligne ou une flèche entre deux points du diagramme,
dessinée par l'humain.

Un connecteur a deux bouts, chacun **libre** (un point du plan) ou **attaché** à un équipement (par `hostname`), à un
groupe ou à une annotation (par `id`) : il suit ce qui bouge et part du bord de l'élément, d'une **ancre** choisie (le
milieu d'un côté : `n`, `e`, `s`, `w`) ou du point du contour qui regarde l'autre bout (`auto`). Il a une pointe à
chaque bout ou non, un tracé (droit, coudé, courbe) et une courbure, une étiquette, un plan, un verrou, un style, un
auteur et une date. Identité `c<revision>-<n>` attribuée par le serveur. Comme une annotation, rien de ce qu'il porte
n'entre dans le snapshot, le diff ni le placement mémorisé : c'est une intention, pas un câble (un câble déclaré est
une autre sorte, à venir).
"""

import re
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, StrictBool, StrictInt, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, UtcDatetime
from ld_contracts.intent.annotations import AnchorRef, ShapeLabel, ZOrder
from ld_contracts.intent.base import Author, Coordinate, Hue, LabelColor, LabelFont, LabelWeight

MAX_CONNECTORS = 2_000
BEND_BOUND = 2_000

ConnectorId = Annotated[str, StringConstraints(pattern=r"^c[0-9]+-[0-9]+$")]
GROUP_ID = r"^g[0-9]+-[0-9]+$"
ANNOTATION_ID = r"^a[0-9]+-[0-9]+$"


class FreeEnd(ContractModel):
    """Un bout libre : un point du plan."""

    kind: Literal["free"]
    x: Coordinate = Field(description="Abscisse du point, en unités du dessin.")
    y: Coordinate = Field(description="Ordonnée du point.")


class Side(StrEnum):
    """L'ancre d'un bout attaché : le contour vers l'autre bout (`auto`), ou le milieu d'un côté (1.5.0)."""

    AUTO = "auto"
    NORTH = "n"
    EAST = "e"
    SOUTH = "s"
    WEST = "w"


class AttachedEnd(ContractModel):
    """Un bout attaché : le tracé part de l'ancre de l'élément (un côté), ou de son contour vers l'autre bout."""

    kind: Literal["device", "group", "annotation"]
    ref: AnchorRef = Field(
        description="Le `hostname` de l'équipement, l'`id` du groupe (`g<revision>-<n>`) ou de l'annotation "
        "(`a<revision>-<n>`)."
    )
    side: Side = Field(
        description="L'ancre : `auto` = le point du contour qui regarde l'autre bout ; `n`, `e`, `s`, `w` = le milieu "
        "de ce côté de la boîte, d'où le tracé coudé part perpendiculairement (1.5.0)."
    )

    @model_validator(mode="after")
    def _ref_matches_kind(self) -> AttachedEnd:
        pattern = GROUP_ID if self.kind == "group" else ANNOTATION_ID if self.kind == "annotation" else None
        if pattern and not re.match(pattern, self.ref):
            message = "un bout attaché à un groupe ou à une annotation en porte l'`id`"
            raise PydanticCustomError("end_ref_mismatch", message, {"kind": self.kind})
        return self


ConnectorEnd = Annotated[FreeEnd | AttachedEnd, Field(discriminator="kind")]


class Head(StrEnum):
    NONE = "none"
    ARROW = "arrow"


class Heads(ContractModel):
    """La pointe à chaque bout : aucune (une ligne), une flèche à l'arrivée, au départ, ou aux deux."""

    start: Head
    end: Head


class Route(StrEnum):
    STRAIGHT = "straight"
    ELBOW = "elbow"
    CURVE = "curve"


class LineStyle(StrEnum):
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"


class ConnectorStyle(ContractModel):
    """Le style d'un connecteur : toutes clés écrites ; le serveur complète avec les défauts à la création."""

    hue: Hue = Field(description="Teinte nommée du trait, des pointes et de l'étiquette (si `text_color` = hue).")
    stroke_width: StrictInt = Field(ge=1, le=8, description="Épaisseur du trait.")
    stroke_style: LineStyle = Field(description="Trait plein, tirets ou pointillés (jamais aucun : invisible).")
    opacity: StrictInt = Field(ge=10, le=100, description="Opacité du connecteur entier, en pourcent.")
    text_size: StrictInt = Field(ge=8, le=64, description="Taille de l'étiquette, en pixels du dessin.")
    text_weight: LabelWeight = Field(description="Graisse de l'étiquette.")
    text_font: LabelFont = Field(description="Police de l'étiquette : sans (Inter) ou mono (JetBrains Mono).")
    text_color: LabelColor = Field(description="Couleur de l'étiquette : la teinte, ou l'encre du thème.")


DEFAULT_CONNECTOR_STYLE: dict[str, object] = {
    "hue": "slate",
    "stroke_width": 2,
    "stroke_style": "solid",
    "opacity": 100,
    "text_size": 12,
    "text_weight": "semibold",
    "text_font": "sans",
    "text_color": "hue",
}
DEFAULT_HEADS: dict[str, str] = {"start": "none", "end": "arrow"}


class Connector(ContractModel):
    """Un connecteur (docs/10 §6) : deux bouts, des pointes, un tracé, une étiquette, un style ; signé, daté."""

    id: ConnectorId = Field(description="Identité stable attribuée par le serveur à la création : `c<revision>-<n>`.")
    start: ConnectorEnd = Field(
        description="Le bout de départ : libre, ou attaché à un équipement, un groupe, une annotation."
    )
    end: ConnectorEnd = Field(
        description="Le bout d'arrivée, de même ; jamais le même élément que le départ (`connector_same_ends`)."
    )
    heads: Heads
    route: Route = Field(description="Droit ; coudé (deux angles droits) ; courbe (un arc).")
    bend: StrictInt = Field(
        ge=-BEND_BOUND,
        le=BEND_BOUND,
        description="Courbe : écart du milieu de l'arc à la corde, perpendiculaire, signé ; coudé : décalage du "
        "segment médian ; droit : ignoré.",
    )
    label: ShapeLabel = Field(description="Étiquette au milieu du tracé (vide admis), 80 caractères au plus.")
    z: ZOrder = Field(description="`back` : sous les cadres et les cartes ; `front` : au-dessus de tout.")
    locked: StrictBool = Field(description="Verrouillé : ni bout ni courbure ne se glissent sur la toile.")
    style: ConnectorStyle
    author: Author = Field(description="Qui a créé ou modifié le connecteur en dernier.")
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")

    @model_validator(mode="after")
    def _two_distinct_ends(self) -> Connector:
        a, b = self.start, self.end
        if a.kind != "free" and b.kind != "free" and a.kind == b.kind and a.ref == b.ref:  # type: ignore[union-attr]
            raise PydanticCustomError("connector_same_ends", "les deux bouts visent le même élément", {})
        return self

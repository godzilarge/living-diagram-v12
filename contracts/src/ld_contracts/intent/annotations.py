"""Les annotations (docs/10 §6) : ce que seul l'humain sait et que la collecte ne saura jamais, posé sur la toile.

Une annotation est une note, une forme, un tableau ou une image, avec une boîte (`x`, `y`, `w`, `h`), un ancrage (libre
dans le plan, ou attachée à un équipement ou à un groupe : elle suit ce qui bouge), un plan (dessous, dessus), un
verrou, une ligne de rappel vers son ancre, un style complet, un auteur et une date. Identité `a<revision>-<n>`
attribuée par le serveur. Ce qu'elle porte n'entre jamais dans le snapshot, le diff ni le placement mémorisé.
Les lignes et les flèches ne sont plus des formes depuis 1.4.0 : ce sont des connecteurs (`connectors.py`), à deux
bouts, chacun libre ou attaché à un élément du diagramme.
"""

import re
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, StrictBool, StrictInt, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, UtcDatetime
from ld_contracts.intent.base import (
    HOSTNAME_MAX_LENGTH,
    MULTILINE,
    PRINTABLE,
    PRINTABLE_OR_EMPTY,
    Author,
    Coordinate,
    Hue,
    LabelColor,
    LabelFont,
    LabelWeight,
    StrokeStyle,
)

MAX_ANNOTATIONS = 2_000
SIZE_MIN, SIZE_MAX = 20, 4_000
NOTE_MAX_LENGTH = 2_000
CELL_MAX_LENGTH = 120
TABLE_MAX_ROWS, TABLE_MAX_COLUMNS = 30, 8
SHAPE_LABEL_MAX_LENGTH = 80
ALT_MAX_LENGTH = 120

AnnotationId = Annotated[str, StringConstraints(pattern=r"^a[0-9]+-[0-9]+$")]
AnchorRef = Annotated[str, StringConstraints(min_length=1, max_length=HOSTNAME_MAX_LENGTH, pattern=PRINTABLE)]
Size = Annotated[StrictInt, Field(ge=SIZE_MIN, le=SIZE_MAX)]
NoteText = Annotated[str, StringConstraints(min_length=1, max_length=NOTE_MAX_LENGTH, pattern=MULTILINE)]
ShapeLabel = Annotated[str, StringConstraints(max_length=SHAPE_LABEL_MAX_LENGTH, pattern=PRINTABLE_OR_EMPTY)]
Cell = Annotated[str, StringConstraints(max_length=CELL_MAX_LENGTH, pattern=PRINTABLE_OR_EMPTY)]
AssetId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
AltText = Annotated[str, StringConstraints(max_length=ALT_MAX_LENGTH, pattern=PRINTABLE_OR_EMPTY)]
GROUP_ID = r"^g[0-9]+-[0-9]+$"


class AnchorKind(StrEnum):
    FREE = "free"
    DEVICE = "device"
    GROUP = "group"


class Anchor(ContractModel):
    """À quoi l'annotation est attachée : rien (libre, dans le plan), un équipement (par `hostname`), un groupe (par
    `id`). `ref` est null si et seulement si l'annotation est libre (`anchor_ref_mismatch`)."""

    kind: AnchorKind = Field(
        description="`free` : coordonnées du plan ; `device` : relative au centre de la carte ; "
        "`group` : relative au coin haut gauche du cadre."
    )
    ref: AnchorRef | None = Field(description="Le `hostname` de l'équipement ou l'`id` du groupe ; null si libre.")

    @model_validator(mode="after")
    def _ref_matches_kind(self) -> Anchor:
        if (self.kind == AnchorKind.FREE) != (self.ref is None):
            message = "`ref` est null si et seulement si l'ancrage est `free`"
            raise PydanticCustomError("anchor_ref_mismatch", message, {"kind": str(self.kind)})
        if self.kind == AnchorKind.GROUP and self.ref is not None and not re.match(GROUP_ID, self.ref):
            message = "l'ancre d'un groupe est un `id` de groupe (`g<revision>-<n>`)"
            raise PydanticCustomError("anchor_ref_mismatch", message, {"kind": "group"})
        return self


class ZOrder(StrEnum):
    BACK = "back"
    FRONT = "front"


class ShapeKind(StrEnum):
    RECTANGLE = "rectangle"
    ELLIPSE = "ellipse"


class TextAlign(StrEnum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class TextValign(StrEnum):
    TOP = "top"
    MIDDLE = "middle"
    BOTTOM = "bottom"


class AnnotationStyle(ContractModel):
    """Le style d'une annotation (docs/10 §6) : toutes clés écrites ; le serveur complète avec les défauts de la sorte
    à la création."""

    hue: Hue = Field(description="Teinte nommée (remplissage, bordure, texte si `text_color` = hue).")
    fill_opacity: StrictInt = Field(ge=0, le=100, description="Opacité du remplissage, en pourcent.")
    stroke_width: StrictInt = Field(ge=0, le=8, description="Épaisseur de la bordure (ou du trait d'une ligne).")
    stroke_style: StrokeStyle = Field(description="Trait de la bordure : plein, tirets, pointillés, aucun.")
    radius: StrictInt = Field(ge=0, le=80, description="Rayon des coins d'un rectangle, d'une note, d'une image.")
    opacity: StrictInt = Field(ge=10, le=100, description="Opacité de l'annotation entière, en pourcent.")
    text_size: StrictInt = Field(ge=8, le=64, description="Taille du texte, en pixels du dessin.")
    text_weight: LabelWeight = Field(description="Graisse du texte.")
    text_font: LabelFont = Field(description="Police du texte : sans (Inter) ou mono (JetBrains Mono).")
    text_color: LabelColor = Field(description="Couleur du texte : la teinte, ou l'encre du thème.")
    text_align: TextAlign = Field(description="Alignement horizontal du texte dans la boîte.")
    text_valign: TextValign = Field(description="Alignement vertical du texte dans la boîte.")


class NoteContent(ContractModel):
    """Une note : du texte brut, multi-ligne, jamais du HTML ni du Markdown."""

    kind: Literal["note"]
    text: NoteText = Field(
        description="1 à 2 000 caractères ; retours à la ligne admis, aucun autre caractère de contrôle."
    )


class ShapeContent(ContractModel):
    """Une forme : rectangle ou ellipse, avec une étiquette (une ligne ou une flèche est un connecteur)."""

    kind: Literal["shape"]
    shape: ShapeKind
    label: ShapeLabel = Field(description="Étiquette au centre (vide admis), 80 caractères au plus.")


Weight = Annotated[StrictInt, Field(ge=1, le=SIZE_MAX)]
Index = Annotated[StrictInt, Field(ge=0)]


class Merge(ContractModel):
    """Des cellules fusionnées : la cellule haut gauche (`row`, `col`) couvre `rows` × `cols` cellules ; le texte est
    celui de la cellule haut gauche, les cellules couvertes gardent le leur sans le montrer."""

    row: Index = Field(description="Ligne de la cellule haut gauche, depuis 0.")
    col: Index = Field(description="Colonne de la cellule haut gauche, depuis 0.")
    rows: Annotated[StrictInt, Field(ge=1, le=TABLE_MAX_ROWS)] = Field(description="Lignes couvertes, 1 au moins.")
    cols: Annotated[StrictInt, Field(ge=1, le=TABLE_MAX_COLUMNS)] = Field(description="Colonnes couvertes, 1 au moins.")


class TableContent(ContractModel):
    """Un tableau de texte : lignes × colonnes, toutes les lignes de même longueur (`table_ragged`) ; des largeurs de
    colonne et des hauteurs de ligne relatives (poids, la boîte reste la mesure), des cellules fusionnées."""

    kind: Literal["table"]
    header: StrictBool = Field(description="La première ligne est un en-tête.")
    rows: tuple[tuple[Cell, ...], ...] = Field(
        min_length=1, max_length=TABLE_MAX_ROWS, description="1 à 30 lignes de 1 à 8 cellules, 120 caractères au plus."
    )
    widths: tuple[Weight, ...] | None = Field(
        description="Un poids par colonne (1..4000) : la largeur de la boîte se partage au prorata ; null = colonnes "
        "égales. Autant de poids que de colonnes (`table_dims_mismatch`)."
    )
    heights: tuple[Weight, ...] | None = Field(
        description="Un poids par ligne, de même ; null = lignes égales. Autant de poids que de lignes."
    )
    merges: tuple[Merge, ...] = Field(
        max_length=TABLE_MAX_ROWS * TABLE_MAX_COLUMNS,
        description="Les fusions, triées par (`row`, `col`), dans le tableau, sans chevauchement, couvrant deux "
        "cellules au moins (`table_merge_outside`, `table_merge_overlap`, `table_merge_trivial`).",
    )

    @model_validator(mode="after")
    def _rectangular(self) -> TableContent:
        widths = {len(row) for row in self.rows}
        if len(widths) != 1:
            raise PydanticCustomError("table_ragged", "toutes les lignes ont le même nombre de cellules", {})
        columns = next(iter(widths))
        if columns < 1 or columns > TABLE_MAX_COLUMNS:
            raise PydanticCustomError("too_long" if columns else "too_short", "1 à 8 colonnes", {"columns": columns})
        if self.widths is not None and len(self.widths) != columns:
            raise PydanticCustomError("table_dims_mismatch", "autant de largeurs que de colonnes", {"axis": "widths"})
        if self.heights is not None and len(self.heights) != len(self.rows):
            raise PydanticCustomError("table_dims_mismatch", "autant de hauteurs que de lignes", {"axis": "heights"})
        self._merges_fit(len(self.rows), columns)
        return self

    def _merges_fit(self, rows: int, columns: int) -> None:
        covered: set[tuple[int, int]] = set()
        previous: tuple[int, int] | None = None
        for index, merge in enumerate(self.merges):
            if merge.rows * merge.cols < 2:
                message = "une fusion couvre deux cellules au moins"
                raise PydanticCustomError("table_merge_trivial", message, {"index": index})
            if merge.row + merge.rows > rows or merge.col + merge.cols > columns:
                raise PydanticCustomError("table_merge_outside", "une fusion sort du tableau", {"index": index})
            key = (merge.row, merge.col)
            if previous is not None and key <= previous:
                raise PydanticCustomError(
                    "not_canonical_order", "liste hors de l'ordre canonique", {"section": "merges", "index": index}
                )
            previous = key
            span_rows, span_cols = range(merge.row, merge.row + merge.rows), range(merge.col, merge.col + merge.cols)
            cells = {(r, c) for r in span_rows for c in span_cols}
            if covered & cells:
                raise PydanticCustomError("table_merge_overlap", "deux fusions se chevauchent", {"index": index})
            covered |= cells


class ImageContent(ContractModel):
    """Une image du magasin de fichiers de l'infrastructure, par son empreinte ; PNG, JPEG ou WebP, jamais SVG."""

    kind: Literal["image"]
    asset: AssetId = Field(description="SHA-256 hexadécimal du fichier, tel que `POST /api/intent/assets` l'a rendu.")
    alt: AltText = Field(description="Texte de remplacement, 120 caractères au plus (vide admis).")


AnnotationContent = Annotated[NoteContent | ShapeContent | TableContent | ImageContent, Field(discriminator="kind")]
ANNOTATION_KINDS = ("note", "shape", "table", "image")

DEFAULT_ANNOTATION_STYLE: dict[str, dict[str, object]] = {
    "note": {
        "hue": "amber",
        "fill_opacity": 12,
        "stroke_width": 1,
        "stroke_style": "solid",
        "radius": 8,
        "opacity": 100,
        "text_size": 13,
        "text_weight": "regular",
        "text_font": "sans",
        "text_color": "ink",
        "text_align": "left",
        "text_valign": "top",
    },
    "shape": {
        "hue": "slate",
        "fill_opacity": 8,
        "stroke_width": 2,
        "stroke_style": "solid",
        "radius": 12,
        "opacity": 100,
        "text_size": 12,
        "text_weight": "semibold",
        "text_font": "sans",
        "text_color": "hue",
        "text_align": "center",
        "text_valign": "middle",
    },
    "table": {
        "hue": "slate",
        "fill_opacity": 0,
        "stroke_width": 1,
        "stroke_style": "solid",
        "radius": 6,
        "opacity": 100,
        "text_size": 12,
        "text_weight": "regular",
        "text_font": "mono",
        "text_color": "ink",
        "text_align": "left",
        "text_valign": "top",
    },
    "image": {
        "hue": "slate",
        "fill_opacity": 0,
        "stroke_width": 0,
        "stroke_style": "none",
        "radius": 8,
        "opacity": 100,
        "text_size": 12,
        "text_weight": "regular",
        "text_font": "sans",
        "text_color": "ink",
        "text_align": "left",
        "text_valign": "top",
    },
}
DEFAULT_ANNOTATION_SIZE: dict[str, tuple[int, int]] = {"note": (220, 80), "shape": (200, 120), "image": (320, 240)}
TABLE_CELL_W, TABLE_ROW_H = 80, 26


def default_size(content: NoteContent | ShapeContent | TableContent | ImageContent) -> tuple[int, int]:
    """La taille d'une annotation créée sans `w` ni `h` : par sorte ; un tableau, selon ses lignes et colonnes."""
    if isinstance(content, TableContent):
        return (TABLE_CELL_W * len(content.rows[0]), TABLE_ROW_H * len(content.rows))
    return DEFAULT_ANNOTATION_SIZE[content.kind]


class Annotation(ContractModel):
    """Une annotation (docs/10 §6) : un contenu, une boîte, un ancrage, un style ; signée, datée."""

    id: AnnotationId = Field(description="Identité stable attribuée par le serveur à la création : `a<revision>-<n>`.")
    anchor: Anchor
    x: Coordinate = Field(description="Abscisse du coin haut gauche : dans le plan si libre, sinon relative à l'ancre.")
    y: Coordinate = Field(description="Ordonnée du coin haut gauche, même repère.")
    w: Size = Field(description="Largeur, 20 à 4 000 unités du dessin.")
    h: Size = Field(description="Hauteur, 20 à 4 000 unités du dessin.")
    z: ZOrder = Field(description="`back` : sous les cadres et les cartes ; `front` : au-dessus de tout.")
    locked: StrictBool = Field(description="Verrouillée : ni glissé ni redimensionnement sur la toile.")
    leader: StrictBool = Field(description="Ligne de rappel vers l'ancre ; faux si libre (`leader_without_anchor`).")
    content: AnnotationContent
    style: AnnotationStyle
    author: Author = Field(description="Qui a créé ou modifié l'annotation en dernier.")
    at: UtcDatetime = Field(description="Quand : date UTC écrite par le serveur à l'application de l'opération.")

    @model_validator(mode="after")
    def _leader_needs_anchor(self) -> Annotation:
        if self.leader and self.anchor.kind == AnchorKind.FREE:
            raise PydanticCustomError("leader_without_anchor", "une annotation libre n'a pas de ligne de rappel", {})
        return self

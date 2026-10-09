"""Les briques partagées du contrat Intent : bornes, textes admis, teintes et énumérations de style, communes aux
épingles, aux couleurs, aux groupes (`intent.py`) et aux annotations (`annotations.py`)."""

from enum import StrEnum
from typing import Annotated

from pydantic import Field, StrictInt, StringConstraints

COORDINATE_BOUND = 1_000_000
AUTHOR_MAX_LENGTH = 80
HOSTNAME_MAX_LENGTH = 253  # la longueur d'un nom DNS : un hostname plus long n'est pas un nom
MAX_PINS = (
    10_000  # au-delà, ce n'est plus une couche d'intention tenue à la main ; borne la relecture à chaque écriture
)
MAX_GROUPS = 1_000
LABEL_MAX_LENGTH = 80
DESCRIPTION_MAX_LENGTH = 500
# Aucun caractère de contrôle (C0, DEL) dans ce qui s'affiche et se journalise : un retour à la ligne casserait une
# ligne de `ld intent`, une séquence d'échappement un terminal. Les blancs de bord sont retirés.
PRINTABLE = r"^[^\x00-\x1f\x7f]+$"
PRINTABLE_OR_EMPTY = r"^[^\x00-\x1f\x7f]*$"
# Un texte multi-ligne : le retour à la ligne est admis, aucun autre caractère de contrôle.
MULTILINE = r"^[^\x00-\x09\x0b-\x1f\x7f]*$"

Coordinate = Annotated[StrictInt, Field(ge=-COORDINATE_BOUND, le=COORDINATE_BOUND)]
Author = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=AUTHOR_MAX_LENGTH, pattern=PRINTABLE)
]
PinHostname = Annotated[str, StringConstraints(min_length=1, max_length=HOSTNAME_MAX_LENGTH, pattern=PRINTABLE)]
GroupId = Annotated[str, StringConstraints(pattern=r"^g[0-9]+-[0-9]+$")]
GroupLabel = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=LABEL_MAX_LENGTH, pattern=PRINTABLE)
]
GroupDescription = Annotated[str, StringConstraints(max_length=DESCRIPTION_MAX_LENGTH, pattern=MULTILINE)]


class Hue(StrEnum):
    """Les douze teintes nommées d'une couleur d'intention ; le moteur donne à chacune sa valeur sombre et sa valeur
    claire, le contrat ne connaît que le nom (jamais une valeur libre : docs/10, décision 4)."""

    BLUE = "blue"
    SKY = "sky"
    INDIGO = "indigo"
    VIOLET = "violet"
    PINK = "pink"
    RED = "red"
    ORANGE = "orange"
    AMBER = "amber"
    LIME = "lime"
    GREEN = "green"
    TEAL = "teal"
    SLATE = "slate"


class StrokeStyle(StrEnum):
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"
    NONE = "none"


class LabelWeight(StrEnum):
    REGULAR = "regular"
    SEMIBOLD = "semibold"
    BOLD = "bold"


class LabelFont(StrEnum):
    SANS = "sans"
    MONO = "mono"


class LabelColor(StrEnum):
    HUE = "hue"
    INK = "ink"

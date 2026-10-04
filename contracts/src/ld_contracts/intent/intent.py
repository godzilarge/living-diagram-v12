"""Intent v1 : ce que l'humain veut en plus de ce que la collecte montre, pour une infrastructure (docs/08).

Un document par infrastructure, jamais par run. V1 ne connaît qu'une sorte de patch, l'épingle, keyée par le
`hostname` du nœud (identité stable, à l'octet), jamais par une coordonnée ni par une run. D'autres sortes viendront
comme des listes à côté (additif, mineure). Toutes les clés sont écrites, aucun défaut, pas d'`extras` ; l'ordre des
épingles est refusé par le type, comme dans le snapshot.
"""

from typing import Annotated

from pydantic import Field, StrictInt, StringConstraints, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, NonEmptyStr, SemVer, UtcDatetime
from ld_contracts.snapshot.order import require_canonical

INTENT_VERSION = "1.0.0"
INTENT_MAJOR = int(INTENT_VERSION.split(".")[0])
COORDINATE_BOUND = 1_000_000
AUTHOR_MAX_LENGTH = 80
HOSTNAME_MAX_LENGTH = 253  # la longueur d'un nom DNS : un hostname plus long n'est pas un nom
MAX_PINS = (
    10_000  # au-delà, ce n'est plus une couche d'intention tenue à la main ; borne la relecture à chaque écriture
)
# Aucun caractère de contrôle (C0, DEL) dans ce qui s'affiche et se journalise : un retour à la ligne casserait une
# ligne de `ld intent`, une séquence d'échappement un terminal. Les blancs de bord sont retirés.
PRINTABLE = r"^[^\x00-\x1f\x7f]+$"

Coordinate = Annotated[StrictInt, Field(ge=-COORDINATE_BOUND, le=COORDINATE_BOUND)]
Author = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=AUTHOR_MAX_LENGTH, pattern=PRINTABLE)
]
PinHostname = Annotated[str, StringConstraints(min_length=1, max_length=HOSTNAME_MAX_LENGTH, pattern=PRINTABLE)]


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


class Intent(ContractModel):
    """La couche d'intention d'une infrastructure : ses patchs keyés par identité stable, avec leur auteur et leur date.

    Le document ne s'écrit que par opérations (`pin`, `unpin`) ; chaque requête acceptée incrémente `revision`.
    Il n'est lu ni par B1 ni par B3 : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.
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
        if (self.revision == 0) != (self.updated_at is None):
            raise PydanticCustomError(
                "revision_update_mismatch",
                "`updated_at` est null si et seulement si `revision` vaut 0",
                {"revision": self.revision, "updated_at_is_null": self.updated_at is None},
            )
        # Une épingle n'est jamais plus récente que la dernière écriture du document qui la porte.
        for index, pin in enumerate(self.pins):
            if self.updated_at is not None and pin.at > self.updated_at:
                raise PydanticCustomError(
                    "pin_after_update", "une épingle est datée après `updated_at`", {"section": "pins", "index": index}
                )
        return self


def empty_intent(infrastructure: str) -> Intent:
    """Le document d'une infrastructure où rien n'a été écrit : ce que l'API sert avant la première épingle."""
    return Intent(intent_version=INTENT_VERSION, infrastructure=infrastructure, revision=0, updated_at=None, pins=())

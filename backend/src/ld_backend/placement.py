"""Le placement mémorisé (`docs/09`) : la place de chaque équipement déjà dessiné, par infrastructure.

La toile calcule le placement dans le navigateur ; sans mémoire, chaque run repartait de zéro et un seul switch
ajouté redessinait tout. Ici, un document par infrastructure, jamais par run, à côté de l'intention
(`<archive>/_placement/<infra>/placement.json`) :
- **la première place d'un équipement est celle qui reste** : une page n'enregistre que les équipements qu'elle a
  placés sans mémoire ; ce qui est déjà mémorisé ne se déplace pas (`record`). « Replacer » remplace tout (`replace`) ;
- **une page ne complète que le document qu'elle a lu** (`base_revision`) : si le document a changé entre-temps, la
  requête est refusée avec le document courant (`PlacementStaleError`, 409) et la page replace ses nouveaux venus autour
  de lui, puis renvoie. Sinon deux premières pages sur deux runs différentes mêleraient deux dessins incompatibles
  (revue, H1) ;
- c'est une donnée **dérivée et jetable** : la perdre coûte un replacement, aucune épingle (celles-ci vivent dans
  l'intention, qui gagne toujours sur la mémoire). Donc ni contrat dans `ld-contracts`, ni journal, ni auteur ;
- lire ne crée rien ; écrire est atomique et sous verrou, comme l'intention ; un document illisible ou incohérent est
  isolé (`PlacementCorruptError`) jusqu'à `ld placement --forget`, qui est la sortie prévue.
"""

import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Annotated

from ld_contracts.intent.intent import Coordinate, PinHostname
from pydantic import Field, StrictBool, StrictInt, ValidationError, field_validator
from pydantic_core import PydanticCustomError

from ld_backend.archive import _segment
from ld_backend.files import locked, write_atomically
from ld_backend.schemas import ApiModel, utc_z

log = logging.getLogger(__name__)

PLACEMENT_DIR = "_placement"
PLACEMENT_FILE = "placement.json"
MAX_PLACES = 10_000  # la borne de l'intention : au-delà, ce n'est plus un diagramme


class PlacementCorruptError(Exception):
    """Le document de placement d'une infrastructure est illisible ou incohérent ; isolé jusqu'à `--forget`."""


class PlacementLimitError(ValueError):
    """La requête ferait dépasser au document sa borne : refusée, rien n'est écrit."""


class Place(ApiModel):
    """La place mémorisée d'un équipement, en unités du dessin (mêmes bornes que l'épingle)."""

    hostname: PinHostname = Field(description="Identité stable du nœud (`nodes[].hostname`), à l'octet.")
    x: Coordinate
    y: Coordinate


def _unique_sorted(places: tuple[Place, ...], *, sorted_required: bool) -> tuple[Place, ...]:
    names = [place.hostname for place in places]
    if len(set(names)) != len(names):
        raise PydanticCustomError("place_duplicate", "un équipement n'a qu'une place")
    if sorted_required and names != sorted(names):
        raise PydanticCustomError("places_not_sorted", "les places sont triées par hostname")
    return places


class Placement(ApiModel):
    """Le placement mémorisé d'une infrastructure : une place par équipement déjà dessiné, triées par hostname."""

    infrastructure: Annotated[str, Field(min_length=1)]
    revision: StrictInt = Field(ge=0, description="Nombre d'écritures acceptées ; 0 = jamais écrit.")
    updated_at: str | None = Field(description="Date UTC (`Z`) de la dernière écriture ; null si `revision` vaut 0.")
    places: tuple[Place, ...] = Field(max_length=MAX_PLACES, description="Triées par hostname, uniques.")

    @field_validator("places")
    @classmethod
    def _sorted_unique(cls, places: tuple[Place, ...]) -> tuple[Place, ...]:
        return _unique_sorted(places, sorted_required=True)


class PlacementStaleError(Exception):
    """La page a dessiné sur un document qui a changé depuis : refusée, rien n'est écrit ; `current` est le document
    à partir duquel redessiner."""

    def __init__(self, current: Placement) -> None:
        super().__init__("le placement mémorisé a changé depuis la lecture de la page")
        self.current = current


class PlacementWrite(ApiModel):
    """Ce qu'une page envoie après avoir dessiné : les places des équipements qu'elle a placés sans mémoire."""

    base_revision: StrictInt = Field(
        ge=0,
        description="La `revision` du document que la page a lu avant de dessiner : si le document a changé depuis "
        "et que la requête apporterait quelque chose, elle est refusée (409) avec le document courant.",
    )
    replace: StrictBool = Field(
        description="false : n'entrent que les équipements sans place mémorisée (la première place reste) ; "
        "true : le document devient exactement `places` (« replacer »)."
    )
    places: tuple[Place, ...] = Field(max_length=MAX_PLACES, description="Un équipement au plus une fois.")

    @field_validator("places")
    @classmethod
    def _unique(cls, places: tuple[Place, ...]) -> tuple[Place, ...]:
        return _unique_sorted(places, sorted_required=False)


def empty_placement(infrastructure: str) -> Placement:
    return Placement(infrastructure=infrastructure, revision=0, updated_at=None, places=())


def placement_json(doc: Placement) -> str:
    """Même forme que les documents des contrats : clés triées, UTF-8, indentation 2, fin de ligne."""
    return json.dumps(doc.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, indent=2) + "\n"


class PlacementStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self._local = threading.Lock()

    def _folder(self, infrastructure: str) -> Path:
        return self.root / PLACEMENT_DIR / _segment(infrastructure)

    def load(self, infrastructure: str) -> Placement:
        """Le document de l'infrastructure, ou le document vide si rien n'a jamais été dessiné."""
        path = self._folder(infrastructure) / PLACEMENT_FILE
        if not path.exists():
            return empty_placement(infrastructure)
        try:
            doc = Placement.model_validate(json.loads(path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, ValidationError) as exc:
            log.warning("document de placement illisible ou incohérent, isolé : %r (%s)", str(path), type(exc).__name__)
            raise PlacementCorruptError(str(path)) from exc
        if doc.infrastructure != infrastructure:
            log.warning("document de placement d'une autre infrastructure à cet emplacement, isolé : %r", str(path))
            raise PlacementCorruptError(str(path))
        return doc

    def record(self, infrastructure: str, request: PlacementWrite, now: datetime) -> Placement:
        """Applique la requête et retourne le document ; rien n'est écrit quand elle n'apporte rien, ni quand la page a
        dessiné sur un document déjà changé (`PlacementStaleError`)."""
        folder = self._folder(infrastructure)
        with locked(folder, self._local):
            current = self.load(infrastructure)
            updated = _applied(current, request, now)
            if updated is not current:
                write_atomically(folder / PLACEMENT_FILE, placement_json(updated))
        return updated

    def forget(self, infrastructure: str) -> bool:
        """Retire le document, lisible ou non ; False s'il n'y en avait pas."""
        folder = self._folder(infrastructure)
        with locked(folder, self._local):
            path = folder / PLACEMENT_FILE
            if not path.exists():
                return False
            path.unlink()
        return True


def _applied(current: Placement, request: PlacementWrite, now: datetime) -> Placement:
    if request.replace:
        places = {place.hostname: place for place in request.places}
    else:
        places = {place.hostname: place for place in current.places}
        fresh = [place for place in request.places if place.hostname not in places]
        if not fresh:
            return current
        places.update((place.hostname, place) for place in fresh)
    if request.base_revision != current.revision:
        raise PlacementStaleError(current)
    if len(places) > MAX_PLACES:
        raise PlacementLimitError(f"plus de {MAX_PLACES} équipements placés pour une infrastructure")
    return Placement(
        infrastructure=current.infrastructure,
        revision=current.revision + 1,
        updated_at=utc_z(now),
        places=tuple(places[name] for name in sorted(places)),
    )

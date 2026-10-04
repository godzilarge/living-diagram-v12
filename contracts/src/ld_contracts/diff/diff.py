"""Diff v1 : ce qui a changé entre deux snapshots d'une même infrastructure, sortie de B3.

Auto-porteur : aucune référence à résoudre, les entités ajoutées ou retirées sont écrites en entier. Le document
refuse un résumé qui ne correspond pas à ses listes, un écart de temps qui ne correspond pas aux deux runs, et
toute liste hors de l'ordre canonique : un diff incohérent est un bug de B3.
"""

from datetime import datetime

from pydantic import Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Int, NonEmptyStr, SemVer
from ld_contracts.diff.changes import Event, event_key
from ld_contracts.diff.enums import EventKind
from ld_contracts.diff.sections import (
    AggregateChanges,
    CheckChanges,
    CoverageChanges,
    HaClusterChanges,
    InterfaceChanges,
    LinkChanges,
    MlagDomainChanges,
    NodeChanges,
)
from ld_contracts.diff.summary import RunRef, Summary
from ld_contracts.snapshot.order import require_canonical

DIFF_VERSION = "1.0.0"
DIFF_MAJOR = int(DIFF_VERSION.split(".")[0])

ENTITY_SECTIONS = ("nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters")
PARTS = ("added", "removed", "changed")


def elapsed_seconds_between(before_start: datetime, after_start: datetime) -> int:
    """Écart entre deux débuts de run, en secondes entières, signé (division entière vers le bas)."""
    delta = after_start - before_start
    return delta.days * 86400 + delta.seconds


class Diff(ContractModel):
    """Ce qui a changé entre deux snapshots d'une même infrastructure, par entité, en mots du snapshot.

    Calculé à la demande par B3, jamais archivé, déterministe : mêmes snapshots ⇒ mêmes octets. Ne lit jamais la
    couche d'intention. `before` → `after` est la direction demandée, quel que soit l'ordre des dates.
    """

    diff_version: SemVer = Field(description="Version semver du contrat Diff, indépendante des deux autres contrats.")
    infrastructure: NonEmptyStr = Field(
        description="Infrastructure des deux snapshots (B3 refuse deux infrastructures)."
    )
    before: RunRef = Field(description="La run de départ.")
    after: RunRef = Field(description="La run d'arrivée.")
    elapsed_seconds: Int = Field(
        description="`after.start_datetime − before.start_datetime` en secondes, signé ; négatif = runs comparées à "
        "rebours, et alors aucun événement n'est calculé."
    )
    summary: Summary = Field(description="Comptes par section et par sorte, vérifiés contre les listes.")
    nodes: NodeChanges = Field(description="Nœuds.")
    interfaces: InterfaceChanges = Field(description="Interfaces.")
    links: LinkChanges = Field(description="Liens.")
    aggregates: AggregateChanges = Field(description="Agrégats.")
    mlag_domains: MlagDomainChanges = Field(description="Domaines MLAG.")
    ha_clusters: HaClusterChanges = Field(description="Clusters HA.")
    checks: CheckChanges = Field(description="Contrôles apparus, résolus, persistants.")
    coverage: CoverageChanges = Field(description="Couverture changée.")
    events: tuple[Event, ...] = Field(
        description="Faits lus dans les champs volatils, triés par (sorte, référence) ; vide si `elapsed_seconds` ≤ 0 "
        "(refusé sinon), chacun recopiant `elapsed_seconds` dans ses détails."
    )

    @field_validator("diff_version")
    @classmethod
    def _major_is_supported(cls, value: str) -> str:
        major = int(value.split(".")[0])
        if major != DIFF_MAJOR:
            raise PydanticCustomError(
                "diff_major_unsupported",
                "version majeure du diff non supportée",
                {"received": major, "expected": DIFF_MAJOR},
            )
        return value

    @model_validator(mode="after")
    def _consistent(self) -> Diff:
        require_canonical(self.events, key=event_key, section="events")
        self._elapsed_consistent()
        self._events_consistent()
        self._counts_consistent()
        return self

    def _events_consistent(self) -> None:
        """Des événements seulement dans une fenêtre strictement positive, et chacun recopie cette fenêtre."""
        if self.elapsed_seconds <= 0 and self.events:
            raise PydanticCustomError(
                "events_without_elapsed",
                "des événements alors que la fenêtre n'est pas strictement positive",
                {"elapsed_seconds": self.elapsed_seconds, "events": len(self.events)},
            )
        for index, event in enumerate(self.events):
            if event.details.elapsed_seconds != self.elapsed_seconds:
                raise PydanticCustomError(
                    "event_elapsed_mismatch",
                    "la fenêtre d'un événement n'est pas `elapsed_seconds`",
                    {"index": index, "declared": event.details.elapsed_seconds, "actual": self.elapsed_seconds},
                )

    def _elapsed_consistent(self) -> None:
        actual = elapsed_seconds_between(self.before.start_datetime, self.after.start_datetime)
        if self.elapsed_seconds != actual:
            raise PydanticCustomError(
                "elapsed_mismatch",
                "`elapsed_seconds` n'est pas l'écart entre les deux débuts de run",
                {"declared": self.elapsed_seconds, "actual": actual},
            )

    def _counts_consistent(self) -> None:
        for name in ENTITY_SECTIONS:
            declared, section = getattr(self.summary, name), getattr(self, name)
            for part in PARTS:
                _expect(name, part, getattr(declared, part), len(getattr(section, part)))
        _expect("checks", "appeared", self.summary.checks.appeared, len(self.checks.appeared))
        _expect("checks", "resolved", self.summary.checks.resolved, len(self.checks.resolved))
        _expect("checks", "persisted", self.summary.checks.persisted, self.checks.persisted)
        _expect("coverage", "changed", self.summary.coverage.changed, len(self.coverage.changed))
        kinds = [event.kind for event in self.events]
        _expect("events", "rebooted", self.summary.events.rebooted, kinds.count(EventKind.REBOOTED))
        _expect("events", "flapped", self.summary.events.flapped, kinds.count(EventKind.FLAPPED))


def _expect(section: str, part: str, declared: int, actual: int) -> None:
    if declared != actual:
        raise PydanticCustomError(
            "counts_mismatch",
            "un compte du résumé diffère de la taille de sa liste",
            {"section": section, "part": part, "declared": declared, "actual": actual},
        )

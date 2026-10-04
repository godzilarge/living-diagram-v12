"""Spécification d'une génération : graine, taille, nombre de runs, plan de mutations.

Validée à la construction : une spécification fausse ne produit rien, elle lève `SpecError`.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from ld_contracts.synth.catalogue import MUTATION_KINDS

MIN_DEVICES = 6  # un site complet : deux cœurs, un accès, deux firewalls, un routeur
DEFAULT_START = datetime(2026, 1, 5, 2, 0, tzinfo=UTC)
DEFAULT_INFRASTRUCTURE = "infra-synth"


class SpecError(ValueError):
    """Spécification refusée ; le message dit quel champ et pourquoi, sans valeur secrète (il n'y en a pas)."""


@dataclass(frozen=True, slots=True)
class GenerationSpec:
    seed: str
    devices: int = 24
    runs: int = 1
    infrastructure: str = DEFAULT_INFRASTRUCTURE
    start: datetime = DEFAULT_START
    mutations_per_run: int = 3
    scenario: tuple[str, ...] = field(default=())

    def __post_init__(self) -> None:
        if not isinstance(self.seed, str) or not self.seed:
            raise SpecError("seed : chaîne non vide attendue")
        if not isinstance(self.devices, int) or self.devices < MIN_DEVICES:
            raise SpecError(f"devices : entier ≥ {MIN_DEVICES} attendu (un site complet)")
        if not isinstance(self.runs, int) or self.runs < 1:
            raise SpecError("runs : entier ≥ 1 attendu")
        if not isinstance(self.infrastructure, str) or not self.infrastructure:
            raise SpecError("infrastructure : chaîne non vide attendue")
        if not isinstance(self.start, datetime) or self.start.tzinfo is None:
            raise SpecError("start : date avec fuseau attendue")
        if not isinstance(self.mutations_per_run, int) or self.mutations_per_run < 0:
            raise SpecError("mutations_per_run : entier ≥ 0 attendu")
        unknown = sorted(set(self.scenario) - set(MUTATION_KINDS))
        if unknown:
            raise SpecError(f"scenario : mutations inconnues {unknown} ; catalogue : {list(MUTATION_KINDS)}")
        object.__setattr__(self, "scenario", tuple(self.scenario))

    def as_dict(self) -> dict:
        return {
            "seed": self.seed,
            "devices": self.devices,
            "runs": self.runs,
            "infrastructure": self.infrastructure,
            "start": self.start.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "mutations_per_run": self.mutations_per_run,
            "scenario": list(self.scenario),
        }

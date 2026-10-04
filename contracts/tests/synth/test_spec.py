import pytest

from ld_contracts.synth import MUTATION_KINDS, GenerationSpec, SpecError


def test_defaults_are_usable():
    spec = GenerationSpec(seed="s")
    assert spec.devices >= 6 and spec.runs == 1 and spec.infrastructure
    assert spec.start.tzinfo is not None


@pytest.mark.parametrize(
    "kwargs",
    [
        {"devices": 5},
        {"runs": 0},
        {"mutations_per_run": -1},
        {"scenario": ("not_a_kind",)},
        {"infrastructure": ""},
        {"seed": ""},
    ],
)
def test_invalid_spec_is_refused(kwargs):
    with pytest.raises(SpecError):
        GenerationSpec(**{"seed": "s", **kwargs})


def test_naive_start_is_refused():
    from datetime import datetime

    with pytest.raises(SpecError):
        GenerationSpec(seed="s", start=datetime(2026, 1, 1))


def test_scenario_accepts_every_catalogue_kind():
    spec = GenerationSpec(seed="s", scenario=MUTATION_KINDS)
    assert spec.scenario == MUTATION_KINDS

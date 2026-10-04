"""Fixtures du générateur : une spécification petite et rapide, et le contrôle « valide, zéro constat »."""

from datetime import UTC, datetime

import pytest

from ld_contracts.synth import GenerationSpec, build_world, emit_bundle
from ld_contracts.validate import validate_dict

START = datetime(2026, 1, 5, 2, 0, tzinfo=UTC)


def assert_strictly_valid(bundle: dict) -> None:
    """Le bundle passe le contrat sans erreur et sans aucun constat (clés absentes comprises)."""
    report = validate_dict(bundle)
    assert report.ok, [(i.path, i.message, i.detail) for i in report.errors][:5]
    assert report.findings == (), [(f.code, f.hostname, f.ref) for f in report.findings][:10]


@pytest.fixture
def small_spec() -> GenerationSpec:
    return GenerationSpec(seed="test", devices=8, runs=1, start=START)


@pytest.fixture
def small_world(small_spec):
    return build_world(small_spec)


@pytest.fixture
def small_bundle(small_spec, small_world):
    return emit_bundle(small_world, small_spec, run_index=0)


@pytest.fixture
def two_sites_world():
    return build_world(GenerationSpec(seed="two", devices=30, runs=1, start=START))

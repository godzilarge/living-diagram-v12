"""B1 sur les séries du générateur synthétique : rien ne casse, les mutations se lisent dans les contrôles, et
le snapshot reste déterministe sur une topologie plus riche que la fixture."""

from datetime import UTC, datetime

import pytest
from ld_contracts.snapshot.serialize import canonical_json
from ld_contracts.synth import MUTATION_KINDS, GenerationSpec, generate_series
from ld_contracts.validate import validate_snapshot_dict

from tests.correlate.conftest import run

START = datetime(2026, 1, 5, 2, tzinfo=UTC)
# Codes que la run de base produit par construction : stubs inconnus, port distant en MAC, firewalls sans LLDP
# (câbles documentés seuls), et les téléphones IP (LLDP annonce une MAC, CDP « Port 1 » : deux câbles observés, H2).
BASELINE_CODES = {"neighbor_unknown", "remote_port_is_mac", "documented_not_observed", "multiple_observed_neighbors"}


@pytest.fixture(scope="module")
def series():
    return generate_series(GenerationSpec(seed="b1", devices=12, runs=2, scenario=MUTATION_KINDS, start=START))


def test_baseline_only_carries_expected_codes(series):
    snapshot = run(series.bundles[0])
    assert validate_snapshot_dict(snapshot.model_dump(mode="json")).ok
    assert {c.code for c in snapshot.checks} <= BASELINE_CODES
    statuses = [link.status for link in snapshot.links]
    assert statuses.count("documented_only") == 5, "quatre uplinks de firewall et un heartbeat : jamais observés"
    assert len(snapshot.ha_clusters) == 1 and len(snapshot.mlag_domains) >= 8


def test_baseline_warnings_are_exactly_the_phones(series):
    """Question H2, tant qu'elle n'est pas tranchée : chaque téléphone (LLDP = MAC, CDP = « Port 1 ») donne deux
    câbles observés et deux `multiple_observed_neighbors`, rien d'autre ne sort en warning."""
    snapshot = run(series.bundles[0])
    counts = series.manifest["runs"][0]["counts"]
    phones = counts["stubs_by_kind"].get("phone", 0)
    assert phones > 0, "la graine b1 place au moins un téléphone"
    warnings = [c for c in snapshot.checks if c.severity == "warning"]
    assert len(warnings) == 2 * phones
    assert {c.code for c in warnings} == {"multiple_observed_neighbors"}
    assert len(snapshot.links) == counts["cables"] + counts["stubs"] + phones


def test_ha_positional_descriptions_are_read(series):
    snapshot = run(series.bundles[0])
    assert not [c for c in snapshot.checks if c.code in {"description_ha_unresolved", "description_unparseable"}]
    fw_links = [
        link for link in snapshot.links if link.a.hostname.endswith("-fw-01") or link.b.hostname.endswith("-fw-01")
    ]
    assert len(fw_links) == 3, "x1, x2 et le heartbeat, chacun un câble"


def test_every_mutation_leaves_a_trace_in_the_snapshot(series):
    snapshot = run(series.bundles[1])
    assert validate_snapshot_dict(snapshot.model_dump(mode="json")).ok
    codes = {c.code for c in snapshot.checks}
    assert {"device_unreachable", "device_partial_collection", "description_disagrees_with_observed"} <= codes
    assert {"link_speed_mismatch", "ha_member_down", "link_down"} <= codes
    mutated = {m["kind"] for m in series.manifest["runs"][1]["mutations"]}
    assert mutated == set(MUTATION_KINDS)


def test_generated_snapshot_is_deterministic(series):
    first, second = run(series.bundles[1], "0" * 64), run(series.bundles[1], "0" * 64)
    assert canonical_json(first) == canonical_json(second)

"""Le monde construit : exactement N devices, un motif complet par site, des références toutes résolues."""

from collections import Counter

import pytest

from ld_contracts.synth import GenerationSpec, build_world
from tests.synth.conftest import START


@pytest.mark.parametrize("devices", [6, 7, 24, 25, 26, 60])
def test_exactly_n_devices_in_scope(devices):
    world = build_world(GenerationSpec(seed="n", devices=devices, start=START))
    in_scope = [d for d in world.devices if d.infrastructure == world.infrastructure]
    assert len(in_scope) == devices


def test_every_site_has_the_full_pattern(two_sites_world):
    roles = Counter(
        (d.site, d.role) for d in two_sites_world.devices if d.infrastructure == two_sites_world.infrastructure
    )
    for site in two_sites_world.sites:
        assert roles[(site, "core")] == 2
        assert roles[(site, "firewall")] == 2
        assert roles[(site, "router")] == 1
        assert roles[(site, "access")] >= 1
    assert len(two_sites_world.sites) == 2


def test_externals_belong_to_another_infrastructure(small_world):
    externals = [d for d in small_world.devices if d.role == "external"]
    assert externals and all(d.infrastructure != small_world.infrastructure for d in externals)


def test_cables_reference_existing_ports_once(two_sites_world):
    world = two_sites_world
    seen: Counter = Counter()
    for cable in world.cables:
        assert cable.a < cable.b
        for ref in (cable.a, cable.b):
            assert ref in world.port_index or ref[0] in {d.hostname for d in world.devices if d.role == "external"}
            seen[ref] += 1
    assert max(seen.values()) == 1, "un port porte au plus un câble"


def test_stubs_hang_on_existing_access_ports(small_world):
    assert small_world.stubs
    for stub in small_world.stubs:
        port = small_world.port_index[stub.attached]
        assert port.role == "access"
        assert stub.kind in {"server", "phone", "ap"}


def test_structures_per_site(two_sites_world):
    world = two_sites_world
    peer_links = [a for a in world.aggregates if a.peer_link]
    assert len(peer_links) == 2 * len(world.sites)
    assert all(a.mlag_id is None for a in peer_links)
    assert len(world.clusters) == len(world.sites)
    for cluster in world.clusters:
        assert cluster.priorities[0] > cluster.priorities[1]
        assert cluster.roles == ("primary", "secondary")


def test_sites_are_chained_by_their_cores(two_sites_world):
    world = two_sites_world
    intersite = [p for p in world.ports if p.role == "intersite"]
    assert len(intersite) == 4  # deux cœurs × deux sites, un câble par cœur
    assert all(world.cables_by_port[(p.device, p.name)] for p in intersite)


def test_same_seed_same_world_different_seed_different_world():
    a = build_world(GenerationSpec(seed="a", devices=12, start=START))
    b = build_world(GenerationSpec(seed="a", devices=12, start=START))
    c = build_world(GenerationSpec(seed="c", devices=12, start=START))
    assert a == b
    assert a != c


def test_ports_and_macs_are_unique(two_sites_world):
    refs = [(p.device, p.name) for p in two_sites_world.ports]
    assert len(refs) == len(set(refs))
    macs = [p.mac for p in two_sites_world.ports if p.kind in {"physical", "management"}]
    assert None not in macs and len(macs) == len(set(macs)), "un Po porte la MAC d'un membre ; les autres sont uniques"

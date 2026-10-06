"""Les quatre formes de raccordement du cluster FortiGate aux cœurs (`--firewall-uplinks`).

`vpc` (défaut) : `agg-core` = x1 → cœur 01, x2 → cœur 02, un vPC par membre.
`dual-vpc` : `agg-1` = x1 → cœur 01, x2 → cœur 02 ; `agg-2` = x3 → cœur 01, x4 → cœur 02 ; deux vPC par membre.
`per-core` : `agg-1` = x1, x2 → cœur 01 ; `agg-2` = x3, x4 → cœur 02 ; aucun vPC.
`single-core` : `agg-1` = x1, x2 → cœur 01 ; `agg-2` = x3, x4 → cœur 01 ; aucun vPC, cœur 02 sans firewall.
"""

import pytest

from ld_contracts.synth import (
    FIREWALL_UPLINKS,
    MUTATION_KINDS,
    GenerationError,
    GenerationSpec,
    SpecError,
    build_world,
    check_series,
    check_world,
    emit_bundle,
    generate_series,
)
from tests.synth.conftest import START, assert_strictly_valid

SITE = "dc01"
FW = (f"{SITE}-fw-01", f"{SITE}-fw-02")
CORE = (f"{SITE}-core-01", f"{SITE}-core-02")

# (forme) → par membre (rang) : agrégat du firewall → [(port local, cœur, port du cœur)]
EXPECTED_LEGS = {
    "vpc": {
        0: {"agg-core": [("x1", CORE[0], "Ethernet1/41"), ("x2", CORE[1], "Ethernet1/41")]},
        1: {"agg-core": [("x1", CORE[0], "Ethernet1/42"), ("x2", CORE[1], "Ethernet1/42")]},
    },
    "dual-vpc": {
        0: {
            "agg-1": [("x1", CORE[0], "Ethernet1/33"), ("x2", CORE[1], "Ethernet1/33")],
            "agg-2": [("x3", CORE[0], "Ethernet1/34"), ("x4", CORE[1], "Ethernet1/34")],
        },
        1: {
            "agg-1": [("x1", CORE[0], "Ethernet1/35"), ("x2", CORE[1], "Ethernet1/35")],
            "agg-2": [("x3", CORE[0], "Ethernet1/36"), ("x4", CORE[1], "Ethernet1/36")],
        },
    },
    "per-core": {
        0: {
            "agg-1": [("x1", CORE[0], "Ethernet1/33"), ("x2", CORE[0], "Ethernet1/34")],
            "agg-2": [("x3", CORE[1], "Ethernet1/33"), ("x4", CORE[1], "Ethernet1/34")],
        },
        1: {
            "agg-1": [("x1", CORE[0], "Ethernet1/35"), ("x2", CORE[0], "Ethernet1/36")],
            "agg-2": [("x3", CORE[1], "Ethernet1/35"), ("x4", CORE[1], "Ethernet1/36")],
        },
    },
    "single-core": {
        0: {
            "agg-1": [("x1", CORE[0], "Ethernet1/33"), ("x2", CORE[0], "Ethernet1/34")],
            "agg-2": [("x3", CORE[0], "Ethernet1/35"), ("x4", CORE[0], "Ethernet1/36")],
        },
        1: {
            "agg-1": [("x1", CORE[0], "Ethernet1/37"), ("x2", CORE[0], "Ethernet1/38")],
            "agg-2": [("x3", CORE[0], "Ethernet1/39"), ("x4", CORE[0], "Ethernet1/40")],
        },
    },
}


def _world(form: str, devices: int = 8):
    return build_world(GenerationSpec(seed="fw", devices=devices, start=START, firewall_uplinks=form))


def test_catalogue_of_forms():
    assert FIREWALL_UPLINKS == ("vpc", "dual-vpc", "per-core", "single-core")
    assert GenerationSpec(seed="s").firewall_uplinks == "vpc"
    assert GenerationSpec(seed="s").as_dict()["firewall_uplinks"] == "vpc"


def test_unknown_form_is_refused():
    with pytest.raises(SpecError, match="firewall_uplinks"):
        GenerationSpec(seed="s", firewall_uplinks="one-arm")


@pytest.mark.parametrize("form", FIREWALL_UPLINKS)
def test_cables_and_firewall_aggregates_follow_the_form(form):
    world = _world(form)
    assert check_world(world) == []
    aggregates = {(a.device, a.name): a for a in world.aggregates}
    for rank, legs in EXPECTED_LEGS[form].items():
        fw = FW[rank]
        assert sorted(n for d, n in aggregates if d == fw) == sorted(legs)
        for agg, ends in legs.items():
            assert aggregates[(fw, agg)].members == tuple(local for local, _, _ in ends)
            assert aggregates[(fw, agg)].mlag_id is None
            for local, core, core_port in ends:
                assert world.cables_by_port[(fw, local)].other((fw, local)) == (core, core_port)
                assert world.port_index[(core, core_port)].aggregate is not None


@pytest.mark.parametrize("form", FIREWALL_UPLINKS)
def test_core_side_aggregates(form):
    """vPC : un port-channel d'un membre par cœur et par agrégat du firewall, même numéro de vPC des deux côtés ;
    sans vPC : un port-channel par cœur qui regroupe les membres de cet agrégat, sans `mlag_id`."""
    world = _world(form)
    vpc = form in {"vpc", "dual-vpc"}
    for member_legs in EXPECTED_LEGS[form].values():
        for ends in member_legs.values():
            for _, core, port in ends:
                agg = next(a for a in world.aggregates if a.device == core and port in a.members)
                assert world.port_index[(core, port)].aggregate == agg.name
                assert agg.members == tuple(p for _, c, p in ends if c == core)
                assert (agg.mlag_id is not None) is vpc
            if vpc:
                pos = {next(a for a in world.aggregates if a.device == c and p in a.members).name for _, c, p in ends}
                assert len(pos) == 1, "les deux pattes d'un vPC portent le même numéro"
    if form == "single-core":
        assert not [p for p in world.ports if p.device == CORE[1] and p.role == "fw_link"]


@pytest.mark.parametrize("form", FIREWALL_UPLINKS)
def test_ha_positional_descriptions_name_each_member_port(form):
    """Configuration partagée : chaque port xN porte une paire (cœur, port) par membre, dans l'ordre des priorités."""
    world = _world(form)
    legs = EXPECTED_LEGS[form]
    for fw in FW:
        for agg in legs[0]:
            for i, (local, _, _) in enumerate(legs[0][agg]):
                pairs = [legs[rank][agg][i][1:] for rank in (0, 1)]
                expected = "C1|" + "|".join(f"{core}|{port}" for core, port in pairs)
                assert world.port_index[(fw, local)].description == expected


@pytest.mark.parametrize("form", FIREWALL_UPLINKS)
def test_bundle_is_strictly_valid(form):
    spec = GenerationSpec(seed="fw", devices=30, start=START, firewall_uplinks=form)
    assert_strictly_valid(emit_bundle(build_world(spec), spec, run_index=0))


@pytest.mark.parametrize("form", [f for f in FIREWALL_UPLINKS if f != "vpc"])
def test_transit_subinterface_hangs_on_the_first_aggregate(form):
    world = _world(form)
    for fw in FW:
        sub = world.port_index[(fw, "agg-1.400")]
        assert sub.kind == "subinterface" and sub.ip is not None
        assert (fw, "agg-core") not in world.port_index


@pytest.mark.parametrize("form", FIREWALL_UPLINKS)
def test_every_mutation_still_applies(form):
    """Les ports des firewalls ne gênent ni l'accès ajouté (ports libres du cœur) ni aucune autre mutation."""
    spec = GenerationSpec(seed="fw", devices=30, runs=3, start=START, scenario=MUTATION_KINDS, firewall_uplinks=form)
    check_series(generate_series(spec))


def test_access_switches_never_take_a_firewall_port():
    """Accès ajoutés jusqu'à remplir le cœur 01 (trois à la construction, 29 ajoutés, ports 1 à 32) : aucun ne prend
    un port de firewall, et le suivant est une erreur, jamais un port pris en silence."""
    fields = {"seed": "full", "devices": 8, "start": START, "scenario": ("device_added",)}
    series = generate_series(GenerationSpec(runs=30, firewall_uplinks="single-core", **fields))
    check_series(series)
    fw_ports = {f"Ethernet1/{n}" for n in range(33, 41)}
    added = [m["details"]["uplinks"] for run in series.manifest["runs"] for m in run["mutations"]]
    assert len(added) == 29 and not {port for pair in added for _, port in pair} & fw_ports
    with pytest.raises(GenerationError):
        generate_series(GenerationSpec(runs=31, firewall_uplinks="single-core", **fields))


def test_legs_refuse_an_unknown_form():
    from ld_contracts.synth.build_firewall import legs

    with pytest.raises(ValueError, match="inconnue"):
        legs("one-arm", 0)

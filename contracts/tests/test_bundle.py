import copy
import json

import pytest
from pydantic import ValidationError

from ld_contracts.bundle import RunBundle
from tests.conftest import first_error


def test_minimal_fixture_is_a_valid_bundle(minimal_dict):
    bundle = RunBundle.model_validate(minimal_dict)
    assert bundle.infrastructure == "infra-lab"
    assert len(bundle.devices) == 5
    assert len(bundle.interfaces) == 18


def test_reference_fixture_has_a_peer_link_and_a_real_vpc(minimal_dict):
    """Question 1 de docs/05 §8 (2026-09-20) : Po10 = peer-link, Po20 = vPC 20 vers fw-edge-01 (x1 + x2)."""
    bundle = RunBundle.model_validate(minimal_dict)
    by_key = {(a.hostname, a.name): a for a in bundle.aggregates}
    for core in ("sw-core-01", "sw-core-02"):
        peer = by_key[(core, "port-channel10")]
        assert peer.mlag_peer_link is True and peer.mlag_id is None
        vpc = by_key[(core, "port-channel20")]
        assert vpc.mlag_id == 20 and vpc.mlag_peer_link is False and len(vpc.members) == 1
    fortigate = by_key[("fw-edge-01", "agg-core")]
    assert [m.name for m in fortigate.members] == ["x1", "x2"] and fortigate.mlag_id is None
    descriptions = {(i.hostname, i.name): i.description for i in bundle.interfaces}
    assert descriptions[("sw-core-01", "Ethernet1/3")] == "C2|fw-edge-01|x1|"
    assert descriptions[("sw-core-02", "Ethernet1/4")] == "C2|fw-edge-01|x2|"
    assert descriptions[("fw-edge-01", "x2")] == "C2|sw-core-02|Ethernet1/4|"
    by_itf = {(i.hostname, i.name): i for i in bundle.interfaces}
    assert by_itf[("fw-edge-01", "agg-core.400")].parent_interface == "agg-core"
    assert by_itf[("fw-edge-01", "x1")].vrf is None and by_itf[("fw-edge-01", "x2")].vrf is None
    assert by_itf[("fw-edge-01", "agg-core")].vrf == "default"


def test_duplicate_interface_identity_is_rejected_without_leaking_values(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["interfaces"].append(copy.deepcopy(bad["interfaces"][0]))
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "duplicate_identity"
    assert "Ethernet1/1" not in err["msg"]
    assert ("sw-core-01", "Ethernet1/1") in err["ctx"]["duplicates"]


def test_local_hostname_must_exist_in_devices(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["interfaces"][0]["hostname"] = "ghost-01"
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "hostname_not_in_devices"
    assert "ghost-01" not in err["msg"] and err["ctx"]["hostname"] == "ghost-01"


def test_topic_document_of_a_device_from_another_infrastructure_is_rejected(minimal_dict):
    """`devices` fait foi : rt-wan-01 est dans infra-wan, un document de topic à son nom sort du périmètre."""
    bad = copy.deepcopy(minimal_dict)
    bad["system"].append({**copy.deepcopy(bad["system"][0]), "hostname": "rt-wan-01"})
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "hostname_outside_infrastructure"
    assert "infra-wan" not in err["msg"] and "rt-wan-01" not in err["msg"]
    assert err["ctx"] == {
        "section": "system",
        "index": 3,
        "hostname": "rt-wan-01",
        "infrastructure": "infra-wan",
        "expected": "infra-lab",
    }


@pytest.mark.parametrize("section", ["tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha"])
def test_topic_documents_do_not_carry_infrastructure(minimal_dict, section):
    """Le périmètre est un fait du bundle, écrit une fois : une copie par document est refusée (2026-09-14)."""
    bad = copy.deepcopy(minimal_dict)
    bad[section][0]["infrastructure"] = "infra-lab"
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "extra_forbidden" and err["loc"][-1] == "infrastructure"


def test_device_hostnames_are_unique_case_insensitively(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["devices"].append(dict(bad["devices"][0], hostname="SW-CORE-01"))
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    assert first_error(exc)["type"] == "duplicate_identity"


def test_devices_table_may_span_other_infrastructures(minimal_dict):
    bundle = RunBundle.model_validate(minimal_dict)
    assert {d.infrastructure for d in bundle.devices} == {"infra-lab", "infra-wan"}


def test_unknown_major_contract_version_is_rejected(minimal_dict):
    bad = {**minimal_dict, "contract_version": "2.0.0"}
    with pytest.raises(ValidationError, match="contract_version"):
        RunBundle.model_validate(bad)


@pytest.mark.parametrize("value", ["2026-09-10T02:20:11", 1757470811, 1757470811.5])
def test_naive_or_numeric_datetime_is_rejected(minimal_dict, value):
    bad = copy.deepcopy(minimal_dict)
    bad["produced_at"] = value
    with pytest.raises(ValidationError, match="produced_at"):
        RunBundle.model_validate(bad)


def test_collections_are_immutable_tuples(minimal_dict):
    bundle = RunBundle.model_validate(minimal_dict)
    assert isinstance(bundle.interfaces, tuple)
    with pytest.raises(AttributeError):
        bundle.interfaces.append(None)  # type: ignore[attr-defined]


def test_json_round_trip_is_stable(minimal_dict):
    first = RunBundle.model_validate(minimal_dict)
    text = first.model_dump_json()
    second = RunBundle.model_validate(json.loads(text))
    assert second == first
    assert second.model_dump_json() == text


def test_topic_hostname_must_match_devices_byte_for_byte(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["interfaces"][0]["hostname"] = "SW-CORE-01"
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    assert first_error(exc)["type"] == "hostname_not_in_devices"


def test_numeric_string_datetime_is_rejected(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["produced_at"] = "1757470811"
    with pytest.raises(ValidationError, match="produced_at"):
        RunBundle.model_validate(bad)


def test_ha_document_missing_its_local_device_is_located_in_the_bundle(minimal_dict):
    """Le validateur de document remonte avec la position du document dans `ha`."""
    bad = copy.deepcopy(minimal_dict)
    bad["ha"][0]["members"] = bad["ha"][0]["members"][1:]
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "ha_local_not_in_members" and err["loc"] == ("ha", 0)


def test_interface_vlan_mode_refusal_is_located_in_the_bundle(minimal_dict):
    """Le refus de cohérence VLAN / mode remonte avec la position du document dans `interfaces`."""
    bad = copy.deepcopy(minimal_dict)
    idx = next(i for i, itf in enumerate(bad["interfaces"]) if itf["switchport_mode"] == "access")
    bad["interfaces"][idx]["native_vlan"] = 1
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "trunk_vlans_outside_trunk_mode" and err["loc"] == ("interfaces", idx)


def test_fixture_carries_an_access_port_with_its_vlan(minimal_dict):
    """La fixture exerce la branche access : au moins un port `access` avec son `access_vlan` (2026-09-16)."""
    access = [itf for itf in minimal_dict["interfaces"] if itf["switchport_mode"] == "access"]
    assert access and all(type(itf["access_vlan"]) is int for itf in access)
    assert all(itf["access_vlan"] is None for itf in minimal_dict["interfaces"] if itf["switchport_mode"] != "access")


def test_fixture_trunks_carry_allowed_vlan_ranges(minimal_dict):
    """Chaque trunk de la fixture porte `allowed_vlans` en liste d'intervalles `{first, last}` (2026-09-16)."""
    trunks = [itf for itf in minimal_dict["interfaces"] if itf["switchport_mode"] == "trunk"]
    assert trunks and all(isinstance(itf["allowed_vlans"], list) and itf["allowed_vlans"] for itf in trunks)
    core = next(itf for itf in trunks if itf["hostname"] == "sw-core-01" and itf["name"] == "Ethernet1/1")
    assert core["allowed_vlans"] == [{"first": 10, "last": 20}, {"first": 100, "last": 100}]


def test_a_port_member_of_two_aggregates_is_rejected(minimal_dict):
    """Contre-revue B1 du 2026-09-20 (M1) : sans ce refus, l'appartenance dépendait de l'ordre des documents."""
    core = [a for a in minimal_dict["aggregates"] if a["hostname"] == "sw-core-01"]
    stolen = copy.deepcopy(core[0]["members"][0])
    core[1]["members"].append(stolen)
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(minimal_dict)
    err = first_error(exc)
    assert err["type"] == "member_in_several_aggregates"
    assert err["ctx"] == {"section": "aggregates", "hostname": "sw-core-01", "members": [stolen["name"]]}


def test_a_port_listed_by_two_aggregate_interfaces_is_rejected(minimal_dict):
    """Même refus sur `interfaces[].members`, que B1 lit quand le topic `aggregates` n'est pas en succès."""
    parents = [i for i in minimal_dict["interfaces"] if i["hostname"] == "sw-core-01" and i["members"]]
    parents[1]["members"].append(parents[0]["members"][0])
    with pytest.raises(ValidationError) as exc:
        RunBundle.model_validate(minimal_dict)
    err = first_error(exc)
    assert err["type"] == "member_in_several_aggregates" and err["ctx"]["section"] == "interfaces"


def test_the_same_member_name_on_two_devices_is_not_a_conflict(minimal_dict):
    names = {(a["hostname"], m["name"]) for a in minimal_dict["aggregates"] for m in a["members"]}
    assert ("sw-core-01", "Ethernet1/1") in names and ("sw-core-02", "Ethernet1/1") in names
    RunBundle.model_validate(minimal_dict)

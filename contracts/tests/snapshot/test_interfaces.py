"""Interfaces du snapshot : sous-ensemble L1 / L2 / L3, description parsée, appartenance, rôles."""

import pytest
from pydantic import ValidationError

from ld_contracts.snapshot.interfaces import SnapshotInterface
from tests.snapshot.conftest import first_error, interface_doc


def test_example_interface_is_valid_and_keeps_raw_and_parsed_description():
    itf = SnapshotInterface.model_validate(interface_doc())
    assert itf.description == "C1|sw-b|Ethernet1/1|"
    assert itf.description_parsed is not None and itf.description_parsed.neighbor == "sw-b"


def test_bundle_only_fields_are_refused():
    for field in ("counters", "extras", "members", "mtu", "configured_speed_mbps", "auto_negotiate"):
        with pytest.raises(ValidationError):
            SnapshotInterface.model_validate({**interface_doc(), field: None})


def test_every_key_is_required_even_when_null():
    doc = interface_doc()
    del doc["oper_reason"]
    with pytest.raises(ValidationError) as exc:
        SnapshotInterface.model_validate(doc)
    assert first_error(exc)["type"] == "missing"


def test_allowed_vlans_must_be_canonical_sorted_and_merged():
    for ranges in (
        [{"first": 100, "last": 100}, {"first": 10, "last": 20}],
        [{"first": 10, "last": 20}, {"first": 21, "last": 30}],
        [{"first": 10, "last": 20}, {"first": 15, "last": 30}],
    ):
        with pytest.raises(ValidationError) as exc:
            SnapshotInterface.model_validate(interface_doc(allowed_vlans=ranges))
        assert first_error(exc)["type"] in {"vlan_ranges_not_canonical", "vlan_ranges_overlap"}, ranges
    SnapshotInterface.model_validate(
        interface_doc(allowed_vlans=[{"first": 10, "last": 20}, {"first": 22, "last": 30}])
    )
    SnapshotInterface.model_validate(interface_doc(allowed_vlans=[]))
    SnapshotInterface.model_validate(interface_doc(allowed_vlans=None))


def test_roles_sorted_unique_from_closed_vocabulary():
    SnapshotInterface.model_validate(interface_doc(roles=["heartbeat", "mlag_peer_link"]))
    with pytest.raises(ValidationError):
        SnapshotInterface.model_validate(interface_doc(roles=["mlag_peer_link", "heartbeat"]))
    with pytest.raises(ValidationError):
        SnapshotInterface.model_validate(interface_doc(roles=["heartbeat", "heartbeat"]))
    with pytest.raises(ValidationError):
        SnapshotInterface.model_validate(interface_doc(roles=["uplink"]))


def test_aggregate_membership_allows_unknown_member_status():
    itf = SnapshotInterface.model_validate(interface_doc(aggregate={"name": "port-channel10", "member_status": None}))
    assert itf.aggregate is not None and itf.aggregate.member_status is None
    SnapshotInterface.model_validate(interface_doc(aggregate={"name": "port-channel10", "member_status": "bundled"}))


def test_ip_addresses_canonical_order():
    v4 = {"address": "192.0.2.1", "prefix": 31, "family": 4, "role": "primary"}
    v6 = {"address": "2001:db8::1", "prefix": 64, "family": 6, "role": "primary"}
    SnapshotInterface.model_validate(interface_doc(ip_addresses=[v4, v6]))
    with pytest.raises(ValidationError) as exc:
        SnapshotInterface.model_validate(interface_doc(ip_addresses=[v6, v4]))
    assert first_error(exc)["type"] == "not_canonical_order"


def test_parsed_description_neighbor_is_required_port_and_options_optional():
    SnapshotInterface.model_validate(
        interface_doc(description_parsed={"criticality": None, "neighbor": "sw-b", "port": None, "options": "x=1"})
    )
    with pytest.raises(ValidationError):
        SnapshotInterface.model_validate(
            interface_doc(description_parsed={"criticality": "C1", "neighbor": "", "port": None, "options": None})
        )


def test_vlan_fields_must_match_switchport_mode_like_the_bundle():
    with pytest.raises(ValidationError) as exc:
        SnapshotInterface.model_validate(interface_doc(access_vlan=10))
    assert first_error(exc)["type"] == "access_vlan_outside_access_mode"
    with pytest.raises(ValidationError) as exc:
        SnapshotInterface.model_validate(interface_doc(switchport_mode="access", access_vlan=10))
    assert first_error(exc)["type"] == "trunk_vlans_outside_trunk_mode"
    SnapshotInterface.model_validate(
        interface_doc(switchport_mode="access", access_vlan=10, native_vlan=None, allowed_vlans=None)
    )

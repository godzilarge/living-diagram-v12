"""Agrégats, domaines MLAG, clusters HA."""

import pytest
from pydantic import ValidationError

from ld_contracts.snapshot.structures import HaCluster, MlagDomain, SnapshotAggregate
from tests.snapshot.conftest import aggregate_doc, first_error, ha_cluster_doc, mlag_domain_doc


def test_example_structures_are_valid():
    SnapshotAggregate.model_validate(aggregate_doc())
    MlagDomain.model_validate(mlag_domain_doc())
    HaCluster.model_validate(ha_cluster_doc())


def test_aggregate_degraded_flag_must_match_member_states():
    with pytest.raises(ValidationError) as exc:
        SnapshotAggregate.model_validate(aggregate_doc(degraded=True))
    assert first_error(exc)["type"] == "aggregate_degraded_mismatch"
    members = [{"name": "Ethernet1/1", "status": "bundled"}, {"name": "Ethernet1/2", "status": "suspended"}]
    SnapshotAggregate.model_validate(aggregate_doc(members=members, degraded=True))
    with pytest.raises(ValidationError) as exc:
        SnapshotAggregate.model_validate(aggregate_doc(members=members, degraded=False))
    assert first_error(exc)["type"] == "aggregate_degraded_mismatch"


def test_aggregate_members_and_cables_are_canonical():
    members = [{"name": "Ethernet1/10", "status": "bundled"}, {"name": "Ethernet1/2", "status": "bundled"}]
    with pytest.raises(ValidationError) as exc:
        SnapshotAggregate.model_validate(aggregate_doc(members=members))
    assert first_error(exc)["type"] == "not_canonical_order"
    cable = aggregate_doc()["cables"][0]
    with pytest.raises(ValidationError) as exc:
        SnapshotAggregate.model_validate(aggregate_doc(cables=[cable, cable]))
    assert first_error(exc)["type"] == "duplicate_identity"


def test_aggregate_has_no_extras():
    with pytest.raises(ValidationError):
        SnapshotAggregate.model_validate({**aggregate_doc(), "extras": {}})


def test_mlag_domain_has_exactly_two_members_on_distinct_devices_sorted():
    doc = mlag_domain_doc()
    with pytest.raises(ValidationError):
        MlagDomain.model_validate({**doc, "members": doc["members"][:1]})
    with pytest.raises(ValidationError) as exc:
        MlagDomain.model_validate({**doc, "members": list(reversed(doc["members"]))})
    assert first_error(exc)["type"] == "not_canonical_order"
    same = [{"hostname": "sw-a", "aggregate": "port-channel20"}, {"hostname": "sw-a", "aggregate": "port-channel21"}]
    with pytest.raises(ValidationError) as exc:
        MlagDomain.model_validate({**doc, "members": same})
    assert first_error(exc)["type"] == "mlag_domain_same_device"


def test_mlag_domain_peer_link_and_downstream_may_be_null():
    MlagDomain.model_validate(mlag_domain_doc(peer_link=None, downstream=None))


def test_ha_cluster_members_sorted_and_heartbeat_on_a_member():
    doc = ha_cluster_doc()
    with pytest.raises(ValidationError) as exc:
        HaCluster.model_validate({**doc, "members": list(reversed(doc["members"]))})
    assert first_error(exc)["type"] == "not_canonical_order"
    with pytest.raises(ValidationError) as exc:
        HaCluster.model_validate(
            ha_cluster_doc(heartbeat_interfaces=[{"hostname": "fw-9", "interface": "ha1", "cable": None}])
        )
    assert first_error(exc)["type"] == "heartbeat_not_a_member"
    with pytest.raises(ValidationError):
        HaCluster.model_validate(ha_cluster_doc(members=[]))


def test_ha_member_reported_by_sorted_unique_non_empty():
    doc = ha_cluster_doc()
    member = {**doc["members"][0], "reported_by": ["fw-2", "fw-1"]}
    with pytest.raises(ValidationError):
        HaCluster.model_validate({**doc, "members": [member, doc["members"][1]]})
    member = {**doc["members"][0], "reported_by": []}
    with pytest.raises(ValidationError):
        HaCluster.model_validate({**doc, "members": [member, doc["members"][1]]})


def test_reported_by_lists_only_cluster_members():
    doc = ha_cluster_doc()
    member = {**doc["members"][0], "reported_by": ["fw-9"]}
    with pytest.raises(ValidationError) as exc:
        HaCluster.model_validate({**doc, "members": [member, doc["members"][1]]})
    assert first_error(exc)["type"] == "reported_by_not_a_member"

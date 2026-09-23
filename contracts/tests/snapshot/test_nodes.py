"""Nœuds : device, external, stub, et ce que chaque sorte peut porter."""

import pytest
from pydantic import ValidationError

from ld_contracts.snapshot.nodes import Node
from tests.snapshot.conftest import first_error, node_doc, stub_doc


def test_device_and_stub_examples_are_valid():
    assert Node.model_validate(node_doc()).kind == "device"
    assert Node.model_validate(stub_doc()).kind == "stub"


def test_device_needs_a_collection_status_and_carries_no_evidence():
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(collection=None))
    assert first_error(exc)["type"] == "node_fields_for_kind"
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(evidence=stub_doc()["evidence"]))
    assert first_error(exc)["type"] == "node_fields_for_kind"


def test_stub_carries_evidence_and_nothing_from_devices():
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(stub_doc(evidence=None))
    assert first_error(exc)["type"] == "node_fields_for_kind"
    for field, value in (("type", "server"), ("serial_number", "X"), ("collection", "success"), ("uptime_seconds", 1)):
        with pytest.raises(ValidationError) as exc:
            Node.model_validate(stub_doc(**{field: value}))
        err = first_error(exc)
        assert err["type"] == "node_fields_for_kind" and field in err["ctx"]["fields"], field


def test_external_node_has_evidence_and_no_collection_status():
    external = node_doc(
        kind="external",
        hostname="rt-wan-01",
        collection=None,
        evidence=stub_doc()["evidence"],
        reported_hostname=None,
        uptime_seconds=None,
    )
    assert Node.model_validate(external).type == "switch"
    with pytest.raises(ValidationError) as exc:
        Node.model_validate({**external, "collection": "success"})
    assert first_error(exc)["type"] == "node_fields_for_kind"


def test_evidence_seen_by_is_canonical_and_capabilities_sorted_unique():
    seen = [
        {"hostname": "sw-a", "interface": "Ethernet1/10", "source": "lldp"},
        {"hostname": "sw-a", "interface": "Ethernet1/2", "source": "cdp"},
    ]
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(stub_doc(evidence={"seen_by": seen, "capabilities": []}))
    assert first_error(exc)["type"] == "not_canonical_order"
    Node.model_validate(stub_doc(evidence={"seen_by": list(reversed(seen)), "capabilities": ["bridge", "router"]}))
    with pytest.raises(ValidationError):
        Node.model_validate(stub_doc(evidence={"seen_by": [], "capabilities": ["router", "bridge"]}))


def test_stack_member_count_matches_members_sorted_by_slot():
    member = {"slot": 1, "serial": "S1", "model": "C9300", "role": "active", "state": "ready", "priority": 15}
    second = {**member, "slot": 2, "serial": "S2", "role": "member"}
    node = Node.model_validate(node_doc(stack={"member_count": 2, "members": [member, second]}))
    assert node.stack is not None and node.stack.member_count == 2
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(stack={"member_count": 3, "members": [member, second]}))
    assert first_error(exc)["type"] == "stack_count_mismatch"
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(stack={"member_count": 2, "members": [second, member]}))
    assert first_error(exc)["type"] == "not_canonical_order"


def test_stack_member_fields_are_all_required():
    member = {"slot": 1, "serial": None, "model": None, "role": "active", "state": "ready"}
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(stack={"member_count": 1, "members": [member]}))
    assert first_error(exc)["type"] == "missing"


def test_virtual_contexts_sorted_unique():
    Node.model_validate(node_doc(virtual_contexts=["root", "vsys2"]))
    with pytest.raises(ValidationError):
        Node.model_validate(node_doc(virtual_contexts=["vsys2", "root"]))


def test_stub_has_no_virtual_contexts():
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(stub_doc(virtual_contexts=["root"]))
    assert first_error(exc)["ctx"]["fields"] == ["virtual_contexts"]


def test_external_carries_nothing_from_system_topics():
    """Un device d'une autre infrastructure n'a aucun document `system` dans le bundle."""
    external = node_doc(
        kind="external",
        hostname="rt-1",
        collection=None,
        evidence=stub_doc()["evidence"],
        reported_hostname=None,
        uptime_seconds=None,
    )
    Node.model_validate(external)
    stack = {
        "member_count": 1,
        "members": [{"slot": 1, "serial": None, "model": None, "role": "active", "state": "ready", "priority": None}],
    }
    for field, value in (
        ("reported_hostname", "rt-1"),
        ("uptime_seconds", 1),
        ("virtual_contexts", ["root"]),
        ("stack", stack),
    ):
        with pytest.raises(ValidationError) as exc:
            Node.model_validate({**external, field: value})
        err = first_error(exc)
        assert err["type"] == "node_fields_for_kind" and field in err["ctx"]["fields"], field


def test_device_and_external_need_a_type():
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(node_doc(type=None))
    assert first_error(exc)["ctx"]["fields"] == ["type"]


def test_stub_hostname_is_casefolded():
    with pytest.raises(ValidationError) as exc:
        Node.model_validate(stub_doc(hostname="SRV-1"))
    assert first_error(exc)["ctx"]["fields"] == ["hostname"]

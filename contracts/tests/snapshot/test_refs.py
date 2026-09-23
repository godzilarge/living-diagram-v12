"""Endpoints, clés de lien et références typées."""

import pytest
from pydantic import TypeAdapter, ValidationError

from ld_contracts.snapshot.refs import Endpoint, LinkKey, Ref, ref_key
from tests.snapshot.conftest import endpoint, first_error


def test_link_key_requires_sorted_endpoints_with_natural_interface_order():
    LinkKey.model_validate({"a": endpoint("sw-a", "Ethernet1/2"), "b": endpoint("sw-a", "Ethernet1/10")})
    with pytest.raises(ValidationError) as exc:
        LinkKey.model_validate({"a": endpoint("sw-a", "Ethernet1/10"), "b": endpoint("sw-a", "Ethernet1/2")})
    assert first_error(exc)["type"] == "link_endpoints_unordered"


def test_link_key_rejects_identical_endpoints():
    with pytest.raises(ValidationError) as exc:
        LinkKey.model_validate({"a": endpoint("sw-a", "Ethernet1/1"), "b": endpoint("sw-a", "Ethernet1/1")})
    assert first_error(exc)["type"] == "link_endpoints_equal"


def test_refs_are_discriminated_by_kind():
    adapter = TypeAdapter(Ref)
    node = adapter.validate_python({"kind": "node", "hostname": "sw-a"})
    itf = adapter.validate_python({"kind": "interface", "hostname": "sw-a", "name": "Ethernet1/1"})
    link = adapter.validate_python({"kind": "link", "a": endpoint("sw-a", "x1"), "b": endpoint("sw-b", "x1")})
    agg = adapter.validate_python({"kind": "aggregate", "hostname": "sw-a", "name": "port-channel10"})
    cluster = adapter.validate_python({"kind": "cluster", "members": ["fw-1", "fw-2"]})
    assert [r.kind for r in (node, itf, link, agg, cluster)] == ["node", "interface", "link", "aggregate", "cluster"]
    with pytest.raises(ValidationError):
        adapter.validate_python({"kind": "planet", "hostname": "sw-a"})


def test_cluster_ref_members_are_sorted_unique_and_non_empty():
    adapter = TypeAdapter(Ref)
    for members in (["fw-2", "fw-1"], ["fw-1", "fw-1"], []):
        with pytest.raises(ValidationError):
            adapter.validate_python({"kind": "cluster", "members": members})


def test_ref_key_orders_by_kind_then_identity_with_natural_interface_names():
    adapter = TypeAdapter(Ref)
    refs = [
        adapter.validate_python({"kind": "interface", "hostname": "sw-a", "name": "Ethernet1/10"}),
        adapter.validate_python({"kind": "interface", "hostname": "sw-a", "name": "Ethernet1/2"}),
        adapter.validate_python({"kind": "node", "hostname": "sw-a"}),
        adapter.validate_python({"kind": "aggregate", "hostname": "sw-a", "name": "port-channel10"}),
    ]
    ordered = sorted(refs, key=ref_key)
    assert [(r.kind, getattr(r, "name", None)) for r in ordered] == [
        ("aggregate", "port-channel10"),
        ("interface", "Ethernet1/2"),
        ("interface", "Ethernet1/10"),
        ("node", None),
    ]


def test_endpoint_is_strict_and_immutable():
    ep = Endpoint.model_validate(endpoint("sw-a", "x1"))
    with pytest.raises(ValidationError):
        Endpoint.model_validate({**endpoint("sw-a", "x1"), "extra": 1})
    with pytest.raises(ValidationError):
        ep.hostname = "other"  # type: ignore[misc]

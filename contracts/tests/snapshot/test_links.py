"""Liens : endpoints triés, évidences, cohérence du statut avec les sources."""

import pytest
from pydantic import ValidationError

from ld_contracts.snapshot.links import Link
from tests.snapshot.conftest import endpoint, evidence_doc, first_error, link_doc


def test_example_link_is_valid():
    link = Link.model_validate(link_doc())
    assert link.status == "confirmed" and len(link.evidence) == 4


def test_link_needs_at_least_one_evidence():
    with pytest.raises(ValidationError):
        Link.model_validate(link_doc(evidence=[]))


def test_witness_must_be_one_of_the_endpoints():
    stranger = evidence_doc(witness=endpoint("sw-c", "Ethernet1/1"))
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(evidence=[stranger]))
    assert first_error(exc)["type"] == "evidence_witness_not_endpoint"


def test_status_must_match_evidence_sources():
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(status="confirmed", evidence=[evidence_doc()]))
    assert first_error(exc)["type"] == "link_status_mismatch"
    Link.model_validate(link_doc(status="observed_only", evidence=[evidence_doc()]))
    Link.model_validate(link_doc(status="documented_only", evidence=[evidence_doc(source="description")]))
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(status="observed_only"))
    assert first_error(exc)["type"] == "link_status_mismatch"


def test_evidence_is_canonically_ordered():
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(evidence=[evidence_doc(), evidence_doc(source="description")]))
    assert first_error(exc)["type"] == "not_canonical_order"
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(evidence=[evidence_doc(), evidence_doc()]))
    assert first_error(exc)["type"] == "duplicate_identity"


def test_description_without_port_resolves_the_device_only():
    """`C1|sw-b|` : le port documenté est absent, l'accord se juge sur le device (R3, comme le cas MAC)."""
    ev = evidence_doc(
        source="description",
        remote_raw={"name": "sw-b", "port": None},
        remote_resolved={"hostname": "sw-b", "interface": None},
    )
    link = Link.model_validate(link_doc(status="confirmed", evidence=[ev, evidence_doc()]))
    assert link.evidence[0].remote_resolved.interface is None
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(evidence=[evidence_doc(remote_resolved={"hostname": "sw-b"})]))
    assert first_error(exc)["type"] == "missing"


def test_resolved_remote_must_be_the_device_opposite_the_witness():
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(
            link_doc(status="observed_only", evidence=[evidence_doc(remote_resolved=endpoint("sw-z", "x1"))])
        )
    assert first_error(exc)["type"] == "evidence_resolved_not_endpoint"
    same_side = evidence_doc(witness=endpoint("sw-b", "Ethernet1/1"), remote_resolved=endpoint("sw-b", "Ethernet1/1"))
    with pytest.raises(ValidationError) as exc:
        Link.model_validate(link_doc(status="observed_only", evidence=[same_side]))
    assert first_error(exc)["type"] == "evidence_resolved_not_endpoint"


def test_link_kinds_are_closed_and_cable_is_the_only_v1_kind():
    for kind in ("l2_segment", "l3_adjacency", "bgp_session"):
        Link.model_validate(link_doc(kind=kind))
    with pytest.raises(ValidationError):
        Link.model_validate(link_doc(kind="tunnel"))

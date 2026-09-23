"""Contrôles : catalogue fermé, sévérités, origine, références triées."""

import pytest
from pydantic import ValidationError

from ld_contracts.checks import FINDING_CODES
from ld_contracts.defaults import ABSENT_CODE
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CATALOGUE, RECOPIED_FINDING_CODES, CheckCode
from ld_contracts.snapshot.enums import CheckOrigin, Severity
from tests.snapshot.conftest import check_doc, endpoint, first_error, link_ref

DOCS_05_SECTION_4 = {
    "neighbor_name_case_differs": {"info"},
    "neighbor_resolved_by_reported_hostname": {"warning"},
    "neighbor_resolved_by_address": {"warning"},
    "neighbor_name_ambiguous": {"warning"},
    "neighbor_unknown": {"info"},
    "remote_port_is_mac": {"info"},
    "remote_port_is_aggregate": {"warning"},
    "description_unparseable": {"info"},
    "description_disagrees_with_observed": {"warning"},
    "multiple_observed_neighbors": {"warning"},
    "one_way_observation": {"warning"},
    "self_observation": {"warning"},
    "documented_not_observed": {"warning", "info"},
    "aggregate_member_not_bundled": {"warning"},
    "aggregate_below_min_links": {"error"},
    "aggregate_protocol_mismatch": {"error"},
    "mlag_downstream_inconsistent": {"warning"},
    "mlag_pair_direct_link": {"warning"},
    "ha_member_down": {"error"},
    "ha_view_mismatch": {"warning"},
    "heartbeat_link_not_observed": {"info"},
    "link_oper_mismatch": {"warning"},
    "link_speed_mismatch": {"warning"},
    "native_vlan_mismatch": {"warning"},
    "link_down": {"info"},
    "documented_port_without_transceiver": {"warning"},
    "device_unreachable": {"error"},
    "device_partial_collection": {"info"},
}


def test_catalogue_covers_docs_05_section_4_with_the_same_severities():
    for code, severities in DOCS_05_SECTION_4.items():
        spec = CATALOGUE[CheckCode(code)]
        assert spec.origin == CheckOrigin.CORRELATION, code
        assert {s.value for s in spec.severities} == severities, code
        assert spec.rule.startswith("R"), code


def test_bundle_findings_are_recopied_except_absent_keys():
    bundle_codes = {code.value for code, spec in CATALOGUE.items() if spec.origin == CheckOrigin.BUNDLE}
    assert bundle_codes == set(FINDING_CODES) - {ABSENT_CODE} == RECOPIED_FINDING_CODES
    assert set(CheckCode) == set(CATALOGUE)
    assert {c.value for c in CheckCode} == set(DOCS_05_SECTION_4) | bundle_codes


def test_every_catalogue_entry_has_a_meaning_and_at_least_one_severity():
    for code, spec in CATALOGUE.items():
        assert spec.meaning and spec.severities, code
        assert spec.severities <= set(Severity)


def test_severity_must_be_allowed_for_the_code():
    with pytest.raises(ValidationError) as exc:
        Check.model_validate(check_doc(code="link_down", severity="error"))
    assert first_error(exc)["type"] == "check_severity_not_allowed"
    Check.model_validate(check_doc(code="documented_not_observed", severity="warning"))
    Check.model_validate(check_doc(code="documented_not_observed", severity="info"))


def test_origin_must_match_the_catalogue():
    with pytest.raises(ValidationError) as exc:
        Check.model_validate(check_doc(origin="bundle"))
    assert first_error(exc)["type"] == "check_origin_mismatch"
    node = {"kind": "node", "hostname": "sw-a"}
    Check.model_validate(check_doc(code="reported_hostname_differs", severity="warning", origin="bundle", refs=[node]))


def test_unknown_code_is_refused():
    with pytest.raises(ValidationError):
        Check.model_validate(check_doc(code="something_new"))


def test_refs_are_canonical_and_details_are_json():
    a, b = endpoint("sw-a", "Ethernet1/1"), endpoint("sw-b", "Ethernet1/1")
    refs = [link_ref(a, b), {"kind": "interface", "hostname": "sw-a", "name": "Ethernet1/1"}]
    with pytest.raises(ValidationError) as exc:
        Check.model_validate(check_doc(refs=refs))
    assert first_error(exc)["type"] == "not_canonical_order"
    check = Check.model_validate(check_doc(refs=list(reversed(refs)), details={"targets": ["x", "y"], "n": 2}))
    assert check.details["n"] == 2


def test_details_must_be_json_values():
    for bad in ({"x": {1, 2}}, {"x": object()}, {"x": b"bytes"}):
        with pytest.raises(ValidationError):
            Check.model_validate(check_doc(details=bad))
    Check.model_validate(
        check_doc(details={"targets": [{"hostname": "sw-b", "interface": None}], "n": 1.5, "ok": True})
    )

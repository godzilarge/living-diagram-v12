import copy

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import check_bundle


def codes(bundle_dict):
    return {w.code for w in check_bundle(RunBundle.model_validate(bundle_dict))}


def test_minimal_fixture_has_no_referential_findings(minimal_dict):
    assert codes(minimal_dict) == set()


def test_aggregate_member_missing_from_interfaces(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["aggregates"][0]["members"].append({"name": "Ethernet1/48", "status": "bundled"})
    assert "aggregate_member_unknown" in codes(bad)


def test_parent_interface_missing(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    sub = next(i for i in bad["interfaces"] if i["type"] == "subinterface")
    sub["parent_interface"] = "x9"
    assert "parent_interface_unknown" in codes(bad)


def test_lldp_local_interface_missing(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["lldp"][0]["local_interface"] = "Ethernet1/48"
    assert "local_interface_unknown" in codes(bad)


def test_ha_member_outside_devices_is_a_finding_not_an_error(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    bad["ha"][0]["members"].append(
        {"name": "fw-edge-99", "serial": None, "role": "member", "state": "unknown", "priority": None}
    )
    assert "ha_member_unknown" in codes(bad)


def test_task_without_subject_but_documents_present(minimal_dict):
    bad = copy.deepcopy(minimal_dict)
    del bad["tasks"][0]["status_per_subject"]["lldp"]
    assert "documents_without_task" in codes(bad)


def test_upstream_subject_aliases_are_accepted(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    for task in doc["tasks"]:
        subjects = task["status_per_subject"]
        for old, new in (("lldp", "lldp_neighbors"), ("cdp", "cdp_neighbors"), ("system", "system_info")):
            if old in subjects:
                subjects[new] = subjects.pop(old)
    assert "documents_without_task" not in codes(doc)


def test_reported_hostname_case_difference_is_not_a_finding_but_domain_is(minimal_dict):
    assert "reported_hostname_differs" not in codes(minimal_dict)
    bad = copy.deepcopy(minimal_dict)
    bad["system"][0]["reported_hostname"] = "sw-core-01.corp.local"
    assert "reported_hostname_differs" in codes(bad)

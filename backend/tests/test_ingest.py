from ld_backend.archive import BundleArchive
from ld_backend.ingest import ingest_bundle, result_payload
from tests.conftest import modified


def test_valid_bundle_is_created_then_already_present(archive: BundleArchive, bundle_dict):
    first = ingest_bundle(bundle_dict, archive)
    assert first.status == "created" and first.http_status == 201
    assert first.summary["devices_in_scope"] == 4 and first.summary["interfaces"] == 18
    again = ingest_bundle(bundle_dict, archive)
    assert again.status == "already_present" and again.http_status == 200


def test_conflicting_bundle_is_refused(archive: BundleArchive, bundle_dict):
    ingest_bundle(bundle_dict, archive)
    result = ingest_bundle(modified(bundle_dict), archive)
    assert result.status == "conflict" and result.http_status == 409
    assert archive.load_bundle("infra-lab", "66db3f0e9a1c2b0012f4a7d1")["interfaces"][0]["oper_status"] == "up"


def test_invalid_bundle_is_reported_and_not_archived(archive: BundleArchive, bundle_dict):
    bad = dict(bundle_dict, contract_version="2.0.0")
    result = ingest_bundle(bad, archive)
    assert result.status == "invalid" and result.http_status == 422
    assert any(i.path == "contract_version" for i in result.errors)
    assert archive.list_runs("infra-lab") == []


def test_not_a_bundle_at_all(archive: BundleArchive):
    result = ingest_bundle(["nope"], archive)
    assert result.status == "invalid" and result.errors


def test_findings_are_returned_with_the_report(archive: BundleArchive, bundle_dict):
    doc = dict(bundle_dict)
    doc["aggregates"] = [
        dict(
            doc["aggregates"][0],
            members=[*doc["aggregates"][0]["members"], {"name": "Ethernet1/48", "status": "bundled"}],
        )
    ]
    result = ingest_bundle(doc, archive)
    assert result.status == "created"
    assert "aggregate_member_unknown" in {f.code for f in result.findings}
    payload = result_payload(result)
    assert payload["status"] == "created" and payload["findings"][0]["code"] == "aggregate_member_unknown"
    assert (
        archive.load_report("infra-lab", "66db3f0e9a1c2b0012f4a7d1")["findings"][0]["code"]
        == "aggregate_member_unknown"
    )

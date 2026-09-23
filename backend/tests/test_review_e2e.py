"""Corrections issues du test de bout en bout du 2026-09-19 (instance réelle, bundles soumis au `curl`)."""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from tests.conftest import modified

URL, BUNDLE_URL, REPORT_URL = "/api/ingest/bundles", "/api/ingest/bundle", "/api/ingest/report"


def _relabel(bundle: dict, infrastructure: str, run_id: str) -> dict:
    doc = json.loads(json.dumps(bundle))
    for device in doc["devices"]:
        if device["infrastructure"] == doc["infrastructure"]:
            device["infrastructure"] = infrastructure
    doc["infrastructure"], doc["run"]["collector_run_id"] = infrastructure, run_id
    return doc


@pytest.mark.parametrize(
    ("infrastructure", "run_id"),
    [
        ("DC/Paris", "run-1"),
        ("infra-lab", "../../etc/passwd"),
        ("DC Paris Prod", "run 1"),
        ("cœur-réseau", "a/b?c=d&e#f"),
    ],
)
def test_any_archived_run_can_be_read_back(client: TestClient, auth, bundle_dict, infrastructure, run_id):
    """Un libellé libre (`/`, espace, accent, `?`) s'archivait et se listait, mais ne se relisait pas (404)."""
    assert client.post(URL, json=_relabel(bundle_dict, infrastructure, run_id), headers=auth).status_code == 201
    params = {"infrastructure": infrastructure, "run_id": run_id}
    listed = client.get(URL, params={"infrastructure": infrastructure}, headers=auth).json()["runs"]
    assert [r["run_id"] for r in listed] == [run_id]
    bundle = client.get(BUNDLE_URL, params=params, headers=auth)
    assert bundle.status_code == 200 and bundle.json()["run"]["collector_run_id"] == run_id
    report = client.get(REPORT_URL, params=params, headers=auth)
    assert report.status_code == 200 and report.json()["run_id"] == run_id


def test_path_addressed_read_routes_are_gone(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    assert client.get(f"{URL}/infra-lab/66db3f0e9a1c2b0012f4a7d1", headers=auth).status_code == 404
    assert client.get(f"{URL}/infra-lab/66db3f0e9a1c2b0012f4a7d1/report", headers=auth).status_code == 404


def test_run_list_carries_the_collection_dates_and_status(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    run = client.get(URL, params={"infrastructure": "infra-lab"}, headers=auth).json()["runs"][0]
    assert set(run) == {"run_id", "run_start", "run_end", "run_status", "produced_at", "stored_at", "sha256"}
    assert run["run_start"] == bundle_dict["run"]["start_datetime"] and run["run_status"] == "completed"
    assert all(run[k].endswith("Z") for k in ("run_start", "run_end", "produced_at", "stored_at"))


def test_summary_date_uses_the_contract_form(client: TestClient, auth, bundle_dict):
    body = client.post(URL, json=bundle_dict, headers=auth).json()
    assert body["summary"]["produced_at"] == bundle_dict["produced_at"] == "2026-09-10T02:20:11Z"


def test_conflict_says_what_differs(client: TestClient, auth, bundle_dict):
    first = client.post(URL, json=bundle_dict, headers=auth)
    listed = client.get(URL, params={"infrastructure": "infra-lab"}, headers=auth).json()["runs"][0]
    res = client.post(URL, json=modified(bundle_dict), headers=auth)
    assert first.status_code == 201 and res.status_code == 409
    conflict = res.json()["conflict"]
    assert conflict["archived_sha256"] == listed["sha256"] != conflict["received_sha256"]
    assert conflict["archived_stored_at"] == listed["stored_at"]
    assert first.json()["conflict"] is None and res.json()["summary"] is None


def test_findings_are_structured_in_the_report(client: TestClient, auth, bundle_dict):
    sparse = json.loads(json.dumps(bundle_dict))
    del sparse["interfaces"][0]["mtu"]
    finding = client.post(URL, json=sparse, headers=auth).json()["findings"][0]
    assert finding["details"] == {"field": "interfaces[].mtu", "occurrences": 1, "devices": 1}
    assert set(finding) == {"code", "message", "hostname", "ref", "details"}


def test_scope_error_path_points_at_the_document(client: TestClient, auth, bundle_dict):
    ghost = json.loads(json.dumps(bundle_dict))
    ghost["lldp"][0]["hostname"] = "ghost-01"
    res = client.post(URL, json=ghost, headers=auth)
    assert res.status_code == 422 and [e["path"] for e in res.json()["errors"]] == ["lldp.0.hostname"]
    assert "ghost-01" not in res.text


def test_root_that_is_not_an_object_is_422_without_internal_names(client: TestClient, auth):
    res = client.post(URL, content=b"[]", headers={**auth, "Content-Type": "application/json"})
    assert res.status_code == 422 and "RunBundle" not in res.text and res.json()["summary"] is None


@pytest.mark.parametrize("content_type", ["text/plain", "application/xml", None])
def test_body_must_be_declared_as_json(client: TestClient, auth, bundle_dict, content_type):
    headers = {**auth, **({"Content-Type": content_type} if content_type else {})}
    res = client.post(URL, content=json.dumps(bundle_dict).encode(), headers=headers)
    assert res.status_code == 415 and "application/json" in res.json()["detail"]


@pytest.mark.parametrize("content_type", ["application/json", "application/json; charset=utf-8", "application/ld+json"])
def test_json_media_types_are_accepted(client: TestClient, auth, bundle_dict, content_type):
    res = client.post(URL, content=json.dumps(bundle_dict).encode(), headers={**auth, "Content-Type": content_type})
    assert res.status_code == 201


def test_query_errors_use_the_api_shape_and_echo_nothing(client: TestClient, auth):
    res = client.get(URL, headers=auth)
    assert res.status_code == 422
    assert res.json() == {
        "detail": "paramètres de requête invalides",
        "errors": [{"path": "query.infrastructure", "message": "Field required"}],
    }
    res = client.get(BUNDLE_URL, params={"infrastructure": "infra-lab", "run_id": ""}, headers=auth)
    assert res.status_code == 422 and "input" not in res.text


def test_openapi_types_the_responses(client: TestClient):
    doc = client.get("/openapi.json").json()
    post = doc["paths"][URL]["post"]["responses"]
    for code in ("200", "201", "409", "422"):
        assert post[code]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/IngestReport"}
    schemas = doc["components"]["schemas"]
    assert {"IngestReport", "IngestError", "IngestFinding", "IngestSummary", "IngestConflict", "RunList"} <= set(
        schemas
    )
    assert set(doc["paths"]) == {"/api/health", URL, BUNDLE_URL, REPORT_URL, "/api/snapshot"}
    listed = doc["paths"][URL]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert listed == {"$ref": "#/components/schemas/RunList"}


def test_each_ingestion_is_logged_without_bundle_values(client: TestClient, auth, bundle_dict, caplog):
    sparse = json.loads(json.dumps(bundle_dict))
    del sparse["interfaces"][0]["mtu"]
    with caplog.at_level(logging.INFO, logger="ld_backend.ingest"):
        client.post(URL, json=sparse, headers=auth)
        client.post(URL, json={"contract_version": "1.0.0"}, headers=auth)
    lines = [r.getMessage() for r in caplog.records if r.name == "ld_backend.ingest"]
    assert len(lines) == 2
    assert "status=created" in lines[0] and "findings=1" in lines[0] and "run='66db3f0e9a1c2b0012f4a7d1'" in lines[0]
    assert "status=invalid" in lines[1] and "errors=" in lines[1]
    assert all("sw-core-01" not in line for line in lines)


def test_a_run_id_with_a_newline_cannot_forge_a_log_line(client: TestClient, auth, bundle_dict, caplog):
    forged = _relabel(bundle_dict, "infra-lab", "x\nINFO:     ld_backend.ingest - ingestion status=created")
    with caplog.at_level(logging.INFO, logger="ld_backend.ingest"):
        assert client.post(URL, json=forged, headers=auth).status_code == 201
    lines = [r.getMessage() for r in caplog.records if r.name == "ld_backend.ingest"]
    assert len(lines) == 1 and "\n" not in lines[0]

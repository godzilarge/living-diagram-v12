"""`GET /api/snapshot` : le snapshot archivé, adressé comme le bundle, décrit dans OpenAPI par le contrat."""

import json

from fastapi.testclient import TestClient
from ld_contracts.snapshot import Snapshot

from ld_backend import snapshots
from tests.test_api import RUN, URL, _refs

SNAPSHOT_URL = "/api/snapshot"


def test_post_reports_the_correlation_and_the_snapshot_is_served_as_archived(client: TestClient, auth, bundle_dict):
    body = client.post(URL, json=bundle_dict, headers=auth).json()
    assert body["correlation"] == {
        "status": "created",
        "nodes": 6,
        "links": 6,
        "checks": body["correlation"]["checks"],
    }
    assert set(body["correlation"]["checks"]) == {"error", "warning", "info"}
    res = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    snapshot = Snapshot.model_validate_json(res.content)
    assert snapshot.source.infrastructure == "infra-lab" and len(snapshot.links) == 6


def test_snapshot_needs_the_token_and_both_parameters(client: TestClient, auth):
    assert client.get(SNAPSHOT_URL, params=RUN).status_code == 401
    assert client.get(SNAPSHOT_URL, params={"infrastructure": "infra-lab"}, headers=auth).status_code == 422


def test_unknown_run_and_missing_snapshot_are_two_different_404(client: TestClient, auth, bundle_dict, monkeypatch):
    unknown = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert unknown.status_code == 404 and "inconnue" in unknown.json()["detail"]

    def boom(*_: object) -> None:
        raise RuntimeError("bug de B1")

    monkeypatch.setattr(snapshots, "correlate", boom)
    posted = client.post(URL, json=bundle_dict, headers=auth)
    assert posted.status_code == 201 and posted.json()["correlation"]["status"] == "failed"
    assert "bug de B1" not in posted.text
    missing = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert missing.status_code == 404 and "ld correlate" in missing.json()["detail"]


def test_a_label_with_a_slash_addresses_its_snapshot(client: TestClient, auth, bundle_dict):
    doc = json.loads(json.dumps(bundle_dict).replace("infra-lab", "site/lab"))
    assert client.post(URL, json=doc, headers=auth).status_code == 201
    res = client.get(SNAPSHOT_URL, params={**RUN, "infrastructure": "site/lab"}, headers=auth)
    assert res.status_code == 200 and res.json()["source"]["infrastructure"] == "site/lab"


def test_corrupt_run_is_a_neutral_500(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    (settings.archive_dir / "infra-lab" / RUN["run_id"] / "meta.json").write_text("{broken", encoding="utf-8")
    res = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert res.status_code == 500 and "broken" not in res.text


def test_openapi_describes_the_snapshot_from_the_contract(client: TestClient):
    doc = client.get("/openapi.json").json()
    ok = doc["paths"][SNAPSHOT_URL]["get"]["responses"]["200"]
    assert ok["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Snapshot"}
    schemas = doc["components"]["schemas"]
    assert "links" in schemas["Snapshot"]["properties"] and "contract_version" in schemas["RunBundle"]["properties"]
    assert "CorrelationSummary" in schemas
    for ref in _refs(doc):
        assert ref.removeprefix("#/components/schemas/") in schemas, ref


# ---------------------------------------------------------------- revue du branchement (2026-09-20)


def test_m5_a_truncated_snapshot_is_never_served(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    (settings.archive_dir / "infra-lab" / RUN["run_id"] / "snapshot.json").write_bytes(b'{"nodes": [')
    res = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert res.status_code == 404 and "ld correlate" in res.json()["detail"]


def test_m6_an_unreadable_snapshot_is_a_neutral_500_in_the_api_shape(client, auth, bundle_dict, monkeypatch):
    client.post(URL, json=bundle_dict, headers=auth)

    def denied(*_: object) -> bytes:
        raise PermissionError(13, "Permission denied: /srv/archive/infra-lab")

    monkeypatch.setattr("ld_backend.archive.BundleArchive.load_snapshot_bytes", denied)
    res = client.get(SNAPSHOT_URL, params=RUN, headers=auth)
    assert res.status_code == 500 and "detail" in res.json() and "/srv/archive" not in res.text


def test_b9_no_contract_schema_is_renamed_by_a_name_collision(client: TestClient):
    """Deux classes homonymes dans les deux contrats : Pydantic préfixerait les deux par leur module (`a__b__Nom`)."""
    names = client.get("/openapi.json").json()["components"]["schemas"]
    assert [name for name in names if "__" in name] == []

"""`GET` et `POST /api/placement` : le placement mémorisé d'une infrastructure par l'API (docs/09)."""

import json

from fastapi.testclient import TestClient

from ld_backend.placement import Placement
from tests.test_api import RUN, URL, _refs

PLACEMENT_URL = "/api/placement"
PARAMS = {"infrastructure": RUN["infrastructure"]}
PLACE = {"hostname": "sw-core-01", "x": 120, "y": -40}


def body(*places: dict, replace: bool = False, base: int = 0) -> dict:
    return {"base_revision": base, "replace": replace, "places": list(places)}


def test_reading_needs_the_token_and_an_unknown_infrastructure_reads_empty(client: TestClient, auth):
    assert client.get(PLACEMENT_URL, params=PARAMS).status_code == 401
    res = client.get(PLACEMENT_URL, params=PARAMS, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    doc = Placement.model_validate_json(res.content)
    assert doc.revision == 0 and doc.places == () and doc.infrastructure == "infra-lab"
    assert client.get(PLACEMENT_URL, headers=auth).status_code == 422


def test_recording_needs_an_archived_run_then_the_first_place_stays(client: TestClient, auth, bundle_dict):
    assert client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE)).status_code == 401
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE), headers=auth)
    assert res.status_code == 404 and "aucune run" in res.json()["detail"] and "infra-lab" not in res.json()["detail"]
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE), headers=auth)
    assert res.status_code == 200
    doc = Placement.model_validate_json(res.content)
    assert doc.revision == 1 and [(p.hostname, p.x, p.y) for p in doc.places] == [("sw-core-01", 120, -40)]
    assert res.content == client.get(PLACEMENT_URL, params=PARAMS, headers=auth).content, "GET sert le même document"
    other = {"hostname": "fw-edge-01", "x": 3, "y": 4}
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body({**PLACE, "x": 999}, other, base=1), headers=auth)
    doc = Placement.model_validate_json(res.content)
    assert [(p.hostname, p.x) for p in doc.places] == [("fw-edge-01", 3), ("sw-core-01", 120)], (
        "une seconde page ne déplace pas ce qu'une première a déjà placé"
    )
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body({**PLACE, "x": 7}, base=2, replace=True), headers=auth)
    doc = Placement.model_validate_json(res.content)
    assert [(p.hostname, p.x) for p in doc.places] == [("sw-core-01", 7)] and doc.revision == 3, "« replacer »"


def test_a_page_that_drew_on_an_older_document_gets_409_and_the_current_document(client: TestClient, auth, bundle_dict):
    """Revue, H1 : la page redessine ses nouveaux venus autour du document courant, puis renvoie."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    assert client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE), headers=auth).status_code == 200
    stale = {"hostname": "fw-edge-01", "x": 3, "y": 4}
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body(stale, base=0), headers=auth)
    assert res.status_code == 409 and res.headers["content-type"].startswith("application/json")
    current = Placement.model_validate_json(res.content)
    assert current.revision == 1 and [p.hostname for p in current.places] == ["sw-core-01"], "le document courant"
    assert client.get(PLACEMENT_URL, params=PARAMS, headers=auth).content == res.content, "rien n'est écrit"
    assert (
        client.post(PLACEMENT_URL, params=PARAMS, json=body(stale, base=0, replace=True), headers=auth).status_code
        == 409
    )
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body(stale, base=1), headers=auth)
    assert res.status_code == 200 and Placement.model_validate_json(res.content).revision == 2
    assert client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE, base=0), headers=auth).status_code == 200, (
        "une requête qui n'apporte rien n'est jamais refusée"
    )


def test_invalid_requests_are_refused_in_the_shape_of_the_api(client: TestClient, auth, bundle_dict):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    bad = [
        {"base_revision": 0, "places": [PLACE]},
        {"replace": False, "places": [PLACE]},
        {"base_revision": -1, "replace": False, "places": [PLACE]},
        {"base_revision": "0", "replace": False, "places": [PLACE]},
        {"base_revision": 0, "replace": "oui", "places": [PLACE]},
        body({**PLACE, "x": 1.5}),
        body({**PLACE, "x": "12"}),
        body({**PLACE, "y": 10**7}),
        body({**PLACE, "hostname": ""}),
        body({**PLACE, "hostname": "h" * 254}),
        body({**PLACE, "author": "orhan"}),
        body(PLACE, {**PLACE, "x": 1}),
        body(*[{**PLACE, "hostname": f"h{i}"} for i in range(10_001)]),
        [PLACE],
    ]
    for item in bad:
        res = client.post(PLACEMENT_URL, params=PARAMS, json=item, headers=auth)
        assert res.status_code == 422, str(item)[:200]
        assert res.json()["detail"] == "corps de requête invalide" and res.json()["errors"], str(item)[:200]
        assert "sw-core-01" not in json.dumps(res.json()) and "oui" not in json.dumps(res.json()), (
            "jamais une valeur dans un message"
        )
    assert client.get(PLACEMENT_URL, params=PARAMS, headers=auth).json()["revision"] == 0, "rien n'a été écrit"
    headers = {**auth, "Content-Type": "application/json"}
    assert client.post(PLACEMENT_URL, params=PARAMS, content="{broken", headers=headers).status_code == 400
    plain = {**auth, "Content-Type": "text/plain"}
    assert client.post(PLACEMENT_URL, params=PARAMS, content="x=1", headers=plain).status_code == 415


def test_the_body_is_bounded(auth, bundle_dict, tmp_path):
    from ld_backend.api import create_app
    from ld_backend.config import Settings

    settings = Settings(api_token="test-token-123", archive_dir=tmp_path / "archive", max_intent_bytes=4_000)
    client = TestClient(create_app(settings))
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    huge = body(*[{**PLACE, "hostname": "h" * 200 + str(i)} for i in range(30)])
    res = client.post(PLACEMENT_URL, params=PARAMS, json=huge, headers=auth)
    assert res.status_code == 413 and "4000" in res.json()["detail"]
    assert client.get(PLACEMENT_URL, params=PARAMS, headers=auth).json()["revision"] == 0


def test_a_document_never_exceeds_the_cap(client: TestClient, auth, bundle_dict, monkeypatch):
    from ld_backend import placement as module

    monkeypatch.setattr(module, "MAX_PLACES", 2)
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    two = body({**PLACE, "hostname": "h0"}, {**PLACE, "hostname": "h1"})
    assert client.post(PLACEMENT_URL, params=PARAMS, json=two, headers=auth).status_code == 200
    res = client.post(PLACEMENT_URL, params=PARAMS, json=body({**PLACE, "hostname": "h2"}, base=1), headers=auth)
    assert res.status_code == 422 and res.json()["errors"][0]["path"] == "places" and "h2" not in res.text
    assert client.get(PLACEMENT_URL, params=PARAMS, headers=auth).json()["revision"] == 1


def test_a_corrupt_document_is_a_neutral_500_and_is_logged(client: TestClient, auth, bundle_dict, settings, caplog):
    import logging

    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    client.post(PLACEMENT_URL, params=PARAMS, json=body(PLACE), headers=auth)
    broken = settings.archive_dir / "_placement" / "infra-lab" / "placement.json"
    broken.write_text("{broken", encoding="utf-8")
    with caplog.at_level(logging.WARNING, logger="ld_backend.placement"):
        for method, kwargs in (("get", {}), ("post", {"json": body(PLACE)})):
            res = getattr(client, method)(PLACEMENT_URL, params=PARAMS, headers=auth, **kwargs)
            assert res.status_code == 500 and "ld placement" in res.json()["detail"] and "broken" not in res.text
    assert broken.read_text(encoding="utf-8") == "{broken"
    assert any("isolé" in record.getMessage() for record in caplog.records), "la trace est au journal du serveur"


def test_openapi_describes_the_placement(client: TestClient):
    doc = client.get("/openapi.json").json()
    get = doc["paths"][PLACEMENT_URL]["get"]
    ref = {"$ref": "#/components/schemas/Placement"}
    assert get["responses"]["200"]["content"]["application/json"]["schema"] == ref
    post = doc["paths"][PLACEMENT_URL]["post"]
    assert post["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PlacementWrite"
    }
    assert {"404", "409", "413", "415", "422", "500"} <= set(post["responses"])
    assert post["responses"]["409"]["content"]["application/json"]["schema"] == ref
    schemas = doc["components"]["schemas"]
    assert {"Placement", "Place", "PlacementWrite"} <= set(schemas)
    for found in _refs(doc):
        assert found.removeprefix("#/components/schemas/") in schemas, found

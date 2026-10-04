"""`GET /api/intent` et `POST /api/intent/patches` : la couche d'intention par l'API (B4, docs/08)."""

import json

from fastapi.testclient import TestClient
from ld_contracts.intent import Intent

from tests.test_api import RUN, URL, _refs

INTENT_URL = "/api/intent"
PATCHES_URL = "/api/intent/patches"
PARAMS = {"infrastructure": RUN["infrastructure"]}
PIN = {"op": "pin", "hostname": "sw-core-01", "x": 120, "y": -40}


def test_reading_needs_the_token_and_an_unknown_infrastructure_reads_empty(client: TestClient, auth):
    assert client.get(INTENT_URL, params=PARAMS).status_code == 401
    res = client.get(INTENT_URL, params=PARAMS, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    intent = Intent.model_validate_json(res.content)
    assert intent.revision == 0 and intent.pins == () and intent.infrastructure == "infra-lab"
    assert client.get(INTENT_URL, headers=auth).status_code == 422


def test_patches_need_an_archived_run(client: TestClient, auth, bundle_dict):
    body = {"author": "orhan", "ops": [PIN]}
    assert client.post(PATCHES_URL, params=PARAMS, json=body).status_code == 401
    res = client.post(PATCHES_URL, params=PARAMS, json=body, headers=auth)
    assert res.status_code == 404 and "aucune run" in res.json()["detail"] and "infra-lab" not in res.json()["detail"]
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    res = client.post(PATCHES_URL, params=PARAMS, json=body, headers=auth)
    assert res.status_code == 200
    intent = Intent.model_validate_json(res.content)
    assert intent.revision == 1 and [(p.hostname, p.x, p.y, p.author) for p in intent.pins] == [
        ("sw-core-01", 120, -40, "orhan")
    ]
    assert intent.updated_at is not None and intent.pins[0].at == intent.updated_at
    assert res.content == client.get(INTENT_URL, params=PARAMS, headers=auth).content, "GET sert le même document"


def test_last_writer_wins_per_pin_and_authors_coexist(client: TestClient, auth, bundle_dict):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [PIN]}, headers=auth)
    alice = {"author": "  alice ", "ops": [{"op": "pin", "hostname": "fw-edge-01", "x": 0, "y": 0}, {**PIN, "x": 1}]}
    res = client.post(PATCHES_URL, params=PARAMS, json=alice, headers=auth)
    pins = [(p.hostname, p.x, p.author) for p in Intent.model_validate_json(res.content).pins]
    assert pins == [("fw-edge-01", 0, "alice"), ("sw-core-01", 1, "alice")], "l'auteur est débarrassé de ses blancs"
    res = client.post(
        PATCHES_URL,
        params=PARAMS,
        json={"author": "orhan", "ops": [{"op": "unpin", "hostname": "sw-core-01"}]},
        headers=auth,
    )
    intent = Intent.model_validate_json(res.content)
    assert intent.revision == 3 and [p.hostname for p in intent.pins] == ["fw-edge-01"]


def test_invalid_operations_are_refused_in_the_shape_of_the_api(client: TestClient, auth, bundle_dict):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    bad = [
        {"author": "orhan", "ops": []},
        {"author": "   ", "ops": [PIN]},
        {"author": "x" * 81, "ops": [PIN]},
        {"author": "orhan", "ops": [{"op": "move", "hostname": "x"}]},
        {"author": "orhan", "ops": [{**PIN, "x": 1.5}]},
        {"author": "orhan", "ops": [{**PIN, "x": "12"}]},
        {"author": "orhan", "ops": [{**PIN, "y": 10**7}]},
        {"author": "orhan", "ops": [{**PIN, "hostname": ""}]},
        {"author": "orhan", "ops": [{**PIN, "extra": 1}]},
        {"author": "orhan", "ops": [PIN] * 501},
    ]
    for body in bad:
        res = client.post(PATCHES_URL, params=PARAMS, json=body, headers=auth)
        assert res.status_code == 422, body
        assert res.json()["detail"] == "corps de requête invalide" and res.json()["errors"], body
        text = json.dumps(res.json())
        assert "sw-core-01" not in text and "move" not in text and "x" * 81 not in text, (
            "jamais une valeur dans un message"
        )
    assert client.get(INTENT_URL, params=PARAMS, headers=auth).json()["revision"] == 0, "rien n'a été écrit"
    assert (
        client.post(
            PATCHES_URL, params=PARAMS, content="{broken", headers={**auth, "Content-Type": "application/json"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            PATCHES_URL, params=PARAMS, content="x=1", headers={**auth, "Content-Type": "text/plain"}
        ).status_code
        == 415
    )


def test_the_body_and_the_document_are_bounded(auth, bundle_dict, tmp_path):
    """Revue B4, H2 : corps borné, hostname borné, document borné : un jeton ne permet pas de tout remplir."""
    from ld_backend.api import create_app
    from ld_backend.config import Settings

    settings = Settings(api_token="test-token-123", archive_dir=tmp_path / "archive", max_intent_bytes=4_000)
    client = TestClient(create_app(settings))
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    huge = {"author": "orhan", "ops": [{**PIN, "hostname": "h" * 200, "x": i} for i in range(30)]}
    res = client.post(PATCHES_URL, params=PARAMS, json=huge, headers=auth)
    assert res.status_code == 413 and "4000" in res.json()["detail"]
    assert client.get(INTENT_URL, params=PARAMS, headers=auth).json()["revision"] == 0
    too_long_name = {"author": "orhan", "ops": [{**PIN, "hostname": "h" * 254}]}
    assert client.post(PATCHES_URL, params=PARAMS, json=too_long_name, headers=auth).status_code == 422
    doc = client.get("/openapi.json").json()["paths"][PATCHES_URL]["post"]["responses"]
    assert "413" in doc and "415" in doc


def test_a_document_never_exceeds_the_pin_cap(client: TestClient, auth, bundle_dict, settings, monkeypatch):
    from ld_backend import intent as intent_module

    monkeypatch.setattr(intent_module, "MAX_PINS", 3)
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    three = {"author": "orhan", "ops": [{**PIN, "hostname": f"h{i}"} for i in range(3)]}
    assert client.post(PATCHES_URL, params=PARAMS, json=three, headers=auth).status_code == 200
    res = client.post(
        PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [{**PIN, "hostname": "h4"}]}, headers=auth
    )
    assert res.status_code == 422 and res.json()["errors"][0]["path"] == "ops" and "h4" not in res.text
    assert client.get(INTENT_URL, params=PARAMS, headers=auth).json()["revision"] == 1, "rien n'a été écrit"
    replace = {"author": "orhan", "ops": [{**PIN, "hostname": "h0", "x": 9}]}
    assert client.post(PATCHES_URL, params=PARAMS, json=replace, headers=auth).status_code == 200, (
        "remplacer ne dépasse pas"
    )


def test_a_corrupt_store_is_a_neutral_500(client: TestClient, auth, bundle_dict, settings):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [PIN]}, headers=auth)
    broken = settings.archive_dir / "_intent" / "infra-lab" / "intent.json"
    broken.write_text("{broken", encoding="utf-8")
    for method, kwargs in (("get", {}), ("post", {"json": {"author": "orhan", "ops": [PIN]}})):
        res = getattr(client, method)(
            INTENT_URL if method == "get" else PATCHES_URL, params=PARAMS, headers=auth, **kwargs
        )
        assert res.status_code == 500 and "intervention" in res.json()["detail"] and "broken" not in res.text
    assert broken.read_text(encoding="utf-8") == "{broken"


def test_a_corrupt_store_is_a_neutral_500_and_is_logged(client: TestClient, auth, bundle_dict, settings, caplog):
    import logging

    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [PIN]}, headers=auth)
    broken = settings.archive_dir / "_intent" / "infra-lab" / "intent.json"
    broken.write_text("{broken", encoding="utf-8")
    with caplog.at_level(logging.WARNING, logger="ld_backend.intent"):
        res = client.get(INTENT_URL, params=PARAMS, headers=auth)
    assert res.status_code == 500 and "corrompu" in res.json()["detail"]
    assert any("isolé" in record.getMessage() for record in caplog.records), "la trace est au journal du serveur"


def test_openapi_describes_the_intent_from_the_contract(client: TestClient):
    doc = client.get("/openapi.json").json()
    get = doc["paths"][INTENT_URL]["get"]
    assert get["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Intent"}
    post = doc["paths"][PATCHES_URL]["post"]
    assert post["requestBody"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/IntentOps"}
    schemas = doc["components"]["schemas"]
    assert {"Intent", "Pin", "IntentOps", "PinOp", "UnpinOp"} <= set(schemas)
    for ref in _refs(doc):
        assert ref.removeprefix("#/components/schemas/") in schemas, ref

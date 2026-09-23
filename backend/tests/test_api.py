import gc
import json
import re

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from ld_backend import api
from ld_backend.api import create_app
from tests.conftest import TOKEN, modified

URL = "/api/ingest/bundles"
BUNDLE_URL, REPORT_URL = "/api/ingest/bundle", "/api/ingest/report"
RUN = {"infrastructure": "infra-lab", "run_id": "66db3f0e9a1c2b0012f4a7d1"}


def test_health_needs_no_token(client: TestClient):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_post_without_or_with_wrong_token_is_unauthorized(client: TestClient, bundle_dict):
    assert client.post(URL, json=bundle_dict).status_code == 401
    assert client.post(URL, json=bundle_dict, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_post_valid_bundle_created_then_already_present(client: TestClient, auth, bundle_dict):
    first = client.post(URL, json=bundle_dict, headers=auth)
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["status"] == "created" and body["infrastructure"] == "infra-lab"
    assert body["summary"]["interfaces"] == 18 and body["errors"] == []
    again = client.post(URL, json=bundle_dict, headers=auth)
    assert again.status_code == 200 and again.json()["status"] == "already_present"


def test_post_conflicting_bundle_is_409(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    res = client.post(URL, json=modified(bundle_dict), headers=auth)
    assert res.status_code == 409 and res.json()["status"] == "conflict"


def test_post_invalid_bundle_is_422_with_paths_and_no_values(client: TestClient, auth, bundle_dict):
    bad = dict(bundle_dict)
    bad["interfaces"] = [dict(bad["interfaces"][0], duplex="full-duplex", hostname="ghost-01")]
    res = client.post(URL, json=bad, headers=auth)
    assert res.status_code == 422
    body = res.json()
    assert body["status"] == "invalid"
    assert any(e["path"] == "interfaces.0.duplex" for e in body["errors"])
    serialized = json.dumps(body["errors"], ensure_ascii=False)
    assert "ghost-01" not in serialized and "full-duplex" not in serialized


def test_422_detail_keeps_only_locators(client: TestClient, auth, bundle_dict):
    """Le contexte de l'erreur porte hostname et infrastructures : le corps ne garde que section et index."""
    bad = dict(bundle_dict)
    bad["system"] = [*bad["system"], {**bad["system"][0], "hostname": "rt-wan-01"}]
    res = client.post(URL, json=bad, headers=auth)
    assert res.status_code == 422
    errors = res.json()["errors"]
    assert errors == [
        {
            "path": "system.3.hostname",
            "message": "le device de ce document appartient à une autre infrastructure",
            "detail": {"section": "system", "index": 3},
        }
    ]


def test_post_malformed_json_is_400(client: TestClient, auth):
    res = client.post(URL, content=b"{not json", headers={**auth, "Content-Type": "application/json"})
    assert res.status_code == 400


def test_post_too_large_is_413(client: TestClient, auth, bundle_dict):
    huge = dict(bundle_dict)
    huge["residual_normalizations"] = {f"rule_{i}": i for i in range(20_000)}
    res = client.post(URL, content=json.dumps(huge).encode(), headers={**auth, "Content-Type": "application/json"})
    assert res.status_code == 413


def test_get_runs_bundle_and_report(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    runs = client.get(URL, params={"infrastructure": "infra-lab"}, headers=auth)
    assert runs.status_code == 200 and runs.json()["runs"][0]["run_id"] == "66db3f0e9a1c2b0012f4a7d1"
    bundle = client.get(BUNDLE_URL, params=RUN, headers=auth)
    assert bundle.status_code == 200 and bundle.json()["infrastructure"] == "infra-lab"
    report = client.get(REPORT_URL, params=RUN, headers=auth)
    assert report.status_code == 200 and report.json()["status"] == "created"
    assert client.get(BUNDLE_URL, params={**RUN, "run_id": "unknown"}, headers=auth).status_code == 404
    assert client.get(URL, params={"infrastructure": "infra-lab"}).status_code == 401


# ---------------------------------------------------------------- review fixes


def test_corrupt_archive_entry_is_a_neutral_500(client: TestClient, auth, bundle_dict, settings):
    first = client.post(URL, json=bundle_dict, headers=auth)
    assert first.status_code == 201
    meta = settings.archive_dir / "infra-lab" / "66db3f0e9a1c2b0012f4a7d1" / "meta.json"
    meta.write_text("{broken", encoding="utf-8")
    res = client.post(URL, json=bundle_dict, headers=auth)
    assert res.status_code == 500 and "broken" not in res.text and str(settings.archive_dir) not in res.text


def test_report_has_no_path_and_bundle_get_returns_canonical_bytes(client: TestClient, auth, bundle_dict):
    body = client.post(URL, json=bundle_dict, headers=auth).json()
    assert "archived_path" not in body, "le couple (infrastructure, run_id) adresse la run ; aucun chemin annoncé"
    res = client.get(BUNDLE_URL, params=RUN, headers=auth)
    assert res.headers["content-type"].startswith("application/json")
    assert res.content.startswith(b'{"aggregates":')


def test_get_bundle_with_corrupt_bytes_is_a_neutral_500(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    (settings.archive_dir / "infra-lab" / "66db3f0e9a1c2b0012f4a7d1" / "bundle.json").write_text(
        "{corrupt", encoding="utf-8"
    )
    res = client.get(BUNDLE_URL, params=RUN, headers=auth)
    assert res.status_code == 500 and "corrupt" not in res.text.replace("corrompue", "")


def test_streamed_body_is_cut_before_the_end_asgi_level(settings, bundle_dict):
    """Le TestClient lit tout le corps avant l'application ; on parle donc ASGI directement."""
    import asyncio

    from ld_backend.api import create_app

    app = create_app(settings)
    payload = json.dumps(dict(bundle_dict, residual_normalizations={f"r{i}": i for i in range(30_000)})).encode()
    chunks = [payload[i : i + 8192] for i in range(0, len(payload), 8192)]
    delivered = 0
    sent: list[dict] = []

    async def receive():
        nonlocal delivered
        body = chunks[delivered]
        delivered += 1
        return {"type": "http.request", "body": body, "more_body": delivered < len(chunks)}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": URL,
        "raw_path": URL.encode(),
        "query_string": b"",
        "root_path": "",
        "server": ("test", 80),
        "client": ("test", 1),
        "headers": [
            (b"authorization", f"Bearer {TOKEN}".encode()),
            (b"content-type", b"application/json"),
            (b"transfer-encoding", b"chunked"),
        ],
    }
    asyncio.run(app(scope, receive, send))
    status = next(m["status"] for m in sent if m["type"] == "http.response.start")
    assert status == 413
    assert delivered < len(chunks), "le corps a été lu en entier avant le contrôle de taille"
    assert delivered <= settings.max_bundle_bytes // 8192 + 2


def test_openapi_uses_a_bearer_security_scheme_not_a_header_parameter(client: TestClient):
    doc = client.get("/openapi.json").json()
    schemes = doc["components"]["securitySchemes"]
    assert len(schemes) == 1
    ((name, scheme),) = schemes.items()
    assert scheme["type"] == "http" and scheme["scheme"] == "bearer"
    for path, item in doc["paths"].items():
        for method, operation in item.items():
            names = [p["name"].lower() for p in operation.get("parameters", [])]
            assert "authorization" not in names, (path, method)
            if path == "/api/health":  # seule route sans jeton : tout le reste lit ou écrit l'archive
                assert "security" not in operation, (path, method)
            else:
                assert operation["security"] == [{name: []}], (path, method)


def test_openapi_declares_the_bundle_body_from_the_contract(client: TestClient):
    doc = client.get("/openapi.json").json()
    body = doc["paths"][URL]["post"]["requestBody"]
    assert body["required"] is True
    assert body["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/RunBundle"}
    schemas = doc["components"]["schemas"]
    assert "contract_version" in schemas["RunBundle"]["properties"]
    assert "Device" in schemas and "Interface" in schemas
    assert "#/$defs/" not in json.dumps(schemas)
    responses = doc["paths"][URL]["post"]["responses"]
    assert {"200", "201", "400", "401", "409", "413", "422", "500"} <= set(responses)
    assert "content" in responses["201"], "201 est la réponse de succès par défaut du POST"


def test_unauthorized_rejects_raw_token_or_other_scheme_and_advertises_bearer(client: TestClient):
    for headers in ({"Authorization": TOKEN}, {"Authorization": f"Basic {TOKEN}"}, {}):
        response = client.get(URL, params={"infrastructure": "infra-lab"}, headers=headers)
        assert response.status_code == 401, headers
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.json() == {"detail": "jeton d'API absent ou invalide"}


def test_docs_page_is_served(client: TestClient):
    assert client.get("/docs").status_code == 200


def _refs(node: object) -> set[str]:
    if isinstance(node, dict):
        own = {node["$ref"]} if isinstance(node.get("$ref"), str) else set()
        return own.union(*(_refs(v) for v in node.values()))
    if isinstance(node, list):
        return set().union(*(_refs(v) for v in node))
    return set()


def test_every_openapi_ref_resolves_inside_the_document(client: TestClient):
    doc = client.get("/openapi.json").json()
    refs = _refs(doc)
    assert refs, "le document doit référencer les schémas du contrat"
    for ref in refs:
        assert ref.startswith("#/components/schemas/"), ref
        assert ref.removeprefix("#/components/schemas/") in doc["components"]["schemas"], ref


OPENAPI_KEY = re.compile(r"^[a-zA-Z0-9._-]+$")


def test_openapi_component_keys_are_valid(client: TestClient):
    components = client.get("/openapi.json").json()["components"]
    for section in ("securitySchemes", "schemas"):
        for key in components[section]:
            assert OPENAPI_KEY.fullmatch(key), (section, key)


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER"])
def test_bearer_scheme_is_case_insensitive(client: TestClient, scheme: str):
    response = client.get(URL, params={"infrastructure": "infra-lab"}, headers={"Authorization": f"{scheme} {TOKEN}"})
    assert response.status_code == 200


def test_unauthorized_responses_retain_no_request(client: TestClient):
    for i in range(40):
        headers = {"Authorization": f"Bearer wrong-{i}"}
        assert client.get(URL, params={"infrastructure": "infra-lab"}, headers=headers).status_code == 401
    gc.collect()
    assert [o for o in gc.get_objects() if isinstance(o, Request)] == []


def test_openapi_document_is_built_once(settings):
    app = create_app(settings)
    assert app.openapi() is app.openapi()
    assert "requestBody" in app.openapi()["paths"][URL]["post"]


def test_contract_schema_name_collision_is_an_error(settings, monkeypatch):
    monkeypatch.setattr(api, "_contract_schemas", lambda: {"HTTPValidationError": {"type": "string"}})
    with pytest.raises(RuntimeError, match="collision"):
        create_app(settings).openapi()


# ---------------------------------------------------------------- clés nullables absentes (2026-09-19)


def test_absent_nullable_key_is_ingested_counted_and_archived_in_canonical_form(client: TestClient, auth, bundle_dict):
    """Clé absente = `null`, comptée dans le rapport ; même empreinte que le `null` explicite."""
    sparse = json.loads(json.dumps(bundle_dict))
    del sparse["aggregates"][0]["min_links"]
    first = client.post(URL, json=sparse, headers=auth)
    assert first.status_code == 201, first.text
    findings = first.json()["findings"]
    assert [f["code"] for f in findings] == ["nullable_key_absent"]
    assert findings[0]["message"].startswith("aggregates[].min_links : ")
    explicit = json.loads(json.dumps(bundle_dict))
    explicit["aggregates"][0]["min_links"] = None
    again = client.post(URL, json=explicit, headers=auth)
    assert again.status_code == 200 and again.json()["status"] == "already_present"
    stored = client.get(BUNDLE_URL, params=RUN, headers=auth).json()
    assert stored["aggregates"][0]["min_links"] is None and "min_links" in stored["aggregates"][0]
    report = client.get(REPORT_URL, params=RUN, headers=auth).json()
    assert [f["code"] for f in report["findings"]] == ["nullable_key_absent"]


def test_response_describes_the_delivery_and_the_archive_keeps_the_first_one(client: TestClient, auth, bundle_dict):
    """Même empreinte, deux livraisons : la réponse décrit ce qui vient d'être reçu, `/report` ce qui est archivé."""
    explicit = json.loads(json.dumps(bundle_dict))
    explicit["interfaces"][0]["mtu"] = None
    sparse = json.loads(json.dumps(explicit))
    del sparse["interfaces"][0]["mtu"]
    assert client.post(URL, json=explicit, headers=auth).status_code == 201
    again = client.post(URL, json=sparse, headers=auth)
    assert again.status_code == 200 and again.json()["status"] == "already_present"
    assert [f["code"] for f in again.json()["findings"]] == ["nullable_key_absent"]
    assert client.get(REPORT_URL, params=RUN, headers=auth).json()["findings"] == []

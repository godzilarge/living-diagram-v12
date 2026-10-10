"""Le document OpenAPI (`/openapi.json`, `/docs`) : organisé, et fidèle à ce que l'API répond (audit du 2026-10-09)."""

import re

from fastapi.testclient import TestClient

from ld_backend import __version__
from ld_backend.openapi import TAGS
from ld_backend.schemas import IntentOp

PUBLIC = {("/api/health", "get")}
PROBLEM = {"$ref": "#/components/schemas/Problem"}
OPERATION_ID = re.compile(r"^[a-z]+(?:_[a-z]+)*$")


def _operations(doc: dict) -> list[tuple[str, str, dict]]:
    return [(path, method, op) for path, item in doc["paths"].items() for method, op in item.items()]


def _doc(client: TestClient) -> dict:
    return client.get("/openapi.json").json()


def test_the_document_names_the_whole_api_and_its_version(client: TestClient):
    info = _doc(client)["info"]
    assert info["title"] == "Living Diagram API"
    assert info["version"] == __version__
    for word in ("Ingestion", "Intention", "Placement", "Journal", "`/view`", "Authorize"):
        assert word in info["description"], word


def test_every_operation_has_one_declared_tag_in_pipeline_order(client: TestClient):
    doc = _doc(client)
    declared = [tag["name"] for tag in doc["tags"]]
    assert declared == [tag["name"] for tag in TAGS]
    assert all(tag.get("description") for tag in doc["tags"])
    used = []
    for path, method, op in _operations(doc):
        assert len(op.get("tags", [])) == 1, (path, method)
        used.append(op["tags"][0])
    assert set(used) == set(declared), "un tag déclaré sans route, ou une route sous un tag non déclaré"


def test_operation_ids_are_short_unique_snake_case(client: TestClient):
    ids = [op["operationId"] for _, _, op in _operations(_doc(client))]
    assert len(ids) == len(set(ids))
    for operation_id in ids:
        assert OPERATION_ID.fullmatch(operation_id) and "_api_" not in operation_id, operation_id


def test_pages_and_their_files_are_not_api_operations(client: TestClient):
    paths = set(_doc(client)["paths"])
    assert {"/", "/view"}.isdisjoint(paths)
    assert not any(path.startswith("/assets/") for path in paths)
    assert client.get("/").status_code == 200 and client.get("/view").status_code == 200


def test_every_protected_operation_documents_401_as_a_problem(client: TestClient):
    for path, method, op in _operations(_doc(client)):
        if (path, method) in PUBLIC:
            assert "security" not in op and "401" not in op["responses"], (path, method)
            continue
        assert op["security"] == [{"bearerAuth": []}], (path, method)
        assert op["responses"]["401"]["content"]["application/json"]["schema"] == PROBLEM, (path, method)


def test_every_error_response_has_a_body_schema_and_fastapi_default_is_gone(client: TestClient):
    doc = _doc(client)
    assert {"HTTPValidationError", "ValidationError"}.isdisjoint(doc["components"]["schemas"])
    problem = doc["components"]["schemas"]["Problem"]
    assert problem["required"] == ["detail"] and "errors" in problem["properties"]
    for path, method, op in _operations(doc):
        for code, response in op["responses"].items():
            if int(code) < 400:
                continue
            schema = response["content"]["application/json"]["schema"]
            assert schema == PROBLEM or (path, method, code) in INGEST_REPORTS, (path, method, code)


# Quatre refus portent un document plutôt qu'un problème : le rapport d'ingestion, le placement courant.
INGEST_REPORTS = {
    ("/api/ingest/bundles", "post", "409"),
    ("/api/ingest/bundles", "post", "500"),
    ("/api/ingest/bundles", "post", "422"),
    ("/api/placement", "post", "409"),
}


def test_every_success_response_declares_its_schema(client: TestClient):
    for path, method, op in _operations(_doc(client)):
        for code, response in op["responses"].items():
            if not code.startswith("2") or code == "204":
                continue
            content = response.get("content")
            assert content, (path, method, code)
            for media, body in content.items():
                assert body.get("schema"), (path, method, code, media)


def test_bodies_that_are_not_json_are_declared_with_their_media_types(client: TestClient):
    doc = _doc(client)
    bundle = doc["paths"]["/api/ingest/bundle"]["get"]["responses"]["200"]["content"]
    assert bundle == {"application/json": {"schema": {"$ref": "#/components/schemas/RunBundle"}}}
    assets = doc["paths"]["/api/intent/assets"]
    image = assets["get"]["responses"]["200"]["content"]
    assert set(image) == {"image/png", "image/jpeg", "image/webp"}
    assert image["image/png"]["schema"] == {"type": "string", "format": "binary"}
    upload = assets["post"]["requestBody"]
    assert upload["required"] is True and set(upload["content"]) == {"image/png", "image/jpeg", "image/webp"}
    for code in ("200", "201"):
        receipt = assets["post"]["responses"][code]["content"]["application/json"]["schema"]
        assert receipt == {"$ref": "#/components/schemas/AssetReceipt"}
    health = doc["paths"]["/api/health"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert health == {"$ref": "#/components/schemas/Health"}


def test_the_patch_route_names_every_operation_of_the_contract(client: TestClient):
    op = _doc(client)["paths"]["/api/intent/patches"]["post"]
    assert len(op["summary"]) <= 80
    names = [member.model_fields["op"].annotation.__args__[0] for member in IntentOp.__origin__.__args__]
    assert len(names) == 17
    for name in names:
        assert f"`{name}`" in op["description"], name


def test_summaries_are_one_short_line(client: TestClient):
    for path, method, op in _operations(_doc(client)):
        assert op.get("summary") and len(op["summary"]) <= 80 and "\n" not in op["summary"], (path, method)

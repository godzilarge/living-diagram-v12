"""`GET /api/intent/journal` : le journal des modifications de l'intention par l'API (lecture seule)."""

from fastapi.testclient import TestClient

from tests.test_api import URL

JOURNAL_URL = "/api/intent/journal"
PATCHES_URL = "/api/intent/patches"
LAB = {"infrastructure": "infra-lab"}


def _patch(client: TestClient, auth, author: str, ops: list[dict]) -> None:
    assert client.post(PATCHES_URL, params=LAB, json={"author": author, "ops": ops}, headers=auth).status_code == 200


def test_the_journal_needs_the_token_and_reads_empty_before_any_write(client: TestClient, auth):
    assert client.get(JOURNAL_URL).status_code == 401
    res = client.get(JOURNAL_URL, headers=auth)
    assert res.status_code == 200
    assert res.json() == {
        "entries": [],
        "total": 0,
        "next": None,
        "authors": [],
        "categories": [],
        "infrastructures": [],
        "unreadable": 0,
    }


def test_every_accepted_request_is_an_entry_filtered_and_paged(client: TestClient, auth, bundle_dict):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    _patch(client, auth, "orhan", [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}])
    _patch(client, auth, "alice", [{"op": "group_create", "label": "Cœur", "members": ["sw-core-01"]}])
    _patch(client, auth, "alice", [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}])
    page = client.get(JOURNAL_URL, params=LAB, headers=auth).json()
    assert [(e["revision"], e["author"], e["categories"]) for e in page["entries"]] == [
        (3, "alice", ["colors"]),
        (2, "alice", ["groups"]),
        (1, "orhan", ["positions"]),
    ]
    assert page["entries"][1]["subjects"] == [{"id": "g2-1", "kind": "group", "label": "Cœur", "form": ""}]
    assert page["infrastructures"] == [{"value": "infra-lab", "count": 3}]
    params = [("author", "orhan"), ("author", "alice"), ("category", "groups"), ("category", "positions")]
    filtered = client.get(JOURNAL_URL, params=params, headers=auth).json()
    assert [e["revision"] for e in filtered["entries"]] == [2, 1] and filtered["total"] == 2
    assert [e["revision"] for e in client.get(JOURNAL_URL, params={"q": "CŒUR"}, headers=auth).json()["entries"]] == [2]
    first = client.get(JOURNAL_URL, params={"limit": 2}, headers=auth).json()
    assert len(first["entries"]) == 2 and first["next"]
    rest = client.get(JOURNAL_URL, params={"limit": 2, "before": first["next"]}, headers=auth).json()
    assert [e["revision"] for e in rest["entries"]] == [1] and rest["next"] is None
    future = client.get(JOURNAL_URL, params={"since": "2999-01-01T00:00:00Z"}, headers=auth).json()
    assert future["entries"] == [] and future["total"] == 0


def test_invalid_parameters_are_refused_without_echo(client: TestClient, auth):
    for params in (
        {"category": "teleport"},
        {"since": "2026-10-06T10:00:00"},  # sans fuseau : refusée, jamais lue en heure locale
        {"limit": 0},
        {"limit": 501},
        {"infrastructure": ""},
        {"before": "pas-un-curseur"},
    ):
        res = client.get(JOURNAL_URL, params=params, headers=auth)
        assert res.status_code == 422, params
        body = res.json()
        assert body["errors"] and "pas-un-curseur" not in res.text and "teleport" not in res.text, params


def test_the_journal_route_is_typed_in_openapi(client: TestClient):
    schema = client.get("/openapi.json").json()
    response = schema["paths"][JOURNAL_URL]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert response == {"$ref": "#/components/schemas/JournalPage"}
    assert "JournalEntry" in schema["components"]["schemas"]

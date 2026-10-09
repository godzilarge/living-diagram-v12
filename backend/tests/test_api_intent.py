"""`GET /api/intent` et `POST /api/intent/patches` : la couche d'intention par l'API (B4, docs/08)."""

import json

from fastapi.testclient import TestClient
from ld_contracts.intent import Intent

from tests.test_api import RUN, URL, _refs

INTENT_URL = "/api/intent"
PATCHES_URL = "/api/intent/patches"
PARAMS = {"infrastructure": RUN["infrastructure"]}
PIN = {"op": "pin", "hostname": "sw-core-01", "x": 120, "y": -40}
TABLE = {"kind": "table", "header": False, "rows": [["x"]], "widths": None, "heights": None, "merges": []}


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
        {"author": "orhan", "ops": [{"op": "teleport", "hostname": "x"}]},
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
        assert "sw-core-01" not in text and "teleport" not in text and "x" * 81 not in text, (
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


def test_colour_operations_write_hues_and_refuse_unknown_hues_and_types(client: TestClient, auth, bundle_dict):
    """docs/10 : `color`, `uncolor`, `color_type`, `uncolor_type` par la même requête que les épingles."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    ops = [
        {"op": "color_type", "type": "firewall", "hue": "red"},
        {"op": "color", "hostname": "sw-core-01", "hue": "amber"},
    ]
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": ops}, headers=auth)
    assert res.status_code == 200
    intent = Intent.model_validate_json(res.content)
    assert [(c.type, c.hue, c.author) for c in intent.type_colors] == [("firewall", "red", "orhan")]
    assert [(c.hostname, c.hue) for c in intent.device_colors] == [("sw-core-01", "amber")] and intent.pins == ()
    for bad in (
        {"op": "color", "hostname": "sw-core-01", "hue": "#ff0000"},
        {"op": "color_type", "type": "phone", "hue": "red"},
        {"op": "uncolor_type", "type": "switch", "hue": "red"},
    ):
        res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [bad]}, headers=auth)
        assert res.status_code == 422 and "#ff0000" not in res.text, bad
    undo = [{"op": "uncolor", "hostname": "sw-core-01"}, {"op": "uncolor_type", "type": "firewall"}]
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "alice", "ops": undo}, headers=auth)
    intent = Intent.model_validate_json(res.content)
    assert intent.revision == 2 and intent.type_colors == () and intent.device_colors == ()


def test_group_operations_create_update_and_refuse_an_unknown_id(client: TestClient, auth, bundle_dict):
    """docs/10 §5 : la création répond avec l'identité du serveur ; un id inconnu ou un dernier membre retiré = 422."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    create = {
        "op": "group_create",
        "label": "Cœur",
        "members": ["sw-core-02", "sw-core-01"],
        "style": {"hue": "indigo"},
    }
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [create]}, headers=auth)
    assert res.status_code == 200
    intent = Intent.model_validate_json(res.content)
    assert [(g.id, g.label, g.members, g.style.hue, g.style.shape) for g in intent.groups] == [
        ("g1-1", "Cœur", ("sw-core-01", "sw-core-02"), "indigo", "rectangle")
    ]
    update = [
        {"op": "group_update", "id": "g1-1", "style": {"shape": "ellipse", "label_size": 20}},
        {"op": "group_remove", "id": "g1-1", "members": ["sw-core-02"]},
    ]
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "alice", "ops": update}, headers=auth)
    group = Intent.model_validate_json(res.content).groups[0]
    assert group.style.shape == "ellipse" and group.style.label_size == 20 and group.members == ("sw-core-01",)
    for bad in (
        {"op": "group_delete", "id": "g7-7"},
        {"op": "group_remove", "id": "g1-1", "members": ["sw-core-01"]},
        {"op": "group_create", "label": "", "members": ["a"]},
        {"op": "group_update", "id": "g1-1", "style": {"radius": 99}},
        {"op": "group_create", "label": "x", "members": []},
    ):
        res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [bad]}, headers=auth)
        assert res.status_code == 422, bad
    assert Intent.model_validate_json(client.get(INTENT_URL, params=PARAMS, headers=auth).content).revision == 2


def test_annotation_operations_create_update_delete_and_refuse_in_the_shape_of_the_api(
    client: TestClient, auth, bundle_dict
):
    """docs/10 §6 : la création répond avec l'identité du serveur et les défauts ; 422 nommés, jamais une valeur."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    create = {"op": "annotation_create", "content": {"kind": "note", "text": "Baie 12\nrangée B"}, "x": 40, "y": -20}
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [create]}, headers=auth)
    assert res.status_code == 200, res.text
    intent = Intent.model_validate_json(res.content)
    a = intent.annotations[0]
    assert (a.id, a.content.kind, a.x, a.w, a.h, a.style.hue, a.anchor.kind) == (
        "a1-1",
        "note",
        40,
        220,
        80,
        "amber",
        "free",
    )
    update = [
        {
            "op": "annotation_update",
            "id": "a1-1",
            "anchor": {"kind": "device", "ref": "sw-core-01"},
            "leader": True,
            "style": {"text_size": 16},
        }
    ]
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "alice", "ops": update}, headers=auth)
    a = Intent.model_validate_json(res.content).annotations[0]
    assert a.anchor.ref == "sw-core-01" and a.leader and a.style.text_size == 16 and a.author == "alice"
    for bad, code in (
        ({"op": "annotation_delete", "id": "a7-7"}, "annotation inconnue"),
        (
            {
                "op": "annotation_update",
                "id": "a1-1",
                "content": {"kind": "shape", "shape": "ellipse", "label": ""},
            },
            "garde sa sorte",
        ),
        (
            {"op": "annotation_create", "content": {"kind": "note", "text": "x"}, "leader": True},
            "ligne de rappel",
        ),
        (
            {"op": "annotation_create", "content": {**TABLE, "rows": [["a"], ["b", "c"]]}},
            "même nombre de cellules",
        ),
        (
            {"op": "annotation_create", "content": {**TABLE, "rows": [["a", "b"]], "widths": [1, 2, 3]}},
            "autant de largeurs",
        ),
        (
            {
                "op": "annotation_create",
                "content": {**TABLE, "rows": [["a", "b"]], "merges": [{"row": 0, "col": 1, "rows": 1, "cols": 2}]},
            },
            "sort du tableau",
        ),
        (
            {
                "op": "annotation_create",
                "content": {"kind": "note", "text": "x"},
                "anchor": {"kind": "group", "ref": "sw-core-01"},
            },
            "ancre d'un groupe",
        ),
        ({"op": "annotation_create", "content": {"kind": "sticker"}}, None),
        ({"op": "annotation_create", "content": {"kind": "note", "text": "x"}, "w": 5}, None),
        ({"op": "annotation_create", "content": {"kind": "image", "asset": "zz", "alt": ""}}, None),
        ({"op": "annotation_update", "id": "a1-1", "style": {"opacity": 101}}, None),
    ):
        res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [bad]}, headers=auth)
        assert res.status_code == 422, bad
        body = res.json()
        assert body["detail"] == "corps de requête invalide" and body["errors"], bad
        text = json.dumps(body, ensure_ascii=False)
        if code:
            assert code in text, (code, body)
        assert "sw-core-01" not in text and "sticker" not in text
    res = client.post(
        PATCHES_URL,
        params=PARAMS,
        json={"author": "orhan", "ops": [{"op": "annotation_delete", "id": "a1-1"}]},
        headers=auth,
    )
    assert res.status_code == 200 and Intent.model_validate_json(res.content).annotations == ()


def test_connector_operations_create_update_delete_and_refuse_in_the_shape_of_the_api(
    client: TestClient, auth, bundle_dict
):
    """docs/10 §6 (1.4.0) : la création répond avec l'identité du serveur et les défauts (flèche droite) ; 422
    nommés."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    create = {
        "op": "connector_create",
        "start": {"kind": "device", "ref": "sw-core-01", "side": "e"},
        "end": {"kind": "free", "x": 300, "y": -40},
        "label": "WAN",
    }
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [create]}, headers=auth)
    assert res.status_code == 200, res.text
    c = Intent.model_validate_json(res.content).connectors[0]
    assert (c.id, c.start.kind, c.end.x, c.heads.end, c.route, c.bend, c.style.hue, c.label) == (
        "c1-1",
        "device",
        300,
        "arrow",
        "straight",
        0,
        "slate",
        "WAN",
    )
    update = [{"op": "connector_update", "id": "c1-1", "route": "elbow", "bend": -30, "style": {"hue": "teal"}}]
    res = client.post(PATCHES_URL, params=PARAMS, json={"author": "alice", "ops": update}, headers=auth)
    c = Intent.model_validate_json(res.content).connectors[0]
    assert c.route == "elbow" and c.bend == -30 and c.style.hue == "teal" and c.author == "alice"
    same = {"kind": "device", "ref": "sw-core-01", "side": "auto"}
    for bad, code in (
        ({"op": "connector_delete", "id": "c7-7"}, "connecteur inconnu"),
        ({"op": "connector_create", "start": same, "end": same}, "même élément"),
        (
            {"op": "connector_create", "start": same, "end": {"kind": "group", "ref": "sw-core-02", "side": "auto"}},
            "en porte l'`id`",
        ),
        ({"op": "connector_create", "start": same}, None),
        ({"op": "connector_create", "start": same, "end": {"kind": "free", "x": 1, "y": 2}, "bend": 2001}, None),
        ({"op": "connector_update", "id": "c1-1", "style": {"stroke_style": "none"}}, None),
    ):
        res = client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [bad]}, headers=auth)
        assert res.status_code == 422, bad
        body = res.json()
        assert body["detail"] == "corps de requête invalide" and body["errors"], bad
        text = json.dumps(body, ensure_ascii=False)
        if code:
            assert code in text, (code, body)
        assert "sw-core-01" not in text and "sw-core-02" not in text
    res = client.post(
        PATCHES_URL,
        params=PARAMS,
        json={"author": "orhan", "ops": [{"op": "connector_delete", "id": "c1-1"}]},
        headers=auth,
    )
    assert res.status_code == 200 and Intent.model_validate_json(res.content).connectors == ()


def test_openapi_describes_the_intent_from_the_contract(client: TestClient):
    doc = client.get("/openapi.json").json()
    get = doc["paths"][INTENT_URL]["get"]
    assert get["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Intent"}
    post = doc["paths"][PATCHES_URL]["post"]
    assert post["requestBody"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/IntentOps"}
    schemas = doc["components"]["schemas"]
    expected = {"Intent", "Pin", "TypeColor", "DeviceColor", "IntentOps", "PinOp", "UnpinOp", "ColorOp", "UncolorOp"}
    groups = {"Group", "GroupStyle", "GroupCreateOp", "GroupUpdateOp", "GroupAddOp", "GroupRemoveOp", "GroupDeleteOp"}
    notes = {"Annotation", "AnnotationStyle", "Anchor", "NoteContent", "ShapeContent", "TableContent", "ImageContent"}
    notes |= {"AnnotationCreateOp", "AnnotationUpdateOp", "AnnotationDeleteOp", "Merge"}
    lines = {"Connector", "ConnectorStyle", "FreeEnd", "AttachedEnd", "Heads", "Side"}
    lines |= {"ConnectorCreateOp", "ConnectorUpdateOp", "ConnectorDeleteOp"}
    assert expected | {"ColorTypeOp", "UncolorTypeOp"} | groups | notes | lines <= set(schemas)
    for ref in _refs(doc):
        assert ref.removeprefix("#/components/schemas/") in schemas, ref

"""`GET /api/diff` : deux runs archivées comparées à la demande (B3), jamais stockées, décrites par le contrat Diff."""

import json

from fastapi.testclient import TestClient
from ld_contracts.diff import Diff

from ld_backend import snapshots
from tests.diff.conftest import LATER_RUN_ID, WEEK, cable_down_later
from tests.test_api import RUN, URL, _refs

DIFF_URL = "/api/diff"
PAIR = {"infrastructure": "infra-lab", "from": RUN["run_id"], "to": LATER_RUN_ID}


def _two_runs(client: TestClient, auth, bundle_dict) -> None:
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    assert client.post(URL, json=cable_down_later(bundle_dict), headers=auth).status_code == 201


def test_two_archived_runs_are_compared_on_demand(client: TestClient, auth, bundle_dict, settings):
    _two_runs(client, auth, bundle_dict)
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    d = Diff.model_validate_json(res.content)
    assert d.before.collector_run_id == RUN["run_id"] and d.after.collector_run_id == LATER_RUN_ID
    assert d.elapsed_seconds == WEEK and d.summary.links.changed == 1 and d.summary.checks.appeared == 1
    assert d.summary.interfaces.changed == 2 and d.summary.volatile_changes > 0
    reverse = client.get(DIFF_URL, params={**PAIR, "from": LATER_RUN_ID, "to": RUN["run_id"]}, headers=auth)
    assert reverse.status_code == 200 and reverse.json()["elapsed_seconds"] == -WEEK
    assert [p.name for p in settings.archive_dir.rglob("*") if "diff" in p.name] == [], "jamais stocké"
    assert res.content == client.get(DIFF_URL, params=PAIR, headers=auth).content, "mêmes octets à chaque appel"


def test_diff_needs_the_token_and_its_three_parameters(client: TestClient, auth):
    assert client.get(DIFF_URL, params=PAIR).status_code == 401
    without_to = {k: v for k, v in PAIR.items() if k != "to"}
    res = client.get(DIFF_URL, params=without_to, headers=auth)
    assert res.status_code == 422 and res.json()["detail"] == "paramètres de requête invalides"
    assert [e["path"] for e in res.json()["errors"]] == ["query.to"]
    assert client.get(DIFF_URL, params={**PAIR, "from": ""}, headers=auth).status_code == 422


def test_each_side_has_its_own_404(client: TestClient, auth, bundle_dict, monkeypatch):
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert res.status_code == 404 and "`from`" in res.json()["detail"] and "inconnue" in res.json()["detail"]
    assert RUN["run_id"] not in res.text
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert res.status_code == 404 and "`to`" in res.json()["detail"] and "inconnue" in res.json()["detail"]

    def boom(*_: object) -> None:
        raise RuntimeError("bug de B1")

    monkeypatch.setattr(snapshots, "correlate", boom)
    assert (
        client.post(URL, json=cable_down_later(bundle_dict), headers=auth).json()["correlation"]["status"] == "failed"
    )
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert res.status_code == 404 and "`to`" in res.json()["detail"] and "ld correlate" in res.json()["detail"]
    assert "bug de B1" not in res.text


def test_an_archived_snapshot_outside_the_contract_is_a_neutral_500(client: TestClient, auth, bundle_dict, settings):
    _two_runs(client, auth, bundle_dict)
    broken = settings.archive_dir / "infra-lab" / RUN["run_id"] / "snapshot.json"
    broken.write_text('{"nodes": "not a list"}\n', encoding="utf-8")
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert res.status_code == 500 and "ld correlate" in res.json()["detail"] and "not a list" not in res.text


def test_a_label_with_a_slash_and_a_corrupt_run(client: TestClient, auth, bundle_dict, settings):
    for doc in (bundle_dict, cable_down_later(bundle_dict)):
        slashed = json.loads(json.dumps(doc).replace("infra-lab", "site/lab"))
        assert client.post(URL, json=slashed, headers=auth).status_code == 201
    res = client.get(DIFF_URL, params={**PAIR, "infrastructure": "site/lab"}, headers=auth)
    assert res.status_code == 200 and res.json()["infrastructure"] == "site/lab"
    corrupt = next(settings.archive_dir.rglob("meta.json"))  # le répertoire est nettoyé, le libellé reste exact
    corrupt.write_text("{broken", encoding="utf-8")
    res = client.get(DIFF_URL, params={**PAIR, "infrastructure": "site/lab"}, headers=auth)
    assert res.status_code in {404, 500} and "broken" not in res.text


def test_openapi_describes_the_diff_from_the_contract(client: TestClient):
    doc = client.get("/openapi.json").json()
    get = doc["paths"][DIFF_URL]["get"]
    assert get["responses"]["200"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Diff"}
    assert [p["name"] for p in get["parameters"]] == ["infrastructure", "from", "to"]
    schemas = doc["components"]["schemas"]
    assert {"events", "before", "after", "summary"} <= set(schemas["Diff"]["properties"])
    assert "MlagDomainRef" in schemas and "Snapshot" in schemas and "RunBundle" in schemas
    for ref in _refs(doc):
        assert ref.removeprefix("#/components/schemas/") in schemas, ref
    assert [name for name in schemas if "__" in name] == []


def test_two_archived_snapshots_of_different_infrastructures_are_a_neutral_500(
    client: TestClient, auth, bundle_dict, settings
):
    """Revue B4 : une `DiffError` dans l'API est une archive incohérente, traduite, jamais un 500 nu."""
    _two_runs(client, auth, bundle_dict)
    path = settings.archive_dir / "infra-lab" / RUN["run_id"] / "snapshot.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["source"]["infrastructure"] = "autre-site"
    path.write_text(json.dumps(doc) + "\n", encoding="utf-8")  # entier : la forme canonique finit par une fin de ligne
    res = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert (
        res.status_code == 500 and "infrastructure" in res.json()["detail"] and "intervention" in res.json()["detail"]
    )
    assert "autre-site" not in res.text and "infra-lab" not in res.json()["detail"]

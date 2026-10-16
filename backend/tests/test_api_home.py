"""`GET /api/infrastructures` : ce que l'accueil de la v2 lit (brique 1 de `docs/13`) : chaque infrastructure
archivée, sa dernière run, ses équipements, les contrôles de son snapshot, ses dernières runs. Jamais une valeur dans
un message."""

import copy
import json
import os

import pytest
from fastapi.testclient import TestClient

from ld_backend import home, snapshots
from ld_backend.archive import BundleArchive
from tests.test_api import URL

HOME_URL = "/api/infrastructures"
FIRST_RUN = "66db3f0e9a1c2b0012f4a7d1"


def _later(bundle: dict, run_id: str, start: str, infrastructure: str | None = None) -> dict:
    """Une run de plus : autre identifiant, autre début, un port basculé pour que l'empreinte change."""
    out = copy.deepcopy(bundle)
    run = {"collector_run_id": run_id, "start_datetime": start, "end_datetime": None, "status": "partial"}
    out["run"] = {**out["run"], **run}
    out["interfaces"][0]["oper_status"] = "down"
    if infrastructure:
        out = json.loads(json.dumps(out).replace("infra-lab", infrastructure))
    return out


def test_an_empty_archive_lists_nothing_and_the_token_is_required(client: TestClient, auth):
    assert client.get(HOME_URL).status_code == 401
    res = client.get(HOME_URL, headers=auth)
    assert res.status_code == 200 and res.json() == {"infrastructures": [], "unreadable": 0}


def test_each_infrastructure_carries_its_last_run_its_devices_its_checks_and_its_recent_runs(
    client: TestClient, auth, bundle_dict
):
    posted = client.post(URL, json=bundle_dict, headers=auth).json()
    client.post(URL, json=_later(bundle_dict, "77db3f0e9a1c2b0012f4a7d2", "2026-09-11T02:00:00Z"), headers=auth)
    third = _later(bundle_dict, "88db3f0e9a1c2b0012f4a7d3", "2026-09-12T02:00:00Z", "site/lab")
    client.post(URL, json=third, headers=auth)
    body = client.get(HOME_URL, headers=auth).json()
    assert body["unreadable"] == 0
    assert [i["infrastructure"] for i in body["infrastructures"]] == ["site/lab", "infra-lab"]
    lab = body["infrastructures"][1]
    assert lab["runs"] == 2 and lab["devices"] == posted["summary"]["devices_in_scope"]
    assert lab["last_run"] == {
        "run_id": "77db3f0e9a1c2b0012f4a7d2",
        "run_start": "2026-09-11T02:00:00Z",
        "run_end": None,
        "run_status": "partial",
    }
    assert set(lab["checks"]) == {"error", "warning", "info"} and sum(lab["checks"].values()) >= 1
    # le bundle minimal : un équipement du périmètre n'a pas répondu (snapshot-minimal.json, `collection`)
    assert lab["answered"] == lab["devices"] - 1 and lab["last_good_run"] == lab["last_run"]
    assert [r["run_id"] for r in lab["recent_runs"]] == ["77db3f0e9a1c2b0012f4a7d2", FIRST_RUN]
    assert lab["recent_runs"][0]["previous_run_id"] == FIRST_RUN and lab["recent_runs"][1]["previous_run_id"] is None
    assert lab["recent_runs"][1] == {
        "run_id": FIRST_RUN,
        "run_start": "2026-09-10T02:00:00Z",
        "run_end": "2026-09-10T02:14:32Z",
        "run_status": "completed",
        "devices": posted["summary"]["devices_in_scope"],
        "answered": posted["summary"]["devices_in_scope"] - 1,
        "previous_run_id": None,
    }
    # un nom haché sur disque (`site/lab`) revient tel qu'il a été ingéré
    assert body["infrastructures"][0]["runs"] == 1 and body["infrastructures"][0]["last_run"]["run_status"] == "partial"


def test_without_a_snapshot_the_checks_are_null(client: TestClient, auth, bundle_dict, monkeypatch):
    def boom(*_: object) -> None:
        raise RuntimeError("bug de B1")

    monkeypatch.setattr(snapshots, "correlate", boom)
    assert client.post(URL, json=bundle_dict, headers=auth).json()["correlation"]["status"] == "failed"
    body = client.get(HOME_URL, headers=auth).json()
    assert body["infrastructures"][0]["checks"] is None and body["infrastructures"][0]["runs"] == 1
    assert body["infrastructures"][0]["answered"] is None
    assert "bug de B1" not in json.dumps(body)


def test_a_corrupt_run_is_skipped_and_counted_without_a_word_of_it(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    client.post(URL, json=_later(bundle_dict, "77db3f0e9a1c2b0012f4a7d2", "2026-09-11T02:00:00Z"), headers=auth)
    meta = settings.archive_dir / "infra-lab" / "77db3f0e9a1c2b0012f4a7d2" / "meta.json"
    meta.write_text("{broken", encoding="utf-8")
    body = client.get(HOME_URL, headers=auth).json()
    assert body["unreadable"] == 1 and "broken" not in json.dumps(body)
    assert body["infrastructures"][0]["runs"] == 1 and body["infrastructures"][0]["last_run"]["run_id"] == FIRST_RUN


def test_an_unreadable_report_leaves_the_devices_null(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    (settings.archive_dir / "infra-lab" / FIRST_RUN / "report.json").write_text("{broken", encoding="utf-8")
    body = client.get(HOME_URL, headers=auth).json()
    entry = body["infrastructures"][0]
    assert entry["devices"] is None and entry["recent_runs"][0]["devices"] is None
    assert body["infrastructures"][0]["checks"] is not None


def test_a_folder_without_any_readable_run_is_not_an_infrastructure(client: TestClient, auth, bundle_dict, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    (settings.archive_dir / "ghost").mkdir()
    (settings.archive_dir / "ghost" / "run").mkdir()
    (settings.archive_dir / "stray.txt").write_text("x", encoding="utf-8")
    body = client.get(HOME_URL, headers=auth).json()
    assert [i["infrastructure"] for i in body["infrastructures"]] == ["infra-lab"] and body["unreadable"] == 0


def test_the_checks_are_counted_once_per_snapshot_file(client: TestClient, auth, bundle_dict, monkeypatch):
    client.post(URL, json=bundle_dict, headers=auth)
    reads: list[str] = []
    original = home.snapshot_facts

    def counted(archive, infrastructure: str, run_id: str):
        reads.append(run_id)
        return original(archive, infrastructure, run_id)

    monkeypatch.setattr(home, "snapshot_facts", counted)
    first = client.get(HOME_URL, headers=auth).json()
    second = client.get(HOME_URL, headers=auth).json()
    assert first == second and reads == [FIRST_RUN]


def test_the_cache_is_bounded_and_forgets_the_oldest_file(tmp_path, bundle_dict, auth, client, settings):
    client.post(URL, json=bundle_dict, headers=auth)
    client.post(URL, json=_later(bundle_dict, "77db3f0e9a1c2b0012f4a7d2", "2026-09-11T02:00:00Z"), headers=auth)
    archive = BundleArchive(settings.archive_dir)
    cache = home.SnapshotCache(max_entries=1)
    runs = archive.list_runs("infra-lab")
    first, second = cache.facts(archive, runs[0]), cache.facts(archive, runs[1])
    assert first is not None and second is not None and len(cache._entries) == 1
    assert cache.facts(archive, runs[0]) == first and cache.facts(archive, runs[1]) == second


def test_a_corrupt_or_truncated_snapshot_gives_null_checks_and_answered(
    client: TestClient, auth, bundle_dict, settings
):
    client.post(URL, json=bundle_dict, headers=auth)
    client.post(URL, json=_later(bundle_dict, "77db3f0e9a1c2b0012f4a7d2", "2026-09-11T02:00:00Z"), headers=auth)
    run_dir = settings.archive_dir / "infra-lab"
    (run_dir / "77db3f0e9a1c2b0012f4a7d2" / "snapshot.json").write_text("{broken}\n", encoding="utf-8")
    (run_dir / FIRST_RUN / "snapshot.json").write_text('{"checks": {}, "nodes": []}', encoding="utf-8")
    body = client.get(HOME_URL, headers=auth).json()
    entry = body["infrastructures"][0]
    assert entry["checks"] is None and entry["answered"] is None
    assert [r["answered"] for r in entry["recent_runs"]] == [None, None] and "broken" not in json.dumps(body)


def test_a_failed_last_run_keeps_the_last_good_one_to_open(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    failed = _later(bundle_dict, "77db3f0e9a1c2b0012f4a7d2", "2026-09-11T02:00:00Z")
    failed["run"]["status"] = "failed"
    client.post(URL, json=failed, headers=auth)
    entry = client.get(HOME_URL, headers=auth).json()["infrastructures"][0]
    assert entry["last_run"]["run_status"] == "failed" and entry["last_good_run"]["run_id"] == FIRST_RUN
    # les comptes sont ceux de la bonne run, celle qu'on ouvre, pas ceux de la run échouée
    good = next(r for r in entry["recent_runs"] if r["run_id"] == FIRST_RUN)
    assert (entry["devices"], entry["answered"]) == (good["devices"], good["answered"]) and entry["checks"] is not None
    only_failed = _later(bundle_dict, "99db3f0e9a1c2b0012f4a7d4", "2026-09-12T02:00:00Z", "site/lab")
    only_failed["run"]["status"] = "failed"
    client.post(URL, json=only_failed, headers=auth)
    entries = client.get(HOME_URL, headers=auth).json()["infrastructures"]
    assert entries[0]["infrastructure"] == "site/lab" and entries[0]["last_good_run"] is None


def test_an_unreadable_folder_is_counted_and_the_others_are_served(client: TestClient, auth, bundle_dict, settings):
    if os.geteuid() == 0:
        pytest.skip("root lit tout")
    client.post(URL, json=bundle_dict, headers=auth)
    locked = settings.archive_dir / "zulu"
    locked.mkdir()
    locked.chmod(0)
    try:
        body = client.get(HOME_URL, headers=auth).json()
    finally:
        locked.chmod(0o755)
    assert body["unreadable"] == 1 and [i["infrastructure"] for i in body["infrastructures"]] == ["infra-lab"]


def test_the_list_is_sorted_by_date_not_by_text_and_recent_runs_are_capped(client: TestClient, auth, bundle_dict):
    client.post(URL, json=bundle_dict, headers=auth)
    for index in range(7):
        run_id = f"{index}7db3f0e9a1c2b0012f4a7d{index}"
        client.post(URL, json=_later(bundle_dict, run_id, f"2026-09-1{index + 1}T02:00:00Z"), headers=auth)
    client.post(
        URL, json=_later(bundle_dict, "88db3f0e9a1c2b0012f4a7d8", "2026-09-18T02:00:00.500000Z", "b"), headers=auth
    )
    client.post(URL, json=_later(bundle_dict, "88db3f0e9a1c2b0012f4a7d9", "2026-09-18T02:00:00Z", "a"), headers=auth)
    body = client.get(HOME_URL, headers=auth).json()
    assert [i["infrastructure"] for i in body["infrastructures"]] == ["b", "a", "infra-lab"]
    lab = body["infrastructures"][2]
    assert (
        lab["runs"] == 8
        and len(lab["recent_runs"]) == 6
        and lab["recent_runs"][0]["run_id"] == lab["last_run"]["run_id"]
    )


def test_the_user_asks_for_as_many_recent_runs_as_he_wants_within_the_bound(client: TestClient, auth, bundle_dict):
    # Orhan, 2026-10-16 : la page ne bride pas ; `recent` borné, jamais une valeur dans un refus
    client.post(URL, json=bundle_dict, headers=auth)
    for index in range(7):
        run_id = f"{index}7db3f0e9a1c2b0012f4a7d{index}"
        client.post(URL, json=_later(bundle_dict, run_id, f"2026-09-1{index + 1}T02:00:00Z"), headers=auth)
    more = client.get(HOME_URL, params={"recent": 100}, headers=auth).json()["infrastructures"][0]
    assert len(more["recent_runs"]) == 8 and more["recent_runs"][-1]["previous_run_id"] is None
    one = client.get(HOME_URL, params={"recent": 1}, headers=auth).json()["infrastructures"][0]
    assert len(one["recent_runs"]) == 1 and one["recent_runs"][0]["run_id"] == one["last_run"]["run_id"]
    for bad in ("0", "101", "six"):
        refused = client.get(HOME_URL, params={"recent": bad}, headers=auth)
        assert refused.status_code == 422 and bad not in refused.text and refused.json()["code"] == "invalid_query"

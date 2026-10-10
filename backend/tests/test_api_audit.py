"""Audit de l'API du 2026-10-09 : une écriture qui attend ne fige pas le serveur, la garde « une run archivée » ne
relit pas toute l'archive, une image se retire sous le verrou de l'intention, le diff se garde en mémoire."""

import threading
import time

from fastapi.testclient import TestClient

from ld_backend import api
from ld_backend.api import create_app
from ld_backend.archive import BundleArchive
from ld_backend.files import folder_lock
from ld_backend.intent import INTENT_DIR
from tests.diff.conftest import cable_down_later
from tests.test_api import RUN, URL
from tests.test_api_assets import ASSETS, png
from tests.test_api_diff import DIFF_URL, PAIR
from tests.test_api_intent import PARAMS, PATCHES_URL, PIN


def _intent_folder(settings):
    return settings.archive_dir / INTENT_DIR / RUN["infrastructure"]


def test_a_write_waiting_for_the_intent_lock_does_not_freeze_the_server(settings, auth, bundle_dict):
    """Avant : verrou, `fsync` et journal dans la boucle d'événements ; `ld journal prune` figeait toute l'API."""
    with TestClient(create_app(settings)) as client:  # un seul fil d'événements pour toutes les requêtes
        assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
        lock = folder_lock(_intent_folder(settings))
        written: list[int] = []
        answered: list[int] = []
        body = {"author": "orhan", "ops": [PIN]}
        writer = threading.Thread(
            target=lambda: written.append(client.post(PATCHES_URL, params=PARAMS, json=body, headers=auth).status_code)
        )
        lock.acquire()
        try:
            writer.start()
            time.sleep(0.3)  # l'écrivain attend le verrou
            probe = threading.Thread(target=lambda: answered.append(client.get("/api/health").status_code))
            probe.start()
            probe.join(timeout=3)
            assert answered == [200], "le serveur ne répond plus pendant qu'une écriture attend"
            assert written == []
        finally:
            lock.release()
        writer.join(timeout=5)
    assert written == [200]


def test_the_write_guard_never_lists_the_runs(client: TestClient, auth, bundle_dict, monkeypatch):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201

    def forbidden(*_: object) -> None:
        raise AssertionError("list_runs relit et trie toute l'archive à chaque écriture")

    monkeypatch.setattr(BundleArchive, "list_runs", forbidden)
    assert (
        client.post(PATCHES_URL, params=PARAMS, json={"author": "orhan", "ops": [PIN]}, headers=auth).status_code == 200
    )
    as_png = {**auth, "Content-Type": "image/png"}
    assert client.post(ASSETS, params=PARAMS, content=png(), headers=as_png).status_code == 201
    place = {"base_revision": 0, "replace": False, "places": [{"hostname": "sw-core-01", "x": 0, "y": 0}]}
    assert client.post("/api/placement", params=PARAMS, json=place, headers=auth).status_code == 200


def test_has_runs_skips_temporary_and_corrupt_entries(archive: BundleArchive, client: TestClient, auth, bundle_dict):
    assert archive.has_runs("infra-lab") is False
    infra = archive.root / "infra-lab"
    (infra / ".tmp-x").mkdir(parents=True)
    corrupt = infra / "broken"
    corrupt.mkdir()
    (corrupt / "meta.json").write_text("{", encoding="utf-8")
    assert archive.has_runs("infra-lab") is False
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    assert archive.has_runs("infra-lab") is True and archive.has_runs("autre") is False


def test_an_image_is_released_under_the_intent_lock(client: TestClient, auth, bundle_dict, settings):
    """Avant : vérifier « aucune annotation ne la cite » puis supprimer, sans verrou ; une annotation écrite entre
    les deux citait une image disparue."""
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    receipt = client.post(ASSETS, params=PARAMS, content=png(), headers={**auth, "Content-Type": "image/png"}).json()
    deleted: list[int] = []
    target = {**PARAMS, "asset": receipt["asset"]}
    remover = threading.Thread(
        target=lambda: deleted.append(client.delete(ASSETS, params=target, headers=auth).status_code)
    )
    lock = folder_lock(_intent_folder(settings))
    lock.acquire()
    try:
        remover.start()
        time.sleep(0.3)
        assert deleted == [], "le retrait n'attend pas le verrou de l'intention"
    finally:
        lock.release()
    remover.join(timeout=5)
    assert deleted == [204]


def test_a_diff_is_computed_once_until_a_snapshot_changes(client: TestClient, auth, bundle_dict, archive, monkeypatch):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    assert client.post(URL, json=cable_down_later(bundle_dict), headers=auth).status_code == 201
    calls: list[int] = []
    compute = api.diff

    def counted(before, after):
        calls.append(1)
        return compute(before, after)

    monkeypatch.setattr(api, "diff", counted)
    first = client.get(DIFF_URL, params=PAIR, headers=auth)
    again = client.get(DIFF_URL, params=PAIR, headers=auth)
    assert first.status_code == again.status_code == 200 and first.content == again.content
    assert len(calls) == 1
    reverse = client.get(DIFF_URL, params={**PAIR, "from": PAIR["to"], "to": PAIR["from"]}, headers=auth)
    assert reverse.status_code == 200 and len(calls) == 2, "l'autre sens est une autre clé"
    raw = archive.load_snapshot_bytes("infra-lab", PAIR["to"]).decode("utf-8")
    archive.store_snapshot("infra-lab", PAIR["to"], raw)  # ce que fait `ld correlate` : un nouveau fichier
    assert client.get(DIFF_URL, params=PAIR, headers=auth).content == first.content
    assert len(calls) == 3, "un snapshot remplacé rend l'entrée inatteignable"


def test_a_failed_diff_is_never_cached(client: TestClient, auth, bundle_dict):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    assert client.get(DIFF_URL, params=PAIR, headers=auth).status_code == 404
    assert client.post(URL, json=cable_down_later(bundle_dict), headers=auth).status_code == 201
    assert client.get(DIFF_URL, params=PAIR, headers=auth).status_code == 200


def test_an_unexpected_error_keeps_the_problem_shape(settings, monkeypatch):
    def boom(*_: object) -> None:
        raise RuntimeError("/srv/secret")

    monkeypatch.setattr(BundleArchive, "list_runs", boom)
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    res = client.get(URL, params=PARAMS, headers={"Authorization": f"Bearer {settings.api_token}"})
    assert res.status_code == 500 and res.json() == {"detail": "erreur interne, intervention nécessaire"}
    assert "/srv/secret" not in res.text


def test_every_body_too_large_says_body_not_bundle(client: TestClient, auth, bundle_dict, settings):
    assert client.post(URL, json=bundle_dict, headers=auth).status_code == 201
    huge = b"x" * (settings.max_asset_bytes + 1)
    res = client.post(ASSETS, params=PARAMS, content=huge, headers={**auth, "Content-Type": "image/png"})
    assert res.status_code == 413 and res.json()["detail"].startswith("corps trop volumineux")

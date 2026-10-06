"""Le store du placement mémorisé (docs/09) : la place de chaque équipement déjà dessiné, par infrastructure."""

import json
import threading
from datetime import UTC, datetime, timedelta

import pytest

from ld_backend.placement import (
    Place,
    Placement,
    PlacementCorruptError,
    PlacementLimitError,
    PlacementStaleError,
    PlacementStore,
    PlacementWrite,
    placement_json,
)

NOW = datetime(2026, 10, 6, 9, 0, tzinfo=UTC)
INFRA = "infra-lab"


def write(*places: tuple[str, int, int], base: int = 0, replace: bool = False) -> PlacementWrite:
    """`base` : la révision du document que la page a lu avant de dessiner."""
    return PlacementWrite(
        base_revision=base, replace=replace, places=[Place(hostname=h, x=x, y=y) for h, x, y in places]
    )


def seen(doc: Placement) -> list[tuple[str, int, int]]:
    return [(p.hostname, p.x, p.y) for p in doc.places]


@pytest.fixture
def store(tmp_path) -> PlacementStore:
    return PlacementStore(tmp_path / "archive")


def test_an_infrastructure_never_drawn_reads_as_the_empty_document(store: PlacementStore):
    doc = store.load(INFRA)
    assert doc.infrastructure == INFRA and doc.revision == 0 and doc.updated_at is None and doc.places == ()
    assert not (store.root / "_placement").exists(), "lire n'écrit rien"


def test_the_first_place_of_a_device_is_the_one_that_stays(store: PlacementStore):
    first = store.record(INFRA, write(("sw-core-02", 10, 20), ("fw-edge-01", -5, 0)), now=NOW)
    assert first.revision == 1 and first.updated_at == "2026-10-06T09:00:00Z"
    assert seen(first) == [("fw-edge-01", -5, 0), ("sw-core-02", 10, 20)], "triées par hostname"
    later = NOW + timedelta(minutes=5)
    second = store.record(INFRA, write(("sw-core-02", 999, 999), ("sw-acc-01", 1, 2), base=1), now=later)
    assert seen(second) == [("fw-edge-01", -5, 0), ("sw-acc-01", 1, 2), ("sw-core-02", 10, 20)], (
        "un équipement déjà placé garde sa place ; seul le nouveau entre"
    )
    assert second.revision == 2 and second.updated_at == "2026-10-06T09:05:00Z"
    assert store.load(INFRA) == second


def test_a_request_that_brings_nothing_new_writes_nothing(store: PlacementStore):
    first = store.record(INFRA, write(("sw-core-01", 1, 1)), now=NOW)
    path = store.root / "_placement" / INFRA / "placement.json"
    before = path.stat().st_mtime_ns
    again = store.record(INFRA, write(("sw-core-01", 7, 7), base=1), now=NOW + timedelta(hours=1))
    assert again == first and path.stat().st_mtime_ns == before, "ni révision ni écriture"
    assert store.record(INFRA, write(base=1), now=NOW) == first
    assert store.record(INFRA, write(("sw-core-01", 7, 7), base=0), now=NOW) == first, (
        "une requête qui n'apporte rien n'est pas périmée non plus : rien à refuser"
    )


def test_a_page_only_completes_the_document_it_has_read(store: PlacementStore):
    """Revue, H1 : deux premières pages sur deux runs différentes dessinent deux repères incompatibles ; la seconde
    est refusée avec le document courant, et redessine ses nouveaux venus autour de lui."""
    first = store.record(INFRA, write(("a", 0, 0), ("b", 100, 0)), now=NOW)
    with pytest.raises(PlacementStaleError) as refused:
        store.record(INFRA, write(("b", 500, 500), ("c", 600, 600), base=0), now=NOW)
    assert refused.value.current == first and store.load(INFRA) == first, "rien n'est écrit"
    with pytest.raises(PlacementStaleError):
        store.record(INFRA, write(("c", 600, 600), base=0, replace=True), now=NOW)
    assert store.load(INFRA) == first, "« replacer » aussi : un conflit se voit, jamais résolu en silence"
    done = store.record(INFRA, write(("c", 150, 0), base=1), now=NOW)
    assert seen(done) == [("a", 0, 0), ("b", 100, 0), ("c", 150, 0)] and done.revision == 2


def test_replace_swaps_the_whole_document(store: PlacementStore):
    store.record(INFRA, write(("a", 1, 1), ("b", 2, 2)), now=NOW)
    done = store.record(INFRA, write(("b", 20, 20), ("c", 3, 3), base=1, replace=True), now=NOW)
    assert seen(done) == [("b", 20, 20), ("c", 3, 3)] and done.revision == 2
    emptied = store.record(INFRA, write(base=2, replace=True), now=NOW)
    assert emptied.places == () and emptied.revision == 3 and emptied.updated_at is not None


def test_the_document_is_written_canonically_and_atomically(store: PlacementStore):
    done = store.record(INFRA, write(("sw-core-01", 0, 0)), now=NOW)
    folder = store.root / "_placement" / INFRA
    assert (folder / "placement.json").read_text(encoding="utf-8") == placement_json(done)
    assert Placement.model_validate_json((folder / "placement.json").read_bytes()) == done
    assert sorted(p.name for p in folder.iterdir()) == ["lock", "placement.json"], "aucun temporaire ne reste"


def test_a_corrupt_document_is_isolated_until_it_is_forgotten(store: PlacementStore):
    store.record(INFRA, write(("sw-core-01", 0, 0)), now=NOW)
    path = store.root / "_placement" / INFRA / "placement.json"
    for broken in (
        "{broken",
        json.dumps({"infrastructure": "autre", "revision": 0, "updated_at": None, "places": []}),
        json.dumps(
            {
                "infrastructure": INFRA,
                "revision": 1,
                "updated_at": "2026-10-06T09:00:00Z",
                "places": [{"hostname": "b", "x": 0, "y": 0}, {"hostname": "a", "x": 0, "y": 0}],
            }
        ),
    ):
        path.write_text(broken, encoding="utf-8")
        with pytest.raises(PlacementCorruptError):
            store.load(INFRA)
        with pytest.raises(PlacementCorruptError):
            store.record(INFRA, write(("sw-core-02", 0, 0), base=1), now=NOW)
        assert path.read_text(encoding="utf-8") == broken, "rien n'est écrasé en silence"
    assert store.forget(INFRA) is True, "oublier est la sortie : le placement se recalcule"
    assert store.load(INFRA).revision == 0
    assert store.forget(INFRA) is False, "rien à oublier"


def test_the_cap_is_enforced_before_writing(store: PlacementStore, monkeypatch):
    from ld_backend import placement as module

    monkeypatch.setattr(module, "MAX_PLACES", 2)
    store.record(INFRA, write(("a", 0, 0), ("b", 0, 0)), now=NOW)
    with pytest.raises(PlacementLimitError):
        store.record(INFRA, write(("c", 0, 0), base=1), now=NOW)
    with pytest.raises(PlacementLimitError):
        store.record(INFRA, write(("c", 0, 0), ("d", 0, 0), ("e", 0, 0), base=1, replace=True), now=NOW)
    assert store.load(INFRA).revision == 1


def test_a_request_never_names_a_device_twice():
    with pytest.raises(ValueError, match="place_duplicate"):
        write(("a", 0, 0), ("a", 1, 1))


def _record_many(root: str, prefix: str) -> None:
    """Ce qu'une page fait : lire, dessiner, envoyer ; refusée, elle relit et renvoie."""
    from ld_backend import placement as module

    store = module.PlacementStore(root)
    for index in range(30):
        while True:
            read = store.load("infra-lab")
            place = module.Place(hostname=f"{prefix}-{index:02d}", x=index, y=0)
            request = module.PlacementWrite(base_revision=read.revision, replace=False, places=[place])
            try:
                store.record("infra-lab", request, now=NOW)
                break
            except module.PlacementStaleError:
                continue


def test_concurrent_pages_lose_nothing(store: PlacementStore):
    """Deux fils qui mémorisent chacun 30 équipements distincts : 60 places, 60 révisions, aucune écriture perdue."""
    errors: list[BaseException] = []

    def page(prefix: str) -> None:
        try:
            _record_many(str(store.root), prefix)
        except BaseException as exc:  # noqa: BLE001 - remonté au test
            errors.append(exc)

    threads = [threading.Thread(target=page, args=(name,)) for name in ("a", "b")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    final = store.load(INFRA)
    assert final.revision == 60 and len(final.places) == 60


def test_concurrent_processes_lose_nothing(store: PlacementStore):
    """Revue, B4 : le verrou de fichier joue entre processus, pas seulement entre fils."""
    import multiprocessing

    context = multiprocessing.get_context("fork")
    workers = [context.Process(target=_record_many, args=(str(store.root), name)) for name in ("p", "q")]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=120)
    assert all(worker.exitcode == 0 for worker in workers)
    final = store.load(INFRA)
    assert final.revision == 60 and len(final.places) == 60


def test_a_label_with_a_slash_gets_a_safe_folder_and_two_infrastructures_do_not_mix(store: PlacementStore):
    done = store.record("site/lab", write(("x", 0, 0)), now=NOW)
    assert done.infrastructure == "site/lab" and store.load("site/lab") == done
    assert store.load(INFRA).places == ()
    folders = [p.name for p in (store.root / "_placement").iterdir()]
    assert len(folders) == 1 and "/" not in folders[0]

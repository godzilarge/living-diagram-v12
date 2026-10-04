"""Le store d'intention (B4, docs/08) : un document par infrastructure, écrit par opérations, journalisé, atomique."""

import json
import threading
from datetime import UTC, datetime, timedelta

import pytest
from ld_contracts.intent import Intent
from ld_contracts.intent.serialize import canonical_json

from ld_backend.intent import IntentCorruptError, IntentStore
from ld_backend.schemas import IntentOps, PinOp, UnpinOp

NOW = datetime(2026, 10, 4, 18, 30, tzinfo=UTC)
INFRA = "infra-lab"


def ops(*items, author: str = "orhan") -> IntentOps:
    return IntentOps(author=author, ops=list(items))


def pin(hostname: str, x: int, y: int) -> PinOp:
    return PinOp(op="pin", hostname=hostname, x=x, y=y)


def unpin(hostname: str) -> UnpinOp:
    return UnpinOp(op="unpin", hostname=hostname)


@pytest.fixture
def store(tmp_path) -> IntentStore:
    return IntentStore(tmp_path / "archive")


def test_an_infrastructure_never_written_reads_as_the_empty_document(store: IntentStore):
    intent = store.load(INFRA)
    assert intent.revision == 0 and intent.updated_at is None and intent.pins == ()
    assert intent.infrastructure == INFRA
    assert not (store.root / "_intent").exists(), "lire n'écrit rien"


def test_pin_replace_and_unpin_with_the_audit_journal(store: IntentStore):
    first = store.apply(INFRA, ops(pin("sw-core-01", 120, -40)), now=NOW)
    assert first.revision == 1 and first.updated_at == NOW
    assert [(p.hostname, p.x, p.y, p.author, p.at) for p in first.pins] == [("sw-core-01", 120, -40, "orhan", NOW)]
    later = NOW + timedelta(minutes=5)
    second = store.apply(INFRA, ops(pin("sw-core-01", 1, 2), author="alice"), now=later)
    assert second.revision == 2 and [(p.x, p.y, p.author, p.at) for p in second.pins] == [(1, 2, "alice", later)]
    third = store.apply(INFRA, ops(unpin("sw-core-01"), unpin("jamais-vu")), now=later)
    assert third.revision == 3 and third.pins == () and third.updated_at == later, (
        "retirer une épingle absente ne fait rien"
    )
    assert store.load(INFRA) == third
    lines = [json.loads(line) for line in (store.root / "_intent" / INFRA / "journal.jsonl").read_text().splitlines()]
    assert [(line["revision"], line["author"], len(line["ops"])) for line in lines] == [
        (1, "orhan", 1),
        (2, "alice", 1),
        (3, "orhan", 2),
    ]
    assert (
        lines[0]["ops"][0] == {"op": "pin", "hostname": "sw-core-01", "x": 120, "y": -40}
        and lines[0]["at"] == "2026-10-04T18:30:00Z"
    )


def test_operations_apply_in_order_and_the_pins_come_out_sorted(store: IntentStore):
    done = store.apply(
        INFRA,
        ops(
            pin("sw-core-02", 1, 1),
            pin("fw-edge-01", 2, 2),
            pin("sw-core-02", 3, 3),
        ),
        now=NOW,
    )
    assert [(p.hostname, p.x) for p in done.pins] == [("fw-edge-01", 2), ("sw-core-02", 3)], "le dernier gagne, triées"


def test_the_document_is_written_canonically_and_atomically(store: IntentStore):
    done = store.apply(INFRA, ops(pin("sw-core-01", 0, 0)), now=NOW)
    folder = store.root / "_intent" / INFRA
    assert (folder / "intent.json").read_text(encoding="utf-8") == canonical_json(done)
    assert Intent.model_validate_json((folder / "intent.json").read_bytes()) == done
    assert sorted(p.name for p in folder.iterdir()) == ["intent.json", "journal.jsonl", "lock"], (
        "aucun temporaire ne reste"
    )


def test_a_corrupt_document_is_isolated_and_never_overwritten(store: IntentStore):
    store.apply(INFRA, ops(pin("sw-core-01", 0, 0)), now=NOW)
    path = store.root / "_intent" / INFRA / "intent.json"
    path.write_text("{broken", encoding="utf-8")
    with pytest.raises(IntentCorruptError):
        store.load(INFRA)
    with pytest.raises(IntentCorruptError):
        store.apply(INFRA, ops(pin("sw-core-02", 0, 0)), now=NOW)
    assert path.read_text(encoding="utf-8") == "{broken", "rien n'est écrasé"
    path.write_text(
        json.dumps(
            {"intent_version": "1.0.0", "infrastructure": "autre", "revision": 0, "updated_at": None, "pins": []}
        )
    )
    with pytest.raises(IntentCorruptError):
        store.load(INFRA)  # un document d'une autre infrastructure à cet endroit : incohérent, isolé


def test_concurrent_writers_lose_nothing(store: IntentStore):
    """Deux fils qui épinglent chacun 40 équipements distincts : 80 épingles, 80 révisions, aucune écriture perdue."""
    errors: list[BaseException] = []

    def writer(prefix: str) -> None:
        try:
            for index in range(40):
                store.apply(INFRA, ops(pin(f"{prefix}-{index:02d}", index, 0)), now=NOW)
        except BaseException as exc:  # noqa: BLE001 - remonté au test
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(name,)) for name in ("a", "b")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    final = store.load(INFRA)
    assert final.revision == 80 and len(final.pins) == 80
    journal = (store.root / "_intent" / INFRA / "journal.jsonl").read_text().splitlines()
    assert sorted(json.loads(line)["revision"] for line in journal) == list(range(1, 81))


def test_an_inaccessible_journal_refuses_the_request_before_anything_is_written(store: IntentStore):
    """Revue B4, M1 : I1 promet qu'une requête acceptée est toujours journalisée ; sans journal, rien n'est accepté."""
    first = store.apply(INFRA, ops(pin("sw-core-01", 0, 0)), now=NOW)
    folder = store.root / "_intent" / INFRA
    journal = folder / "journal.jsonl"
    journal.unlink()
    journal.mkdir()  # un dossier à la place du journal : impossible d'y écrire une ligne
    with pytest.raises(OSError):
        store.apply(INFRA, ops(pin("sw-core-02", 0, 0)), now=NOW)
    assert store.load(INFRA) == first, "le document n'a pas changé"
    assert [p.name for p in folder.iterdir() if p.name.startswith(".tmp-")] == []


def test_the_pin_cap_is_enforced_before_writing(store: IntentStore, monkeypatch):
    from ld_backend import intent as intent_module
    from ld_backend.intent import IntentLimitError

    monkeypatch.setattr(intent_module, "MAX_PINS", 2)
    store.apply(INFRA, ops(pin("a", 0, 0), pin("b", 0, 0)), now=NOW)
    with pytest.raises(IntentLimitError):
        store.apply(INFRA, ops(pin("c", 0, 0)), now=NOW)
    assert store.load(INFRA).revision == 1
    assert len((store.root / "_intent" / INFRA / "journal.jsonl").read_text().splitlines()) == 1


def _pin_many(root: str, prefix: str) -> None:
    from ld_backend.intent import IntentStore as Store
    from ld_backend.schemas import IntentOps as Ops
    from ld_backend.schemas import PinOp as Op

    store = Store(root)
    for index in range(30):
        store.apply(
            "infra-lab", Ops(author=prefix, ops=[Op(op="pin", hostname=f"{prefix}-{index:02d}", x=index, y=0)]), now=NOW
        )


def test_concurrent_processes_lose_nothing(store: IntentStore):
    """Revue B4, B6 : le verrou de fichier joue entre processus, pas seulement entre fils."""
    import multiprocessing

    context = multiprocessing.get_context("fork")
    workers = [context.Process(target=_pin_many, args=(str(store.root), name)) for name in ("p", "q")]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=120)
    assert all(worker.exitcode == 0 for worker in workers)
    final = store.load(INFRA)
    assert final.revision == 60 and len(final.pins) == 60


def test_a_label_with_a_slash_gets_a_safe_folder_and_keeps_its_exact_name(store: IntentStore):
    done = store.apply("site/lab", ops(pin("x", 0, 0)), now=NOW)
    assert done.infrastructure == "site/lab" and store.load("site/lab") == done
    folders = [p.name for p in (store.root / "_intent").iterdir()]
    assert len(folders) == 1 and folders[0].startswith("_") and "/" not in folders[0]

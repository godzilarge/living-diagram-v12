"""La purge du journal d'intention (`journal_prune.py`, `ld journal prune`) : ce qui part, ce qui reste, l'archive, la
trace, les noms des sujets gardés (deltas), la concurrence, les refus. Revue du 2026-10-10 :
`docs/revues/2026-10-10-purge-journal.md`."""

import gzip
import hashlib
import os
import threading
import time
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

import ld_backend.journal_prune as journal_prune
from ld_backend.cli import main
from ld_backend.intent import IntentStore
from ld_backend.journal import JournalQuery, JournalReader
from ld_backend.journal_prune import JournalNotFoundError, JournalPruneError, prune
from ld_backend.schemas import IntentOps

LAB = "infra-lab"
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
PIN = {"op": "pin", "hostname": "sw-1", "x": 0, "y": 0}


def _at(minute: int) -> datetime:
    return datetime(2026, 10, 6, 10, minute, tzinfo=UTC)


def _write(store: IntentStore, ops: list[dict], minute: int, author: str = "orhan") -> None:
    store.apply(LAB, IntentOps.model_validate({"author": author, "ops": ops}), _at(minute))


@pytest.fixture
def root(tmp_path: Path) -> Path:
    store = IntentStore(tmp_path)
    _write(store, [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}], 0)
    _write(store, [{"op": "group_create", "label": "Cœur DC02", "members": ["sw-core-01", "sw-core-02"]}], 1, "alice")
    _write(store, [{"op": "group_update", "id": "g2-1", "label": "Cœur"}], 2)
    _write(
        store, [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}, {"op": "unpin", "hostname": "sw-core-01"}], 3
    )
    _write(store, [{"op": "pin", "hostname": "sw-core-02", "x": 0, "y": 0}], 4)
    _write(store, [{"op": "group_delete", "id": "g2-1"}], 5)
    return tmp_path


def _journal(root: Path) -> Path:
    return root / "_intent" / LAB / "journal.jsonl"


def _entries(root: Path, **query) -> list[dict]:
    page = JournalReader(root).page(JournalQuery(infrastructure=LAB, **query))
    return page.model_dump(mode="json")["entries"]


def _labels(root: Path, revision: int) -> list[str]:
    entry = next(e for e in _entries(root) if e["revision"] == revision and e["ops"][0]["op"] != "journal_prune")
    return [s["label"] for s in entry["subjects"]]


def test_old_lines_leave_for_a_byte_exact_archive_and_a_trace_says_so(root: Path):
    before = _journal(root).read_bytes().splitlines(keepends=True)
    result = prune(root, LAB, before=_at(3), author="admin", now=NOW)
    assert (result.removed, result.kept) == (3, 3)
    assert result.archive is not None and result.archive.parent.name == "journal-archive"
    data = result.archive.read_bytes()
    assert gzip.decompress(data) == b"".join(before[:3]), "les lignes parties, octet pour octet"
    after = _journal(root).read_bytes().splitlines(keepends=True)
    assert after[1:] == before[3:], "les lignes gardées, octet pour octet, dans leur ordre"
    entries = _entries(root)
    assert [e["revision"] for e in entries] == [6, 6, 5, 4], "la trace porte la révision courante"
    trace = entries[0]
    assert (trace["author"], trace["categories"], trace["at"]) == ("admin", ["other"], "2026-10-10T12:00:00Z")
    op = trace["ops"][0]
    assert {k: op[k] for k in ("op", "removed", "first_revision", "last_revision", "before", "categories")} == {
        "op": "journal_prune",
        "removed": 3,
        "first_revision": 1,
        "last_revision": 3,
        "before": "2026-10-06T10:03:00Z",
        "categories": [],
    }
    assert op["archive"] == f"journal-archive/{result.archive.name}"
    assert op["sha256"] == hashlib.sha256(data).hexdigest(), "l'empreinte de l'archive, pour l'audit"
    assert "seed" not in trace and "seed" not in op, "les deltas ne sortent pas par l'API"


def test_the_trace_and_the_entry_of_the_same_revision_page_apart(root: Path):
    prune(root, LAB, before=_at(3), author="admin", now=NOW)
    prune(root, LAB, before=_at(5), categories=("positions",), author="admin", now=NOW)  # même seconde
    seen, cursor = [], None
    while True:
        page = JournalReader(root).page(JournalQuery(infrastructure=LAB, limit=1, before=cursor))
        seen += [(e.revision, e.ops[0]["op"]) for e in page.entries]
        if page.next is None:
            break
        cursor = page.next
    assert len(seen) == page.total == 4, "ni entrée sautée, ni resservie, à révision égale"
    assert sum(op == "journal_prune" for _, op in seen) == 2


def test_a_cursor_written_before_the_rank_still_reads(root: Path):
    import base64
    import json

    old = base64.urlsafe_b64encode(json.dumps([_at(4).isoformat(), LAB, 5]).encode()).decode()
    assert [e["revision"] for e in _entries(root, before=old)] == [4, 3, 2, 1]


def test_the_kept_entries_still_name_subjects_created_in_purged_lines(root: Path):
    prune(root, LAB, before=_at(3), author="admin", now=NOW)
    assert _labels(root, 6) == ["Cœur"], "le nom vient du delta de la trace"
    prune(root, LAB, before=_at(5), author="admin", now=NOW + timedelta(hours=1))
    assert _labels(root, 6) == ["Cœur"], "une seconde purge garde le premier delta"
    assert sum(e["ops"][0]["op"] == "journal_prune" for e in _entries(root)) == 2, "une trace ne se purge jamais"


def test_a_name_from_a_kept_line_reaches_a_purged_connector(tmp_path: Path):
    """Revue, M1 : le groupe est gardé, le connecteur qui le vise est purgé ; sa suite gardée garde ses deux bouts."""
    store = IntentStore(tmp_path)
    _write(store, [{"op": "group_create", "label": "Coeur", "members": ["sw-1"]}], 0)
    start, end = {"kind": "group", "ref": "g1-1", "side": "auto"}, {"kind": "device", "ref": "sw-1", "side": "auto"}
    _write(store, [{"op": "connector_create", "start": start, "end": end}], 1)
    _write(store, [{"op": "connector_update", "id": "c2-1", "bend": 12}], 5)
    before = _labels(tmp_path, 3)
    prune(tmp_path, LAB, before=_at(3), categories=("connectors",), author="admin", now=NOW)
    assert before == ["Coeur → sw-1"] and _labels(tmp_path, 3) == before


def test_a_name_changed_by_a_purged_line_between_two_kept_ones(tmp_path: Path):
    """Revue, M2 : L0 mixte gardée (création « X »), L1 purgée (renommé « Y »), L2 mixte gardée : lit « Y »."""
    store = IntentStore(tmp_path)
    _write(store, [{"op": "group_create", "label": "X", "members": ["sw-1"]}, PIN], 0)
    _write(store, [{"op": "group_update", "id": "g1-1", "label": "Y"}], 1)
    _write(store, [{"op": "group_add", "id": "g1-1", "members": ["sw-2"]}, PIN], 2)
    _write(store, [{"op": "group_update", "id": "g1-1", "label": "Z"}], 3)
    _write(store, [{"op": "group_add", "id": "g1-1", "members": ["sw-3"]}, PIN], 4)
    truth = (_labels(tmp_path, 1), _labels(tmp_path, 3), _labels(tmp_path, 5))
    assert truth == (["X"], ["Y"], ["Z"])
    prune(tmp_path, LAB, before=_at(2), categories=("groups",), author="admin", now=NOW)
    assert (_labels(tmp_path, 1), _labels(tmp_path, 3), _labels(tmp_path, 5)) == truth
    prune(tmp_path, LAB, before=_at(4), categories=("groups",), author="admin", now=NOW + timedelta(hours=1))
    assert (_labels(tmp_path, 1), _labels(tmp_path, 3), _labels(tmp_path, 5)) == truth, "deux purges, deux deltas"


def test_a_category_prune_takes_only_lines_whose_every_category_is_listed(root: Path):
    result = prune(root, LAB, before=_at(5), categories=("positions",), author="admin", now=NOW)
    assert result.removed == 2, "les deux épingles seules ; la rafale couleur + désépinglage reste entière"
    ops = [[op["op"] for op in e["ops"]] for e in _entries(root)]
    assert ["color", "unpin"] in ops and ["pin"] not in ops
    assert ops[0] == ["journal_prune"] and _entries(root)[0]["ops"][0]["categories"] == ["positions"]


def test_a_date_in_another_zone_is_the_same_instant(root: Path):
    paris = datetime(2026, 10, 6, 12, 3, tzinfo=timezone(timedelta(hours=2)))  # 10:03 UTC
    assert prune(root, LAB, before=paris, author="admin", now=NOW).removed == 3


def test_the_trace_is_found_by_the_words_its_line_shows_never_by_its_archive(root: Path):
    """Révisé le 2026-10-10 (revue, M4 : la recherche trouve ce que la ligne affiche) : la ligne dit « a purgé le
    journal : 6 entrées antérieures au … (positions, couleurs, groupes) », ces mots la trouvent ; l'archive, non."""
    prune(root, LAB, before=_at(9), categories=("positions", "colors", "groups"), author="admin", now=NOW)
    assert [e["ops"][0]["op"] for e in _entries(root, q="purge")] == ["journal_prune"]
    assert [e["ops"][0]["op"] for e in _entries(root, q="couleurs antérieures")] == ["journal_prune"]
    assert _entries(root, q="journal-archive") == []


def test_dry_run_and_nothing_to_remove_leave_the_journal_untouched(root: Path):
    data = _journal(root).read_bytes()
    dry = prune(root, LAB, before=_at(9), author="admin", now=NOW, dry_run=True)
    assert (dry.removed, dry.archive, dry.dry_run) == (6, None, True)
    none = prune(root, LAB, before=_at(0), author="admin", now=NOW)
    assert (none.removed, none.archive) == (0, None)
    assert _journal(root).read_bytes() == data
    assert not (root / "_intent" / LAB / "journal-archive").exists()


def test_unreadable_lines_stay_and_an_unfinished_last_line_is_ended(root: Path):
    path = _journal(root)
    path.write_bytes(path.read_bytes() + b"pas du json \xff\n" + b'{"at": "2026-10-06T10:00')
    prune(root, LAB, before=_at(9), author="admin", now=NOW)
    data = path.read_bytes()
    assert data.endswith(b"pas du json \xff\n" + b'{"at": "2026-10-06T10:00\n'), "octets gardés, ligne terminée"
    _write(IntentStore(root), [PIN], 30)
    assert [e["ops"][0]["op"] for e in _entries(root)] == ["journal_prune", "pin"], "la suivante ne s'y colle pas"


def test_a_valid_line_with_a_bad_byte_is_archived_byte_for_byte(root: Path):
    path = _journal(root)
    bad = b'{"at": "2026-10-06T09:00:00Z", "author": "x\xff", "revision": 0, "ops": [{"op": "pin", "hostname": "h"}]}'
    path.write_bytes(bad + b"\n" + path.read_bytes())
    result = prune(root, LAB, before=_at(1), author="admin", now=NOW)
    assert result.archive is not None and gzip.decompress(result.archive.read_bytes()).startswith(bad + b"\n")


def test_mode_is_kept_for_the_journal_and_its_archive(root: Path):
    path = _journal(root)
    path.chmod(0o600)
    result = prune(root, LAB, before=_at(3), author="admin", now=NOW)
    assert result.archive is not None
    assert (path.stat().st_mode & 0o777, result.archive.stat().st_mode & 0o777) == (0o600, 0o600)


def test_a_failed_rewrite_leaves_the_journal_whole_and_the_archive_written(root: Path, monkeypatch):
    data = _journal(root).read_bytes()
    real = journal_prune.replace_bytes

    def failing(path: Path, payload: bytes, like: Path | None = None) -> None:
        if path.name == "journal.jsonl":
            raise OSError("disque plein")
        real(path, payload, like)

    monkeypatch.setattr(journal_prune, "replace_bytes", failing)
    with pytest.raises(OSError):
        prune(root, LAB, before=_at(3), author="admin", now=NOW)
    assert _journal(root).read_bytes() == data, "rien de perdu"
    assert len(list((root / "_intent" / LAB / "journal-archive").glob("*.jsonl.gz"))) == 1, "au pire, un doublon"


def test_a_request_accepted_during_a_prune_waits_then_appends(root: Path, monkeypatch):
    real = journal_prune._deltas
    started = threading.Event()

    def slow(*args):
        started.set()
        time.sleep(0.3)  # la purge tient le verrou
        return real(*args)

    monkeypatch.setattr(journal_prune, "_deltas", slow)
    worker = threading.Thread(target=lambda: prune(root, LAB, before=_at(9), author="admin", now=NOW))
    worker.start()
    assert started.wait(5)
    _write(IntentStore(root), [PIN], 30)  # attend la fin de la purge
    worker.join(5)
    assert [e["ops"][0]["op"] for e in _entries(root)] == ["journal_prune", "pin"], "rien de perdu, rien d'écrasé"


def test_a_request_accepted_after_a_prune_appends_to_the_rewritten_journal(root: Path):
    prune(root, LAB, before=_at(9), author="admin", now=NOW)
    _write(IntentStore(root), [{"op": "pin", "hostname": "sw-core-01", "x": 5, "y": 5}], 30)
    assert [e["ops"][0]["op"] for e in _entries(root)] == ["journal_prune", "pin"]


def test_a_line_separator_in_a_text_is_not_a_line_end(tmp_path: Path):
    """Revue, H1 : U+2028, U+2029 et U+0085 restent dans leur ligne JSON."""
    store = IntentStore(tmp_path)
    for minute, text in enumerate(("a b", "c d", "e\x85f")):
        _write(store, [{"op": "group_create", "label": text, "members": ["sw-1"]}], minute)
    page = JournalReader(tmp_path).page(JournalQuery(infrastructure=LAB))
    assert (page.total, page.unreadable) == (3, 0)


@pytest.mark.parametrize(
    ("kwargs", "word"),
    [
        ({"before": datetime(2030, 1, 1, tzinfo=UTC)}, "futur"),
        ({"before": datetime(2026, 10, 1)}, "fuseau"),
        ({"categories": ("teleport",)}, "catégorie"),
        ({"author": " "}, "auteur"),
        ({"author": "a\nb"}, "auteur"),
        ({"author": "ad min"}, "auteur"),
        ({"author": "a\x7fb"}, "auteur"),
        ({"author": "a\x85b"}, "auteur"),
    ],
)
def test_refusals_write_nothing(root: Path, kwargs: dict, word: str):
    data = _journal(root).read_bytes()
    args = {"before": _at(3), "author": "admin", **kwargs}
    with pytest.raises(JournalPruneError, match=word):
        prune(root, LAB, now=NOW, **args)
    assert _journal(root).read_bytes() == data


def test_an_infrastructure_without_journal_is_not_found(tmp_path: Path):
    with pytest.raises(JournalNotFoundError):
        prune(tmp_path, LAB, before=_at(3), author="admin", now=NOW)


def test_the_command_line(root: Path, capsys: pytest.CaptureFixture[str]):
    base = ["journal", "prune", "--infrastructure", LAB, "--author", "admin", "--archive", str(root)]
    assert main([*base, "--before", "2026-10-07", "--category", "positions", "--dry-run"]) == 0
    assert "essai à blanc : 2 entrée(s) partiraient (positions), 4 resteraient" in capsys.readouterr().out
    assert main([*base, "--before", "2026-10-06T10:03:00+00:00"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("3 entrée(s) retirée(s) (toutes catégories), 3 gardée(s) ; archive : ")
    assert main([*base, "--before", "2026-10-06T10:00:00Z"]) == 0
    assert "rien à retirer" in capsys.readouterr().out
    assert main([*base, "--before", "2099-01-01"]) == 2
    assert "purge refusée : la date est dans le futur" in capsys.readouterr().out
    assert main([*base[:3], "autre", *base[4:], "--before", "2026-10-07"]) == 1
    assert "aucun journal" in capsys.readouterr().out
    with pytest.raises(SystemExit):
        main([*base, "--before", "2026-10-06T10:00:00"])  # sans fuseau : refusé par argparse
    assert os.path.isdir(root / "_intent" / LAB / "journal-archive")

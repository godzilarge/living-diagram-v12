"""Sondes de la revue du journal (2026-10-10). Lancer depuis backend/ :
uv run pytest -q -p no:warnings <ce fichier>
Chaque test passe quand le défaut est PRÉSENT (assertion sur le comportement constaté)."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from ld_backend.intent import IntentStore
from ld_backend.journal import JournalQuery, JournalReader
from ld_backend.journal_prune import prune
from ld_backend.schemas import IntentOps

LAB, EDGE = "infra-lab", "infra-edge"


def _at(minute: int) -> datetime:
    return datetime(2026, 10, 6, 10, minute, tzinfo=UTC)


def _write(store, infra, author, ops, minute):
    store.apply(infra, IntentOps.model_validate({"author": author, "ops": ops}), _at(minute))


def _read(root, **kw):
    return JournalReader(root).page(JournalQuery(**kw)).model_dump(mode="json")


def _pins(store, infra, n, start=0, author="o"):
    for i in range(n):
        _write(store, infra, author, [{"op": "pin", "hostname": f"sw-{i}", "x": i, "y": 0}], start + i)


def test_p1_link_to_a_purged_last_revision_lands_on_the_trace_and_says_found(tmp_path: Path):
    store = IntentStore(tmp_path)
    _write(store, LAB, "o", [{"op": "group_create", "label": "Cœur", "members": ["sw-0"]}], 0)
    _pins(store, LAB, 2, start=1)  # r2, r3 (positions)
    prune(tmp_path, LAB, before=_at(30), categories=("positions",), author="admin", now=_at(40))
    page = _read(tmp_path, infrastructure=LAB, start=3)
    first = page["entries"][0]
    assert first["ops"][0]["op"] == "journal_prune" and first["revision"] == 3
    assert page["start_missing"] is False, "r3 (une épingle) a été purgée, mais la page dit l'avoir trouvée"


def test_p2_link_older_than_everything_kept_gives_an_empty_page(tmp_path: Path):
    store = IntentStore(tmp_path)
    _pins(store, LAB, 3)  # r1..r3
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["sw-0"]}], 10)  # r4
    prune(tmp_path, LAB, before=_at(5), categories=("positions",), author="admin", now=_at(40))
    page = _read(tmp_path, infrastructure=LAB, start=2)
    assert page["start_missing"] is True and page["entries"] == [] and page["total"] == 2
    # la page dit alors « Aucune modification enregistrée » (filtered() ignore rev) alors que total = 2


def test_p3_search_misses_plural_words_the_page_shows(tmp_path: Path):
    store = IntentStore(tmp_path)
    many = [{"op": "pin", "hostname": f"sw-{i}", "x": i, "y": 0} for i in range(3)]
    _write(store, LAB, "o", many, 0)  # la page : « a placé 3 équipements »
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["a", "b"]}], 1)  # « (2 membres) »
    _write(store, LAB, "o", [{"op": "group_delete", "id": "g2-1"}, {"op": "pin", "hostname": "x", "x": 0, "y": 0}], 2)
    found = lambda q: [e["revision"] for e in _read(tmp_path, q=q)["entries"]]  # noqa: E731
    assert found("équipements") == [], "la ligne affiche « a placé 3 équipements »"
    assert found("membres") == [], "la ligne affiche « a créé le groupe G (2 membres) »"
    assert found("autres") == [], "la ligne affiche « … et 1 autre modification » (pluriel : « autres »)"


def test_p4_purge_trace_words_not_searchable(tmp_path: Path):
    store = IntentStore(tmp_path)
    _pins(store, LAB, 2)
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["a"]}], 10)
    prune(tmp_path, LAB, before=_at(5), categories=("positions",), author="admin", now=_at(40))
    found = lambda q: [e["ops"][0]["op"] for e in _read(tmp_path, q=q)["entries"]]  # noqa: E731
    assert found("antérieures") == [] and found("positions") == [], (
        "« a purgé le journal : 2 entrées antérieures au … (positions) » ne se trouve pas par ses mots"
    )


def test_p5_object_history_mixes_two_infrastructures_with_the_same_id(tmp_path: Path):
    store = IntentStore(tmp_path)
    _write(store, LAB, "o", [{"op": "group_create", "label": "Cœur LAB", "members": ["a"]}], 0)
    _write(store, EDGE, "o", [{"op": "group_create", "label": "DMZ EDGE", "members": ["b"]}], 1)
    page = _read(tmp_path, object="g1-1")  # « Toutes » : ce que donne jinfra=* avec jobj
    labels = sorted(e["subjects"][0]["label"] for e in page["entries"])
    assert labels == ["Cœur LAB", "DMZ EDGE"], "deux objets distincts présentés comme un seul historique"


def test_p6_group_ids_shift_after_a_purge(tmp_path: Path):
    store = IntentStore(tmp_path)
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["a"]}], 0)
    _pins(store, LAB, 3, start=20)
    before = [e["group"]["id"] for e in _read(tmp_path, infrastructure=LAB)["entries"] if e["group"]]
    prune(tmp_path, LAB, before=_at(5), author="admin", now=_at(40))
    after = [e["group"]["id"] for e in _read(tmp_path, infrastructure=LAB)["entries"] if e["group"]]
    # avant : la session des épingles r2..r4 est `s1` ; après la purge de r1 (le groupe), la trace prend le rang 0 et la
    # session garde `s1` par coïncidence ; purger UNE épingle décale : voir ci-dessous
    assert before == ["s1", "s1", "s1"] and after == ["s1", "s1", "s1"]


def test_p6b_group_id_changes_when_a_purge_shifts_ranks(tmp_path: Path):
    store = IntentStore(tmp_path)
    _write(store, LAB, "o", [{"op": "color", "hostname": "a", "hue": "red"}], 0)
    _write(store, LAB, "o", [{"op": "color", "hostname": "b", "hue": "red"}], 1)
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["a"]}], 2)
    _pins(store, LAB, 3, start=20)
    before = {e["revision"]: e["group"]["id"] for e in _read(tmp_path, infrastructure=LAB)["entries"] if e["group"]}
    prune(tmp_path, LAB, before=_at(5), categories=("colors",), author="admin", now=_at(40))
    after = {e["revision"]: e["group"]["id"] for e in _read(tmp_path, infrastructure=LAB)["entries"] if e["group"]}
    assert before == {4: "s3", 5: "s3", 6: "s3"} and after == {4: "s2", 5: "s2", 6: "s2"}, (before, after)



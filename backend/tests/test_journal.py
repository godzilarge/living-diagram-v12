"""Le journal de l'intention, relu (`journal.py`) : entrées, catégories, sujets, filtres, curseur, facettes."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from ld_backend.intent import IntentStore
from ld_backend.journal import JournalCursorError, JournalQuery, JournalReader, categories_of
from ld_backend.schemas import IntentOps

LAB, EDGE = "infra-lab", "infra edge/2"  # le second passe par un nom de dossier haché
NOTE = {"kind": "note", "text": "Salle B\nbaie 4"}


def _at(minute: int) -> datetime:
    return datetime(2026, 10, 6, 10, minute, tzinfo=UTC)


def _write(store: IntentStore, infra: str, author: str, ops: list[dict], minute: int) -> None:
    store.apply(infra, IntentOps.model_validate({"author": author, "ops": ops}), _at(minute))


@pytest.fixture
def root(tmp_path: Path) -> Path:
    store = IntentStore(tmp_path)
    _write(store, LAB, "orhan", [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}], 0)
    _write(
        store, LAB, "alice", [{"op": "group_create", "label": "Cœur DC02", "members": ["sw-core-01", "sw-core-02"]}], 1
    )
    _write(store, LAB, "orhan", [{"op": "group_update", "id": "g2-1", "label": "Cœur"}], 2)
    _write(
        store,
        LAB,
        "alice",
        [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}, {"op": "unpin", "hostname": "sw-core-01"}],
        3,
    )
    _write(store, LAB, "orhan", [{"op": "annotation_create", "content": NOTE}], 4)
    _write(store, LAB, "orhan", [{"op": "group_delete", "id": "g2-1"}], 5)
    _write(store, EDGE, "bob", [{"op": "color_type", "type": "router", "hue": "amber"}], 2)
    return tmp_path


def _read(root: Path, **kwargs) -> dict:
    return JournalReader(root).page(JournalQuery(**kwargs)).model_dump(mode="json")


def test_categories_come_from_the_operation_names_and_an_unknown_one_is_other():
    ops = [{"op": "pin"}, {"op": "color_type"}, {"op": "group_add"}, {"op": "teleport"}, {"op": "pin"}]
    assert categories_of(ops) == ["positions", "colors", "groups", "other"], "ordre fixe, sans doublon"
    assert categories_of([{"op": "annotation_delete"}, {"op": "connector_update"}]) == ["annotations", "connectors"]


def test_all_infrastructures_newest_first_with_categories_and_created_ids(root: Path):
    page = _read(root)
    keys = [(e["infrastructure"], e["revision"]) for e in page["entries"]]
    assert keys == [(LAB, 6), (LAB, 5), (LAB, 4), (LAB, 3), (EDGE, 1), (LAB, 2), (LAB, 1)], (
        "date, puis infra, puis révision"
    )
    assert page["total"] == 7 and page["next"] is None and page["unreadable"] == 0
    by_rev = {e["revision"]: e for e in page["entries"] if e["infrastructure"] == LAB}
    assert by_rev[4]["categories"] == ["positions", "colors"] and by_rev[4]["author"] == "alice"
    assert by_rev[4]["at"] == "2026-10-06T10:03:00Z"
    assert by_rev[2]["created"] == ["g2-1"] and by_rev[5]["created"] == ["a5-1"]
    assert by_rev[1]["ops"] == [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}], (
        "les opérations telles qu'écrites"
    )


def test_subjects_carry_the_label_known_at_that_revision(root: Path):
    by_rev = {e["revision"]: e for e in _read(root, infrastructure=LAB)["entries"]}
    assert by_rev[2]["subjects"] == [{"id": "g2-1", "kind": "group", "label": "Cœur DC02", "form": ""}]
    assert by_rev[3]["subjects"] == [{"id": "g2-1", "kind": "group", "label": "Cœur", "form": ""}], (
        "renommé à cette révision"
    )
    assert by_rev[6]["subjects"] == [{"id": "g2-1", "kind": "group", "label": "Cœur", "form": ""}], (
        "supprimé : son dernier nom"
    )
    assert by_rev[5]["subjects"] == [{"id": "a5-1", "kind": "annotation", "label": "Salle B", "form": "note"}]


def test_filters_by_infrastructure_author_category_and_period(root: Path):
    assert [e["infrastructure"] for e in _read(root, infrastructure=EDGE)["entries"]] == [EDGE]
    assert _read(root, infrastructure="inconnue")["entries"] == []
    assert {e["author"] for e in _read(root, authors=("alice", "bob"))["entries"]} == {"alice", "bob"}
    assert [e["revision"] for e in _read(root, categories=("colors",))["entries"]] == [4, 1]
    since, until = _at(2), _at(4)
    assert [(e["infrastructure"], e["revision"]) for e in _read(root, since=since, until=until)["entries"]] == [
        (LAB, 4),
        (LAB, 3),
        (EDGE, 1),
    ], "depuis inclus, jusqu'à exclu"


def test_text_search_is_case_insensitive_every_word_must_match(root: Path):
    found = lambda q: [e["revision"] for e in _read(root, infrastructure=LAB, q=q)["entries"]]  # noqa: E731
    assert found("SW-CORE-01") == [4, 2, 1], "hostname dans les opérations, membres compris"
    assert found("cœur") == [6, 3, 2], "le nom d'un groupe, même pour une opération qui ne cite que son id"
    assert found("baie") == [5], "le texte d'une note"
    assert found("alice red") == [4], "chaque mot, sur l'auteur ou le contenu"
    assert found("g2-1") == [6, 3, 2]
    assert found("absent") == []
    assert found("lab") == [], "le nom de l'infrastructure n'est pas cherché : il a sa facette"


def test_facets_ignore_their_own_filter_and_never_move(root: Path):
    """Chaque facette compte sans son propre filtre ; ses valeurs et leur ordre ne dépendent d'aucun filtre (Orhan,
    2026-10-09 : les sous-menus bougeaient selon la sélection) : une valeur sans entrée reste, à 0."""
    page = _read(root, authors=("alice",), categories=("colors",))
    assert [e["revision"] for e in page["entries"]] == [4]
    assert page["authors"] == [
        {"value": "alice", "count": 1},
        {"value": "bob", "count": 1},
        {"value": "orhan", "count": 0},
    ], "les auteurs en couleurs, tous présents, par nom"
    assert page["categories"] == [
        {"value": "positions", "count": 1},
        {"value": "colors", "count": 1},
        {"value": "groups", "count": 1},
        {"value": "annotations", "count": 0},
    ], "les catégories des entrées d'alice ; celles du journal restent, à 0"
    assert page["infrastructures"] == [{"value": EDGE, "count": 0}, {"value": LAB, "count": 1}]
    everything = _read(root)
    assert everything["infrastructures"] == [{"value": EDGE, "count": 1}, {"value": LAB, "count": 6}], "par nom"
    assert [a["value"] for a in everything["authors"]] == ["alice", "bob", "orhan"], "par nom, pas par activité"
    shapes = {
        name: [f["value"] for f in _read(root, **filters)[name]]
        for filters in ({}, {"q": "absent"}, {"categories": ("groups",)}, {"since": _at(30)})
        for name in ("authors", "categories", "infrastructures")
    }
    assert shapes == {name: [f["value"] for f in everything[name]] for name in shapes}, "mêmes valeurs, même ordre"
    lab = _read(root, infrastructure=LAB, q="absent")
    assert [a["value"] for a in lab["authors"]] == ["alice", "orhan"], "les auteurs de l'infrastructure choisie"


def test_cursor_pages_without_gaps_or_duplicates_even_when_the_journal_grows(root: Path):
    reader = JournalReader(root)
    first = reader.page(JournalQuery(limit=3))
    assert [e.revision for e in first.entries] == [6, 5, 4] and first.next and first.total == 7
    _write(IntentStore(root), LAB, "carol", [{"op": "pin", "hostname": "new", "x": 0, "y": 0}], 9)
    second = reader.page(JournalQuery(limit=3, before=first.next))
    assert [(e.infrastructure, e.revision) for e in second.entries] == [(LAB, 3), (EDGE, 1), (LAB, 2)]
    third = reader.page(JournalQuery(limit=3, before=second.next))
    assert [e.revision for e in third.entries] == [1] and third.next is None
    assert reader.page(JournalQuery(limit=3)).entries[0].author == "carol", "le cache suit le fichier qui grandit"
    with pytest.raises(JournalCursorError):
        reader.page(JournalQuery(before="pas-un-curseur"))


def test_unreadable_lines_are_skipped_and_counted_a_partial_last_line_is_not(root: Path):
    journal = next((root / "_intent").glob("infra-lab/journal.jsonl"))
    with journal.open("a", encoding="utf-8") as handle:
        handle.write("{cassé\n")
        handle.write(json.dumps({"at": "2026-10-06T11:00:00Z", "author": "x", "revision": "7", "ops": []}) + "\n")
        handle.write('{"at": "2026-10-06T11:')  # une écriture en cours : pas encore une ligne
    page = _read(root, infrastructure=LAB)
    assert page["total"] == 6 and page["unreadable"] == 2


def test_a_corrupt_intent_document_does_not_hide_its_journal(root: Path):
    """Revue, M2 : un nom sûr est le nom du dossier ; seul un dossier haché au document illisible reste sans nom, et
    ses lignes ne se comptent illisibles que dans « toutes », jamais chez une autre infrastructure."""
    (root / "_intent" / "infra-lab" / "intent.json").write_text("{", encoding="utf-8")
    assert _read(root)["total"] == 7 and _read(root)["unreadable"] == 0, "infra-lab se nomme par son dossier"
    hashed = next(p for p in (root / "_intent").iterdir() if p.name.startswith("_"))
    (hashed / "intent.json").write_text("{", encoding="utf-8")
    everything = _read(root)
    assert {e["infrastructure"] for e in everything["entries"]} == {LAB} and everything["unreadable"] == 1
    assert _read(root, infrastructure=LAB)["unreadable"] == 0, "jamais compté chez une autre"
    assert _read(root, infrastructure=EDGE)["total"] == 1, "nommée, l'infrastructure se lit par son dossier"


def test_dates_compare_as_dates_and_a_date_without_zone_is_unreadable(tmp_path: Path):
    """Revue, B2 : `10:00:00.5Z` vient après `10:00:00Z`, même si le texte dit l'inverse."""
    folder = tmp_path / "_intent" / LAB
    folder.mkdir(parents=True)
    rows = [
        {"at": "2026-10-06T10:00:00.500000Z", "author": "a", "revision": 2, "ops": []},
        {"at": "2026-10-06T10:00:00Z", "author": "a", "revision": 1, "ops": []},
        {"at": "2026-10-06T10:00:01", "author": "a", "revision": 3, "ops": []},
    ]
    (folder / "journal.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    page = _read(tmp_path)
    assert [e["revision"] for e in page["entries"]] == [2, 1] and page["unreadable"] == 1
    assert [e["revision"] for e in _read(tmp_path, since=_at(0))["entries"]] == [2, 1]
    assert [e["revision"] for e in _read(tmp_path, until=_at(0))["entries"]] == []
    first = JournalReader(tmp_path).page(JournalQuery(limit=1))
    assert [e.revision for e in JournalReader(tmp_path).page(JournalQuery(limit=1, before=first.next)).entries] == [1]


def test_a_connector_read_from_a_legacy_line_keeps_its_name(tmp_path: Path):
    """Revue, B5 : une ligne ou une flèche `a5-1` (1.3.x) relue en connecteur `c5-1` garde son nom."""
    folder = tmp_path / "_intent" / LAB
    folder.mkdir(parents=True)
    shape = {"op": "annotation_create", "content": {"kind": "shape", "shape": "arrow", "label": "vers le WAN"}}
    rows = [
        {"at": "2026-10-06T10:00:00Z", "author": "a", "revision": 5, "ops": [shape]},
        {"at": "2026-10-06T10:01:00Z", "author": "a", "revision": 6, "ops": [{"op": "connector_update", "id": "c5-1"}]},
    ]
    (folder / "journal.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    assert _read(tmp_path)["entries"][0]["subjects"] == [
        {"id": "c5-1", "kind": "connector", "label": "vers le WAN", "form": ""}
    ]


def test_no_intent_folder_reads_empty(tmp_path: Path):
    page = _read(tmp_path)
    assert page["entries"] == [] and page["total"] == 0 and page["authors"] == [] and page["infrastructures"] == []


def test_an_update_without_content_keeps_the_name_the_journal_writes_null_keys(tmp_path: Path):
    store = IntentStore(tmp_path)
    _write(store, LAB, "orhan", [{"op": "annotation_create", "content": NOTE}], 0)
    _write(store, LAB, "orhan", [{"op": "annotation_update", "id": "a1-1", "x": 40}], 1)
    image = {"kind": "image", "asset": "0" * 64, "alt": ""}
    _write(store, LAB, "orhan", [{"op": "annotation_create", "content": image}], 2)
    entries = _read(tmp_path)["entries"]
    assert [e["subjects"][0]["label"] for e in entries] == ["", "Salle B", "Salle B"], "une image n'a pas de nom"
    assert [e["subjects"][0]["form"] for e in entries] == ["image", "note", "note"], (
        "la sorte se garde d'une mise à jour à l'autre"
    )
    assert entries[1]["ops"][0]["content"] is None, "les opérations telles qu'écrites, clés nulles comprises"


def test_tables_images_and_connectors_are_named_by_what_they_show(tmp_path: Path):
    """Revue Impeccable : un tableau se nomme par ses premières cellules, une image par son texte alternatif, un
    connecteur sans étiquette par ses deux bouts (un groupe ou une annotation cités par leur nom)."""
    store = IntentStore(tmp_path)
    table = {"kind": "table", "header": True, "rows": [["VLAN", "NAME", "X"], ["10", "adm", ""]]}
    table = {**table, "widths": None, "heights": None, "merges": []}
    group = {"op": "group_create", "label": "Cœur", "members": ["sw-core-01"]}
    _write(store, LAB, "o", [{"op": "annotation_create", "content": table}, group], 0)
    ends = {"start": {"kind": "device", "ref": "fw-edge-01", "side": "auto"}, "end": {"kind": "free", "x": 0, "y": 0}}
    _write(store, LAB, "o", [{"op": "connector_create", **ends}], 1)
    _write(
        store,
        LAB,
        "o",
        [{"op": "connector_update", "id": "c2-1", "end": {"kind": "group", "ref": "g1-1", "side": "auto"}}],
        2,
    )
    labels = [[s["label"] for s in e["subjects"]] for e in _read(tmp_path)["entries"]]
    assert labels == [["fw-edge-01 → Cœur"], ["fw-edge-01 → point libre"], ["VLAN · NAME", "Cœur"]]

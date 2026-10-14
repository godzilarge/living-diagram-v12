"""Le journal de l'intention, relu (`journal.py`) : entrées, catégories, sujets, filtres, curseur, facettes."""

import json
from collections.abc import Iterator
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
    assert by_rev[2]["subjects"] == [
        {"id": "g2-1", "kind": "group", "label": "Cœur DC02", "form": "", "unnamed": "", "parts": []}
    ]
    assert by_rev[3]["subjects"] == [
        {"id": "g2-1", "kind": "group", "label": "Cœur", "form": "", "unnamed": "", "parts": []}
    ], "renommé à cette révision"
    assert by_rev[6]["subjects"] == [
        {"id": "g2-1", "kind": "group", "label": "Cœur", "form": "", "unnamed": "", "parts": []}
    ], "supprimé : son dernier nom"
    assert by_rev[5]["subjects"] == [
        {"id": "a5-1", "kind": "annotation", "label": "Salle B", "form": "note", "unnamed": "", "parts": []}
    ]


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
        {"id": "c5-1", "kind": "connector", "label": "vers le WAN", "form": "", "unnamed": "", "parts": []}
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
    assert labels == [["fw-edge-01 → Cœur", "Cœur"], ["fw-edge-01 → point libre"], ["VLAN · NAME", "Cœur"]], (
        "le groupe visé par un bout est cité avec son nom"
    )


def test_an_unnamed_subject_is_said_by_its_kind_and_an_anchor_is_cited_by_name(tmp_path: Path):
    """Revue Impeccable du 2026-10-10 : « ancrage g187-1 », « a848-1 → point libre » ne parlaient à personne."""
    store = IntentStore(tmp_path)
    shape = {"kind": "shape", "shape": "rectangle", "label": ""}
    group = {"op": "group_create", "label": "Cœur", "members": ["sw-core-01"]}
    _write(store, LAB, "o", [{"op": "annotation_create", "content": shape}, group], 0)
    ends = {"start": {"kind": "annotation", "ref": "a1-1", "side": "auto"}, "end": {"kind": "free", "x": 0, "y": 0}}
    _write(store, LAB, "o", [{"op": "connector_create", **ends}], 1)
    _write(store, LAB, "o", [{"op": "annotation_update", "id": "a1-1", "anchor": {"kind": "group", "ref": "g1-1"}}], 2)
    entries = _read(tmp_path)["entries"]
    cited = [[(s["id"], s["label"]) for s in e["subjects"]] for e in entries]
    assert cited[0] == [("a1-1", ""), ("g1-1", "Cœur")], (
        "l'ancrage est cité par son nom ; sans nom, la page dit sa sorte"
    )
    assert cited[1] == [("c2-1", "forme sans titre → point libre"), ("a1-1", "")]
    assert cited[2] == [("a1-1", ""), ("g1-1", "Cœur")]


def test_search_finds_the_words_the_page_shows_without_case_or_accents(tmp_path: Path):
    """Revue Impeccable du 2026-10-10 : « supprimé », « rouge », « placé » ne trouvaient rien (la recherche ne lisait
    que `group_delete`, `red`, `pin`) ; un faux négatif silencieux dans un registre d'audit."""
    store = IntentStore(tmp_path)
    table = {"kind": "table", "header": True, "rows": [["VLAN", "NAME"]]}
    table = {**table, "widths": None, "heights": None, "merges": []}
    _write(store, LAB, "o", [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}], 0)
    _write(store, LAB, "o", [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}], 1)
    _write(store, LAB, "o", [{"op": "group_create", "label": "Cœur", "members": ["sw-core-01"]}], 2)
    _write(store, LAB, "o", [{"op": "group_delete", "id": "g3-1"}], 3)
    _write(store, LAB, "o", [{"op": "annotation_create", "content": table}], 4)
    _write(store, LAB, "o", [{"op": "annotation_update", "id": "a5-1", "x": 4}], 5)
    _write(store, LAB, "o", [{"op": "color_type", "type": "router", "hue": "amber"}], 6)

    def found(q: str) -> list[int]:
        return [e["revision"] for e in _read(tmp_path, q=q)["entries"]]

    assert found("supprimé") == [4]
    assert found("SUPPRIME") == [4], "sans la casse ni les accents"
    assert found("rouge") == [2]
    assert found("placé") == [1]
    assert found("tableau") == [6, 5], "la sorte d'une annotation, même dans une mise à jour sans contenu"
    assert found("tableau position") == [6], "les champs modifiés, comme la page les dit"
    assert found("routeur ambre") == [7]
    # les mêmes mots en anglais (2026-10-10 : la page parle aussi anglais, le serveur ne sait pas laquelle)
    assert found("deleted") == [4]
    assert found("placed") == [1]
    assert found("table position") == [6]
    assert found("router amber") == [7]


def test_search_finds_an_unnamed_object_in_english_too(tmp_path: Path):
    """Le serveur nomme en français un objet sans nom (« forme sans titre → point libre ») ; la page anglaise affiche
    « untitled shape → free point » : la recherche trouve les deux."""
    store = IntentStore(tmp_path)
    shape = {"kind": "shape", "shape": "rectangle", "label": ""}
    _write(store, LAB, "o", [{"op": "annotation_create", "content": shape}], 0)
    ends = {"start": {"kind": "annotation", "ref": "a1-1", "side": "auto"}, "end": {"kind": "free", "x": 0, "y": 0}}
    _write(store, LAB, "o", [{"op": "connector_create", **ends}], 1)
    revisions = [e["revision"] for e in _read(tmp_path, q="free point")["entries"]]
    assert revisions == [2]
    assert [e["revision"] for e in _read(tmp_path, q="point libre")["entries"]] == [2]


def test_groups_are_computed_on_the_whole_file_never_on_a_filter(tmp_path: Path):
    """Revue Impeccable du 2026-10-10 : calculées sur la liste filtrée, les sessions changeaient avec le filtre."""
    store = IntentStore(tmp_path)
    pin = [{"op": "pin", "hostname": "sw-core-01", "x": 1, "y": 2}]
    for minute in (0, 5, 10):
        _write(store, LAB, "o", pin, minute)
    _write(store, LAB, "o", [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}], 11)
    for minute in (12, 14):
        _write(store, LAB, "o", [{"op": "pin", "hostname": "fw-edge-01", "x": minute, "y": 0}], minute)
    _write(store, LAB, "o", [{"op": "color", "hostname": "fw-edge-01", "hue": "teal"}], 15)
    _write(store, LAB, "o", [{"op": "color", "hostname": "fw-edge-01", "hue": "red"}], 16)
    _write(store, LAB, "bob", pin, 17)

    def groups(**kwargs) -> list:
        return [
            (e["revision"], e["group"] and (e["group"]["kind"], e["group"]["size"]))
            for e in _read(tmp_path, **kwargs)["entries"]
        ]

    assert groups() == [
        (9, None),
        (8, ("repeat", 2)),
        (7, ("repeat", 2)),
        (6, ("repeat", 2)),
        (5, ("repeat", 2)),
        (4, None),
        (3, ("session", 3)),
        (2, ("session", 3)),
        (1, ("session", 3)),
    ], "trois positions : une session ; deux : une répétition ; une couleur coupe ; un autre auteur aussi"
    assert groups(categories=("positions",))[1:] == [
        (6, ("repeat", 2)),
        (5, ("repeat", 2)),
        (3, ("session", 3)),
        (2, ("session", 3)),
        (1, ("session", 3)),
    ], "filtrées, les positions ne fusionnent pas en une session de cinq"


LOCALES = Path(__file__).parents[2] / "engine" / "src" / "i18n" / "locales"


def _catalog(language: str) -> dict:
    return json.loads((LOCALES / language / "journal.json").read_text(encoding="utf-8"))


def _templates(tree: dict, prefix: str = "") -> Iterator[tuple[str, str]]:
    """Les phrases d'un catalogue, à plat : (opération, texte) ; un pluriel donne sa forme `other`, une sorte
    d'annotation (`say.annotation_create.note`) compte pour son opération."""
    for key, value in tree.items():
        if isinstance(value, dict):
            yield from _templates(value, prefix or key)
        elif not key.endswith(("_one", "_many", "_zero")):
            yield (prefix or key.removesuffix("_other")), value


def test_every_verb_the_page_writes_is_searchable():
    """La recherche lit les mots de la page (`journal_words.py`) : chaque verbe des phrases du catalogue `journal`
    (`say.*`, `batch.*`), dans chaque langue, doit être dans le vocabulaire de son opération, et le nom d'une rafale
    aussi (« a placé 3 équipements », « placed 3 devices ») ; sinon une phrase affichée ne se trouve pas."""
    import re

    from ld_backend.journal_words import OP_WORDS, fold

    for language in ("fr", "en"):
        catalog = _catalog(language)
        says = [(op, text) for op, text in _templates(catalog["say"]) if op in OP_WORDS]
        assert len(says) >= 18, (language, "les phrases du catalogue se lisent encore")
        for op, text in says:
            verb = re.sub(r"\{\{\w+\}\}", "", text).split()[0]
            assert fold(verb) in fold(" ".join(OP_WORDS[op])), (language, op, verb)
        batches = [(op, text) for op, text in _templates(catalog["batch"]) if text.split()]
        assert len(batches) >= 12, (language, "la table des rafales se lit encore")
        for op, text in batches:
            words = fold(" ".join(OP_WORDS.get(op, ())))
            verb, noun = text.split()[0], text.split("{{count}}")[1].split()[0]
            assert fold(verb) in words and fold(noun) in words, (language, op, verb, noun)


def test_the_page_and_the_search_know_every_kind_the_server_marks_as_unnamed():
    """Le serveur marque un objet sans nom par sa sorte (`unnamed`, `parts`) ; la page la dit dans sa langue
    (`journal:unnamedRef`) et la recherche la connaît dans les deux (`UNNAMED_WORDS`) : les trois listes disent la même
    chose, et les mots français du serveur (`label`, gardé pour la recherche) sont ceux de la page."""
    from ld_backend.journal_replay import UNNAMED_TEXT
    from ld_backend.journal_words import UNNAMED_WORDS

    fr, en = _catalog("fr")["unnamedRef"], _catalog("en")["unnamedRef"]
    assert set(UNNAMED_TEXT) == set(UNNAMED_WORDS)
    for kind, text in UNNAMED_TEXT.items():
        assert fr[kind] == text and UNNAMED_WORDS[kind] == (fr[kind], en[kind]), kind


def test_a_name_typed_by_a_user_is_never_taken_for_an_unnamed_object(tmp_path: Path):
    """Revue de l'interface bilingue, B3 : un groupe nommé « point libre » reste un nom ; un bout libre est marqué."""
    store = IntentStore(tmp_path)
    _write(store, LAB, "o", [{"op": "group_create", "label": "point libre", "members": ["sw-core-01"]}], 0)
    ends = {"start": {"kind": "group", "ref": "g1-1", "side": "auto"}, "end": {"kind": "free", "x": 0, "y": 0}}
    _write(store, LAB, "o", [{"op": "connector_create", **ends}], 1)
    subjects = {s["id"]: s for e in _read(tmp_path)["entries"] for s in e["subjects"]}
    assert subjects["g1-1"]["label"] == "point libre" and subjects["g1-1"]["unnamed"] == ""
    assert subjects["c2-1"]["parts"] == [{"text": "point libre", "unnamed": None}, {"text": None, "unnamed": "free"}]
    assert subjects["c2-1"]["unnamed"] == "", "un connecteur nommé par ses bouts a un nom"


def test_actions_are_created_modified_deleted_and_a_purge_counts_as_deleted(root: Path):
    page = _read(root, infrastructure=LAB)
    assert [(e["revision"], e["actions"]) for e in page["entries"]] == [
        (6, ["deleted"]),
        (5, ["created"]),
        (4, ["modified"]),
        (3, ["modified"]),
        (2, ["created"]),
        (1, ["modified"]),
    ], "retirer une épingle ou une couleur modifie, ne supprime pas"
    assert page["actions"] == [{"value": "created", "count": 2}, {"value": "modified", "count": 3},
                               {"value": "deleted", "count": 1}]  # fmt: skip
    deleted = _read(root, infrastructure=LAB, actions=("deleted",))
    assert [e["revision"] for e in deleted["entries"]] == [6]
    assert [f["count"] for f in deleted["actions"]] == [2, 3, 1], "la facette se compte sans son propre filtre"


def test_object_history_lists_everything_that_cites_it(root: Path):
    """L'historique d'un objet : ses opérations, sa création, un groupe qui le compte parmi ses membres."""
    assert [e["revision"] for e in _read(root, infrastructure=LAB, object="sw-core-01")["entries"]] == [4, 2, 1]
    assert [e["revision"] for e in _read(root, infrastructure=LAB, object="g2-1")["entries"]] == [6, 3, 2], (
        "créé, renommé, supprimé"
    )
    assert _read(root, infrastructure=LAB, object="inconnu")["entries"] == []
    with pytest.raises(ValueError):  # une identité n'est unique que dans son infrastructure (revue, M3)
        _read(root, object="g2-1")


def test_a_link_opens_the_page_at_its_revision_and_says_when_it_is_gone(root: Path):
    page = _read(root, infrastructure=LAB, start=3, limit=2)
    assert [e["revision"] for e in page["entries"]] == [3, 2] and page["start_missing"] is False
    assert page["next"], "la suite se lit comme d'habitude"
    assert [e["revision"] for e in _read(root, infrastructure=LAB, before=page["next"])["entries"]] == [1]
    gone = _read(root, infrastructure=LAB, start=99)
    assert gone["start_missing"] is True, "une révision absente (purgée, ou inconnue) se dit"
    assert gone["entries"][0]["revision"] == 6, "et la page part de la plus proche plus ancienne"
    nearest = _read(root, infrastructure=LAB, start=4, categories=("groups",))
    assert nearest["start_missing"] is True, "filtrée : la page part de la plus proche plus ancienne"
    assert [e["revision"] for e in nearest["entries"]] == [3, 2]


def test_a_link_to_a_purged_revision_lands_on_the_purge_never_on_an_empty_page(tmp_path: Path):
    """Revue, M1 et M2 : la trace de purge porte la révision maximale ; un lien vers l'entrée purgée de cette révision
    tombait sur la trace sans dire que l'entrée manque, et un lien plus ancien que tout donnait une page vide."""
    from ld_backend.journal_prune import prune

    store = IntentStore(tmp_path)
    for minute in range(3):
        _write(store, LAB, "o", [{"op": "pin", "hostname": f"sw-{minute}", "x": 0, "y": 0}], minute)
    prune(
        tmp_path, LAB, before=datetime(2026, 10, 7, tzinfo=UTC), author="admin", now=datetime(2026, 10, 7, tzinfo=UTC)
    )
    _write(store, LAB, "o", [{"op": "color", "hostname": "sw-0", "hue": "red"}], 30)
    for revision in (3, 1):
        page = _read(tmp_path, infrastructure=LAB, start=revision)
        assert page["start_missing"] is True, revision
        assert page["entries"][0]["ops"][0]["op"] == "journal_prune", "la trace qui explique la disparition"
    unknown = _read(tmp_path, infrastructure=LAB, start=0)
    assert unknown["start_missing"] is True and len(unknown["entries"]) == 2, "jamais une page vide : tout le journal"


def test_search_finds_plurals_counts_and_purge_words(tmp_path: Path):
    """Revue, M4 : « équipements » ne trouvait pas « a placé 3 équipements », ni la purge par ses mots."""
    from ld_backend.journal_prune import prune

    store = IntentStore(tmp_path)
    _write(
        store,
        LAB,
        "o",
        [{"op": "pin", "hostname": "a", "x": 0, "y": 0}, {"op": "pin", "hostname": "b", "x": 0, "y": 0}],
        0,
    )
    _write(store, LAB, "o", [{"op": "group_create", "label": "G", "members": ["a", "b"]}], 1)
    when = datetime(2026, 10, 6, 10, 1, tzinfo=UTC)
    prune(tmp_path, LAB, before=when, categories=("positions",), author="admin", now=datetime(2026, 10, 7, tzinfo=UTC))

    def found(q: str) -> int:
        return _read(tmp_path, q=q)["total"]

    assert found("membres") == 1
    assert found("autres modifications") == 0 and found("groupes") == 1
    assert found("entrées antérieures") == 1 and found("positions purgé") == 1, "la trace, par ses mots et sa catégorie"


def test_a_legacy_line_is_in_the_history_of_the_connector_it_became(tmp_path: Path):
    """Revue, B10 : une flèche d'un 1.3.x (annotation `a…`) est relue comme connecteur `c…` : sa création compte."""
    line = json.dumps(
        {"at": "2026-10-06T10:00:00Z", "author": "o", "revision": 5, "ops": [
            {"op": "annotation_create", "content": {"kind": "shape", "shape": "arrow", "label": ""}}]}
    )  # fmt: skip
    folder = tmp_path / "_intent" / LAB
    folder.mkdir(parents=True)
    (folder / "journal.jsonl").write_text(line + "\n", encoding="utf-8")
    assert [e["revision"] for e in _read(tmp_path, infrastructure=LAB, object="c5-1")["entries"]] == [5]


@pytest.mark.parametrize("language", ["fr", "en"])
def test_the_search_words_say_what_the_page_shows(language):
    """Revue de l'interface bilingue, B9 : les teintes, les types, les catégories, les sortes d'annotation et les champs
    que la page écrit se cherchent avec ces mots-là, dans chaque langue ; renommer un mot dans un catalogue sans la
    table de recherche recréerait le faux négatif du 2026-10-10 (« tester une recherche avec les mots affichés »)."""
    from ld_backend.journal_words import CATEGORY_WORDS, FIELD_WORDS, HUE_WORDS, KIND_WORDS, TYPE_WORDS, fold

    common = json.loads((LOCALES / language / "common.json").read_text(encoding="utf-8"))
    page = _catalog(language)
    pairs = ((HUE_WORDS, common["hue"]), (TYPE_WORDS, common["type"]), (CATEGORY_WORDS, page["category"]),
             (KIND_WORDS, common["annotationKind"]))  # fmt: skip
    for table, shown in pairs:
        for key, words in table.items():
            assert fold(shown[key]) in {fold(w) for w in words}, (language, key, shown[key])
    fields = {fold(w) for words in FIELD_WORDS.values() for w in words}
    assert {fold(text) for text in page["field"].values()} <= fields, language

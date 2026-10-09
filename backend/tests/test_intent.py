"""Le store d'intention (B4, docs/08) : un document par infrastructure, écrit par opérations, journalisé, atomique."""

import json
import threading
from datetime import UTC, datetime, timedelta

import pytest
from ld_contracts.intent import Intent
from ld_contracts.intent.serialize import canonical_json

from ld_backend.intent import IntentCorruptError, IntentGroupError, IntentStore
from ld_backend.schemas import (
    AnnotationCreateOp,
    AnnotationDeleteOp,
    AnnotationStylePatch,
    AnnotationUpdateOp,
    ColorOp,
    ColorTypeOp,
    ConnectorCreateOp,
    ConnectorDeleteOp,
    ConnectorStylePatch,
    ConnectorUpdateOp,
    GroupAddOp,
    GroupCreateOp,
    GroupDeleteOp,
    GroupRemoveOp,
    GroupStylePatch,
    GroupUpdateOp,
    IntentOps,
    PinOp,
    UncolorOp,
    UncolorTypeOp,
    UnpinOp,
)

NOW = datetime(2026, 10, 4, 18, 30, tzinfo=UTC)
INFRA = "infra-lab"
TABLE = {"kind": "table", "header": True, "rows": [["x"]], "widths": None, "heights": None, "merges": []}


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


def test_colours_apply_like_pins_last_writer_wins_per_type_or_device(store: IntentStore):
    """docs/10 : couleur de type et d'équipement, mêmes règles que les épingles, même journal, mêmes tris."""
    first = store.apply(
        INFRA,
        ops(
            ColorTypeOp(op="color_type", type="switch", hue="sky"),
            ColorTypeOp(op="color_type", type="firewall", hue="red"),
            ColorOp(op="color", hostname="sw-core-01", hue="amber"),
            ColorOp(op="color", hostname="fw-edge-01", hue="pink"),
        ),
        now=NOW,
    )
    assert [(c.type, c.hue, c.author, c.at) for c in first.type_colors] == [
        ("firewall", "red", "orhan", NOW),
        ("switch", "sky", "orhan", NOW),
    ]
    assert [(c.hostname, c.hue) for c in first.device_colors] == [("fw-edge-01", "pink"), ("sw-core-01", "amber")]
    later = NOW + timedelta(minutes=2)
    second = store.apply(
        INFRA,
        ops(
            ColorOp(op="color", hostname="sw-core-01", hue="lime"),
            UncolorTypeOp(op="uncolor_type", type="switch"),
            UncolorOp(op="uncolor", hostname="jamais-vu"),
            author="alice",
        ),
        now=later,
    )
    assert second.revision == 2 and [(c.type, c.hue) for c in second.type_colors] == [("firewall", "red")]
    assert [(c.hostname, c.hue, c.author, c.at) for c in second.device_colors] == [
        ("fw-edge-01", "pink", "orhan", NOW),
        ("sw-core-01", "lime", "alice", later),
    ]
    assert second.pins == () and store.load(INFRA) == second
    lines = [json.loads(line) for line in (store.root / "_intent" / INFRA / "journal.jsonl").read_text().splitlines()]
    assert (
        lines[1]["ops"][0] == {"op": "color", "hostname": "sw-core-01", "hue": "lime"} and lines[1]["author"] == "alice"
    )


def test_a_document_written_before_1_1_is_read_with_empty_colours_and_rewritten_at_the_next_write(store: IntentStore):
    """docs/10, décision 7 : un `intent.json` 1.0.0 (épingles seules) se relit tel quel, puis s'écrit en 1.1.0."""
    folder = store.root / "_intent" / INFRA
    folder.mkdir(parents=True)
    old = {
        "intent_version": "1.0.0",
        "infrastructure": INFRA,
        "revision": 1,
        "updated_at": "2026-10-04T18:30:00Z",
        "pins": [{"hostname": "sw-core-01", "x": 1, "y": 2, "author": "orhan", "at": "2026-10-04T18:30:00Z"}],
    }
    (folder / "intent.json").write_text(json.dumps(old), encoding="utf-8")
    read = store.load(INFRA)
    assert read.intent_version == "1.5.0" and read.type_colors == () and read.groups == () and read.pins[0].x == 1
    assert json.loads((folder / "intent.json").read_text())["intent_version"] == "1.0.0", "lire ne réécrit rien"
    written = store.apply(
        INFRA, ops(ColorOp(op="color", hostname="sw-core-01", hue="red")), now=NOW + timedelta(days=1)
    )
    assert written.revision == 2 and json.loads((folder / "intent.json").read_text())["intent_version"] == "1.5.0"


def test_groups_are_created_with_a_server_id_completed_style_then_updated_added_removed_deleted(store: IntentStore):
    """docs/10 §5 : `g<revision>-<n>`, style complété par les défauts, patchs partiels, membres ajoutés sans réécrire,
    dernier membre protégé, id inconnu refusé."""
    first = store.apply(
        INFRA,
        ops(
            GroupCreateOp(op="group_create", label=" Cœur ", members=["sw-core-02", "sw-core-01"]),
            GroupCreateOp(
                op="group_create",
                label="DMZ",
                members=["fw-edge-01"],
                style=GroupStylePatch(shape="ellipse", hue="red"),
            ),
        ),
        now=NOW,
    )
    assert [g.id for g in first.groups] == ["g1-1", "g1-2"]
    assert first.groups[0].label == "Cœur" and first.groups[0].members == ("sw-core-01", "sw-core-02")
    assert first.groups[0].style.shape == "rectangle" and first.groups[0].style.padding == 24, "les défauts"
    assert (
        first.groups[1].style.shape == "ellipse"
        and first.groups[1].style.hue == "red"
        and first.groups[1].style.radius == 16
    )
    later = NOW + timedelta(minutes=1)
    second = store.apply(
        INFRA,
        ops(
            GroupUpdateOp(op="group_update", id="g1-1", label="Cœur DC1", style=GroupStylePatch(padding=40)),
            GroupAddOp(op="group_add", id="g1-2", members=["fw-edge-02", "fw-edge-01"]),
            GroupRemoveOp(op="group_remove", id="g1-2", members=["fw-edge-01"]),
            author="alice",
        ),
        now=later,
    )
    core, dmz = second.groups
    assert (
        core.label == "Cœur DC1" and core.style.padding == 40 and core.style.hue == "slate" and core.author == "alice"
    )
    assert dmz.members == ("fw-edge-02",) and dmz.at == later and dmz.style.shape == "ellipse"
    with pytest.raises(IntentGroupError) as exc:
        store.apply(INFRA, ops(GroupRemoveOp(op="group_remove", id="g1-2", members=["fw-edge-02"])), now=later)
    assert exc.value.code == "group_without_member"
    with pytest.raises(IntentGroupError) as exc:
        store.apply(INFRA, ops(GroupDeleteOp(op="group_delete", id="g9-9")), now=later)
    assert exc.value.code == "unknown_group" and store.load(INFRA) == second, "rien n'est écrit"
    third = store.apply(INFRA, ops(GroupDeleteOp(op="group_delete", id="g1-1")), now=later)
    assert [g.id for g in third.groups] == ["g1-2"] and third.revision == 3
    fourth = store.apply(INFRA, ops(GroupCreateOp(op="group_create", label="x", members=["a"])), now=later)
    assert [g.id for g in fourth.groups] == ["g1-2", "g4-1"], "l'identité suit la révision, jamais réutilisée"


def test_annotations_are_created_with_a_server_id_defaults_then_patched_and_deleted(store: IntentStore):
    """docs/10 §6 : `a<revision>-<n>`, défauts de la sorte (style, taille), patchs partiels, sorte figée, id inconnu
    refusé, image citée seulement si le magasin la connaît."""
    note = {"kind": "note", "text": "Baie 12"}
    first = store.apply(
        INFRA,
        ops(
            AnnotationCreateOp(op="annotation_create", content=note, x=10, y=20),
            AnnotationCreateOp(
                op="annotation_create",
                content={**TABLE, "rows": [["VLAN", "nom"], ["10", "users"]]},
                anchor={"kind": "device", "ref": "sw-core-01"},
                leader=True,
                style=AnnotationStylePatch(hue="red"),
            ),
        ),
        now=NOW,
    )
    a, b = first.annotations
    assert (a.id, b.id) == ("a1-1", "a1-2") and a.content.kind == "note" and (a.w, a.h) == (220, 80)
    assert a.style.hue == "amber" and a.anchor.kind == "free" and a.z == "front" and not a.locked
    assert (b.w, b.h) == (160, 52) and b.style.hue == "red" and b.style.text_font == "mono" and b.leader
    later = NOW + timedelta(minutes=1)
    second = store.apply(
        INFRA,
        ops(
            AnnotationUpdateOp(
                op="annotation_update", id="a1-1", x=-30, w=300, locked=True, style=AnnotationStylePatch(opacity=50)
            ),
            AnnotationUpdateOp(op="annotation_update", id="a1-2", content={**TABLE, "header": False, "rows": [["x"]]}),
            author="alice",
        ),
        now=later,
    )
    a, b = second.annotations
    assert (a.x, a.y, a.w, a.h, a.locked, a.style.opacity, a.author, a.at) == (
        -30,
        20,
        300,
        80,
        True,
        50,
        "alice",
        later,
    )
    assert b.content.rows == (("x",),) and b.style.hue == "red", "le contenu se remplace, le style reste"
    for bad, code in (
        (
            AnnotationUpdateOp(
                op="annotation_update",
                id="a1-1",
                content={"kind": "shape", "shape": "ellipse", "label": ""},
            ),
            "annotation_kind_change",
        ),
        (AnnotationDeleteOp(op="annotation_delete", id="a9-9"), "unknown_annotation"),
        (AnnotationUpdateOp(op="annotation_update", id="a9-9", x=1), "unknown_annotation"),
    ):
        with pytest.raises(IntentGroupError) as exc:
            store.apply(INFRA, ops(bad), now=later)
        assert exc.value.code == code and store.load(INFRA) == second, "rien n'est écrit"
    from pydantic import ValidationError

    with pytest.raises(ValidationError):  # une ligne de rappel sans ancre : refus du contrat, rien n'est écrit
        store.apply(
            INFRA,
            ops(AnnotationUpdateOp(op="annotation_update", id="a1-2", anchor={"kind": "free", "ref": None})),
            now=later,
        )
    assert store.load(INFRA) == second
    third = store.apply(INFRA, ops(AnnotationDeleteOp(op="annotation_delete", id="a1-1")), now=later)
    assert [x.id for x in third.annotations] == ["a1-2"]
    fourth = store.apply(INFRA, ops(AnnotationCreateOp(op="annotation_create", content=note)), now=later)
    assert [x.id for x in fourth.annotations] == ["a1-2", "a4-1"], "l'identité suit la révision"
    journal = (store.root / "_intent" / INFRA / "journal.jsonl").read_text(encoding="utf-8").splitlines()
    assert json.loads(journal[-1])["ops"][0]["op"] == "annotation_create"
    guarded = IntentStore(store.root, asset_exists=lambda infra, asset: asset.startswith("ab"))
    image = {"kind": "image", "asset": "cd" * 32, "alt": ""}
    with pytest.raises(IntentGroupError) as exc:
        guarded.apply(INFRA, ops(AnnotationCreateOp(op="annotation_create", content=image)), now=later)
    assert exc.value.code == "unknown_asset"
    known = guarded.apply(
        INFRA, ops(AnnotationCreateOp(op="annotation_create", content={**image, "asset": "ab" * 32})), now=later
    )
    assert known.annotations[-1].content.kind == "image" and (known.annotations[-1].w, known.annotations[-1].h) == (
        320,
        240,
    )


def test_connectors_are_created_with_a_server_id_defaults_then_patched_and_deleted(store: IntentStore):
    """docs/10 §6 (1.4.0) : `c<revision>-<n>`, flèche droite par défaut, bouts remplacés en entier, style complété,
    id inconnu refusé, même élément aux deux bouts refusé par le contrat."""
    free = {"kind": "free", "x": 0, "y": 0}
    core = {"kind": "device", "ref": "sw-core-01", "side": "auto"}
    first = store.apply(
        INFRA,
        ops(
            ConnectorCreateOp(op="connector_create", start=free, end=core),
            ConnectorCreateOp(
                op="connector_create",
                start=core,
                end={"kind": "annotation", "ref": "a1-1", "side": "n"},
                route="curve",
                bend=60,
                label="WAN",
                style=ConnectorStylePatch(hue="red", stroke_style="dashed"),
            ),
        ),
        now=NOW,
    )
    a, b = first.connectors
    assert (a.id, b.id) == ("c1-1", "c1-2") and a.heads.end == "arrow" and a.heads.start == "none"
    assert a.route == "straight" and a.bend == 0 and a.style.hue == "slate" and a.style.stroke_width == 2
    assert b.route == "curve" and b.bend == 60 and b.style.hue == "red" and b.style.stroke_style == "dashed"
    later = NOW + timedelta(minutes=1)
    second = store.apply(
        INFRA,
        ops(
            ConnectorUpdateOp(
                op="connector_update",
                id="c1-1",
                end={"kind": "free", "x": 300, "y": 40},
                heads={"start": "arrow", "end": "arrow"},
                locked=True,
                style=ConnectorStylePatch(opacity=50),
            ),
            author="alice",
        ),
        now=later,
    )
    a, b = second.connectors
    assert (a.end.kind, a.end.x, a.heads.start, a.locked, a.style.opacity, a.author, a.at) == (
        "free",
        300,
        "arrow",
        True,
        50,
        "alice",
        later,
    )
    assert b == first.connectors[1], "l'autre n'a pas bougé"
    for bad in (
        ConnectorDeleteOp(op="connector_delete", id="c9-9"),
        ConnectorUpdateOp(op="connector_update", id="c9-9", bend=1),
    ):
        with pytest.raises(IntentGroupError) as exc:
            store.apply(INFRA, ops(bad), now=later)
        assert exc.value.code == "unknown_connector" and store.load(INFRA) == second, "rien n'est écrit"
    from pydantic import ValidationError

    with pytest.raises(ValidationError):  # les deux bouts sur le même équipement : refus du contrat
        store.apply(INFRA, ops(ConnectorUpdateOp(op="connector_update", id="c1-2", end=core)), now=later)
    assert store.load(INFRA) == second
    third = store.apply(INFRA, ops(ConnectorDeleteOp(op="connector_delete", id="c1-1")), now=later)
    assert [x.id for x in third.connectors] == ["c1-2"]
    fourth = store.apply(INFRA, ops(ConnectorCreateOp(op="connector_create", start=free, end=core)), now=later)
    assert [x.id for x in fourth.connectors] == ["c1-2", "c4-1"], "l'identité suit la révision"
    journal = (store.root / "_intent" / INFRA / "journal.jsonl").read_text(encoding="utf-8").splitlines()
    assert json.loads(journal[-1])["ops"][0]["op"] == "connector_create"


def test_a_document_written_in_1_3_is_read_with_its_arrows_as_connectors(store: IntentStore):
    """Le store relit un 1.3.0 (la session de la veille) : une flèche en forme devient un connecteur, un tableau
    reçoit ses colonnes égales ; réécrit dans la version courante à la prochaine opération."""
    from ld_contracts.intent import DEFAULT_ANNOTATION_STYLE

    folder = store.root / "_intent" / INFRA
    folder.mkdir(parents=True)
    base = {"anchor": {"kind": "free", "ref": None}, "z": "front", "locked": False, "leader": False, "author": "o"}
    old = {
        "intent_version": "1.3.0",
        "infrastructure": INFRA,
        "revision": 2,
        "updated_at": "2026-10-08T18:30:00Z",
        "pins": [],
        "type_colors": [],
        "device_colors": [],
        "groups": [],
        "annotations": [
            {
                **base,
                "id": "a2-1",
                "x": 10,
                "y": 20,
                "w": 100,
                "h": 50,
                "content": {"kind": "shape", "shape": "arrow", "label": "", "direction": "down"},
                "style": DEFAULT_ANNOTATION_STYLE["shape"],
                "at": "2026-10-08T18:30:00Z",
            },
            {
                **base,
                "id": "a2-2",
                "x": 0,
                "y": 0,
                "w": 160,
                "h": 52,
                "content": {"kind": "table", "header": True, "rows": [["a", "b"]]},
                "style": DEFAULT_ANNOTATION_STYLE["table"],
                "at": "2026-10-08T18:30:00Z",
            },
        ],
    }
    (folder / "intent.json").write_text(json.dumps(old), encoding="utf-8")
    read = store.load(INFRA)
    assert read.intent_version == "1.5.0" and [a.id for a in read.annotations] == ["a2-2"]
    assert read.annotations[0].content.widths is None and read.annotations[0].content.merges == ()
    assert [c.id for c in read.connectors] == ["c2-1"] and read.connectors[0].end.x == 110
    written = store.apply(INFRA, ops(pin("sw-core-01", 1, 2)), now=datetime(2026, 10, 9, tzinfo=UTC))
    assert written.intent_version == "1.5.0" and len(written.connectors) == 1
    assert Intent.model_validate_json((folder / "intent.json").read_text(encoding="utf-8")).revision == 3


def test_a_document_written_before_1_3_is_read_with_empty_annotations(store: IntentStore):
    folder = store.root / "_intent" / INFRA
    folder.mkdir(parents=True)
    old = {
        "intent_version": "1.2.0",
        "infrastructure": INFRA,
        "revision": 1,
        "updated_at": "2026-10-04T18:30:00Z",
        "pins": [],
        "type_colors": [],
        "device_colors": [],
        "groups": [],
    }
    (folder / "intent.json").write_text(json.dumps(old), encoding="utf-8")
    assert store.load(INFRA).annotations == () and store.load(INFRA).intent_version == "1.5.0"


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

"""`ld intent --infrastructure X` : lire les épingles d'une infrastructure, sans valeur inventée."""

from datetime import UTC, datetime

import pytest

from ld_backend import cli
from ld_backend.intent import IntentStore
from ld_backend.schemas import ColorOp, ColorTypeOp, GroupCreateOp, IntentOps, PinOp


def test_intent_lists_the_pins_or_says_there_are_none(capsys, tmp_path):
    archive = tmp_path / "archive"
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "aucune épingle" in out and "aucune couleur" in out and "aucun groupe" in out
    store = IntentStore(archive)
    store.apply(
        "infra-lab",
        IntentOps(author="orhan", ops=[PinOp(op="pin", hostname="sw-core-01", x=12, y=-7)]),
        now=datetime(2026, 10, 4, tzinfo=UTC),
    )
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "révision 1" in out and "sw-core-01" in out and "12" in out and "orhan" in out
    assert out.count("2026-10-04T00:00:00Z") == 2 and "+00:00" not in out, "une seule forme de date (revue B4, B5)"
    colours = [
        ColorTypeOp(op="color_type", type="firewall", hue="red"),
        ColorOp(op="color", hostname="sw-core-01", hue="amber"),
    ]
    store.apply("infra-lab", IntentOps(author="alice", ops=colours), now=datetime(2026, 10, 7, tzinfo=UTC))
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "2 couleur(s)" in out and "type firewall\tred\talice" in out and "sw-core-01\tamber\talice" in out
    store.apply(
        "infra-lab",
        IntentOps(author="alice", ops=[GroupCreateOp(op="group_create", label="Cœur", members=["sw-core-01"])]),
        now=datetime(2026, 10, 7, tzinfo=UTC),
    )
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "1 groupe(s)" in out and "groupe g3-1\tCœur\trectangle slate\tsw-core-01\talice" in out
    assert "aucune annotation" in out
    from ld_backend.schemas import AnnotationCreateOp

    note = AnnotationCreateOp(
        op="annotation_create",
        content={"kind": "note", "text": "Baie 12"},
        anchor={"kind": "device", "ref": "sw-core-01"},
        x=-40,
        y=-90,
    )
    store.apply("infra-lab", IntentOps(author="alice", ops=[note]), now=datetime(2026, 10, 8, tzinfo=UTC))
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "1 annotation(s)" in out and "annotation a4-1\tnote\tdevice sw-core-01\t-40,-90 220x80\talice" in out
    assert "aucun connecteur" in out
    from ld_backend.schemas import ConnectorCreateOp

    arrow = ConnectorCreateOp(
        op="connector_create",
        start={"kind": "annotation", "ref": "a4-1", "side": "s"},
        end={"kind": "free", "x": 300, "y": 40},
        label="voir",
    )
    store.apply("infra-lab", IntentOps(author="alice", ops=[arrow]), now=datetime(2026, 10, 9, tzinfo=UTC))
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    out = capsys.readouterr().out
    assert "1 connecteur(s)" in out
    assert (
        "connecteur c5-1\tannotation a4-1 (s) → 300,40\tstraight none/arrow\tvoir\talice\t2026-10-09T00:00:00Z" in out
    )


def test_intent_needs_an_infrastructure_and_isolates_a_corrupt_store(capsys, tmp_path):
    archive = tmp_path / "archive"
    with pytest.raises(SystemExit) as exc:
        cli.main(["intent", "--archive", str(archive)])
    assert exc.value.code == 2
    folder = archive / "_intent" / "infra-lab"
    folder.mkdir(parents=True)
    (folder / "intent.json").write_text("{broken", encoding="utf-8")
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 1
    assert "intervention" in capsys.readouterr().out

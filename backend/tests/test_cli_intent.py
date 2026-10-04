"""`ld intent --infrastructure X` : lire les épingles d'une infrastructure, sans valeur inventée."""

from datetime import UTC, datetime

import pytest

from ld_backend import cli
from ld_backend.intent import IntentStore
from ld_backend.schemas import IntentOps, PinOp


def test_intent_lists_the_pins_or_says_there_are_none(capsys, tmp_path):
    archive = tmp_path / "archive"
    assert cli.main(["intent", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    assert "aucune épingle" in capsys.readouterr().out
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

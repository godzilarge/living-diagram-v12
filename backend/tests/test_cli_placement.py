"""`ld placement --infrastructure X [--forget]` : lire le placement mémorisé d'une infrastructure, ou l'oublier."""

from datetime import UTC, datetime

import pytest

from ld_backend import cli
from ld_backend.placement import Place, PlacementStore, PlacementWrite

ARGS = ["placement", "--infrastructure", "infra-lab", "--archive"]


def _record(archive, *hosts: str) -> None:
    places = [Place(hostname=host, x=12 * index, y=-7) for index, host in enumerate(hosts, start=1)]
    PlacementStore(archive).record(
        "infra-lab",
        PlacementWrite(base_revision=0, replace=False, places=places),
        now=datetime(2026, 10, 6, tzinfo=UTC),
    )


def test_placement_lists_the_places_or_says_there_are_none(capsys, tmp_path):
    archive = tmp_path / "archive"
    assert cli.main([*ARGS, str(archive)]) == 0
    assert "aucun équipement placé" in capsys.readouterr().out
    _record(archive, "sw-core-01", "fw-edge-01")
    assert cli.main([*ARGS, str(archive)]) == 0
    out = capsys.readouterr().out
    assert "révision 1" in out and "2 équipement(s)" in out and "2026-10-06T00:00:00Z" in out
    assert out.index("fw-edge-01\t24\t-7") < out.index("sw-core-01\t12\t-7")


def test_forget_removes_the_document_and_says_what_it_did(capsys, tmp_path):
    archive = tmp_path / "archive"
    assert cli.main([*ARGS, str(archive), "--forget"]) == 0
    assert "rien à oublier" in capsys.readouterr().out
    _record(archive, "sw-core-01")
    assert cli.main([*ARGS, str(archive), "--forget"]) == 0
    assert "oublié" in capsys.readouterr().out
    assert PlacementStore(archive).load("infra-lab").places == ()


def test_placement_needs_an_infrastructure_and_a_corrupt_document_is_forgotten_on_demand(capsys, tmp_path):
    archive = tmp_path / "archive"
    with pytest.raises(SystemExit) as exc:
        cli.main(["placement", "--archive", str(archive)])
    assert exc.value.code == 2
    _record(archive, "sw-core-01")
    (archive / "_placement" / "infra-lab" / "placement.json").write_text("{broken", encoding="utf-8")
    assert cli.main([*ARGS, str(archive)]) == 1
    assert "--forget" in capsys.readouterr().out, "la sortie est dite"
    assert cli.main([*ARGS, str(archive), "--forget"]) == 0
    assert cli.main([*ARGS, str(archive)]) == 0

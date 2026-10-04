"""`ld diff` : deux fichiers (bundles ou snapshots) sans archive, ou deux runs archivées, les deux dernières par
défaut. Le diff n'est jamais stocké ; `--out` l'écrit en forme canonique."""

import json
from pathlib import Path

from ld_contracts.diff import Diff
from ld_contracts.diff.serialize import canonical_json

from ld_backend import cli
from tests.diff.conftest import LATER_RUN_ID, WEEK, cable_down_later, later
from tests.test_cli import write

RUN_ID = "66db3f0e9a1c2b0012f4a7d1"


def _pair(tmp_path: Path, bundle_dict: dict) -> tuple[Path, Path]:
    return write(tmp_path, "a.json", bundle_dict), write(tmp_path, "b.json", cable_down_later(bundle_dict))


def test_two_bundle_files_give_the_canonical_diff(capsys, tmp_path, bundle_dict):
    a, b = _pair(tmp_path, bundle_dict)
    out = tmp_path / "diff.json"
    assert cli.main(["diff", str(a), str(b), "--out", str(out)]) == 0
    text = capsys.readouterr().out
    assert "diff écrit" in text and "links" in text and f"{RUN_ID} → {LATER_RUN_ID}" in text and f"{WEEK}s" in text
    d = Diff.model_validate_json(out.read_text(encoding="utf-8"))
    assert d.summary.links.changed == 1 and d.summary.checks.appeared == 1
    assert out.read_text(encoding="utf-8") == canonical_json(d)


def test_snapshot_files_and_bundle_files_mix_and_give_the_same_bytes(capsys, tmp_path, bundle_dict):
    a, b = _pair(tmp_path, bundle_dict)
    snapshot_a, snapshot_b = tmp_path / "sa.json", tmp_path / "sb.json"
    assert cli.main(["correlate", str(a), "--out", str(snapshot_a)]) == 0
    assert cli.main(["correlate", str(b), "--out", str(snapshot_b)]) == 0
    outs = [tmp_path / f"d{i}.json" for i in range(3)]
    assert cli.main(["diff", str(a), str(b), "--out", str(outs[0])]) == 0
    assert cli.main(["diff", str(snapshot_a), str(snapshot_b), "--out", str(outs[1])]) == 0
    assert cli.main(["diff", str(snapshot_a), str(b), "--out", str(outs[2])]) == 0
    assert len({o.read_bytes() for o in outs}) == 1, "même empreinte, mêmes snapshots, mêmes octets"
    capsys.readouterr()


def test_without_out_only_the_summary_is_printed(capsys, tmp_path, bundle_dict):
    a, b = _pair(tmp_path, bundle_dict)
    assert cli.main(["diff", str(a), str(b)]) == 0
    text = capsys.readouterr().out
    assert "volatile" in text and "checks" in text and "écrit" not in text
    assert sorted(p.name for p in tmp_path.iterdir()) == ["a.json", "b.json"]


def test_file_mode_usage_errors_write_nothing(capsys, tmp_path, bundle_dict):
    a, b = _pair(tmp_path, bundle_dict)
    before = a.read_bytes()
    assert cli.main(["diff", str(a)]) == 2 and "deux fichiers" in capsys.readouterr().out
    assert cli.main(["diff", str(a), str(b), str(a)]) == 2
    assert cli.main(["diff", str(a), str(b), "--infrastructure", "x"]) == 2
    assert "choisir l'un ou l'autre" in capsys.readouterr().out
    assert cli.main(["diff", str(a), "--infrastructure", "x"]) == 2
    assert "choisir l'un ou l'autre" in capsys.readouterr().out, "le mélange des modes avant le compte (revue, B4)"
    assert cli.main(["diff", str(a), str(b), "--out", str(a)]) == 2
    assert "rien n'est écrit" in capsys.readouterr().out and a.read_bytes() == before
    assert cli.main(["diff"]) == 2 and "--infrastructure" in capsys.readouterr().out


def test_a_file_outside_the_contract_or_unreadable_exits_one(capsys, tmp_path, bundle_dict):
    a = write(tmp_path, "a.json", bundle_dict)
    bad = write(tmp_path, "bad.json", dict(cable_down_later(bundle_dict), contract_version="9.0.0"))
    assert cli.main(["diff", str(a), str(bad)]) == 1
    text = capsys.readouterr().out
    assert "hors contrat" in text and "contract_version" in text
    assert cli.main(["diff", str(a), str(tmp_path / "missing.json")]) == 1
    assert "illisible" in capsys.readouterr().out


def test_two_infrastructures_are_refused_without_naming_them(capsys, tmp_path, bundle_dict):
    a = write(tmp_path, "a.json", bundle_dict)
    other = json.loads(json.dumps(later(bundle_dict)).replace("infra-lab", "other-site"))
    b = write(tmp_path, "b.json", other)
    assert cli.main(["diff", str(a), str(b)]) == 1
    text = capsys.readouterr().out
    assert "infrastructure" in text and "other-site" not in text and "infra-lab" not in text


def _ingest(tmp_path: Path, archive: Path, name: str, doc: dict) -> None:
    assert cli.main(["ingest", str(write(tmp_path, name, doc)), "--archive", str(archive)]) == 0


def test_archive_mode_defaults_to_the_last_two_runs(capsys, tmp_path, bundle_dict):
    archive = tmp_path / "archive"
    _ingest(tmp_path, archive, "a.json", bundle_dict)
    _ingest(tmp_path, archive, "b.json", cable_down_later(bundle_dict))
    capsys.readouterr()
    assert cli.main(["diff", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    text = capsys.readouterr().out
    assert f"{RUN_ID} → {LATER_RUN_ID}" in text and "links        +0 −0 ~1" in text
    out = tmp_path / "d.json"
    args = ["diff", "--infrastructure", "infra-lab", "--archive", str(archive)]
    assert cli.main([*args, "--from", LATER_RUN_ID, "--to", RUN_ID, "--out", str(out)]) == 0
    assert f"écart -{WEEK}s" in capsys.readouterr().out
    assert Diff.model_validate_json(out.read_text(encoding="utf-8")).elapsed_seconds == -WEEK
    assert cli.main([*args, "--to", LATER_RUN_ID]) == 0, "--from se déduit de --to"
    assert f"{RUN_ID} → {LATER_RUN_ID}" in capsys.readouterr().out


def test_a_run_compared_with_itself_is_said_so(capsys, tmp_path, bundle_dict):
    """Revue B5 : `--from` seul désigne la dernière run, et le diff est vide ; la CLI le dit, sans refuser."""
    archive = tmp_path / "archive"
    _ingest(tmp_path, archive, "a.json", bundle_dict)
    _ingest(tmp_path, archive, "b.json", cable_down_later(bundle_dict))
    capsys.readouterr()
    args = ["diff", "--infrastructure", "infra-lab", "--archive", str(archive)]
    assert cli.main([*args, "--from", LATER_RUN_ID]) == 0
    text = capsys.readouterr().out
    assert cli.SAME_RUN_WARNING in text and "links        +0 −0 ~0" in text and "écart 0s" in text
    assert cli.main([*args, "--from", RUN_ID, "--to", RUN_ID]) == 0 and cli.SAME_RUN_WARNING in capsys.readouterr().out
    assert cli.main([*args, "--from", RUN_ID]) == 0 and cli.SAME_RUN_WARNING not in capsys.readouterr().out
    a = write(tmp_path, "same.json", bundle_dict)
    assert cli.main(["diff", str(a), str(a)]) == 0 and cli.SAME_RUN_WARNING in capsys.readouterr().out


def test_archive_mode_errors(capsys, tmp_path, bundle_dict):
    archive = tmp_path / "archive"
    args = ["diff", "--infrastructure", "infra-lab", "--archive", str(archive)]
    assert cli.main(args) == 1 and "deux runs" in capsys.readouterr().out
    _ingest(tmp_path, archive, "a.json", bundle_dict)
    capsys.readouterr()
    assert cli.main(args) == 1 and "deux runs" in capsys.readouterr().out
    assert cli.main([*args, "--to", "nope"]) == 1 and "`to`" in capsys.readouterr().out
    assert cli.main([*args, "--from", "nope", "--to", RUN_ID]) == 1
    text = capsys.readouterr().out
    assert "`from`" in text and "inconnue" in text
    _ingest(tmp_path, archive, "b.json", cable_down_later(bundle_dict))
    capsys.readouterr()
    assert cli.main([*args, "--to", RUN_ID]) == 1 and "précède" in capsys.readouterr().out
    assert cli.main([*args, "--out", str(tmp_path)]) == 1, "--out est un répertoire"
    assert "diff non écrit" in capsys.readouterr().out
    (archive / "infra-lab" / LATER_RUN_ID / "snapshot.json").write_text("{broken}\n", encoding="utf-8")
    assert cli.main(args) == 1
    text = capsys.readouterr().out
    assert "corrompue" in text and "broken" not in text
    (archive / "infra-lab" / RUN_ID / "meta.json").write_text("{broken", encoding="utf-8")
    assert cli.main(args) == 1, "une run illisible est ignorée de la liste : il n'en reste qu'une"
    text = capsys.readouterr().out
    assert "deux runs" in text and "broken" not in text

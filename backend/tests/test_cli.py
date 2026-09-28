import json
from pathlib import Path

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot.serialize import canonical_json

from ld_backend import cli
from ld_backend.archive import fingerprint
from ld_backend.correlate import correlate


def write(tmp_path: Path, name: str, data: dict) -> Path:
    p = tmp_path / name
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_ingest_then_runs(capsys, tmp_path, bundle_dict):
    archive = tmp_path / "archive"
    path = write(tmp_path, "b.json", bundle_dict)
    assert cli.main(["ingest", str(path), "--archive", str(archive)]) == 0
    assert "created" in capsys.readouterr().out
    assert cli.main(["ingest", str(path), "--archive", str(archive)]) == 0
    assert "already_present" in capsys.readouterr().out
    assert cli.main(["runs", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    assert "66db3f0e9a1c2b0012f4a7d1" in capsys.readouterr().out


def test_ingest_invalid_exits_one(capsys, tmp_path, bundle_dict):
    path = write(tmp_path, "bad.json", dict(bundle_dict, contract_version="9.0.0"))
    assert cli.main(["ingest", str(path), "--archive", str(tmp_path / "a")]) == 1
    assert "contract_version" in capsys.readouterr().out


def test_ingest_unreadable_file_exits_one(capsys, tmp_path):
    assert cli.main(["ingest", str(tmp_path / "missing.json"), "--archive", str(tmp_path / "a")]) == 1
    assert "illisible" in capsys.readouterr().out


def test_serve_uses_env_settings_and_uvicorn(monkeypatch, tmp_path):
    calls = {}
    monkeypatch.setenv("LD_API_TOKEN", "tok")
    monkeypatch.setenv("LD_ARCHIVE_DIR", str(tmp_path))
    monkeypatch.setattr("uvicorn.run", lambda app, host, port: calls.update(host=host, port=port, app=app))
    assert cli.main(["serve", "--host", "0.0.0.0", "--port", "9000"]) == 0
    assert calls["host"] == "0.0.0.0" and calls["port"] == 9000 and calls["app"].title.startswith("Living Diagram")


def test_serve_without_token_exits_two(monkeypatch, capsys):
    monkeypatch.delenv("LD_API_TOKEN", raising=False)
    assert cli.main(["serve"]) == 2
    assert "LD_API_TOKEN" in capsys.readouterr().err


def test_cli_archive_default_follows_the_environment(monkeypatch, tmp_path, bundle_dict, capsys):
    monkeypatch.setenv("LD_ARCHIVE_DIR", str(tmp_path / "from-env"))
    path = write(tmp_path, "b.json", bundle_dict)
    assert cli.main(["ingest", str(path)]) == 0
    assert (tmp_path / "from-env" / "infra-lab").is_dir()


def test_runs_shows_the_collection_start_and_status(capsys, tmp_path, bundle_dict):
    archive = tmp_path / "archive"
    assert cli.main(["ingest", str(write(tmp_path, "b.json", bundle_dict)), "--archive", str(archive)]) == 0
    capsys.readouterr()
    assert cli.main(["runs", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    line = capsys.readouterr().out.strip()
    assert line.split("\t")[:3] == ["66db3f0e9a1c2b0012f4a7d1", "2026-09-10T02:00:00Z", "completed"]


def test_serve_makes_the_ingestion_log_visible(monkeypatch, tmp_path):
    """Sans configuration, les lignes INFO de `ld_backend` sont perdues : seul l'accès HTTP d'uvicorn sortait."""
    import logging

    monkeypatch.setenv("LD_API_TOKEN", "tok")
    monkeypatch.setenv("LD_ARCHIVE_DIR", str(tmp_path))
    monkeypatch.setattr("uvicorn.run", lambda app, host, port: None)
    monkeypatch.setattr(logging.getLogger("ld_backend"), "level", logging.NOTSET)
    assert cli.main(["serve"]) == 0
    assert logging.getLogger("ld_backend").getEffectiveLevel() <= logging.INFO
    assert logging.getLogger("ld_backend").handlers


# ---------------------------------------------------------------- ld correlate (2026-09-20)

RUN_ID = "66db3f0e9a1c2b0012f4a7d1"


def _ingested(tmp_path: Path, bundle_dict: dict, capsys) -> Path:
    archive = tmp_path / "archive"
    assert cli.main(["ingest", str(write(tmp_path, "b.json", bundle_dict)), "--archive", str(archive)]) == 0
    capsys.readouterr()
    return archive


def test_correlate_recomputes_the_snapshot_of_one_run(capsys, tmp_path, bundle_dict):
    archive = _ingested(tmp_path, bundle_dict, capsys)
    snapshot = archive / "infra-lab" / RUN_ID / "snapshot.json"
    reference = snapshot.read_bytes()
    snapshot.write_text("{}\n", encoding="utf-8")
    args = ["correlate", "--infrastructure", "infra-lab", "--run-id", RUN_ID, "--archive", str(archive)]
    assert cli.main(args) == 0
    assert snapshot.read_bytes() == reference
    assert capsys.readouterr().out.strip().split("\t")[:4] == [RUN_ID, "created", "6 nœuds", "6 câbles"]


def test_correlate_without_run_id_covers_every_run_of_the_infrastructure(capsys, tmp_path, bundle_dict):
    archive = _ingested(tmp_path, bundle_dict, capsys)
    other = json.loads(json.dumps(bundle_dict).replace(RUN_ID, "run-2"))
    assert cli.main(["ingest", str(write(tmp_path, "c.json", other)), "--archive", str(archive)]) == 0
    capsys.readouterr()
    assert cli.main(["correlate", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 0
    assert [line.split("\t")[0] for line in capsys.readouterr().out.strip().splitlines()] == [RUN_ID, "run-2"]


def test_correlate_unknown_run_or_empty_infrastructure_exits_one(capsys, tmp_path, bundle_dict):
    archive = _ingested(tmp_path, bundle_dict, capsys)
    assert cli.main(["correlate", "--infrastructure", "infra-lab", "--run-id", "x", "--archive", str(archive)]) == 1
    assert "inconnue" in capsys.readouterr().out
    assert cli.main(["correlate", "--infrastructure", "ailleurs", "--archive", str(archive)]) == 1
    assert "aucune run" in capsys.readouterr().out


def test_correlate_failure_exits_one_and_says_so(capsys, tmp_path, bundle_dict, monkeypatch):
    archive = _ingested(tmp_path, bundle_dict, capsys)

    def boom(*_: object) -> None:
        raise RuntimeError("bug de B1")

    monkeypatch.setattr("ld_backend.snapshots.correlate", boom)
    assert cli.main(["correlate", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 1
    assert capsys.readouterr().out.strip().split("\t")[:2] == [RUN_ID, "failed"]


def test_correlate_isolates_a_corrupt_run_and_still_recomputes_the_others(capsys, tmp_path, bundle_dict):
    archive = _ingested(tmp_path, bundle_dict, capsys)
    for run_id in ("run-2", "run-3"):
        other = json.loads(json.dumps(bundle_dict).replace(RUN_ID, run_id))
        assert cli.main(["ingest", str(write(tmp_path, f"{run_id}.json", other)), "--archive", str(archive)]) == 0
    (archive / "infra-lab" / "run-2" / "bundle.json").write_text("{abîmé", encoding="utf-8")
    last = archive / "infra-lab" / "run-3" / "snapshot.json"
    last.write_text("{}\n", encoding="utf-8")
    capsys.readouterr()
    assert cli.main(["correlate", "--infrastructure", "infra-lab", "--archive", str(archive)]) == 1
    lines = [line.split("\t") for line in capsys.readouterr().out.strip().splitlines()]
    assert [(line[0], line[1].split(" ")[0]) for line in lines] == [
        (RUN_ID, "created"),
        ("run-2", "archive"),
        ("run-3", "created"),
    ]
    assert len(last.read_bytes()) > 1000
    meta = archive / "infra-lab" / "run-3" / "meta.json"
    meta.write_text("{", encoding="utf-8")
    args = ["correlate", "--infrastructure", "infra-lab", "--run-id", "run-3", "--archive", str(archive)]
    assert cli.main(args) == 1 and "corrompue" in capsys.readouterr().out


def test_correlate_file_writes_the_canonical_snapshot_without_archive(capsys, tmp_path, bundle_dict):
    """Le mode fichier : les mêmes octets que l'archive rangerait, aucune archive créée."""
    path = write(tmp_path, "b.json", bundle_dict)
    out = tmp_path / "snapshot.json"
    assert cli.main(["correlate", str(path), "--out", str(out), "--archive", str(tmp_path / "archive")]) == 0
    bundle = RunBundle.model_validate(bundle_dict)
    assert out.read_bytes() == canonical_json(correlate(bundle, fingerprint(bundle)[1])).encode("utf-8")
    assert not (tmp_path / "archive").exists()
    line = capsys.readouterr().out
    assert line.startswith("snapshot écrit : ") and "6 nœuds, 6 câbles, error=" in line and "Ko)" in line
    assert "created" not in line  # rien n'est créé dans une archive (revue R5, B2)


def test_correlate_file_refuses_a_bundle_outside_the_contract(capsys, tmp_path, bundle_dict):
    path = write(tmp_path, "bad.json", dict(bundle_dict, contract_version="9.0.0"))
    out = tmp_path / "snapshot.json"
    assert cli.main(["correlate", str(path), "--out", str(out)]) == 1
    assert "hors contrat" in capsys.readouterr().out and not out.exists()


def test_correlate_file_needs_out_and_a_readable_file(capsys, tmp_path, bundle_dict):
    path = write(tmp_path, "b.json", bundle_dict)
    assert cli.main(["correlate", str(path)]) == 2
    assert "--out" in capsys.readouterr().out
    assert cli.main(["correlate", str(tmp_path / "missing.json"), "--out", str(tmp_path / "s.json")]) == 1
    assert "illisible" in capsys.readouterr().out
    assert cli.main(["correlate", str(path), "--out", str(tmp_path / "nope" / "s.json")]) == 1
    assert "non écrit" in capsys.readouterr().out


def test_correlate_without_file_nor_infrastructure_exits_two(capsys):
    assert cli.main(["correlate"]) == 2
    assert "--infrastructure" in capsys.readouterr().out


def test_correlate_and_render_refuse_to_overwrite_their_input(capsys, tmp_path, bundle_dict):
    """`--out` égal au fichier d'entrée écraserait l'export par la sortie (revue R5, M3) : refus, rien d'écrit."""
    path = write(tmp_path, "export.json", bundle_dict)
    before = path.read_bytes()
    assert cli.main(["correlate", str(path), "--out", str(tmp_path / "." / "export.json")]) == 2
    assert "désigne le fichier d'entrée" in capsys.readouterr().out
    assert cli.main(["render", str(path), "--out", str(path)]) == 2
    assert "désigne le fichier d'entrée" in capsys.readouterr().out
    assert path.read_bytes() == before


def test_file_mode_refuses_archive_options_and_vice_versa(capsys, tmp_path, bundle_dict):
    """Les deux modes ne se mélangent pas en silence (revue R5, B1)."""
    path = write(tmp_path, "b.json", bundle_dict)
    out = tmp_path / "s.json"
    assert cli.main(["correlate", str(path), "--out", str(out), "--infrastructure", "infra-lab"]) == 2
    assert "choisir l'un ou l'autre" in capsys.readouterr().out and not out.exists()
    assert cli.main(["render", str(path), "--out", str(tmp_path / "p.html"), "--run-id", "r1"]) == 2
    assert "choisir l'un ou l'autre" in capsys.readouterr().out and not (tmp_path / "p.html").exists()
    assert cli.main(["correlate", "--infrastructure", "infra-lab", "--out", str(out), "--archive", str(tmp_path)]) == 2
    assert "--out ne vaut qu'avec un fichier" in capsys.readouterr().out and not out.exists()

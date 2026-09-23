import copy
import json

from ld_contracts import cli
from ld_contracts.validate import validate_dict, validate_file


def test_validate_dict_reports_paths_and_value_free_messages(minimal_dict):
    bad = dict(minimal_dict)
    bad["interfaces"] = [dict(bad["interfaces"][0], duplex="full-duplex", mac_address="aaaa.bbbb.cccc")]
    report = validate_dict(bad)
    assert not report.ok and report.bundle is None
    paths = {issue.path for issue in report.errors}
    assert "interfaces.0.duplex" in paths and "interfaces.0.mac_address" in paths
    assert all("aaaa.bbbb.cccc" not in issue.message for issue in report.errors)


def test_bundle_level_error_keeps_values_out_of_message_but_in_detail(minimal_dict):
    bad = json.loads(json.dumps(minimal_dict))
    bad["interfaces"][0]["hostname"] = "ghost-01"
    report = validate_dict(bad)
    issue = report.errors[0]
    assert "ghost-01" not in issue.message and issue.detail["hostname"] == "ghost-01"


def test_validate_dict_ok_carries_bundle_and_findings(minimal_dict):
    report = validate_dict(minimal_dict)
    assert report.ok and report.bundle is not None and report.findings == ()


def test_validate_file_handles_missing_and_malformed_files(tmp_path):
    missing = validate_file(tmp_path / "nope.json")
    assert not missing.ok and missing.errors[0].path == "$"
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    assert not validate_file(broken).ok


def test_cli_validate_in_process(capsys, minimal_path):
    assert cli.main(["validate", str(minimal_path)]) == 0
    out = capsys.readouterr().out
    assert "valid:" in out and "devices 5" in out


def test_cli_validate_strict_findings_fails_on_finding(capsys, tmp_path, minimal_dict):
    doc = json.loads(json.dumps(minimal_dict))
    doc["aggregates"][0]["members"].append({"name": "Ethernet1/48", "status": "bundled"})
    p = tmp_path / "warn.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    assert cli.main(["validate", str(p)]) == 0
    out = capsys.readouterr().out
    assert "aggregate_member_unknown" in out and "Ethernet1/48" not in out
    assert cli.main(["validate", str(p), "--show-values"]) == 0
    assert "Ethernet1/48" in capsys.readouterr().out
    assert cli.main(["validate", str(p), "--strict-findings"]) == 1


def test_cli_validate_invalid_shows_detail_only_on_request(capsys, tmp_path, minimal_dict):
    doc = json.loads(json.dumps(minimal_dict))
    doc["interfaces"][0]["hostname"] = "ghost-01"
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    assert cli.main(["validate", str(p)]) == 1
    assert "ghost-01" not in capsys.readouterr().out
    assert cli.main(["validate", str(p), "--show-values"]) == 1
    assert "ghost-01" in capsys.readouterr().out


def test_cli_schema_out_writes_file(capsys, tmp_path):
    target = tmp_path / "s.json"
    assert cli.main(["schema", "--out", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["title"] == "RunBundle"


def test_cli_anonymize_rejects_invalid_input(capsys, tmp_path, monkeypatch):
    monkeypatch.setenv("LD_CONTRACTS_SEED", "x")
    p = tmp_path / "bad.json"
    p.write_text("{}", encoding="utf-8")
    assert cli.main(["anonymize", str(p), str(tmp_path / "out.json")]) == 1
    assert "invalid" in capsys.readouterr().err


def test_cli_anonymize_reads_seed_file(tmp_path, minimal_path, monkeypatch):
    monkeypatch.delenv("LD_CONTRACTS_SEED", raising=False)
    seed = tmp_path / "seed.txt"
    seed.write_text("s3cret\n", encoding="utf-8")
    assert cli.main(["anonymize", str(minimal_path), str(tmp_path / "out.json"), "--seed-file", str(seed)]) == 0
    assert cli.main(["validate", str(tmp_path / "out.json")]) == 0


def test_cli_summary_hides_identifiers_unless_requested(capsys, minimal_path):
    assert cli.main(["validate", str(minimal_path)]) == 0
    out = capsys.readouterr().out
    assert "infra-lab" not in out and "66db3f0e9a1c2b0012f4a7d1" not in out
    assert cli.main(["validate", str(minimal_path), "--show-values"]) == 0
    out = capsys.readouterr().out
    assert "infra-lab" in out and "66db3f0e9a1c2b0012f4a7d1" in out


def test_union_field_reports_one_path_prefix_and_no_value(minimal_dict):
    """Première union à deux branches non nulles du contrat (`last_change_age_seconds`, 2026-09-16) :
    chaque branche refusée produit une Issue, toutes sous le même chemin, aucune ne cite la valeur."""
    bad = json.loads(json.dumps(minimal_dict))
    bad["interfaces"][0]["last_change_age_seconds"] = -1
    report = validate_dict(bad)
    assert not report.ok and report.errors
    assert all(issue.path.startswith("interfaces.0.last_change_age_seconds") for issue in report.errors)
    assert all("-1" not in issue.message and "-1" not in json.dumps(issue.detail) for issue in report.errors)


def test_mac_shaped_neighbor_error_names_the_faulty_field(minimal_dict):
    """Le 422 du backend ne garde que le chemin : il doit dire lequel des deux identifiants est fautif."""
    bad = copy.deepcopy(minimal_dict)
    bad["lldp"][4]["neighbor_interface"] = "003a.9c11.2201"
    report = validate_dict(bad)
    assert [e.path for e in report.errors] == ["lldp.4.neighbor_interface"]
    assert "003a" not in report.errors[0].message


# ---------------------------------------------------------------- revue de bout en bout (2026-09-19)


def test_scope_errors_point_at_the_document_not_at_the_root(minimal_dict):
    """Le 422 ne garde que le chemin et les localisateurs : `$` obligeait à lire le détail."""
    ghost = copy.deepcopy(minimal_dict)
    ghost["lldp"][0]["hostname"] = "ghost-01"
    assert [e.path for e in validate_dict(ghost).errors] == ["lldp.0.hostname"]
    outside = copy.deepcopy(minimal_dict)
    outside["infrastructure"] = "infra-inconnue"
    assert validate_dict(outside).errors[0].path == "tasks.0.hostname"
    twice = copy.deepcopy(minimal_dict)
    twice["devices"].append(dict(twice["devices"][0]))
    assert validate_dict(twice).errors[0].path == "devices"


def test_root_that_is_not_an_object_gets_a_plain_message():
    for data in ([], None, "bundle", 3):
        report = validate_dict(data)
        assert not report.ok and [e.path for e in report.errors] == ["$"]
        assert "RunBundle" not in report.errors[0].message and "objet JSON" in report.errors[0].message

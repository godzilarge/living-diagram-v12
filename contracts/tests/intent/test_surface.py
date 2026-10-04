"""Ce que le paquet expose pour l'intention : schéma versionné, partie D de CONTRAT.md, fixture, CLI."""

import json
import subprocess
import sys
from pathlib import Path

from ld_contracts import cli
from ld_contracts.docgen import generate_markdown
from ld_contracts.intent import Intent
from ld_contracts.intent.serialize import canonical_json
from ld_contracts.schema import generate_schema, load_committed_schema, schema_path
from ld_contracts.validate import validate_intent_dict, validate_intent_file

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
SKELETON = FIXTURES / "intent-skeleton.json"


def test_committed_intent_schema_matches_generated_schema():
    assert schema_path("intent").name == "intent-v1.schema.json"
    committed, generated = load_committed_schema("intent"), generate_schema("intent")
    assert json.dumps(committed, sort_keys=True) == json.dumps(generated, sort_keys=True)
    assert generate_schema("intent")["title"] == "Intent"


def test_the_skeleton_fixture_is_valid_and_canonical():
    report = validate_intent_file(SKELETON)
    assert report.ok and report.intent is not None and len(report.intent.pins) == 2
    assert canonical_json(report.intent) == SKELETON.read_text(encoding="utf-8"), "la fixture est la forme canonique"


def test_validate_intent_dict_reports_without_values():
    report = validate_intent_dict({"intent_version": "1.0.0"})
    assert not report.ok and report.errors[0].path in {"infrastructure", "revision", "updated_at", "pins"}
    assert validate_intent_dict([]).errors[0].message.startswith("un objet JSON")


def test_the_reference_has_a_part_d_with_every_field_and_the_catalogue():
    text = generate_markdown()
    assert "## Partie D — Intention : Intent v1" in text
    for field in ("hostname", "x", "y", "author", "at", "revision", "updated_at", "pins"):
        assert f"| `{field}` |" in text, field
    assert "`revision_update_mismatch`" in text and "`intent_major_unsupported`" in text
    assert "Quatre contrats" in text and "partie D" in text


def test_cli_validates_an_intent_and_refuses_a_broken_one(tmp_path, capsys):
    assert cli.main(["validate", "--contract", "intent", str(SKELETON)]) == 0
    out = capsys.readouterr().out
    assert out.startswith("valid: intent 1.0.0") and "pins 2" in out
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({**json.loads(SKELETON.read_text(encoding="utf-8")), "revision": 0}), encoding="utf-8")
    assert cli.main(["validate", "--contract", "intent", str(broken)]) == 1
    out = capsys.readouterr().out
    assert out.startswith("invalid: 1 error(s)") and "`updated_at` est null" in out and "orhan" not in out
    command = [sys.executable, "-m", "ld_contracts.cli", "schema", "--contract", "intent"]
    done = subprocess.run(command, capture_output=True, text=True, check=False)
    assert done.returncode == 0 and json.loads(done.stdout)["title"] == "Intent"
    assert isinstance(Intent.model_validate(json.loads(SKELETON.read_text(encoding="utf-8"))), Intent)

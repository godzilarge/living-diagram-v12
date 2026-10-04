"""Schéma versionné, partie C de CONTRAT.md, CLI et squelette du diff."""

import json

from ld_contracts import cli
from ld_contracts.diff import Diff
from ld_contracts.diff.codes import DIFF_ERROR_TYPES, DIFF_SHARED_ERROR_TYPES
from ld_contracts.diff.serialize import canonical_json
from ld_contracts.docgen import generate_markdown
from ld_contracts.schema import CONTRACTS, generate_schema, load_committed_schema, schema_path
from tests.snapshot.conftest import FIXTURES, load_fixture


def test_diff_schema_is_a_versioned_draft_2020_12_document():
    schema = generate_schema("diff")
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "Diff"
    assert schema["$id"].endswith("diff-v1.schema.json")
    assert {"before", "after", "links", "events", "summary"} <= set(schema["properties"])
    assert set(CONTRACTS) == {"bundle", "snapshot", "diff"}


def test_committed_diff_schema_matches_generated():
    path = schema_path("diff")
    assert path.exists(), "run `ld-contracts schema --contract diff --out` and commit the result"
    assert json.dumps(load_committed_schema("diff"), sort_keys=True) == json.dumps(
        generate_schema("diff"), sort_keys=True
    )


def _part_c() -> str:
    return generate_markdown().split("Partie C", 1)[1]


def test_reference_has_three_parts_and_lists_every_diff_field():
    text = generate_markdown()
    assert text.index("Partie A") < text.index("Partie B") < text.index("Partie C")
    part_c = _part_c()
    schema = Diff.model_json_schema()
    for name, model in {**schema["$defs"], "Diff": schema}.items():
        for field in model.get("properties", {}):
            assert f"| `{field}` |" in text, (name, field)
    for error_type in (*DIFF_ERROR_TYPES, *DIFF_SHARED_ERROR_TYPES):
        assert f"`{error_type}`" in part_c, error_type
    assert "#### Diff" not in part_c and "### Le document Diff" in part_c


def test_every_diff_field_has_a_description():
    schema = Diff.model_json_schema()
    missing = [
        (name, field)
        for name, model in {**schema["$defs"], "Diff": schema}.items()
        for field, prop in model.get("properties", {}).items()
        if not prop.get("description")
    ]
    assert missing == []


def test_shared_types_are_documented_once_and_linked_from_part_c():
    text = generate_markdown()
    for name in ("Node", "Link", "Check", "NodeRef", "LinkRef", "RunStatus", "SnapshotInterface"):
        assert text.count(f"#### {name}\n") == 1, name
    part_c = _part_c()
    assert "définis en parties A et B" in part_c and "[Node](#node)" in part_c
    assert "#### MlagDomainRef" in part_c and "#### EventKind" in part_c and "#### FieldChange" in part_c


def test_skeleton_is_valid_and_written_in_canonical_form():
    path = FIXTURES / "diff-skeleton.json"
    diff = Diff.model_validate(load_fixture("diff-skeleton.json"))
    assert path.read_text(encoding="utf-8") == canonical_json(diff)
    assert diff.summary.links.changed == 1 and diff.summary.checks.appeared == 1
    assert diff.summary.interfaces.changed == 2 and diff.summary.volatile_changes > 0


def test_skeleton_embedded_in_reference_is_the_fixture():
    block = _part_c().split("```json", 1)[1].split("```", 1)[0]
    assert Diff.model_validate(json.loads(block)) == Diff.model_validate(load_fixture("diff-skeleton.json"))


def test_cli_schema_selects_the_diff_contract(tmp_path, capsys):
    assert cli.main(["schema", "--contract", "diff"]) == 0
    assert json.loads(capsys.readouterr().out)["title"] == "Diff"
    target = tmp_path / "diff.schema.json"
    assert cli.main(["schema", "--contract", "diff", "--out", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["title"] == "Diff"


def test_cli_validates_a_diff_without_leaking_values(tmp_path, capsys):
    from ld_contracts.validate import validate_diff_dict

    path = FIXTURES / "diff-skeleton.json"
    assert cli.main(["validate", "--contract", "diff", str(path)]) == 0
    out = capsys.readouterr().out
    assert out.startswith("valid: diff 1.0.0") and "links" in out and "changed 1" in out
    assert "sw-a" not in out and "66db3f0e" not in out
    bad = load_fixture("diff-skeleton.json")
    bad["summary"]["links"]["changed"] = 7
    target = tmp_path / "bad.json"
    target.write_text(json.dumps(bad), encoding="utf-8")
    assert cli.main(["validate", "--contract", "diff", str(target)]) == 1
    out = capsys.readouterr().out
    assert "counts_mismatch" in out or "compte" in out
    assert "sw-a" not in out
    report = validate_diff_dict(bad)
    assert not report.ok and report.diff is None and report.errors[0].path == "summary.links.changed"
    assert validate_diff_dict([]).errors[0].path == "$"
    assert validate_diff_dict(load_fixture("diff-skeleton.json")).diff is not None

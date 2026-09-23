"""Schéma versionné, partie B de CONTRAT.md, CLI et squelette du snapshot."""

import json

from ld_contracts import cli
from ld_contracts.docgen import generate_markdown
from ld_contracts.schema import CONTRACTS, generate_schema, load_committed_schema, schema_path
from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.codes import CATALOGUE, SNAPSHOT_ERROR_TYPES
from ld_contracts.snapshot.serialize import canonical_json
from tests.snapshot.conftest import FIXTURES, load_fixture


def test_snapshot_schema_is_a_versioned_draft_2020_12_document():
    schema = generate_schema("snapshot")
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "Snapshot"
    assert schema["$id"].endswith("snapshot-v1.schema.json")
    assert "links" in schema["properties"]
    assert set(CONTRACTS) == {"bundle", "snapshot"}


def test_committed_snapshot_schema_matches_generated():
    path = schema_path("snapshot")
    assert path.exists(), "run `ld-contracts schema --contract snapshot --out` and commit the result"
    committed = load_committed_schema("snapshot")
    assert json.dumps(committed, sort_keys=True) == json.dumps(generate_schema("snapshot"), sort_keys=True)


def test_bundle_schema_is_still_the_default():
    assert generate_schema()["title"] == "RunBundle"
    assert schema_path("bundle").name == "runbundle-v1.schema.json"


def test_reference_has_two_parts_and_lists_every_snapshot_field():
    text = generate_markdown()
    assert "Partie A" in text and "Partie B" in text
    assert text.index("Partie A") < text.index("Partie B")
    schema = Snapshot.model_json_schema()
    part_b = text.split("Partie B", 1)[1]
    for name, model in schema["$defs"].items():
        for field in model.get("properties", {}):
            assert f"| `{field}` |" in text, (name, field)
    for code in CATALOGUE:
        assert f"`{code.value}`" in part_b, code
    for error_type in SNAPSHOT_ERROR_TYPES:
        assert f"`{error_type}`" in part_b, error_type


def test_every_snapshot_field_has_a_description():
    schema = Snapshot.model_json_schema()
    missing = [
        (name, field)
        for name, model in {**schema["$defs"], "Snapshot": schema}.items()
        for field, prop in model.get("properties", {}).items()
        if not prop.get("description")
    ]
    assert missing == []


def test_skeleton_is_valid_and_written_in_canonical_form():
    path = FIXTURES / "snapshot-skeleton.json"
    snapshot = Snapshot.model_validate(load_fixture("snapshot-skeleton.json"))
    assert path.read_text(encoding="utf-8") == canonical_json(snapshot)
    assert len(snapshot.links) == 1


def test_skeleton_embedded_in_reference_is_the_fixture():
    text = generate_markdown()
    part_b = text.split("Partie B", 1)[1]
    block = part_b.split("```json", 1)[1].split("```", 1)[0]
    assert Snapshot.model_validate(json.loads(block)) == Snapshot.model_validate(load_fixture("snapshot-skeleton.json"))


def test_cli_schema_selects_the_contract(tmp_path, capsys):
    assert cli.main(["schema", "--contract", "snapshot"]) == 0
    assert json.loads(capsys.readouterr().out)["title"] == "Snapshot"
    assert cli.main(["schema"]) == 0
    assert json.loads(capsys.readouterr().out)["title"] == "RunBundle"
    target = tmp_path / "snap.schema.json"
    assert cli.main(["schema", "--contract", "snapshot", "--out", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8"))["title"] == "Snapshot"


def test_reference_renders_array_bounds():
    from ld_contracts.docgen_render import render_type

    assert (
        render_type({"type": "array", "items": {"type": "string"}, "minItems": 1}, {}) == "liste de texte (au moins 1)"
    )
    assert render_type({"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2}, {}).endswith(
        "(exactement 2)"
    )


def test_shared_types_are_documented_once_and_linked_from_part_b():
    text = generate_markdown()
    for name in ("IpAddress", "VlanRange", "AggregateMember", "OperStatus", "HaMode"):
        assert text.count(f"#### {name}\n") == 1, name
    part_b = text.split("Partie B", 1)[1]
    assert "définis en partie A" in part_b and "[IpAddress](#ipaddress)" in part_b
    assert "#### SnapshotInterface" in part_b and "#### NodeKind" in part_b


def test_part_b_lists_the_errors_of_shared_types():
    from ld_contracts.docgen import ERROR_TYPES
    from ld_contracts.snapshot.codes import SHARED_ERROR_TYPES

    part_b = generate_markdown().split("Partie B", 1)[1]
    assert set(SHARED_ERROR_TYPES) <= set(ERROR_TYPES)
    for error_type in SHARED_ERROR_TYPES:
        assert f"`{error_type}`" in part_b, error_type


def test_json_values_render_without_dangling_anchor():
    text = generate_markdown()
    assert "#jsonvalue" not in text and "objet clé → valeur JSON" in text


def test_cli_validates_a_snapshot_without_leaking_values(tmp_path, capsys):
    from ld_contracts.validate import validate_snapshot_dict

    path = FIXTURES / "snapshot-skeleton.json"
    assert cli.main(["validate", "--contract", "snapshot", str(path)]) == 0
    out = capsys.readouterr().out
    assert out.startswith("valid: snapshot 1.0.0") and "nodes 2" in out and "links 1" in out
    bad = load_fixture("snapshot-skeleton.json")
    bad["nodes"].reverse()
    target = tmp_path / "bad.json"
    target.write_text(json.dumps(bad), encoding="utf-8")
    assert cli.main(["validate", "--contract", "snapshot", str(target)]) == 1
    out = capsys.readouterr().out
    assert "not_canonical_order" in out or "ordre canonique" in out
    assert "sw-a" not in out
    report = validate_snapshot_dict(bad)
    assert not report.ok and report.snapshot is None and report.errors[0].path == "nodes.1"
    assert validate_snapshot_dict([]).errors[0].path == "$"

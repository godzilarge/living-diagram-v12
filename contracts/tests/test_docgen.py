import json
import re
from pathlib import Path

from ld_contracts import cli, docgen
from ld_contracts.bundle import RunBundle
from ld_contracts.docgen import DOC_PATH, ERROR_TYPES, generate_markdown, load_committed_markdown
from ld_contracts.snapshot.codes import SNAPSHOT_ERROR_TYPES


def test_reference_lists_every_field_of_every_document():
    text = generate_markdown()
    schema = RunBundle.model_json_schema()
    for name, model in schema["$defs"].items():
        for field in model.get("properties", {}):
            assert f"| `{field}` |" in text, (name, field)
    assert "### Interface" in text and "### LldpNeighbor" in text and "### OperStatus" in text


def test_every_field_has_a_description():
    schema = RunBundle.model_json_schema()
    missing = [
        (name, field)
        for name, model in {**schema["$defs"], "RunBundle": schema}.items()
        for field, prop in model.get("properties", {}).items()
        if not prop.get("description")
    ]
    assert missing == []


def test_committed_reference_matches_generated():
    assert DOC_PATH.exists(), "run `ld-contracts docs --out` and commit the result"
    assert load_committed_markdown() == generate_markdown()


def test_cli_docs_writes_file(tmp_path, capsys):
    target = tmp_path / "ref.md"
    assert cli.main(["docs", "--out", str(target)]) == 0
    assert target.read_text(encoding="utf-8").startswith("# Contrats Living Diagram")
    assert cli.main(["docs"]) == 0
    assert "Partie A" in capsys.readouterr().out


def test_skeleton_embedded_in_reference_is_valid_json():
    text = generate_markdown()
    block = text.split("```json", 1)[1].split("```", 1)[0]
    RunBundle.model_validate(json.loads(block))


def _raised_types(paths) -> set[str]:
    return {
        code
        for path in paths
        for code in re.findall(r'PydanticCustomError\(\s*"([a-z_]+)"', path.read_text(encoding="utf-8"))
    }


def test_every_raised_error_type_is_catalogued():
    """Un type levé dans le code sans entrée dans son catalogue manquerait dans CONTRAT.md."""
    src = Path(docgen.__file__).parent
    raised = _raised_types(src.glob("*.py"))
    assert raised, "aucun type trouvé : le motif de recherche est cassé"
    assert raised <= set(ERROR_TYPES), sorted(raised - set(ERROR_TYPES))
    raised_snapshot = _raised_types((src / "snapshot").glob("*.py"))
    assert raised_snapshot, "aucun type trouvé dans snapshot/ : le motif de recherche est cassé"
    assert raised_snapshot <= set(SNAPSHOT_ERROR_TYPES), sorted(raised_snapshot - set(SNAPSHOT_ERROR_TYPES))

import json

from ld_contracts.schema import SCHEMA_PATH, generate_schema, load_committed_schema


def test_generated_schema_is_a_draft_2020_12_document():
    schema = generate_schema()
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "RunBundle"
    assert schema["$id"].endswith("runbundle-v1.schema.json")
    assert "interfaces" in schema["properties"]


def test_committed_schema_matches_generated_schema():
    assert SCHEMA_PATH.exists(), "run `ld-contracts schema --out` and commit the result"
    committed = load_committed_schema()
    assert json.dumps(committed, sort_keys=True) == json.dumps(generate_schema(), sort_keys=True)

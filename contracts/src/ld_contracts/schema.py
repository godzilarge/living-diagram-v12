"""JSON Schema des deux contrats (RunBundle en entrée, Snapshot en sortie) : généré depuis les modèles,
versionné avec le paquet. Un test échoue si le fichier versionné dérive des modèles."""

import json
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot

SCHEMA_DIR = Path(__file__).resolve().parent / "schema"
SCHEMA_ID_BASE = "https://living-diagram.internal/contracts/"
SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"


@dataclass(frozen=True, slots=True)
class ContractSpec:
    model: type[BaseModel]
    file_name: str
    title: str


CONTRACTS: dict[str, ContractSpec] = {
    "bundle": ContractSpec(RunBundle, "runbundle-v1.schema.json", "RunBundle"),
    "snapshot": ContractSpec(Snapshot, "snapshot-v1.schema.json", "Snapshot"),
}


def schema_path(contract: str = "bundle") -> Path:
    return SCHEMA_DIR / CONTRACTS[contract].file_name


def generate_schema(contract: str = "bundle") -> dict:
    spec = CONTRACTS[contract]
    generated = spec.model.model_json_schema()
    return {
        "$schema": SCHEMA_DIALECT,
        "$id": SCHEMA_ID_BASE + spec.file_name,
        "title": spec.title,
        **{k: v for k, v in generated.items() if k != "title"},
    }


def load_committed_schema(contract: str = "bundle") -> dict:
    return json.loads(schema_path(contract).read_text(encoding="utf-8"))


def write_schema(path: Path | None = None, contract: str = "bundle") -> Path:
    target = path or schema_path(contract)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(generate_schema(contract), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


SCHEMA_PATH = schema_path("bundle")

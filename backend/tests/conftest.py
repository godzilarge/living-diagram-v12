import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ld_backend.api import create_app
from ld_backend.archive import BundleArchive
from ld_backend.config import Settings

FIXTURES = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"
TOKEN = "test-token-123"


@pytest.fixture
def bundle_dict() -> dict:
    return json.loads((FIXTURES / "bundle-minimal.json").read_text(encoding="utf-8"))


@pytest.fixture
def skeleton_dict() -> dict:
    return json.loads((FIXTURES / "bundle-skeleton.json").read_text(encoding="utf-8"))


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(api_token=TOKEN, archive_dir=tmp_path / "archive", max_bundle_bytes=200_000)


@pytest.fixture
def archive(settings: Settings) -> BundleArchive:
    return BundleArchive(settings.archive_dir)


@pytest.fixture
def client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings))


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def modified(bundle: dict) -> dict:
    out = copy.deepcopy(bundle)
    out["interfaces"][0]["oper_status"] = "down"
    return out

from pathlib import Path

import pytest

from ld_backend.config import ConfigError, Settings


def test_settings_require_token():
    with pytest.raises(ConfigError, match="LD_API_TOKEN"):
        Settings.from_env({})


def test_settings_defaults_and_overrides(tmp_path: Path):
    s = Settings.from_env({"LD_API_TOKEN": "abc", "LD_ARCHIVE_DIR": str(tmp_path), "LD_MAX_BUNDLE_BYTES": "1234"})
    assert s.api_token == "abc" and s.archive_dir == tmp_path and s.max_bundle_bytes == 1234
    assert Settings.from_env({"LD_API_TOKEN": "abc"}).max_bundle_bytes > 1_000_000


def test_settings_reject_invalid_size():
    with pytest.raises(ConfigError, match="LD_MAX_BUNDLE_BYTES"):
        Settings.from_env({"LD_API_TOKEN": "abc", "LD_MAX_BUNDLE_BYTES": "big"})

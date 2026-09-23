"""Configuration du backend : lue dans l'environnement, vérifiée au démarrage, jamais codée en dur."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MAX_BUNDLE_BYTES = 50 * 1024 * 1024
DEFAULT_ARCHIVE_DIR = "./archive"


class ConfigError(ValueError):
    """Configuration absente ou invalide : le service refuse de démarrer."""


@dataclass(frozen=True, slots=True)
class Settings:
    api_token: str
    archive_dir: Path
    max_bundle_bytes: int = DEFAULT_MAX_BUNDLE_BYTES

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        source = os.environ if env is None else env
        token = source.get("LD_API_TOKEN", "").strip()
        if not token:
            raise ConfigError("LD_API_TOKEN manquant : le jeton d'API est obligatoire")
        raw_max = source.get("LD_MAX_BUNDLE_BYTES", str(DEFAULT_MAX_BUNDLE_BYTES))
        try:
            max_bytes = int(raw_max)
        except ValueError as exc:
            raise ConfigError(f"LD_MAX_BUNDLE_BYTES invalide : {raw_max!r}") from exc
        if max_bytes <= 0:
            raise ConfigError("LD_MAX_BUNDLE_BYTES doit être strictement positif")
        return cls(
            api_token=token,
            archive_dir=Path(source.get("LD_ARCHIVE_DIR", DEFAULT_ARCHIVE_DIR)),
            max_bundle_bytes=max_bytes,
        )

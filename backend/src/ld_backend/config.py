"""Configuration du backend : lue dans l'environnement, vérifiée au démarrage, jamais codée en dur."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_MAX_BUNDLE_BYTES = 50 * 1024 * 1024
DEFAULT_MAX_INTENT_BYTES = (
    1024 * 1024
)  # 500 opérations tiennent en quelques dizaines de Ko : au-delà, ce n'est pas une requête
DEFAULT_ARCHIVE_DIR = "./archive"


class ConfigError(ValueError):
    """Configuration absente ou invalide : le service refuse de démarrer."""


@dataclass(frozen=True, slots=True)
class Settings:
    api_token: str
    archive_dir: Path
    max_bundle_bytes: int = DEFAULT_MAX_BUNDLE_BYTES
    max_intent_bytes: int = DEFAULT_MAX_INTENT_BYTES

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        source = os.environ if env is None else env
        token = source.get("LD_API_TOKEN", "").strip()
        if not token:
            raise ConfigError("LD_API_TOKEN manquant : le jeton d'API est obligatoire")
        return cls(
            api_token=token,
            archive_dir=Path(source.get("LD_ARCHIVE_DIR", DEFAULT_ARCHIVE_DIR)),
            max_bundle_bytes=_positive_int(source, "LD_MAX_BUNDLE_BYTES", DEFAULT_MAX_BUNDLE_BYTES),
            max_intent_bytes=_positive_int(source, "LD_MAX_INTENT_BYTES", DEFAULT_MAX_INTENT_BYTES),
        )


def _positive_int(source: Mapping[str, str], name: str, default: int) -> int:
    raw = source.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} invalide : {raw!r}") from exc
    if value <= 0:
        raise ConfigError(f"{name} doit être strictement positif")
    return value

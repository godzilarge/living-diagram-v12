"""Types de base partagés par tous les documents du contrat."""

import ipaddress
import re
from datetime import datetime
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StringConstraints,
)
from pydantic_core import PydanticCustomError

MAC_PATTERN = r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$"
MAC_RE = re.compile(MAC_PATTERN)
# Les trois notations d'une MAC : sert à reconnaître une MAC à sa forme, sans sous-type annoncé.
# `MAC_SHAPE` est écrit en minuscules : à compiler avec `re.IGNORECASE`, comme `MAC_ANY_RE`.
MAC_SHAPE = r"[0-9a-f]{2}(?::[0-9a-f]{2}){5}|[0-9a-f]{2}(?:-[0-9a-f]{2}){5}|[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}"
MAC_ANY_RE = re.compile(r"(?:" + MAC_SHAPE + r")", re.IGNORECASE)
SEMVER_PATTERN = r"^\d+\.\d+\.\d+$"
# Nom réservé de la table de routage globale dans `interfaces[].vrf` : `null` n'affirme jamais un fait.
VRF_GLOBAL = "default"


class ContractModel(BaseModel):
    """Document du contrat : champs inconnus refusés, instances immuables."""

    model_config = ConfigDict(extra="forbid", frozen=True)


def _check_ip(value: str) -> str:
    try:
        ipaddress.ip_address(value)
    except ValueError as exc:
        raise PydanticCustomError("ip_invalid", "adresse IP invalide", {"value": value}) from exc
    return value


def _canonical_if_mac_shaped(value: str) -> str:
    """Sans sous-type annoncé, une MAC se reconnaît à sa forme (blancs de bord ignorés) ; elle doit être normalisée."""
    if MAC_ANY_RE.fullmatch(value.strip()) and not MAC_RE.fullmatch(value):
        raise PydanticCustomError(
            "mac_not_normalized", "identifiant en forme de MAC mais non normalisé", {"value": value}
        )
    return value


NUMERIC_RE = re.compile(r"[+-]?\d+(\.\d+)?")


def _reject_numeric_datetime(value: Any) -> Any:
    numeric = (isinstance(value, int | float) and not isinstance(value, bool)) or (
        isinstance(value, str) and NUMERIC_RE.fullmatch(value.strip()) is not None
    )
    if numeric:
        raise PydanticCustomError("datetime_numeric", "date attendue en ISO 8601 avec fuseau, pas en nombre", {})
    return value


NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
Hostname = NonEmptyStr
IfName = NonEmptyStr
MacAddress = Annotated[str, StringConstraints(pattern=MAC_PATTERN)]
RemoteIdentifier = Annotated[NonEmptyStr, AfterValidator(_canonical_if_mac_shaped)]
CapabilityToken = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]+$")]
IpAddressStr = Annotated[str, AfterValidator(_check_ip)]
SemVer = Annotated[str, StringConstraints(pattern=SEMVER_PATTERN)]
UtcDatetime = Annotated[AwareDatetime, BeforeValidator(_reject_numeric_datetime)]
Int = StrictInt
Bool = StrictBool
Extras = Annotated[dict[str, Any], Field(default_factory=dict)]

__all__ = [
    "MAC_ANY_RE",
    "MAC_RE",
    "MAC_SHAPE",
    "Bool",
    "CapabilityToken",
    "ContractModel",
    "Extras",
    "Hostname",
    "IfName",
    "Int",
    "IpAddressStr",
    "MacAddress",
    "NonEmptyStr",
    "RemoteIdentifier",
    "SemVer",
    "VRF_GLOBAL",
    "UtcDatetime",
    "datetime",
]

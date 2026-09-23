"""Contrôles d'intégrité du snapshot : code du catalogue, sévérité admise, références typées."""

import json

from pydantic import Field, JsonValue, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel
from ld_contracts.snapshot.codes import CATALOGUE, CheckCode
from ld_contracts.snapshot.enums import CheckOrigin, Severity
from ld_contracts.snapshot.order import require_canonical
from ld_contracts.snapshot.refs import Ref, ref_key


class Check(ContractModel):
    """Un contrôle : ce que B1 a constaté, ou un constat du contrat d'entrée recopié (`origin = bundle`)."""

    code: CheckCode = Field(description="Code du catalogue (docs/05 §4 et constats du RunBundle).")
    severity: Severity = Field(
        description="`error` (réseau cassé ou incohérent), `warning` (la donnée se contredit), `info`."
    )
    origin: CheckOrigin = Field(description="`correlation` = émis par B1 ; `bundle` = constat du contrat recopié.")
    refs: tuple[Ref, ...] = Field(min_length=1, description="Éléments concernés, triés par (sorte, identité).")
    details: dict[str, JsonValue] = Field(
        description="Détail structuré propre au code (cibles, statuts, topics) ; valeurs JSON seulement."
    )

    @model_validator(mode="after")
    def _matches_catalogue(self) -> Check:
        require_canonical(self.refs, key=ref_key, section="refs")
        spec = CATALOGUE[self.code]
        if self.severity not in spec.severities:
            raise PydanticCustomError(
                "check_severity_not_allowed",
                "sévérité non admise pour ce code",
                {"code": str(self.code), "severity": str(self.severity)},
            )
        if self.origin != spec.origin:
            raise PydanticCustomError(
                "check_origin_mismatch",
                "origine incompatible avec le code",
                {"code": str(self.code), "origin": str(self.origin), "expected": str(spec.origin)},
            )
        return self


def check_key(check: Check) -> tuple:
    return (
        str(check.code),
        tuple(ref_key(r) for r in check.refs),
        json.dumps(check.details, sort_keys=True, ensure_ascii=False),
    )

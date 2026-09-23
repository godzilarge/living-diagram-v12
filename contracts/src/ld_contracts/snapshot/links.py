"""Liens : arêtes typées du graphe, clé = paire d'endpoints triée, jamais d'identifiant."""

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Hostname, IfName, Int, NonEmptyStr
from ld_contracts.snapshot.enums import OBSERVED_SOURCES, EvidenceSource, EvidenceStatus, LinkKind, LinkOper, Resolution
from ld_contracts.snapshot.order import natural_key, require_canonical
from ld_contracts.snapshot.refs import Endpoint, LinkKey, endpoint_key


class RemoteRaw(ContractModel):
    """Le voisin tel qu'annoncé par la source, avant résolution et normalisation."""

    name: NonEmptyStr = Field(description="Nom (ou MAC, ou IP) du voisin, brut.")
    port: NonEmptyStr | None = Field(description="Port du voisin, brut ; null si la source n'en donne pas.")


class ResolvedRemote(ContractModel):
    """Le voisin après résolution (R0) et normalisation (R1) : toujours le device du bout opposé au témoin."""

    hostname: Hostname = Field(description="Device résolu ; celui du bout opposé au témoin.")
    interface: IfName | None = Field(
        description=(
            "Port résolu ; null quand la description ne nomme pas de port (`C1|voisin|`) : l'accord avec l'observé "
            "se juge alors sur le device seul (R3), comme pour un port distant resté en MAC."
        )
    )


class LinkEvidence(ContractModel):
    """Un témoignage à l'origine du lien : une opinion datée d'une source, jamais un lien à elle seule."""

    source: EvidenceSource = Field(description="`lldp` et `cdp` = observé ; `description` = documenté.")
    witness: Endpoint = Field(description="Le bout qui témoigne ; l'un des deux bouts du lien.")
    remote_raw: RemoteRaw = Field(description="Ce que le témoin annonce, brut.")
    remote_resolved: ResolvedRemote = Field(description="Le voisin après résolution (R0) et normalisation (R1).")
    resolution: Resolution = Field(description="Niveau de R0 qui a résolu le nom.")


def evidence_key(evidence: LinkEvidence) -> tuple:
    resolved = evidence.remote_resolved
    return (
        evidence.source,
        endpoint_key(evidence.witness),
        (resolved.hostname, natural_key(resolved.interface or "")),
        evidence.resolution,
        evidence.remote_raw.name,
        evidence.remote_raw.port or "",
    )


class Link(LinkKey):
    """Une arête. V1 : `cable` seulement ; les autres sortes sont réservées aux vues L2 / L3."""

    kind: LinkKind = Field(description="Sorte d'arête.")
    status: EvidenceStatus = Field(
        description="`confirmed` = observé et documenté ; `observed_only` ; `documented_only`. Dérivé des évidences."
    )
    evidence: tuple[LinkEvidence, ...] = Field(
        min_length=1, description="Témoignages, triés par (source, témoin, voisin résolu)."
    )
    oper: LinkOper = Field(description="`up` si les deux bouts sont up, `down` si l'un l'est, `unknown` sinon.")
    speed_mbps: Int | None = Field(description="Vitesse commune aux deux bouts ; null si différente ou inconnue.")
    aggregate_a: IfName | None = Field(description="Agrégat du bout `a` ; null sinon.")
    aggregate_b: IfName | None = Field(description="Agrégat du bout `b` ; null sinon.")

    @model_validator(mode="after")
    def _evidence_consistent(self) -> Link:
        require_canonical(self.evidence, key=evidence_key, section="evidence")
        opposite = {endpoint_key(self.a): self.b, endpoint_key(self.b): self.a}
        for index, item in enumerate(self.evidence):
            other = opposite.get(endpoint_key(item.witness))
            if other is None:
                raise PydanticCustomError(
                    "evidence_witness_not_endpoint", "le témoin n'est aucun des bouts du lien", {"index": index}
                )
            if item.remote_resolved.hostname != other.hostname:
                raise PydanticCustomError(
                    "evidence_resolved_not_endpoint",
                    "le voisin résolu n'est pas le device du bout opposé au témoin",
                    {"index": index},
                )
        observed = any(e.source in OBSERVED_SOURCES for e in self.evidence)
        documented = any(e.source == EvidenceSource.DESCRIPTION for e in self.evidence)
        expected = {
            (True, True): EvidenceStatus.CONFIRMED,
            (True, False): EvidenceStatus.OBSERVED_ONLY,
            (False, True): EvidenceStatus.DOCUMENTED_ONLY,
        }[(observed, documented)]
        if self.status != expected:
            raise PydanticCustomError(
                "link_status_mismatch",
                "status ne correspond pas aux sources des évidences",
                {"status": str(self.status), "expected": str(expected)},
            )
        return self

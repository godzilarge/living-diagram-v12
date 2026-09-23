"""R1-bis : un port distant observé qui est un agrégat désigne un de ses membres, jamais l'agrégat (2026-09-22).

Un FortiGate dont LLDP est activé annonce en port-id le nom de son agrégat sur chacun de ses membres ; le switch
d'en face sait le device et l'agrégat, pas le membre. B1 cherche le membre dans l'ordre des rangs : une observation
inverse (`lldp` / `cdp` depuis un membre vers le port témoin), puis l'agrégat à un seul membre, puis une description
(du port témoin, ou d'un membre citant le port témoin). Sans réponse unique, le câble s'arrête à l'agrégat et
`remote_port_is_aggregate` le dit. Les descriptions ne dessinent pas ici : seuls les claims observés sont reciblés.
"""

from collections import defaultdict
from dataclasses import replace
from types import MappingProxyType

from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import OBSERVED_SOURCES, EvidenceSource

from ld_backend.correlate.checkbuild import interface_check
from ld_backend.correlate.cisco import equivalent
from ld_backend.correlate.claims import Claim, ClaimSet, EndKey
from ld_backend.correlate.context import Context

AGGREGATE_TO_MEMBER = "aggregate_port_to_member"


class _MemberFinder:
    """Index construits une fois : qui observe quoi, qui documente quoi ; une recherche par claim ensuite."""

    def __init__(self, claims: tuple[Claim, ...]) -> None:
        self.observes: dict[EndKey, set[EndKey]] = defaultdict(set)  # témoin → cibles observées
        self.documents: dict[EndKey, set[EndKey]] = defaultdict(set)  # témoin → cibles documentées (port cité)
        self.documented_ports: dict[tuple[EndKey, str], set[str]] = defaultdict(set)  # (témoin, device) → ports
        for claim in claims:
            if claim.source in OBSERVED_SOURCES:
                self.observes[claim.witness_key].add(claim.target_key)
            elif claim.source == EvidenceSource.DESCRIPTION and claim.port is not None:
                self.documents[claim.witness_key].add(claim.target_key)
                self.documented_ports[(claim.witness_key, claim.resolved.hostname)].add(claim.port)

    def find(self, claim: Claim, members: tuple[str, ...]) -> str | None:
        """Le premier rang qui parle décide ; à plusieurs candidats, aucun ne gagne."""
        host, witness = claim.resolved.hostname, claim.witness_key
        keys = {member: (host, equivalent(member)) for member in members}
        observed = [m for m, key in keys.items() if witness in self.observes.get(key, ())]
        if observed:
            return observed[0] if len(observed) == 1 else None
        if len(members) == 1:
            return members[0]
        documented = {m for m in members if m in self.documented_ports.get((witness, host), ())}
        documented |= {m for m, key in keys.items() if witness in self.documents.get(key, ())}
        return next(iter(documented)) if len(documented) == 1 else None


def _retarget(claim: Claim, member: str) -> Claim:
    return replace(claim, port=member, target_key=(claim.resolved.hostname, equivalent(member)))


def _unresolved_check(ctx: Context, claim: Claim, members: tuple[str, ...]) -> Check:
    return interface_check(
        ctx,
        CheckCode.REMOTE_PORT_IS_AGGREGATE,
        claim.hostname,
        claim.interface,
        neighbor=claim.resolved.hostname,
        aggregate=claim.port,
        members=list(members),
    )


def resolve_aggregate_ports(ctx: Context, claimset: ClaimSet) -> ClaimSet:
    """Recible chaque claim observé visant un agrégat vers son membre ; sinon un contrôle, et le claim reste."""
    finder = _MemberFinder(claimset.claims)
    claims: list[Claim] = []
    checks: list[Check] = []
    resolved = 0
    for claim in claimset.claims:
        members = ctx.members_at(claim.target_key) if claim.source in OBSERVED_SOURCES else None
        if members is None or claim.is_self:  # une auto-observation le reste : jamais un câble vers son membre
            claims.append(claim)
            continue
        member = finder.find(claim, members)
        if member is None:
            checks.append(_unresolved_check(ctx, claim, members))
            claims.append(claim)
        else:
            resolved += 1
            claims.append(_retarget(claim, member))
    normalizations = dict(sorted({**claimset.normalizations, AGGREGATE_TO_MEMBER: resolved}.items()))
    return ClaimSet(
        tuple(claims),
        (*claimset.checks, *checks),
        MappingProxyType(normalizations),
        claimset.unresolved,
        claimset.unparseable,
    )

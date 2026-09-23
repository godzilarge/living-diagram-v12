"""R3 : fusion des claims en câbles, clé = paire d'endpoints ; désaccords, deux voisins, réciprocité."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from ld_contracts.enums import OperStatus
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import (
    OBSERVED_SOURCES,
    EvidenceSource,
    EvidenceStatus,
    LinkKind,
    LinkOper,
    Severity,
    TopicStatus,
)
from ld_contracts.snapshot.links import Link, LinkEvidence, RemoteRaw, ResolvedRemote, evidence_key
from ld_contracts.snapshot.refs import Endpoint, endpoint_key

from ld_backend.correlate.checkbuild import interface_check, link_check
from ld_backend.correlate.cisco import equivalent
from ld_backend.correlate.claims import Claim, ClaimSet, EndKey
from ld_backend.correlate.context import Context

PairKey = tuple[EndKey, EndKey]
Observed = dict[EndKey, tuple[Claim, ...]]  # ce qui est observé à un bout, par bout opposé


@dataclass(frozen=True, slots=True)
class MergeResult:
    links: tuple[Link, ...]
    checks: tuple[Check, ...]


def _pair(first: EndKey, second: EndKey) -> PairKey:
    return (first, second) if first <= second else (second, first)


def _endpoint_dict(hostname: str, interface: str | None) -> dict:
    return {"hostname": hostname, "interface": interface}


def _agrees(ctx: Context, end: EndKey, observed: Iterable[Claim], expected: EndKey, port: str | None) -> bool:
    """Le bout observé `end` est-il celui que la description attend ? Même device, et même port, sauf si la
    description n'en cite pas ou si l'observé n'a qu'une MAC pour port : l'accord se juge alors sur le device.
    Agrégat et membre concordent dans les deux sens (R1-bis) : un bout resté agrégat avec la description d'un de ses
    membres, un membre observé avec la description qui cite l'agrégat (ce que `show lldp neighbors` affiche)."""
    if end[0] != expected[0]:
        return False
    if port is None or end[1] == expected[1] or any(c.port_is_mac and c.target_key == end for c in observed):
        return True
    return _is_member(ctx, expected[1], end) or _is_member(ctx, end[1], expected)


def _is_member(ctx: Context, name: str, aggregate: EndKey) -> bool:
    return any(equivalent(member) == name for member in ctx.members_at(aggregate) or ())


class _Merger:
    def __init__(self, ctx: Context, claims: tuple[Claim, ...]) -> None:
        self.ctx = ctx
        self.claims = claims
        self.groups: dict[PairKey, list[Claim]] = defaultdict(list)
        self.touching: dict[EndKey, Observed] = defaultdict(dict)  # par bout : ce qui y est observé, des deux sens
        self.multiple: list[tuple[EndKey, tuple[EndKey, ...]]] = []  # (témoin, tous les bouts qu'il observe)
        self.checks: list[Check] = []

    def group(self) -> None:
        """L'observé d'abord, en entier ; le documenté ensuite, placé par rapport aux câbles observés."""
        observed: dict[PairKey, list[Claim]] = defaultdict(list)
        documented = []
        for claim in self.claims:
            if claim.is_self:
                self._self_observation(claim)
            elif claim.source in OBSERVED_SOURCES:
                observed[_pair(claim.witness_key, claim.target_key)].append(claim)
            else:
                documented.append(claim)
        for (first, second), claims in observed.items():
            self.groups[(first, second)].extend(claims)
            self.touching[first][second] = self.touching[second][first] = tuple(claims)
        # Un port ne porte qu'un câble : tout bout à plusieurs câbles observés est signalé, qu'il observe ou soit vu.
        self.multiple = [
            (end, tuple(sorted(others))) for end, others in self.touching.items() if self._is_hub(end, others)
        ]
        for claim in documented:
            self._place_documented(claim)

    def _is_hub(self, end: EndKey, others: Observed) -> bool:
        """Un bout resté agrégat (R1-bis) porte légitimement un voisin par membre : hub seulement au-delà ;
        membres inconnus, on se tait (prudent)."""
        if len(others) < 2:
            return False
        members = self.ctx.members_at(end)
        return members is None or (len(members) > 0 and len(others) > len(members))

    def _self_observation(self, claim: Claim) -> None:
        """Bouchon de boucle, réflecteur, description qui cite son propre port : rien à dessiner, un contrôle."""
        self.checks.append(
            interface_check(
                self.ctx, CheckCode.SELF_OBSERVATION, claim.hostname, claim.interface, source=str(claim.source)
            )
        )

    def _place_documented(self, claim: Claim) -> None:
        """L'observé dessine, le documenté commente : la description ne dessine que si aucun de ses deux bouts
        n'a de câble observé. Elle confirme un câble observé s'il y a **un seul** candidat ; à plusieurs elle ne
        confirme rien (`multiple_observed_neighbors` dit déjà l'anomalie) ; à zéro, c'est un désaccord.
        Accord jugé sur le device depuis l'autre bout (l'observé n'a qu'une MAC pour port) : la description est
        absorbée, ni second câble ni désaccord, et elle reste lisible sur son interface.
        """
        here, there = claim.witness_key, claim.target_key
        seen_here = self.touching.get(here, {})
        seen_there = self.touching.get(there, {}) if claim.port is not None else {}
        ctx = self.ctx
        matched = {_pair(here, end) for end, items in seen_here.items() if _agrees(ctx, end, items, there, claim.port)}
        matched |= {_pair(there, end) for end, items in seen_there.items() if _agrees(ctx, end, items, here, here[1])}
        if matched:
            pair = next(iter(matched))
            if len(matched) == 1 and here in pair:  # une évidence témoigne depuis un bout du lien, jamais d'ailleurs
                self.groups[pair].append(claim)
            return
        if seen_here or seen_there:
            self._disagreement(claim, here if seen_here else there, seen_here or seen_there)
        elif claim.port is not None:
            self.groups[_pair(here, there)].append(claim)

    def _disagreement(self, claim: Claim, at: EndKey, seen: Observed) -> None:
        """`observed_at` : le bout qui porte l'observation (le port documentant, ou le port qu'il cite)."""
        everything = [c for items in seen.values() for c in items]
        targets = [_endpoint_dict(end[0], self.display_name(end, list(items))) for end, items in seen.items()]
        self.checks.append(
            interface_check(
                self.ctx,
                CheckCode.DESCRIPTION_DISAGREES_WITH_OBSERVED,
                claim.hostname,
                claim.interface,
                documented=_endpoint_dict(claim.resolved.hostname, claim.port),
                observed_at=_endpoint_dict(at[0], self.display_name(at, everything)),
                observed=sorted(targets, key=lambda t: (t["hostname"], t["interface"] or "")),
            )
        )

    def display_name(self, key: EndKey, claims: list[Claim]) -> str:
        """Le nom du port à cet endpoint : canonique s'il témoigne, sinon la forme longue attestée, sinon brute.

        Jamais « le premier claim » : le nom ne dépend pas de l'ordre des documents.
        """
        witnesses = {c.interface for c in claims if c.witness_key == key}
        if witnesses:  # deux écritures équivalentes du même port local : celle que `interfaces[]` connaît
            return min(witnesses & self.ctx.names_by_host.get(key[0], frozenset()) or witnesses)
        names = {c.port for c in claims if c.target_key == key and c.port is not None}
        return key[1] if key[1] in names else min(names)

    def build(self) -> list[tuple[PairKey, Link]]:
        links = []
        for pair, claims in self.groups.items():
            first, second = pair
            names = {first: self.display_name(first, claims), second: self.display_name(second, claims)}
            a = Endpoint(hostname=first[0], interface=names[first])
            b = Endpoint(hostname=second[0], interface=names[second])
            if endpoint_key(a) > endpoint_key(b):
                a, b = b, a
            links.append((pair, self._link(a, b, claims, names)))
        return links

    def _link(self, a: Endpoint, b: Endpoint, claims: list[Claim], names: dict[EndKey, str]) -> Link:
        """Le témoin d'une évidence porte le nom du bout du lien, pas l'écriture de son document ; deux documents
        qui ne diffèrent que par cette écriture sont la même évidence."""
        unique = {evidence_key(e): e for e in (_evidence(c, names[c.witness_key]) for c in claims)}
        evidence = [unique[key] for key in sorted(unique)]
        sources = {c.source for c in claims}
        observed, documented = bool(sources & OBSERVED_SOURCES), EvidenceSource.DESCRIPTION in sources
        status = {(True, True): EvidenceStatus.CONFIRMED, (True, False): EvidenceStatus.OBSERVED_ONLY}.get(
            (observed, documented), EvidenceStatus.DOCUMENTED_ONLY
        )
        itf_a, itf_b = (
            self.ctx.interfaces.get((a.hostname, a.interface)),
            self.ctx.interfaces.get((b.hostname, b.interface)),
        )
        return Link(
            a=a,
            b=b,
            kind=LinkKind.CABLE,
            status=status,
            evidence=tuple(evidence),
            oper=_oper(itf_a, itf_b),
            speed_mbps=_speed(itf_a, itf_b),
            aggregate_a=self._aggregate(a),
            aggregate_b=self._aggregate(b),
        )

    def _aggregate(self, end: Endpoint) -> str | None:
        membership = self.ctx.membership.get((end.hostname, end.interface))
        return membership.name if membership else None


def _evidence(claim: Claim, witness_port: str) -> LinkEvidence:
    return LinkEvidence(
        source=claim.source,
        witness=Endpoint(hostname=claim.hostname, interface=witness_port),
        remote_raw=RemoteRaw(name=claim.raw_name, port=claim.raw_port),
        remote_resolved=ResolvedRemote(hostname=claim.resolved.hostname, interface=claim.port),
        resolution=claim.resolved.resolution,
    )


def _oper(itf_a, itf_b) -> LinkOper:
    if itf_a is None or itf_b is None:
        return LinkOper.UNKNOWN
    states = {itf_a.oper_status, itf_b.oper_status}
    if OperStatus.UNKNOWN in states:
        return LinkOper.UNKNOWN
    return LinkOper.UP if states == {OperStatus.UP} else LinkOper.DOWN


def _speed(itf_a, itf_b) -> int | None:
    if itf_a is None or itf_b is None or itf_a.speed_mbps is None:
        return None
    return itf_a.speed_mbps if itf_a.speed_mbps == itf_b.speed_mbps else None


def _both_collected_neighbors(ctx: Context, link: Link) -> bool:
    for end in (link.a, link.b):
        coverage = ctx.coverage.get(end.hostname)
        if coverage is None or TopicStatus.SUCCESS not in (coverage.topics.lldp, coverage.topics.cdp):
            return False
    return True


def _multiple_checks(merger: _Merger, by_pair: dict[PairKey, Link]) -> list[Check]:
    """Un contrôle par câble du hub, porté par le port qui observe, avec la liste complète de ses voisins."""
    out = []
    for witness, targets in merger.multiple:
        neighbors = [
            _endpoint_dict(target[0], merger.display_name(target, merger.groups[_pair(witness, target)]))
            for target in targets
        ]
        for target in targets:
            pair = _pair(witness, target)
            seen_from = Endpoint(hostname=witness[0], interface=merger.display_name(witness, merger.groups[pair]))
            out.append(
                link_check(
                    merger.ctx,
                    CheckCode.MULTIPLE_OBSERVED_NEIGHBORS,
                    Severity.WARNING,
                    by_pair[pair],
                    seen_from,
                    neighbors=neighbors,
                )
            )
    return out


def _documented_checks(ctx: Context, links: list[Link]) -> list[Check]:
    out = []
    for link in links:
        if link.status == EvidenceStatus.DOCUMENTED_ONLY:
            severity = Severity.WARNING if _both_collected_neighbors(ctx, link) else Severity.INFO
            out.append(link_check(ctx, CheckCode.DOCUMENTED_NOT_OBSERVED, severity, link, None))
    return out


def _one_way_checks(ctx: Context, claims: tuple[Claim, ...], by_pair: dict[PairKey, Link]) -> list[Check]:
    """Réciprocité : un ensemble construit une fois, un test d'appartenance par claim (jamais un balayage)."""
    observed = [c for c in claims if c.source in OBSERVED_SOURCES and not c.is_self]
    seen = {(c.source, c.witness_key, c.target_key) for c in observed}
    out = []
    for claim in observed:
        coverage = None if claim.resolved.is_stub else ctx.coverage.get(claim.resolved.hostname)
        if coverage is None or getattr(coverage.topics, str(claim.source)) != TopicStatus.SUCCESS:
            continue
        if (claim.source, claim.target_key, claim.witness_key) in seen:
            continue
        out.append(
            link_check(
                ctx,
                CheckCode.ONE_WAY_OBSERVATION,
                Severity.WARNING,
                by_pair[_pair(claim.witness_key, claim.target_key)],
                Endpoint(hostname=claim.hostname, interface=claim.interface),
                source=str(claim.source),
                expected_from=claim.resolved.hostname,
            )
        )
    return out


def build_links(ctx: Context, claimset: ClaimSet) -> MergeResult:
    merger = _Merger(ctx, claimset.claims)
    merger.group()
    built = merger.build()
    by_pair = dict(built)
    links = [link for _, link in built]
    checks = [
        *merger.checks,
        *_multiple_checks(merger, by_pair),
        *_documented_checks(ctx, links),
        *_one_way_checks(ctx, claimset.claims, by_pair),
    ]
    return MergeResult(tuple(links), tuple(checks))

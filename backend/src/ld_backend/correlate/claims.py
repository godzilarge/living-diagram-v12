"""R2 : chaque témoignage (lldp, cdp, description) devient un claim résolu, jamais un lien à lui seul."""

from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType

from ld_contracts.enums import InterfaceType
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import EvidenceSource

from ld_backend.correlate.checkbuild import interface_check
from ld_backend.correlate.cisco import equivalent
from ld_backend.correlate.context import Context
from ld_backend.correlate.identity import Resolved, resolve_name
from ld_backend.correlate.ifnames import MAC_TO_INTERFACE, SHORT_TO_LONG, resolve_port

CABLE_BEARING = frozenset({InterfaceType.PHYSICAL, InterfaceType.MANAGEMENT})
CISCO_PREFIX = "cisco"

EndKey = tuple[str, str]  # (hostname, forme de comparaison du port) : un bout de câble, pour R3


def is_cisco(vendor: str | None) -> bool:
    """`vendor` est une chaîne libre d'inventaire : « cisco », « Cisco », « Cisco Systems » (R1)."""
    return vendor is not None and vendor.casefold().startswith(CISCO_PREFIX)


@dataclass(frozen=True, slots=True)
class Claim:
    source: EvidenceSource
    hostname: str
    interface: str
    raw_name: str
    raw_port: str | None
    resolved: Resolved
    port: str | None
    port_is_mac: bool
    capabilities: tuple[str, ...]
    witness_key: EndKey  # calculées une fois : R3 les compare des milliers de fois
    target_key: EndKey

    @property
    def is_self(self) -> bool:
        """Le port se désigne lui-même comme voisin : jamais un câble (`self_observation`)."""
        return self.witness_key == self.target_key


@dataclass(frozen=True, slots=True)
class ClaimSet:
    claims: tuple[Claim, ...]
    checks: tuple[Check, ...]
    normalizations: Mapping[str, int]
    unresolved: frozenset[str]
    unparseable: int


class _Collector:
    def __init__(self, ctx: Context) -> None:
        self.ctx = ctx
        self.claims: list[Claim] = []
        self.checks: list[Check] = []
        self.normalizations: Counter = Counter({SHORT_TO_LONG: 0, MAC_TO_INTERFACE: 0})
        self.unresolved: set[str] = set()
        self.unparseable = 0

    def add(self, source: EvidenceSource, host: str, itf: str, name: str, port: str | None, caps=()) -> None:
        resolved = resolve_name(self.ctx, name)
        target = None if resolved.is_stub else resolved.hostname
        vendor = self.ctx.devices[target].vendor if target else None
        cisco_hint = (host, itf) in self.ctx.cdp_ports or is_cisco(vendor)
        resolution = resolve_port(self.ctx, target, port, cisco_hint)
        if resolution.normalization:
            self.normalizations[resolution.normalization] += 1
        if resolved.is_stub:
            self.unresolved.add(name)
        if resolved.check is not None:
            self.checks.append(interface_check(self.ctx, resolved.check, host, itf, neighbor=name, resolved=target))
        if resolution.is_mac:
            self.checks.append(interface_check(self.ctx, CheckCode.REMOTE_PORT_IS_MAC, host, itf, port=port))
        self.claims.append(
            Claim(
                source=source,
                hostname=host,
                interface=itf,
                raw_name=name,
                raw_port=port,
                resolved=resolved,
                port=resolution.interface,
                port_is_mac=resolution.is_mac,
                capabilities=tuple(caps),
                witness_key=(host, equivalent(itf)),
                target_key=(resolved.hostname, equivalent(resolution.interface or "")),
            )
        )

    def descriptions(self) -> None:
        for itf in self.ctx.bundle.interfaces:
            parsed = self.ctx.descriptions.get((itf.hostname, itf.name))
            if parsed is None:
                if itf.type in CABLE_BEARING and itf.description and itf.description.strip():
                    self.unparseable += 1
                    self.checks.append(
                        interface_check(self.ctx, CheckCode.DESCRIPTION_UNPARSEABLE, itf.hostname, itf.name)
                    )
                continue
            if itf.type in CABLE_BEARING:
                self.add(EvidenceSource.DESCRIPTION, itf.hostname, itf.name, parsed.neighbor, parsed.port)


def collect_claims(ctx: Context) -> ClaimSet:
    collector = _Collector(ctx)
    for doc in ctx.bundle.lldp:
        collector.add(
            EvidenceSource.LLDP,
            doc.hostname,
            doc.local_interface,
            doc.neighbor,
            doc.neighbor_interface,
            doc.neighbor_capabilities,
        )
    for doc in ctx.bundle.cdp:
        collector.add(
            EvidenceSource.CDP,
            doc.hostname,
            doc.local_interface,
            doc.neighbor,
            doc.neighbor_interface,
            doc.neighbor_capabilities,
        )
    collector.descriptions()
    return ClaimSet(
        tuple(collector.claims),
        tuple(collector.checks),
        MappingProxyType(dict(sorted(collector.normalizations.items()))),
        frozenset(collector.unresolved),
        collector.unparseable,
    )

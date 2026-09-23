"""R0 : résolution ordonnée d'un nom de voisin vers un device, un externe ou un stub."""

from dataclasses import dataclass

from ld_contracts.common import MAC_RE
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import NodeKind, Resolution

from ld_backend.correlate.context import Context, canonical_ip


@dataclass(frozen=True, slots=True)
class Resolved:
    hostname: str
    kind: NodeKind
    resolution: Resolution
    check: CheckCode | None

    @property
    def is_stub(self) -> bool:
        return self.kind == NodeKind.STUB


def _address_key(raw: str) -> str | None:
    """Une MAC arrive déjà normalisée par le contrat ; une IP se compare sur sa valeur, pas sur son écriture."""
    return raw if MAC_RE.fullmatch(raw) else canonical_ip(raw)


def _known(ctx: Context, hostname: str, resolution: Resolution, check: CheckCode | None) -> Resolved:
    kind = NodeKind.DEVICE if ctx.kind_is_device(hostname) else NodeKind.EXTERNAL
    return Resolved(hostname, kind, resolution, check)


def _stub(raw: str, check: CheckCode) -> Resolved:
    return Resolved(raw.casefold(), NodeKind.STUB, Resolution.STUB, check)


def _by_address(ctx: Context, raw: str) -> Resolved:
    hosts = ctx.by_mac.get(raw) or ctx.by_ip.get(raw) or ()
    if len(hosts) == 1:
        return _known(ctx, hosts[0], Resolution.ADDRESS, CheckCode.NEIGHBOR_RESOLVED_BY_ADDRESS)
    if len(hosts) > 1:
        return _stub(raw, CheckCode.NEIGHBOR_NAME_AMBIGUOUS)
    return _stub(raw, CheckCode.NEIGHBOR_UNKNOWN)


def resolve_name(ctx: Context, raw: str) -> Resolved:
    """Le premier niveau qui répond gagne : exact, casse, puis adresse si le nom en est une, sinon nom rapporté, stub.

    Un device inventorié sous son IP annonce cette IP : c'est d'abord un nom (niveaux 1 et 2, essayés sur l'écriture
    annoncée puis sur la forme canonique de l'adresse), avant d'être une adresse à chercher sur les interfaces.
    """
    address = _address_key(raw)
    spellings = tuple(dict.fromkeys(name for name in (raw, address) if name is not None))
    for name in spellings:
        if name in ctx.devices:
            return _known(ctx, name, Resolution.HOSTNAME, None)
    for name in spellings:
        folded = ctx.by_casefold.get(name.casefold(), ())
        if folded:
            return _known(ctx, folded[0], Resolution.HOSTNAME_CASEFOLD, CheckCode.NEIGHBOR_NAME_CASE_DIFFERS)
    if address is not None:
        return _by_address(ctx, address)
    reported = ctx.by_reported.get(raw) or ctx.by_reported_casefold.get(raw.casefold()) or ()
    if len(reported) == 1:
        return _known(ctx, reported[0], Resolution.REPORTED_HOSTNAME, CheckCode.NEIGHBOR_RESOLVED_BY_REPORTED_HOSTNAME)
    if len(reported) > 1:
        return _stub(raw, CheckCode.NEIGHBOR_NAME_AMBIGUOUS)
    return _stub(raw, CheckCode.NEIGHBOR_UNKNOWN)

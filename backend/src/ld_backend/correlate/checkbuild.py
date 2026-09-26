"""Fabrique des contrôles de B1 : un seul endroit décide de la référence et de la sévérité.

Un témoin `lldp` / `cdp` peut citer un port local absent de `interfaces[]` : le contrat d'entrée en fait un
constat (`local_interface_unknown`), pas un refus, et un topic `interfaces` en échec laisse un device sans aucun
port. Le snapshot, lui, refuse une référence qui ne désigne rien : elle se replie alors sur le nœud, et le nom du
port passe dans `details.interface`.
"""

from collections.abc import Iterable

from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CATALOGUE, CheckCode
from ld_contracts.snapshot.enums import CheckOrigin, Severity
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.refs import AggregateRef, ClusterRef, Endpoint, InterfaceRef, LinkRef, NodeRef, Ref, ref_key

from ld_backend.correlate.context import Context


def sole_severity(code: CheckCode) -> Severity:
    """La sévérité d'un code qui n'en admet qu'une ; à plusieurs, l'appelant choisit et le dit."""
    severities = CATALOGUE[code].severities
    if len(severities) != 1:
        raise ValueError(f"{code} admet plusieurs sévérités : la passer explicitement")
    return next(iter(severities))


def port_ref(ctx: Context, hostname: str, name: str) -> tuple[InterfaceRef | NodeRef, dict[str, str]]:
    """La référence d'un port : l'interface si le snapshot la connaît, sinon le nœud et le nom en détail."""
    if (hostname, name) in ctx.interfaces:
        return InterfaceRef(kind="interface", hostname=hostname, name=name), {}
    return NodeRef(kind="node", hostname=hostname), {"interface": name}


def aggregate_ref(hostname: str, name: str) -> AggregateRef:
    return AggregateRef(kind="aggregate", hostname=hostname, name=name)


def cluster_ref(members: Iterable[str]) -> ClusterRef:
    return ClusterRef(kind="cluster", members=tuple(members))


def node_ref(hostname: str) -> NodeRef:
    return NodeRef(kind="node", hostname=hostname)


def interface_check(ctx: Context, code: CheckCode, hostname: str, name: str, **details) -> Check:
    ref, fallback = port_ref(ctx, hostname, name)
    return structure_check(code, (ref,), **details, **fallback)


def link_check(
    ctx: Context, code: CheckCode, severity: Severity, link: Link, witness: Endpoint | None, **details
) -> Check:
    refs: list = [LinkRef(kind="link", a=link.a, b=link.b)]
    if witness is not None:
        ref, fallback = port_ref(ctx, witness.hostname, witness.interface)
        refs.append(ref)
        details = {**details, **fallback}
    return Check(
        code=code,
        severity=severity,
        origin=CheckOrigin.CORRELATION,
        refs=tuple(sorted(refs, key=ref_key)),
        details=details,
    )


def structure_check(code: CheckCode, refs: Iterable[Ref], **details) -> Check:
    """Un contrôle à sévérité unique sur des références déjà construites (agrégat, cluster, nœud, interface)."""
    return Check(
        code=code,
        severity=sole_severity(code),
        origin=CheckOrigin.CORRELATION,
        refs=tuple(sorted(refs, key=ref_key)),
        details=details,
    )

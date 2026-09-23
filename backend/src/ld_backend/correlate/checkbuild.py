"""Fabrique des contrôles de B1 : un seul endroit décide de la référence et de la sévérité.

Un témoin `lldp` / `cdp` peut citer un port local absent de `interfaces[]` : le contrat d'entrée en fait un
constat (`local_interface_unknown`), pas un refus, et un topic `interfaces` en échec laisse un device sans aucun
port. Le snapshot, lui, refuse une référence qui ne désigne rien : elle se replie alors sur le nœud, et le nom du
port passe dans `details.interface`.
"""

from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CATALOGUE, CheckCode
from ld_contracts.snapshot.enums import CheckOrigin, Severity
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.refs import Endpoint, InterfaceRef, LinkRef, NodeRef, ref_key

from ld_backend.correlate.context import Context


def sole_severity(code: CheckCode) -> Severity:
    """La sévérité d'un code qui n'en admet qu'une ; à plusieurs, l'appelant choisit et le dit."""
    severities = CATALOGUE[code].severities
    if len(severities) != 1:
        raise ValueError(f"{code} admet plusieurs sévérités : la passer explicitement")
    return next(iter(severities))


def _port_ref(ctx: Context, hostname: str, name: str) -> tuple[InterfaceRef | NodeRef, dict[str, str]]:
    if (hostname, name) in ctx.interfaces:
        return InterfaceRef(kind="interface", hostname=hostname, name=name), {}
    return NodeRef(kind="node", hostname=hostname), {"interface": name}


def interface_check(ctx: Context, code: CheckCode, hostname: str, name: str, **details) -> Check:
    ref, fallback = _port_ref(ctx, hostname, name)
    return Check(
        code=code,
        severity=sole_severity(code),
        origin=CheckOrigin.CORRELATION,
        refs=(ref,),
        details={**details, **fallback},
    )


def link_check(
    ctx: Context, code: CheckCode, severity: Severity, link: Link, witness: Endpoint | None, **details
) -> Check:
    refs: list = [LinkRef(kind="link", a=link.a, b=link.b)]
    if witness is not None:
        ref, fallback = _port_ref(ctx, witness.hostname, witness.interface)
        refs.append(ref)
        details = {**details, **fallback}
    return Check(
        code=code,
        severity=severity,
        origin=CheckOrigin.CORRELATION,
        refs=tuple(sorted(refs, key=ref_key)),
        details=details,
    )

"""R1 : normalisation des noms d'interfaces distants (forme courte Cisco → forme longue, port en MAC)."""

from dataclasses import dataclass

from ld_contracts.common import MAC_RE

from ld_backend.correlate import cisco
from ld_backend.correlate.context import Context

SHORT_TO_LONG = "ifname_short_to_long"
MAC_TO_INTERFACE = "mac_port_to_interface"


@dataclass(frozen=True, slots=True)
class PortResolution:
    interface: str | None
    normalization: str | None
    is_mac: bool


def resolve_port(ctx: Context, hostname: str | None, raw: str | None, cisco_hint: bool) -> PortResolution:
    """Ramène un port distant brut à la forme canonique du device résolu, sans rien inventer.

    `hostname` est None pour un stub ; `cisco_hint` dit qu'une évidence (CDP sur le même port local,
    `devices[].vendor`) autorise l'expansion Cisco quand le device n'a pas d'interfaces collectées.
    """
    if raw is None:
        return PortResolution(None, None, False)
    names = ctx.names_by_host.get(hostname, frozenset()) if hostname else frozenset()
    if MAC_RE.fullmatch(raw):
        owners = ctx.ports_by_mac.get((hostname, raw), ()) if hostname else ()
        if len(owners) == 1:
            return PortResolution(owners[0], MAC_TO_INTERFACE, False)
        return PortResolution(raw, None, True)
    expanded = cisco.expand_cisco(raw)
    if names:
        if raw in names:
            return PortResolution(raw, None, False)
        if expanded is not None and expanded in names:
            return PortResolution(expanded, SHORT_TO_LONG, False)
        return PortResolution(raw, None, False)
    if cisco_hint and expanded is not None and expanded != raw:
        return PortResolution(expanded, SHORT_TO_LONG, False)
    return PortResolution(raw, None, False)

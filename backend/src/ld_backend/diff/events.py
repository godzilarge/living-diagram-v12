"""D4 : les faits que les champs volatils révèlent, et qu'aucun `changed` ne porte.

`rebooted` : l'uptime d'après est plus court que le temps écoulé entre les deux runs. `flapped` : le port a changé
d'état dans la fenêtre alors que son `oper_status` est le même aux deux runs, **sur un nœud qui n'a pas redémarré** :
après un redémarrage, tout port monté au démarrage a un âge plus court que la fenêtre, et le redémarrage l'explique
(revue, M2 ; un flap postérieur au démarrage sur ce nœud n'est pas distingué). Rien si le temps écoulé n'est pas
strictement positif : à rebours, les volatils ne disent rien.
"""

from ld_contracts.diff.changes import Event, FlappedDetails, RebootedDetails, event_key
from ld_contracts.diff.enums import EventKind
from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.refs import InterfaceRef, NodeRef


def events(before: Snapshot, after: Snapshot, elapsed_seconds: int) -> tuple[Event, ...]:
    if elapsed_seconds <= 0:
        return ()
    rebooted = _rebooted(before, after, elapsed_seconds)
    restarted = frozenset(event.ref.hostname for event in rebooted)
    found = [*rebooted, *_flapped(before, after, elapsed_seconds, restarted)]
    return tuple(sorted(found, key=event_key))


def _rebooted(before: Snapshot, after: Snapshot, elapsed: int) -> list[Event]:
    previous = {node.hostname: node for node in before.nodes}
    out = []
    for node in after.nodes:
        old = previous.get(node.hostname)
        if old is None or node.uptime_seconds is None or node.uptime_seconds >= elapsed:
            continue
        details = RebootedDetails(
            uptime_before=old.uptime_seconds, uptime_after=node.uptime_seconds, elapsed_seconds=elapsed
        )
        out.append(Event(kind=EventKind.REBOOTED, ref=NodeRef(kind="node", hostname=node.hostname), details=details))
    return out


def _flapped(before: Snapshot, after: Snapshot, elapsed: int, restarted: frozenset[str]) -> list[Event]:
    previous = {(itf.hostname, itf.name): itf for itf in before.interfaces}
    out = []
    for itf in after.interfaces:
        if itf.hostname in restarted:
            continue
        old = previous.get((itf.hostname, itf.name))
        age = itf.last_change_age_seconds
        if old is None or not isinstance(age, int) or age >= elapsed or itf.oper_status != old.oper_status:
            continue
        ref = InterfaceRef(kind="interface", hostname=itf.hostname, name=itf.name)
        details = FlappedDetails(age_after=age, elapsed_seconds=elapsed)
        out.append(Event(kind=EventKind.FLAPPED, ref=ref, details=details))
    return out

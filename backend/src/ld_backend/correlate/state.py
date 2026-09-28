"""R5 : contrôles d'état, sur les câbles que R3 a tracés et sur les tasks de collecte (docs/05 R5).

Ce que compare un câble se lit dans `interfaces[]` des deux bouts : un bout absent du bundle (device d'une autre
infrastructure, stub, topic en échec) ne conclut rien. Un câble arrêté à un agrégat (R1-bis indéterminé, déjà signalé
par `remote_port_is_aggregate`) n'est pas un câble entre deux ports : R5 ne juge que des ports `physical` /
`management` (revue, H1 : la vitesse d'un agrégat est la somme de ses membres). « down » est tout état autre que
`up` ; `unknown` d'un bout ne conclut rien non plus (R3 a déjà mis le câble en `unknown`). Un désaccord d'état ou de
VLAN ne se fonde que sur un câble observé : une description de production est trop peu fiable pour dire qu'un port
`down` est mal câblé ; `link_down` et la vitesse valent pour tous les statuts. Une task `failed` n'a pas de code au
catalogue : l'état reste visible sur le nœud et la couverture, sans contrôle (statuts des tasks, question ouverte).
"""

from collections.abc import Iterable

from ld_contracts.checks import SUBJECT_ALIASES
from ld_contracts.enums import DeviceTaskStatus, InterfaceType, OperStatus, SwitchportMode, TaskStatus
from ld_contracts.models_interfaces import Interface
from ld_contracts.models_run import DeviceTask
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import EvidenceStatus, LinkOper
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.refs import Endpoint, link_key

from ld_backend.correlate.checkbuild import interface_check, link_check, node_ref, sole_severity, structure_check
from ld_backend.correlate.context import Context, subject_for

Ends = tuple[Interface, Interface]

CABLE_PORTS = frozenset({InterfaceType.PHYSICAL, InterfaceType.MANAGEMENT})
OBSERVED_STATUSES = frozenset({EvidenceStatus.CONFIRMED, EvidenceStatus.OBSERVED_ONLY})
KNOWN_SUBJECTS = frozenset().union(*SUBJECT_ALIASES.values())  # les topics de B1, sous tous leurs noms


def _ends(ctx: Context, link: Link) -> Ends | None:
    """Les deux bouts, s'ils sont tous deux des ports de câble lus dans le bundle ; sinon aucune conclusion."""
    a = ctx.interfaces.get((link.a.hostname, link.a.interface))
    b = ctx.interfaces.get((link.b.hostname, link.b.interface))
    if a is None or b is None or a.type not in CABLE_PORTS or b.type not in CABLE_PORTS:
        return None
    return a, b


def _state(itf: Interface) -> dict:
    return {
        "hostname": itf.hostname,
        "interface": itf.name,
        "oper_status": str(itf.oper_status),
        "oper_reason": itf.oper_reason,
    }


def _oper_checks(ctx: Context, link: Link, ends: Ends) -> list[Check]:
    """`link.oper` est déjà dérivé par R3 : `down` = aucun bout `unknown`, pas tous `up`."""
    if link.oper != LinkOper.DOWN:
        return []
    states = [_state(itf) for itf in ends]
    down = [itf for itf in ends if itf.oper_status != OperStatus.UP]
    if len(down) == len(ends):
        code = CheckCode.LINK_DOWN
        return [link_check(ctx, code, sole_severity(code), link, None, states=states)]
    if link.status not in OBSERVED_STATUSES:
        return []
    code = CheckCode.LINK_OPER_MISMATCH
    witness = Endpoint(hostname=down[0].hostname, interface=down[0].name)
    return [link_check(ctx, code, sole_severity(code), link, witness, states=states)]


def _speed_checks(ctx: Context, link: Link, ends: Ends) -> list[Check]:
    a, b = ends
    if a.speed_mbps is None or b.speed_mbps is None or a.speed_mbps == b.speed_mbps:
        return []
    speeds = [{"hostname": itf.hostname, "interface": itf.name, "speed_mbps": itf.speed_mbps} for itf in ends]
    code = CheckCode.LINK_SPEED_MISMATCH
    return [link_check(ctx, code, sole_severity(code), link, None, speeds=speeds)]


def _untagged_vlan(itf: Interface) -> int | None:
    """Le VLAN non tagué d'un port : `access_vlan` en access, `native_vlan` en trunk, sinon aucune conclusion."""
    if itf.switchport_mode == SwitchportMode.ACCESS:
        return itf.access_vlan
    if itf.switchport_mode == SwitchportMode.TRUNK:
        return itf.native_vlan
    return None


def _vlan_checks(ctx: Context, link: Link, ends: Ends) -> list[Check]:
    if link.status not in OBSERVED_STATUSES:
        return []
    vlans = [_untagged_vlan(itf) for itf in ends]
    if None in vlans or vlans[0] == vlans[1]:
        return []
    detail = [
        {"hostname": itf.hostname, "interface": itf.name, "switchport_mode": str(itf.switchport_mode), "vlan": vlan}
        for itf, vlan in zip(ends, vlans, strict=True)
    ]
    code = CheckCode.NATIVE_VLAN_MISMATCH
    return [link_check(ctx, code, sole_severity(code), link, None, vlans=detail)]


def _link_checks(ctx: Context, links: Iterable[Link]) -> list[Check]:
    out: list[Check] = []
    for link in sorted(links, key=link_key):
        ends = _ends(ctx, link)
        if ends is None:
            continue
        out += _oper_checks(ctx, link, ends) + _speed_checks(ctx, link, ends) + _vlan_checks(ctx, link, ends)
    return out


def _transceiver_checks(ctx: Context) -> list[Check]:
    """Un port `not_present` dont la description cite un voisin : documenté, mais rien n'y est inséré."""
    out = []
    for key, itf in ctx.interfaces.items():
        parsed = ctx.descriptions.get(key)
        if itf.oper_status != OperStatus.NOT_PRESENT or itf.type not in CABLE_PORTS or parsed is None:
            continue
        code = CheckCode.DOCUMENTED_PORT_WITHOUT_TRANSCEIVER
        out.append(
            interface_check(
                ctx,
                code,
                itf.hostname,
                itf.name,
                neighbor=parsed.neighbor,
                port=parsed.port,
                oper_reason=itf.oper_reason,
            )
        )
    return out


def _failed_topics(task: DeviceTask) -> list[dict]:
    """Les topics en échec, triés, avec l'erreur brute du collecteur : les topics de B1 sous leur nom canonique (mêmes
    alias et même ordre de lecture que la couverture), les autres sujets de la task sous leur nom brut, car la raison
    d'un `partial` peut être un topic que B1 ne consomme pas (revue, M1)."""
    out = []
    for topic in SUBJECT_ALIASES:
        subject = subject_for(task, topic)
        if subject is not None and subject.status == TaskStatus.FAILED:
            out.append({"topic": topic, "error": subject.error})
    for name in set(task.status_per_subject) - KNOWN_SUBJECTS:
        if task.status_per_subject[name].status == TaskStatus.FAILED:
            out.append({"topic": name, "error": task.status_per_subject[name].error})
    return sorted(out, key=lambda item: item["topic"])


def _device_checks(ctx: Context) -> list[Check]:
    """Une task vise toujours un device du périmètre : le contrat d'entrée refuse les autres (`hostname_not_in_devices`,
    `hostname_outside_infrastructure`), le nœud existe donc."""
    out = []
    for task in sorted(ctx.bundle.tasks, key=lambda t: t.hostname):
        refs = (node_ref(task.hostname),)
        if task.status == DeviceTaskStatus.UNREACHABLE:
            out.append(structure_check(CheckCode.DEVICE_UNREACHABLE, refs, error=task.error))
        elif task.status == DeviceTaskStatus.PARTIAL:
            out.append(
                structure_check(
                    CheckCode.DEVICE_PARTIAL_COLLECTION, refs, error=task.error, failed=_failed_topics(task)
                )
            )
    return out


def build_state_checks(ctx: Context, links: Iterable[Link]) -> tuple[Check, ...]:
    return tuple(_link_checks(ctx, links) + _transceiver_checks(ctx) + _device_checks(ctx))

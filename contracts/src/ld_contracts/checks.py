"""Contrôles référentiels : constats (``Finding``), jamais des erreurs.

Une incohérence de données (membre d'agrégat inconnu, parent absent) est une information
que B1 doit voir et signaler, pas une raison de refuser le bundle.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

from ld_contracts.bundle import RunBundle
from ld_contracts.common import VRF_GLOBAL

ABSENT_CODE = "nullable_key_absent"

FINDING_CODES = {
    ABSENT_CODE: (
        "un champ nullable est absent du bundle et a été lu comme `null` ; un constat par champ, avec le nombre "
        "d'occurrences et de devices. Doit tendre vers zéro, comme `residual_normalizations`"
    ),
    "parent_interface_unknown": "le parent d'une sous-interface n'existe pas dans les interfaces du device",
    "interface_member_unknown": "un membre listé dans `interfaces[].members` n'existe pas",
    "aggregate_interface_unknown": "un agrégat n'a pas d'interface du même nom",
    "aggregate_member_unknown": "un membre d'agrégat n'existe pas dans les interfaces du device",
    "local_interface_unknown": "un voisin LLDP / CDP cite un port local absent des interfaces",
    "ha_member_unknown": "un membre HA n'est pas dans `devices`",
    "heartbeat_interface_unknown": "une interface de heartbeat n'existe pas dans les interfaces du device",
    "vrf_default_case": (
        "un `vrf` vaut `default` à la casse ou aux blancs près : VRF utilisateur légitime, ou table globale mal écrite"
    ),
    "reported_hostname_differs": "le nom rapporté par l'équipement diffère du hostname (hors casse)",
    "device_without_task": "un device de l'infrastructure n'a pas de statut de collecte",
    "documents_without_task": "des documents d'un topic existent sans statut de collecte pour ce topic",
}

SUBJECT_ALIASES: dict[str, frozenset[str]] = {
    "interfaces": frozenset({"interfaces"}),
    "aggregates": frozenset({"aggregates", "port_channels", "etherchannels"}),
    "lldp": frozenset({"lldp", "lldp_neighbors"}),
    "cdp": frozenset({"cdp", "cdp_neighbors"}),
    "system": frozenset({"system", "system_info"}),
    "ha": frozenset({"ha", "ha_status"}),
}


@dataclass(frozen=True, slots=True)
class Finding:
    code: str
    message: str
    hostname: str | None = None
    ref: str | None = None
    # Forme structurée du message, sans valeur du bundle (noms de champs, comptes) : lue par l'API et le shell.
    details: Mapping[str, str | int] = field(default_factory=dict)


def check_bundle(bundle: RunBundle) -> list[Finding]:
    ifnames = _interface_names(bundle)
    hostnames = {d.hostname for d in bundle.devices}
    found: list[Finding] = []
    found += _check_interfaces(bundle, ifnames)
    found += _check_aggregates(bundle, ifnames)
    found += _check_neighbors(bundle, ifnames)
    found += _check_ha(bundle, ifnames, hostnames)
    found += _check_system(bundle)
    found += _check_tasks(bundle)
    return found


def _interface_names(bundle: RunBundle) -> dict[str, set[str]]:
    names: dict[str, set[str]] = {}
    for itf in bundle.interfaces:
        names.setdefault(itf.hostname, set()).add(itf.name)
    return names


def _check_interfaces(bundle: RunBundle, ifnames: dict[str, set[str]]) -> list[Finding]:
    out = []
    for itf in bundle.interfaces:
        local = ifnames.get(itf.hostname, set())
        if itf.parent_interface is not None and itf.parent_interface not in local:
            out.append(
                Finding(
                    "parent_interface_unknown",
                    "parent absent des interfaces du device",
                    itf.hostname,
                    f"{itf.name} → {itf.parent_interface}",
                )
            )
        if itf.vrf is not None and itf.vrf != VRF_GLOBAL and itf.vrf.strip().casefold() == VRF_GLOBAL:
            out.append(
                Finding(
                    "vrf_default_case",
                    "vrf égale au nom réservé de la table globale, à la casse ou aux blancs près",
                    itf.hostname,
                    itf.name,
                )
            )
        for member in itf.members:
            if member not in local:
                out.append(
                    Finding(
                        "interface_member_unknown",
                        "membre absent des interfaces du device",
                        itf.hostname,
                        f"{itf.name} → {member}",
                    )
                )
    return out


def _check_aggregates(bundle: RunBundle, ifnames: dict[str, set[str]]) -> list[Finding]:
    out = []
    for agg in bundle.aggregates:
        local = ifnames.get(agg.hostname, set())
        if agg.name not in local:
            out.append(
                Finding(
                    "aggregate_interface_unknown", "agrégat absent des interfaces du device", agg.hostname, agg.name
                )
            )
        for member in agg.members:
            if member.name not in local:
                out.append(
                    Finding(
                        "aggregate_member_unknown",
                        "membre d'agrégat absent des interfaces du device",
                        agg.hostname,
                        f"{agg.name} → {member.name}",
                    )
                )
    return out


def _check_neighbors(bundle: RunBundle, ifnames: dict[str, set[str]]) -> list[Finding]:
    out = []
    for topic in ("lldp", "cdp"):
        for doc in getattr(bundle, topic):
            if doc.local_interface not in ifnames.get(doc.hostname, set()):
                out.append(
                    Finding(
                        "local_interface_unknown",
                        f"{topic} : interface locale absente des interfaces du device",
                        doc.hostname,
                        doc.local_interface,
                    )
                )
    return out


def _check_ha(bundle: RunBundle, ifnames: dict[str, set[str]], hostnames: set[str]) -> list[Finding]:
    out = []
    for ha in bundle.ha:
        for member in ha.members:
            if member.name not in hostnames:
                out.append(
                    Finding("ha_member_unknown", "membre HA absent de la table devices", ha.hostname, member.name)
                )
        for itf in ha.heartbeat_interfaces:
            if itf not in ifnames.get(ha.hostname, set()):
                out.append(
                    Finding(
                        "heartbeat_interface_unknown",
                        "interface de heartbeat absente des interfaces du device",
                        ha.hostname,
                        itf,
                    )
                )
    return out


def _check_system(bundle: RunBundle) -> list[Finding]:
    out = []
    for sysinfo in bundle.system:
        reported = sysinfo.reported_hostname
        if reported is not None and reported.casefold() != sysinfo.hostname.casefold():
            out.append(
                Finding(
                    "reported_hostname_differs",
                    "nom rapporté par l'équipement différent du hostname devices",
                    sysinfo.hostname,
                    reported,
                )
            )
    return out


def _check_tasks(bundle: RunBundle) -> list[Finding]:
    out = []
    tasks = {t.hostname: t for t in bundle.tasks}
    for device in bundle.devices_in_scope():
        if device.hostname not in tasks:
            out.append(Finding("device_without_task", "device du périmètre sans statut de collecte", device.hostname))
    for topic, aliases in SUBJECT_ALIASES.items():
        seen: set[str] = set()
        for doc in getattr(bundle, topic):
            if doc.hostname in seen:
                continue
            seen.add(doc.hostname)
            task = tasks.get(doc.hostname)
            if task is None or aliases.isdisjoint(task.status_per_subject):
                out.append(
                    Finding(
                        "documents_without_task",
                        f"{topic} : documents sans statut de collecte pour ce topic",
                        doc.hostname,
                        topic,
                    )
                )
    return out

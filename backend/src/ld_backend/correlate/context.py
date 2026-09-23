"""Index immuables construits une fois sur le bundle : tout ce que les règles R0 à R6 consultent."""

import ipaddress
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import SUBJECT_ALIASES
from ld_contracts.enums import DeviceTaskStatus, InterfaceType, TaskStatus
from ld_contracts.models_devices import Device, SystemInfo
from ld_contracts.models_interfaces import Interface
from ld_contracts.snapshot.enums import CollectionStatus, TopicStatus
from ld_contracts.snapshot.interfaces import AggregateMembership, ParsedDescription
from ld_contracts.snapshot.report import Coverage, TopicCoverage

from ld_backend.correlate.cisco import equivalent
from ld_backend.correlate.descriptions import parse_description

Key = tuple[str, str]


@dataclass(frozen=True, slots=True)
class Context:
    bundle: RunBundle
    devices: Mapping[str, Device]
    in_scope: frozenset[str]
    interfaces: Mapping[Key, Interface]
    names_by_host: Mapping[str, frozenset[str]]
    ports_by_mac: Mapping[Key, tuple[str, ...]]
    descriptions: Mapping[Key, ParsedDescription]
    by_casefold: Mapping[str, tuple[str, ...]]
    by_reported: Mapping[str, tuple[str, ...]]
    by_reported_casefold: Mapping[str, tuple[str, ...]]
    by_mac: Mapping[str, tuple[str, ...]]
    by_ip: Mapping[str, tuple[str, ...]]
    system: Mapping[str, SystemInfo]
    coverage: Mapping[str, Coverage]
    membership: Mapping[Key, AggregateMembership]
    aggregate_members: Mapping[Key, tuple[str, ...]]  # clé (hostname, forme de comparaison de l'agrégat), R1-bis
    peer_link_members: frozenset[Key]
    heartbeats: frozenset[Key]
    cdp_ports: frozenset[Key]

    def kind_is_device(self, hostname: str) -> bool:
        return hostname in self.in_scope

    def members_at(self, end: Key) -> tuple[str, ...] | None:
        """Les membres si ce bout est un agrégat d'un device collecté (liste vide : membres inconnus) ; None sinon."""
        return self.aggregate_members.get(end)


def canonical_ip(text: str) -> str | None:
    """La forme de comparaison d'une IP (`2001:DB8:0::1` → `2001:db8::1`) ; None si ce n'en est pas une."""
    try:
        return str(ipaddress.ip_address(text))
    except ValueError:
        return None


def _grouped[K](pairs: Iterable[tuple[K, str]]) -> dict[K, tuple[str, ...]]:
    out: dict[K, set[str]] = defaultdict(set)
    for key, value in pairs:
        out[key].add(value)
    return {key: tuple(sorted(values)) for key, values in out.items()}


def _coverage(bundle: RunBundle) -> dict[str, Coverage]:
    tasks = {t.hostname: t for t in bundle.tasks}
    out = {}
    for device in bundle.devices_in_scope():
        task = tasks.get(device.hostname)
        status = CollectionStatus.NOT_COLLECTED if task is None else CollectionStatus(str(task.status))
        topics = {}
        for topic, aliases in SUBJECT_ALIASES.items():
            names = (topic, *sorted(aliases - {topic}))  # nom canonique d'abord, puis les alias, triés
            subject = next((task.status_per_subject[a] for a in names if task and a in task.status_per_subject), None)
            if subject is None or task is None or task.status == DeviceTaskStatus.UNREACHABLE:
                topics[topic] = TopicStatus.ABSENT
            else:
                topics[topic] = TopicStatus.SUCCESS if subject.status == TaskStatus.SUCCESS else TopicStatus.FAILED
        out[device.hostname] = Coverage(hostname=device.hostname, status=status, topics=TopicCoverage(**topics))
    return out


def _aggregates_collected(coverage: Mapping[str, Coverage], hostname: str) -> bool:
    found = coverage.get(hostname)
    return found is not None and found.topics.aggregates == TopicStatus.SUCCESS


def _membership(
    bundle: RunBundle, coverage: Mapping[str, Coverage]
) -> tuple[dict[Key, AggregateMembership], frozenset[Key]]:
    """`aggregates[]` fait foi ; `interfaces[].members` ne sert qu'au device dont le topic n'est pas en succès.

    Topic en succès sans document : le device n'a pas d'agrégat, rien à déduire de `interfaces[].members`.
    """
    membership: dict[Key, AggregateMembership] = {}
    peer_link: set[Key] = set()
    for aggregate in bundle.aggregates:
        for member in aggregate.members:
            membership[(aggregate.hostname, member.name)] = AggregateMembership(
                name=aggregate.name, member_status=member.status
            )
            if aggregate.mlag_peer_link:
                peer_link.add((aggregate.hostname, member.name))
    for itf in bundle.interfaces:
        if _aggregates_collected(coverage, itf.hostname):
            continue
        for member in itf.members:
            membership.setdefault((itf.hostname, member), AggregateMembership(name=itf.name, member_status=None))
    return membership, frozenset(peer_link)


def _aggregate_members(bundle: RunBundle, membership: Mapping[Key, AggregateMembership]) -> dict[Key, tuple[str, ...]]:
    """Par agrégat, ses membres, d'après la même source que `membership` ; une interface `aggregate` sans membre
    connu est un agrégat quand même (liste vide). Clé sous la forme de comparaison des bouts (`Po1` = `port-channel1`).
    """
    members: dict[Key, set[str]] = defaultdict(set)
    for itf in bundle.interfaces:
        if itf.type == InterfaceType.AGGREGATE:
            members[(itf.hostname, equivalent(itf.name))]
    for (hostname, member), found in membership.items():
        members[(hostname, equivalent(found.name))].add(member)
    return {key: tuple(sorted(found)) for key, found in members.items()}


def build_context(bundle: RunBundle) -> Context:
    system = {s.hostname: s for s in bundle.system}
    reported = [(s.reported_hostname, s.hostname) for s in bundle.system if s.reported_hostname]
    coverage = _coverage(bundle)
    membership, peer_link = _membership(bundle, coverage)
    parsed = ((i, parse_description(i.description)) for i in bundle.interfaces)
    return Context(
        bundle=bundle,
        devices={d.hostname: d for d in bundle.devices},
        in_scope=frozenset(d.hostname for d in bundle.devices_in_scope()),
        interfaces={(i.hostname, i.name): i for i in bundle.interfaces},
        names_by_host={h: frozenset(n) for h, n in _grouped((i.hostname, i.name) for i in bundle.interfaces).items()},
        ports_by_mac=_grouped(((i.hostname, i.mac_address), i.name) for i in bundle.interfaces if i.mac_address),
        descriptions={(i.hostname, i.name): p for i, p in parsed if p is not None},
        by_casefold=_grouped((d.hostname.casefold(), d.hostname) for d in bundle.devices),
        by_reported=_grouped(reported),
        by_reported_casefold=_grouped((name.casefold(), host) for name, host in reported),
        by_mac=_grouped((i.mac_address, i.hostname) for i in bundle.interfaces if i.mac_address),
        by_ip=_grouped((canonical_ip(ip.address), i.hostname) for i in bundle.interfaces for ip in i.ip_addresses),
        system=system,
        coverage=coverage,
        membership=membership,
        aggregate_members=_aggregate_members(bundle, membership),
        peer_link_members=peer_link,
        heartbeats=frozenset((h.hostname, name) for h in bundle.ha for name in h.heartbeat_interfaces),
        cdp_ports=frozenset((c.hostname, c.local_interface) for c in bundle.cdp),
    )

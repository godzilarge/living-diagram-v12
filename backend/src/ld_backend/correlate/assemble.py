"""R6 : assemblage du snapshot dans l'ordre canonique, à partir des index, des claims et des câbles."""

from collections import defaultdict
from collections.abc import Iterable

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import check_bundle
from ld_contracts.models_devices import Device, SystemInfo
from ld_contracts.models_interfaces import Interface, VlanRange
from ld_contracts.snapshot import SNAPSHOT_VERSION, Snapshot
from ld_contracts.snapshot.checks import Check, check_key
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.enums import CheckOrigin, InterfaceRole, NodeKind
from ld_contracts.snapshot.interfaces import SnapshotInterface, ip_key
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.nodes import Node, NodeEvidence, SeenBy, Stack, StackMember, seen_by_key
from ld_contracts.snapshot.order import natural_key
from ld_contracts.snapshot.refs import NodeRef, link_key
from ld_contracts.snapshot.report import Report, RunSummary, SectionCounts, Source

from ld_backend.correlate.checkbuild import sole_severity
from ld_backend.correlate.claims import Claim, ClaimSet
from ld_backend.correlate.context import Context
from ld_backend.correlate.merge import MergeResult

COPIED_INTERFACE_FIELDS = (
    "hostname",
    "name",
    "description",
    "type",
    "admin_status",
    "oper_status",
    "oper_reason",
    "speed_mbps",
    "duplex",
    "mac_address",
    "media",
    "parent_interface",
    "virtual_context",
    "last_change_age_seconds",
    "vlan_id",
    "switchport_mode",
    "access_vlan",
    "native_vlan",
    "vrf",
)


def _stack(system: SystemInfo | None) -> Stack | None:
    if system is None or not system.chassis_members:
        return None
    members = sorted(system.chassis_members, key=lambda m: m.slot)
    return Stack(
        member_count=len(members),
        members=tuple(
            StackMember(slot=m.slot, serial=m.serial, model=m.model, role=m.role, state=m.state, priority=m.priority)
            for m in members
        ),
    )


def _device_node(ctx: Context, device: Device) -> Node:
    system = ctx.system.get(device.hostname)
    return Node(
        kind=NodeKind.DEVICE,
        hostname=device.hostname,
        type=device.type,
        vendor=device.vendor,
        model=device.model,
        site=device.site,
        os_name=device.os_name,
        os_version=device.os_version,
        serial_number=device.serial_number,
        reported_hostname=system.reported_hostname if system else None,
        uptime_seconds=system.uptime_seconds if system else None,
        virtual_contexts=tuple(sorted(set(system.virtual_contexts))) if system else (),
        stack=_stack(system),
        collection=ctx.coverage[device.hostname].status,
        evidence=None,
    )


def _cited_node(ctx: Context, hostname: str, kind: NodeKind, evidence: NodeEvidence) -> Node:
    device = ctx.devices.get(hostname) if kind == NodeKind.EXTERNAL else None
    return Node(
        kind=kind,
        hostname=hostname,
        type=device.type if device else None,
        vendor=device.vendor if device else None,
        model=device.model if device else None,
        site=device.site if device else None,
        os_name=device.os_name if device else None,
        os_version=device.os_version if device else None,
        serial_number=device.serial_number if device else None,
        reported_hostname=None,
        uptime_seconds=None,
        virtual_contexts=(),
        stack=None,
        collection=None,
        evidence=evidence,
    )


def _nodes(ctx: Context, claims: Iterable[Claim]) -> tuple[Node, ...]:
    seen: dict[str, set[SeenBy]] = defaultdict(set)
    capabilities: dict[str, set[str]] = defaultdict(set)
    kinds: dict[str, NodeKind] = {}
    for claim in claims:
        if claim.resolved.kind == NodeKind.DEVICE:
            continue
        host = claim.resolved.hostname
        kinds[host] = claim.resolved.kind
        seen[host].add(SeenBy(hostname=claim.hostname, interface=claim.interface, source=claim.source))
        capabilities[host].update(claim.capabilities)
    nodes = [_device_node(ctx, ctx.devices[host]) for host in ctx.in_scope]
    for host, kind in kinds.items():
        evidence = NodeEvidence(
            seen_by=tuple(sorted(seen[host], key=seen_by_key)), capabilities=tuple(sorted(capabilities[host]))
        )
        nodes.append(_cited_node(ctx, host, kind, evidence))
    return tuple(sorted(nodes, key=lambda n: (str(n.kind), n.hostname)))


def canonical_vlans(ranges: tuple[VlanRange, ...] | None) -> tuple[VlanRange, ...] | None:
    """Union des intervalles : triés par `first`, adjacents fusionnés (`10-20, 21-30` → `10-30`)."""
    if ranges is None:
        return None
    merged: list[VlanRange] = []
    for current in sorted(ranges, key=lambda r: (r.first, r.last)):
        if merged and current.first <= merged[-1].last + 1:
            merged[-1] = VlanRange(first=merged[-1].first, last=max(merged[-1].last, current.last))
        else:
            merged.append(current)
    return tuple(merged)


def _unique_ips(itf: Interface) -> tuple:
    """Triées, et un doublon strict (même famille, adresse, préfixe, rôle) n'est gardé qu'une fois : le contrat
    d'entrée l'accepte, celui de sortie le refuse, et le retirer ne perd aucune information."""
    unique = {ip_key(ip): ip for ip in itf.ip_addresses}
    return tuple(unique[key] for key in sorted(unique))


def _interface(ctx: Context, itf: Interface) -> SnapshotInterface:
    key = (itf.hostname, itf.name)
    roles = set()
    if key in ctx.heartbeats:
        roles.add(InterfaceRole.HEARTBEAT)
    if key in ctx.peer_link_members:
        roles.add(InterfaceRole.MLAG_PEER_LINK)
    return SnapshotInterface(
        **{name: getattr(itf, name) for name in COPIED_INTERFACE_FIELDS},
        description_parsed=ctx.descriptions.get(key),
        allowed_vlans=canonical_vlans(itf.allowed_vlans),
        ip_addresses=_unique_ips(itf),
        aggregate=ctx.membership.get(key),
        roles=tuple(sorted(roles)),
    )


def _bundle_checks(bundle: RunBundle) -> list[Check]:
    out = []
    for finding in check_bundle(bundle):
        code = CheckCode(finding.code)
        details = {"message": finding.message, "ref": finding.ref, **finding.details}
        out.append(
            Check(
                code=code,
                severity=sole_severity(code),
                origin=CheckOrigin.BUNDLE,
                refs=(NodeRef(kind="node", hostname=finding.hostname),),
                details=details,
            )
        )
    return out


def _unique_sorted_checks(checks: Iterable[Check]) -> tuple[Check, ...]:
    by_key = {check_key(c): c for c in checks}
    return tuple(by_key[key] for key in sorted(by_key))


def _source(bundle: RunBundle, bundle_sha256: str) -> Source:
    run = bundle.run
    return Source(
        infrastructure=bundle.infrastructure,
        collector_run_id=run.collector_run_id,
        bundle_sha256=bundle_sha256,
        contract_version=bundle.contract_version,
        produced_at=bundle.produced_at,
        exporter_version=bundle.exporter_version,
        run=RunSummary(start_datetime=run.start_datetime, end_datetime=run.end_datetime, status=run.status),
    )


def assemble(ctx: Context, claimset: ClaimSet, merged: MergeResult, bundle_sha256: str) -> Snapshot:
    bundle = ctx.bundle
    nodes = _nodes(ctx, claimset.claims)
    interfaces = tuple(
        sorted((_interface(ctx, i) for i in bundle.interfaces), key=lambda i: (i.hostname, natural_key(i.name)))
    )
    links: tuple[Link, ...] = tuple(sorted(merged.links, key=link_key))
    checks = _unique_sorted_checks([*claimset.checks, *merged.checks, *_bundle_checks(bundle)])
    coverage = tuple(sorted(ctx.coverage.values(), key=lambda c: c.hostname))
    counts = SectionCounts(
        nodes=len(nodes),
        interfaces=len(interfaces),
        links=len(links),
        aggregates=0,
        mlag_domains=0,
        ha_clusters=0,
        checks=len(checks),
    )
    report = Report(
        counts=counts,
        residual_normalizations=dict(bundle.residual_normalizations),
        applied_normalizations=dict(claimset.normalizations),
        unresolved_names=tuple(sorted(claimset.unresolved)),
        unparseable_descriptions=claimset.unparseable,
    )
    return Snapshot(
        snapshot_version=SNAPSHOT_VERSION,
        source=_source(bundle, bundle_sha256),
        nodes=nodes,
        interfaces=interfaces,
        links=links,
        aggregates=(),
        mlag_domains=(),
        ha_clusters=(),
        checks=checks,
        coverage=coverage,
        report=report,
    )

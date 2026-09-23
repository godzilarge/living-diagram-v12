"""Constructeurs de documents snapshot valides ; chaque test ne modifie que ce qu'il teste."""

import copy
import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
TOPICS = ("interfaces", "aggregates", "lldp", "cdp", "system", "ha")


def endpoint(hostname: str, interface: str) -> dict:
    return {"hostname": hostname, "interface": interface}


def node_doc(**overrides) -> dict:
    base = {
        "kind": "device",
        "hostname": "sw-a",
        "type": "switch",
        "vendor": "cisco",
        "model": "N9K-C93180YC-FX",
        "site": "paris-dc1",
        "os_name": "NX-OS",
        "os_version": "10.4.2",
        "serial_number": "SN-A",
        "reported_hostname": "sw-a",
        "uptime_seconds": 9000,
        "virtual_contexts": [],
        "stack": None,
        "collection": "success",
        "evidence": None,
    }
    return {**base, **overrides}


def stub_doc(**overrides) -> dict:
    base = {
        "kind": "stub",
        "hostname": "srv-1",
        "type": None,
        "vendor": None,
        "model": None,
        "site": None,
        "os_name": None,
        "os_version": None,
        "serial_number": None,
        "reported_hostname": None,
        "uptime_seconds": None,
        "virtual_contexts": [],
        "stack": None,
        "collection": None,
        "evidence": {
            "seen_by": [{"hostname": "sw-a", "interface": "Ethernet1/3", "source": "lldp"}],
            "capabilities": ["station"],
        },
    }
    return {**base, **overrides}


def parsed(neighbor: str, port: str | None = "Ethernet1/1") -> dict:
    return {"criticality": "C1", "neighbor": neighbor, "port": port, "options": None}


def interface_doc(**overrides) -> dict:
    base = {
        "hostname": "sw-a",
        "name": "Ethernet1/1",
        "description": "C1|sw-b|Ethernet1/1|",
        "description_parsed": parsed("sw-b"),
        "type": "physical",
        "admin_status": "up",
        "oper_status": "up",
        "oper_reason": None,
        "speed_mbps": 10000,
        "duplex": "full",
        "mac_address": "00:00:5e:00:53:01",
        "media": "10Gbase-SR",
        "parent_interface": None,
        "virtual_context": None,
        "last_change_age_seconds": 3600,
        "vlan_id": None,
        "switchport_mode": "trunk",
        "access_vlan": None,
        "native_vlan": 1,
        "allowed_vlans": [{"first": 10, "last": 20}, {"first": 100, "last": 100}],
        "ip_addresses": [],
        "vrf": None,
        "aggregate": None,
        "roles": [],
    }
    return {**base, **overrides}


def evidence_doc(**overrides) -> dict:
    base = {
        "source": "lldp",
        "witness": endpoint("sw-a", "Ethernet1/1"),
        "remote_raw": {"name": "sw-b", "port": "Ethernet1/1"},
        "remote_resolved": endpoint("sw-b", "Ethernet1/1"),
        "resolution": "hostname",
    }
    return {**base, **overrides}


REVERSE = {
    "witness": endpoint("sw-b", "Ethernet1/1"),
    "remote_raw": {"name": "sw-a", "port": "Ethernet1/1"},
    "remote_resolved": endpoint("sw-a", "Ethernet1/1"),
}


def link_doc(**overrides) -> dict:
    base = {
        "kind": "cable",
        "a": endpoint("sw-a", "Ethernet1/1"),
        "b": endpoint("sw-b", "Ethernet1/1"),
        "status": "confirmed",
        "evidence": [
            evidence_doc(source="description"),
            evidence_doc(source="description", **REVERSE),
            evidence_doc(),
            evidence_doc(**REVERSE),
        ],
        "oper": "up",
        "speed_mbps": 10000,
        "aggregate_a": None,
        "aggregate_b": None,
    }
    return {**base, **overrides}


def link_ref(a: dict, b: dict) -> dict:
    return {"kind": "link", "a": a, "b": b}


def check_doc(**overrides) -> dict:
    base = {
        "code": "link_down",
        "severity": "info",
        "origin": "correlation",
        "refs": [link_ref(endpoint("sw-a", "Ethernet1/1"), endpoint("sw-b", "Ethernet1/1"))],
        "details": {},
    }
    return {**base, **overrides}


def aggregate_doc(**overrides) -> dict:
    base = {
        "hostname": "sw-a",
        "name": "port-channel10",
        "oper_status": "up",
        "protocol": "lacp",
        "lacp_mode": "active",
        "min_links": 1,
        "members": [{"name": "Ethernet1/1", "status": "bundled"}],
        "mlag_id": None,
        "mlag_peer_link": True,
        "cables": [{"a": endpoint("sw-a", "Ethernet1/1"), "b": endpoint("sw-b", "Ethernet1/1")}],
        "degraded": False,
    }
    return {**base, **overrides}


def mlag_domain_doc(**overrides) -> dict:
    base = {
        "mlag_id": 20,
        "members": [
            {"hostname": "sw-a", "aggregate": "port-channel20"},
            {"hostname": "sw-b", "aggregate": "port-channel20"},
        ],
        "peer_link": {"hostname": "sw-a", "aggregate": "port-channel10"},
        "downstream": "fw-1",
    }
    return {**base, **overrides}


def ha_cluster_doc(**overrides) -> dict:
    base = {
        "members": [
            {"hostname": "fw-1", "role": "primary", "state": "up", "priority": 200, "reported_by": ["fw-1"]},
            {"hostname": "fw-2", "role": "secondary", "state": "down", "priority": 100, "reported_by": ["fw-1"]},
        ],
        "mode": "active_passive",
        "cluster_name": "EDGE",
        "heartbeat_interfaces": [{"hostname": "fw-1", "interface": "ha1", "cable": None}],
    }
    return {**base, **overrides}


def coverage_doc(hostname: str, **overrides) -> dict:
    topics = dict.fromkeys(TOPICS, "absent")
    topics["interfaces"] = "success"
    topics["lldp"] = "success"
    base = {"hostname": hostname, "status": "success", "topics": topics}
    return {**base, **overrides}


def counts(**overrides) -> dict:
    base = {
        "nodes": 2,
        "interfaces": 2,
        "links": 1,
        "aggregates": 0,
        "mlag_domains": 0,
        "ha_clusters": 0,
        "checks": 0,
    }
    return {**base, **overrides}


def snapshot_doc(**overrides) -> dict:
    """Deux devices reliés par un câble confirmé : le plus petit snapshot qui dit quelque chose."""
    base = {
        "snapshot_version": "1.0.0",
        "source": {
            "infrastructure": "infra-lab",
            "collector_run_id": "66db3f0e9a1c2b0012f4a7d1",
            "bundle_sha256": "a" * 64,
            "contract_version": "1.0.0",
            "produced_at": "2026-09-10T02:20:11Z",
            "exporter_version": "0.1.0",
            "run": {
                "start_datetime": "2026-09-10T02:00:00Z",
                "end_datetime": "2026-09-10T02:14:32Z",
                "status": "completed",
            },
        },
        "nodes": [node_doc(), node_doc(hostname="sw-b", reported_hostname="sw-b", serial_number="SN-B")],
        "interfaces": [
            interface_doc(),
            interface_doc(
                hostname="sw-b",
                description="C1|sw-a|Ethernet1/1|",
                description_parsed=parsed("sw-a"),
                mac_address="00:00:5e:00:53:02",
            ),
        ],
        "links": [link_doc()],
        "aggregates": [],
        "mlag_domains": [],
        "ha_clusters": [],
        "checks": [],
        "coverage": [coverage_doc("sw-a"), coverage_doc("sw-b")],
        "report": {
            "counts": counts(),
            "residual_normalizations": {},
            "applied_normalizations": {},
            "unresolved_names": [],
            "unparseable_descriptions": 0,
        },
    }
    return {**base, **overrides}


@pytest.fixture
def snap() -> dict:
    return snapshot_doc()


def with_section(doc: dict, section: str, items: list) -> dict:
    """Copie de `doc` avec une section remplacée et les comptes du rapport recalculés."""
    out = copy.deepcopy(doc)
    out[section] = items
    for name in out["report"]["counts"]:
        out["report"]["counts"][name] = len(out[name])
    return out


def first_error(exc_info) -> dict:
    return exc_info.value.errors()[0]


def error_types(exc_info) -> set[str]:
    return {e["type"] for e in exc_info.value.errors()}


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

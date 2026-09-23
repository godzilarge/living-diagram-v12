import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


@pytest.fixture
def minimal_path() -> Path:
    return FIXTURES / "bundle-minimal.json"


@pytest.fixture
def minimal_dict(minimal_path: Path) -> dict:
    return json.loads(minimal_path.read_text(encoding="utf-8"))


def first_error(exc_info) -> dict:
    return exc_info.value.errors()[0]


def interface_doc(**overrides) -> dict:
    base = {
        "hostname": "sw-core-01",
        "name": "Ethernet1/1",
        "description": "C1|sw-core-02|Ethernet1/1|",
        "type": "physical",
        "admin_status": "up",
        "oper_status": "up",
        "oper_reason": None,
        "speed_mbps": 10000,
        "configured_speed_mbps": None,
        "auto_negotiate": None,
        "duplex": "full",
        "mtu": 9216,
        "mac_address": "00:3a:9c:11:22:01",
        "media": None,
        "last_change_age_seconds": None,
        "parent_interface": None,
        "vlan_id": None,
        "members": [],
        "ip_addresses": [],
        "vrf": None,
        "virtual_context": None,
        "switchport_mode": None,
        "access_vlan": None,
        "native_vlan": None,
        "allowed_vlans": None,
        "counters": None,
        "extras": {},
    }
    return {**base, **overrides}


def ha_doc(**overrides) -> dict:
    """Document `ha` valide : le device local figure dans `members` (2026-09-14)."""
    base = {
        "hostname": "fw-edge-01",
        "mode": "active_passive",
        "cluster_name": "EDGE-CLUSTER",
        "members": [
            {"name": "fw-edge-01", "serial": "FG600F0001", "role": "primary", "state": "up", "priority": 200},
            {"name": "fw-edge-02", "serial": "FG600F0002", "role": "secondary", "state": "down", "priority": 100},
        ],
        "heartbeat_interfaces": ["ha1"],
        "extras": {"sync_status": "out_of_sync"},
    }
    return {**base, **overrides}


def system_doc(**overrides) -> dict:
    """Document `system` valide : ce que l'équipement dit de lui-même, sans `platform` (2026-09-14)."""
    base = {
        "hostname": "sw-core-01",
        "reported_hostname": "sw-core-01",
        "vendor": "cisco",
        "model": "N9K-C93180YC-FX",
        "os_version": "10.4(2)",
        "serial_number": "FDO24011AAA",
        "uptime_seconds": 9123456,
        "chassis_members": [],
        "virtual_contexts": [],
        "extras": {},
    }
    return {**base, **overrides}

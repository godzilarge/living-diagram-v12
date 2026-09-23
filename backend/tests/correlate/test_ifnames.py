"""R1 : normalisation des noms d'interfaces distants."""

import pytest

from ld_backend.correlate.cisco import expand_cisco
from tests.correlate.conftest import find_link, lldp_doc, run, variant


@pytest.mark.parametrize(
    ("short", "long"),
    [
        ("Gi0/0/0", "GigabitEthernet0/0/0"),
        ("Gi1/0/1", "GigabitEthernet1/0/1"),
        ("Te1/1/1", "TenGigabitEthernet1/1/1"),
        ("Twe1/0/1", "TwentyFiveGigE1/0/1"),
        ("Fo1/1", "FortyGigabitEthernet1/1"),
        ("Hu1/1", "HundredGigE1/1"),
        ("Eth1/1", "Ethernet1/1"),
        ("Po10", "port-channel10"),
        ("Fa0/1", "FastEthernet0/1"),
        ("Lo0", "Loopback0"),
        ("Vl100", "Vlan100"),
        ("Tu1", "Tunnel1"),
        ("Mgmt0", "mgmt0"),
        ("mgmt0", "mgmt0"),
    ],
)
def test_cisco_expansion(short, long):
    assert expand_cisco(short) == long


@pytest.mark.parametrize(
    "name", ["Ethernet1/1", "GigabitEthernet0/0/0", "x1", "eno1", "3c:ec:ef:12:34:56", "port-channel10", "Gi"]
)
def test_no_expansion_for_long_or_foreign_names(name):
    assert expand_cisco(name) is None


def test_remote_port_resolved_against_the_neighbor_interfaces(minimal):
    """Chez un device collecté : nom brut s'il existe, sinon son expansion Cisco, sinon brut ; MAC unique → nom."""

    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "sw-core-01", "Eth1/5"))
        d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "sw-core-01", "00:3a:9c:11:22:02"))

    snap = run(variant(minimal, mutate))
    assert find_link(snap, ("sw-core-02", "Ethernet1/4"), ("sw-core-01", "Ethernet1/5")) is not None
    assert find_link(snap, ("fw-edge-01", "ha1"), ("sw-core-01", "Ethernet1/2")) is not None
    assert snap.report.applied_normalizations == {
        "aggregate_port_to_member": 0,
        "ifname_short_to_long": 2,
        "mac_port_to_interface": 1,
    }
    assert [c for c in snap.checks if c.code == "remote_port_is_mac"] == [
        c for c in run(minimal).checks if c.code == "remote_port_is_mac"
    ]

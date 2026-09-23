"""Les scénarios de docs/05 §5 couverts par l'étape 1 (R0 à R3) : 1, 2, 4, 5, 6, 7."""

from tests.correlate.conftest import checks, find_link, itf, node


def test_scenario_1_peer_link_member_confirmed_with_five_evidences(snapshot):
    link = find_link(snapshot, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1"))
    assert link.status == "confirmed" and link.oper == "up" and link.speed_mbps == 10000
    assert link.aggregate_a == "port-channel10" and link.aggregate_b == "port-channel10"
    sources = sorted(e.source for e in link.evidence)
    assert sources == ["cdp", "description", "description", "lldp", "lldp"]


def test_scenario_2_disagreement_and_operational_state(snapshot):
    link = find_link(snapshot, ("sw-core-01", "Ethernet1/2"), ("sw-core-02", "Ethernet1/2"))
    assert link.status == "confirmed" and link.oper == "down"
    assert len(checks(snapshot, "description_disagrees_with_observed")) == 1


def test_scenario_4_documented_only_toward_fortigate_is_info(snapshot):
    link = find_link(snapshot, ("sw-core-01", "Ethernet1/3"), ("fw-edge-01", "x1"))
    assert link.status == "documented_only" and link.oper == "up" and link.speed_mbps == 10000
    assert (link.a.hostname, link.aggregate_a, link.aggregate_b) == ("fw-edge-01", "agg-core", "port-channel20")
    found = [c for c in checks(snapshot, "documented_not_observed") if c.refs[0].b.interface == "Ethernet1/3"]
    assert len(found) == 1 and found[0].severity == "info"


def test_scenario_5_external_router_with_cisco_expansion(snapshot):
    link = find_link(snapshot, ("sw-core-01", "Ethernet1/4"), ("rt-wan-01", "GigabitEthernet0/0/0"))
    assert link.status == "confirmed" and link.oper == "unknown" and link.speed_mbps is None
    assert sorted(e.source for e in link.evidence) == ["cdp", "description", "lldp"]
    lldp = next(e for e in link.evidence if e.source == "lldp")
    assert lldp.remote_raw.port == "Gi0/0/0" and lldp.remote_resolved.interface == "GigabitEthernet0/0/0"
    assert snapshot.report.applied_normalizations["ifname_short_to_long"] == 1
    assert node(snapshot, "rt-wan-01").kind == "external"


def test_scenario_6_stub_server_seen_by_mac(snapshot):
    stub = node(snapshot, "srv-hyp-07")
    assert stub.kind == "stub" and stub.evidence.capabilities == ("station",)
    link = find_link(snapshot, ("sw-core-02", "Ethernet1/3"), ("srv-hyp-07", "3c:ec:ef:12:34:56"))
    assert link.status == "confirmed"
    described = next(e for e in link.evidence if e.source == "description")
    assert described.remote_resolved.interface == "eno1"
    assert len(checks(snapshot, "neighbor_unknown")) == 1 and len(checks(snapshot, "remote_port_is_mac")) == 1
    assert snapshot.report.unresolved_names == ("srv-hyp-07",)


def test_scenario_7_empty_port_draws_nothing(snapshot):
    assert not [
        link for link in snapshot.links if link.a.interface == "Ethernet1/5" or link.b.interface == "Ethernet1/5"
    ]
    assert not [c for c in snapshot.checks if any(getattr(r, "name", None) == "Ethernet1/5" for r in c.refs)]
    assert itf(snapshot, "sw-core-01", "Ethernet1/5").last_change_age_seconds == "never"


def test_fixture_q1_vpc_cables_are_documented_only(snapshot):
    link = find_link(snapshot, ("sw-core-02", "Ethernet1/4"), ("fw-edge-01", "x2"))
    assert link.status == "documented_only" and (link.aggregate_a, link.aggregate_b) == ("agg-core", "port-channel20")
    assert len(snapshot.links) == 6

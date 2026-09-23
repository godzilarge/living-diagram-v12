"""R3 : des claims aux câbles ; désaccords, deux voisins, réciprocité, documenté sans observation."""

from tests.correlate.conftest import checks, find_link, interface, lldp_doc, run, task_subject, variant


def test_the_three_statuses_and_evidence_order(snapshot, minimal):
    confirmed = find_link(snapshot, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1"))
    assert confirmed.status == "confirmed"
    assert [e.source for e in confirmed.evidence] == ["cdp", "description", "description", "lldp", "lldp"]
    documented = find_link(snapshot, ("sw-core-01", "Ethernet1/3"), ("fw-edge-01", "x1"))
    assert documented.status == "documented_only" and len(documented.evidence) == 2
    by_mac = find_link(snapshot, ("sw-core-02", "Ethernet1/3"), ("srv-hyp-07", "3c:ec:ef:12:34:56"))
    assert by_mac.status == "confirmed"  # description + lldp, accord jugé sur le device (port en MAC)
    seen = variant(minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0")))
    observed = find_link(run(seen), ("sw-core-01", "Ethernet1/5"), ("srv-a", "eth0"))
    assert observed.status == "observed_only" and [e.source for e in observed.evidence] == ["lldp"]


def test_description_disagreeing_with_observed_does_not_draw(snapshot):
    link = find_link(snapshot, ("sw-core-01", "Ethernet1/2"), ("sw-core-02", "Ethernet1/2"))
    assert link.status == "confirmed" and [e.source for e in link.evidence] == ["description", "lldp", "lldp"]
    assert find_link(snapshot, ("sw-core-02", "Ethernet1/2"), ("sw-core-01", "Ethernet1/9")) is None
    found = checks(snapshot, "description_disagrees_with_observed")
    assert len(found) == 1 and found[0].severity == "warning"
    ref = found[0].refs[0]
    assert ref.kind == "interface" and (ref.hostname, ref.name) == ("sw-core-02", "Ethernet1/2")
    assert found[0].details["documented"] == {"hostname": "sw-core-01", "interface": "Ethernet1/9"}
    assert found[0].details["observed"] == [{"hostname": "sw-core-01", "interface": "Ethernet1/2"}]


def test_two_observed_neighbors_on_one_port_draw_two_cables(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-b", "eth0", ("station",)))

    snap = run(variant(minimal, mutate))
    first = find_link(snap, ("sw-core-01", "Ethernet1/5"), ("srv-a", "eth0"))
    second = find_link(snap, ("sw-core-01", "Ethernet1/5"), ("srv-b", "eth0"))
    assert first.status == "observed_only" and second.status == "observed_only"
    found = checks(snap, "multiple_observed_neighbors")
    assert len(found) == 2 and {c.refs[1].kind for c in found} == {"link"}
    for check in found:
        assert (check.refs[0].hostname, check.refs[0].name) == ("sw-core-01", "Ethernet1/5")
        assert check.details["neighbors"] == [
            {"hostname": "srv-a", "interface": "eth0"},
            {"hostname": "srv-b", "interface": "eth0"},
        ]


def test_one_way_observation_only_when_the_other_side_collected_the_protocol(snapshot, minimal):
    assert checks(snapshot, "one_way_observation") == []  # cdp de sw-core-02 en échec, rt-wan-01 hors périmètre
    snap = run(variant(minimal, lambda d: task_subject(d, "sw-core-02", "cdp", "success")))
    found = checks(snap, "one_way_observation")
    assert len(found) == 1 and found[0].details == {"source": "cdp", "expected_from": "sw-core-02"}
    assert found[0].refs[0].kind == "interface" and found[0].refs[0].hostname == "sw-core-01"


def test_documented_not_observed_severity_depends_on_coverage(snapshot, minimal):
    found = checks(snapshot, "documented_not_observed")
    assert {c.severity for c in found} == {"info"}  # fw-edge-01 n'a pas de topic lldp / cdp
    assert len(found) == 2  # Ethernet1/3 ↔ x1 et Ethernet1/4 ↔ x2
    snap = run(variant(minimal, lambda d: task_subject(d, "fw-edge-01", "lldp", "success")))
    assert {c.severity for c in checks(snap, "documented_not_observed")} == {"warning"}


def test_description_without_port_confirms_on_the_device_only(minimal):
    def mutate(d):
        interface(d, "sw-core-01", "Ethernet1/1")["description"] = "C1|sw-core-02|"
        interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|fw-edge-02|"

    snap = run(variant(minimal, mutate))
    link = find_link(snap, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1"))
    assert link.status == "confirmed"
    partial = next(e for e in link.evidence if e.source == "description" and e.witness.hostname == "sw-core-01")
    assert partial.remote_resolved.interface is None and partial.remote_raw.port is None
    assert not [link for link in snap.links if link.a.interface == "Ethernet1/5" or link.b.interface == "Ethernet1/5"]
    assert checks(snap, "documented_not_observed") == checks(run(minimal), "documented_not_observed")


def test_aggregate_interface_descriptions_never_draw_cables(snapshot):
    assert find_link(snapshot, ("sw-core-01", "port-channel10"), ("sw-core-02", "port-channel10")) is None
    po = next(i for i in snapshot.interfaces if i.hostname == "sw-core-01" and i.name == "port-channel10")
    assert po.description_parsed is not None and po.description_parsed.neighbor == "sw-core-02"


def test_unparseable_description_is_counted_and_flagged(minimal):
    snap = run(
        variant(minimal, lambda d: interface(d, "sw-core-01", "Ethernet1/5").update(description="uplink to somewhere"))
    )
    found = checks(snap, "description_unparseable")
    assert len(found) == 1 and found[0].severity == "info"
    assert snap.report.unparseable_descriptions == 1


def test_stub_port_keeps_its_raw_short_form_without_cisco_evidence(minimal):
    snap = run(
        variant(minimal, lambda d: d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "srv-x", "Gi0/1", ("station",))))
    )
    link = next(link for link in snap.links if link.b.hostname == "srv-x")
    assert link.b.interface == "Gi0/1" and snap.report.applied_normalizations["ifname_short_to_long"] == 1


def test_link_speed_is_null_when_the_two_ends_disagree(minimal):
    snap = run(variant(minimal, lambda d: interface(d, "sw-core-02", "Ethernet1/1").update(speed_mbps=1000)))
    assert find_link(snap, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1")).speed_mbps is None


def test_loop_cable_on_one_device_orders_ports_naturally(minimal):
    snap = run(
        variant(
            minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/2", "sw-core-01", "Ethernet1/10"))
        )
    )
    link = find_link(snap, ("sw-core-01", "Ethernet1/2"), ("sw-core-01", "Ethernet1/10"))
    assert (link.a.interface, link.b.interface) == ("Ethernet1/2", "Ethernet1/10")


def test_link_oper_is_unknown_when_one_end_is_unknown(minimal):
    snap = run(variant(minimal, lambda d: interface(d, "sw-core-02", "Ethernet1/1").update(oper_status="unknown")))
    assert find_link(snap, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1")).oper == "unknown"

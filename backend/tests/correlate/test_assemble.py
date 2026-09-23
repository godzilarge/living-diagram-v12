"""Ce que le snapshot recopie du bundle : nœuds, interfaces, couverture, constats du contrat, rapport."""

from tests.correlate.conftest import checks, interface, itf, node, run, task_subject, variant


def test_device_nodes_carry_devices_and_system_fields(snapshot):
    core = node(snapshot, "sw-core-02")
    assert (core.type, core.vendor, core.os_name, core.os_version) == ("switch", "cisco", "NX-OS", "10.4.2")
    assert core.reported_hostname == "SW-CORE-02" and core.uptime_seconds == 9123000 and core.collection == "partial"
    fw = node(snapshot, "fw-edge-01")
    assert fw.virtual_contexts == ("root",) and fw.stack is None and fw.collection == "success"
    dead = node(snapshot, "fw-edge-02")
    assert dead.collection == "unreachable" and dead.reported_hostname is None and dead.evidence is None


def test_stack_comes_from_chassis_members(minimal):
    members = [
        {"slot": 2, "serial": "S2", "model": "C9300", "role": "member", "state": "ready", "priority": 1},
        {"slot": 1, "serial": "S1", "model": "C9300", "role": "active", "state": "ready", "priority": 15},
    ]
    snap = run(
        variant(
            minimal,
            lambda d: next(s for s in d["system"] if s["hostname"] == "sw-core-01").update(chassis_members=members),
        )
    )
    stack = node(snap, "sw-core-01").stack
    assert stack.member_count == 2 and [m.slot for m in stack.members] == [1, 2]


def test_coverage_follows_tasks_and_missing_task_is_not_collected(snapshot, minimal):
    by_host = {c.hostname: c for c in snapshot.coverage}
    assert by_host["sw-core-02"].status == "partial" and by_host["sw-core-02"].topics.cdp == "failed"
    assert by_host["fw-edge-01"].topics.lldp == "absent" and by_host["fw-edge-01"].topics.ha == "success"
    assert by_host["fw-edge-02"].status == "unreachable" and by_host["fw-edge-02"].topics.interfaces == "absent"
    snap = run(variant(minimal, lambda d: d["tasks"].pop()))
    assert next(c for c in snap.coverage if c.hostname == "fw-edge-02").status == "not_collected"
    assert node(snap, "fw-edge-02").collection == "not_collected"


def test_interfaces_carry_membership_roles_and_parsed_description(snapshot):
    eth = itf(snapshot, "sw-core-01", "Ethernet1/1")
    assert eth.aggregate.name == "port-channel10" and eth.aggregate.member_status == "bundled"
    assert eth.roles == ("mlag_peer_link",)
    assert eth.description_parsed.criticality == "C1" and eth.description == "C1|sw-core-02|Ethernet1/1|"
    assert itf(snapshot, "fw-edge-01", "ha1").roles == ("heartbeat",)
    assert itf(snapshot, "fw-edge-01", "x1").aggregate.name == "agg-core"
    assert itf(snapshot, "sw-core-01", "Ethernet1/5").description_parsed is None


def test_membership_falls_back_to_interfaces_members_without_aggregates_topic(minimal):
    def topic_not_collected(d):
        d["aggregates"].clear()
        for task in d["tasks"]:
            task["status_per_subject"].pop("aggregates", None)

    eth = itf(run(variant(minimal, topic_not_collected)), "sw-core-01", "Ethernet1/1")
    assert eth.aggregate.name == "port-channel10" and eth.aggregate.member_status is None
    assert eth.roles == ()


def test_membership_falls_back_when_the_aggregates_topic_failed(minimal):
    def topic_failed(d):
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != "sw-core-01"]
        task_subject(d, "sw-core-01", "aggregates", "failed")

    snap = run(variant(minimal, topic_failed))
    assert itf(snap, "sw-core-01", "Ethernet1/1").aggregate.member_status is None  # repli : statut non lu
    assert itf(snap, "sw-core-02", "Ethernet1/1").aggregate.member_status is not None  # aggregates[] fait foi


def test_allowed_vlans_are_merged_and_sorted(minimal):
    ranges = [{"first": 100, "last": 100}, {"first": 21, "last": 30}, {"first": 10, "last": 20}]
    snap = run(variant(minimal, lambda d: interface(d, "sw-core-01", "Ethernet1/1").update(allowed_vlans=ranges)))
    merged = itf(snap, "sw-core-01", "Ethernet1/1").allowed_vlans
    assert [(r.first, r.last) for r in merged] == [(10, 30), (100, 100)]


def test_bundle_findings_are_recopied_with_origin_bundle(snapshot, minimal):
    assert [c for c in snapshot.checks if c.origin == "bundle"] == []
    snap = run(variant(minimal, lambda d: interface(d, "fw-edge-01", "agg-core.400").update(parent_interface="ghost")))
    found = checks(snap, "parent_interface_unknown")
    assert len(found) == 1 and found[0].origin == "bundle" and found[0].severity == "warning"
    assert found[0].refs[0].kind == "node" and found[0].refs[0].hostname == "fw-edge-01"
    assert found[0].details["ref"] == "agg-core.400 → ghost"


def test_source_and_report(snapshot, minimal):
    assert (
        snapshot.source.infrastructure == "infra-lab" and snapshot.source.collector_run_id == "66db3f0e9a1c2b0012f4a7d1"
    )
    assert snapshot.source.run.status == "completed" and len(snapshot.source.bundle_sha256) == 64
    assert snapshot.report.residual_normalizations == {"duplex_vendor_form": 3, "mac_dotted_to_colon": 14}
    assert snapshot.report.counts.nodes == len(snapshot.nodes) and snapshot.report.counts.links == 6
    assert snapshot.report.applied_normalizations == {
        "aggregate_port_to_member": 0,
        "ifname_short_to_long": 1,
        "mac_port_to_interface": 0,
    }

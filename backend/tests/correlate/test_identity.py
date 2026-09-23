"""R0 : résolution ordonnée des voisins ; ce qui devient device, external ou stub."""

from tests.correlate.conftest import checks, lldp_doc, node, run, variant


def test_exact_name_resolves_without_check(snapshot):
    assert node(snapshot, "sw-core-02").kind == "device"
    assert checks(snapshot, "neighbor_name_case_differs") == []


def test_case_difference_resolves_with_an_info(minimal):
    snap = run(
        variant(minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "SW-CORE-02", "Ethernet1/5")))
    )
    found = checks(snap, "neighbor_name_case_differs")
    assert len(found) == 1 and found[0].severity == "info"
    assert found[0].refs[0].kind == "interface" and found[0].refs[0].name == "Ethernet1/5"
    assert node(snap, "SW-CORE-02") is None and node(snap, "sw-core-02").kind == "device"


def test_reported_hostname_resolves_with_a_warning(minimal):
    def mutate(d):
        next(s for s in d["system"] if s["hostname"] == "sw-core-02")["reported_hostname"] = "core2"
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "core2", "Ethernet1/5"))

    snap = run(variant(minimal, mutate))
    found = checks(snap, "neighbor_resolved_by_reported_hostname")
    assert len(found) == 1 and found[0].severity == "warning"
    assert node(snap, "core2") is None
    link = next(link for link in snap.links if link.a.interface == "Ethernet1/5")
    assert link.b.hostname == "sw-core-02" and link.evidence[0].resolution == "reported_hostname"


def test_mac_and_ip_names_resolve_by_address(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "00:3a:9c:33:44:03", "Ethernet1/5"))
        d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "192.0.2.0", "Ethernet1/4"))

    snap = run(variant(minimal, mutate))
    found = checks(snap, "neighbor_resolved_by_address")
    assert len(found) == 2 and {c.severity for c in found} == {"warning"}
    by_mac = next(link for link in snap.links if link.a.interface == "Ethernet1/5")
    assert by_mac.b.hostname == "sw-core-02" and by_mac.evidence[0].resolution == "address"
    by_ip = next(link for link in snap.links if link.a.interface == "ha1")
    assert by_ip.b.hostname == "sw-core-01" and by_ip.b.interface == "Ethernet1/4"


def test_ambiguous_address_gives_a_stub_and_a_warning(minimal):
    def mutate(d):
        for i in d["interfaces"]:
            if i["hostname"] == "fw-edge-01" and i["name"] == "x2":
                i["mac_address"] = "00:3a:9c:33:44:03"
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "00:3a:9c:33:44:03", "Ethernet1/5"))

    snap = run(variant(minimal, mutate))
    assert len(checks(snap, "neighbor_name_ambiguous")) == 1
    stub = node(snap, "00:3a:9c:33:44:03")
    assert stub is not None and stub.kind == "stub"
    assert "00:3a:9c:33:44:03" in snap.report.unresolved_names


def _wan_port(d: dict) -> dict:
    return next(i for i in d["interfaces"] if i["hostname"] == "sw-core-01" and i["name"] == "Ethernet1/4")


def test_other_infrastructure_device_becomes_external_only_when_cited(snapshot, minimal):
    external = node(snapshot, "rt-wan-01")
    assert external.kind == "external" and external.type == "router" and external.collection is None
    assert external.evidence is not None and [s.source for s in external.evidence.seen_by] == [
        "cdp",
        "description",
        "lldp",
    ]
    assert external.evidence.capabilities == ("router",)
    uncited = run(
        variant(minimal, lambda d: (d["lldp"].clear(), d["cdp"].clear(), _wan_port(d).update(description=None)))
    )
    assert node(uncited, "rt-wan-01") is None


def test_unknown_name_becomes_a_casefolded_stub(minimal):
    snap = run(
        variant(
            minimal,
            lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "Srv-New-01", "eth0", ("station",))),
        )
    )
    stub = node(snap, "srv-new-01")
    assert stub is not None and stub.kind == "stub" and stub.type is None
    assert stub.evidence.capabilities == ("station",)
    assert stub.evidence.seen_by[0].hostname == "sw-core-01" and stub.evidence.seen_by[0].interface == "Ethernet1/5"
    assert "Srv-New-01" in snap.report.unresolved_names
    assert len(checks(snap, "neighbor_unknown")) == 2  # srv-hyp-07 de la fixture + celui-ci


def test_nodes_are_sorted_by_kind_then_hostname(snapshot):
    kinds = [n.kind for n in snapshot.nodes]
    assert kinds == sorted(kinds)
    assert [n.hostname for n in snapshot.nodes if n.kind == "device"] == [
        "fw-edge-01",
        "fw-edge-02",
        "sw-core-01",
        "sw-core-02",
    ]


def test_ambiguous_reported_hostname_gives_a_stub(minimal):
    def mutate(d):
        for s in d["system"]:
            s["reported_hostname"] = "core"
        d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "core", "Ethernet1/5"))

    snap = run(variant(minimal, mutate))
    assert len(checks(snap, "neighbor_name_ambiguous")) == 1 and node(snap, "core").kind == "stub"


def test_unknown_address_becomes_a_stub(minimal):
    snap = run(variant(minimal, lambda d: d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "00:11:22:33:44:55", "eth0"))))
    stub = node(snap, "00:11:22:33:44:55")
    assert stub is not None and stub.kind == "stub"
    assert len(checks(snap, "neighbor_unknown")) == 2 and len(checks(snap, "neighbor_resolved_by_address")) == 0

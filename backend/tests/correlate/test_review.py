"""Points de la revue indépendante de l'étape 1 (2026-09-20) : chaque test reproduit une sonde du rapport."""

import copy
import random

from ld_contracts.snapshot.serialize import canonical_json

from tests.correlate.conftest import checks, find_link, interface, itf, lldp_doc, node, run, task_subject, variant

SHA = "0" * 64


def test_c1_check_on_an_unknown_local_port_refers_to_the_node(minimal):
    snap = run(variant(minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/99", "srv-z", "eth0"))))
    found = checks(snap, "neighbor_unknown")
    mine = next(c for c in found if c.details.get("neighbor") == "srv-z")
    assert (
        mine.refs[0].kind == "node"
        and mine.refs[0].hostname == "sw-core-01"
        and mine.details["interface"] == "Ethernet1/99"
    )
    assert find_link(snap, ("sw-core-01", "Ethernet1/99"), ("srv-z", "eth0")) is not None


def test_c1_interfaces_topic_failed_with_lldp_success_still_correlates(minimal):
    def mutate(d):
        d["interfaces"] = [i for i in d["interfaces"] if i["hostname"] != "sw-core-02"]
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != "sw-core-02"]
        task_subject(d, "sw-core-02", "interfaces", "failed")

    snap = run(variant(minimal, mutate))
    link = find_link(snap, ("sw-core-01", "Ethernet1/1"), ("sw-core-02", "Ethernet1/1"))
    assert link is not None and link.oper == "unknown"
    assert next(c for c in snap.coverage if c.hostname == "sw-core-02").topics.interfaces == "failed"


def _ring(minimal: dict, devices: int, ports: int) -> dict:
    """Anneau synthétique : chaque device voit `ports` voisins en LLDP, réciproquement."""
    device, task = minimal["devices"][0], minimal["tasks"][0]
    port = interface(minimal, "sw-core-01", "Ethernet1/1")
    sections = ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")
    doc = {**{k: v for k, v in minimal.items() if k not in sections}, **{k: [] for k in sections}}
    names = [f"sw-{n:03d}" for n in range(devices)]
    for n, host in enumerate(names):
        doc["devices"].append({**device, "hostname": host, "serial_number": None})
        doc["tasks"].append({**copy.deepcopy(task), "hostname": host})
        for k in range(1, ports + 1):
            doc["interfaces"].append({**port, "hostname": host, "name": f"Ethernet1/{k}", "description": None})
            doc["lldp"].append(lldp_doc(host, f"Ethernet1/{k}", names[(n + k) % devices], f"Ethernet1/{k}"))
    return doc


def test_c2_names_are_expanded_once_per_claim_not_once_per_comparison(minimal, monkeypatch):
    """Compte les expansions de noms, pas les secondes : l'ancienne réciprocité en coûtait 2 n² (80 000 ici)."""
    from ld_backend.correlate import cisco

    calls = 0
    original = cisco.expand_cisco

    def counting(name: str) -> str | None:
        nonlocal calls
        calls += 1
        return original(name)

    monkeypatch.setattr(cisco, "expand_cisco", counting)
    snap = run(_ring(minimal, devices=40, ports=5), SHA)
    assert snap.report.counts.nodes == 40 and len(snap.links) == 200
    assert calls <= 5 * 200  # 200 claims : une résolution de port et deux clés par claim


def test_h1_hub_checks_are_deterministic_and_list_the_neighbors(minimal):
    def hub(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))
        d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "sw-core-01", "Ethernet1/5"))

    base = variant(minimal, hub)
    reference = canonical_json(run(base, SHA))
    found = checks(run(base), "multiple_observed_neighbors")
    assert len(found) == 2
    for check in found:
        witness = next(r for r in check.refs if r.kind == "interface")
        assert (witness.hostname, witness.name) == ("sw-core-01", "Ethernet1/5")
        assert check.details["neighbors"] == [
            {"hostname": "srv-a", "interface": "eth0"},
            {"hostname": "sw-core-02", "interface": "Ethernet1/4"},
        ]
    for seed in range(4):
        shuffled = copy.deepcopy(base)
        random.Random(seed).shuffle(shuffled["lldp"])
        assert canonical_json(run(shuffled, SHA)) == reference


def test_h2_self_observation_draws_nothing_and_warns(minimal):
    snap = run(
        variant(minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-01", "Ethernet1/5")))
    )
    assert not [link for link in snap.links if link.a.interface == "Ethernet1/5" or link.b.interface == "Ethernet1/5"]
    found = checks(snap, "self_observation")
    assert len(found) == 1 and found[0].severity == "warning" and found[0].refs[0].name == "Ethernet1/5"
    assert found[0].details == {"source": "lldp"}


def test_h2_a_description_citing_its_own_port_draws_nothing_either(minimal):
    snap = run(
        variant(
            minimal, lambda d: interface(d, "sw-core-01", "Ethernet1/5").update(description="C1|sw-core-01|Eth1/5|")
        )
    )
    assert not [link for link in snap.links if link.a.interface == "Ethernet1/5" or link.b.interface == "Ethernet1/5"]
    assert [c.details for c in checks(snap, "self_observation")] == [{"source": "description"}]


def test_b1_a_code_with_two_severities_demands_an_explicit_choice():
    import pytest
    from ld_contracts.snapshot.codes import CheckCode

    from ld_backend.correlate.checkbuild import sole_severity

    assert sole_severity(CheckCode.SELF_OBSERVATION) == "warning"
    with pytest.raises(ValueError, match="documented_not_observed"):
        sole_severity(CheckCode.DOCUMENTED_NOT_OBSERVED)


def test_m1_disagreement_details_do_not_depend_on_document_order(minimal):
    """Deux formes brutes du même port (courte, longue) dans un même groupe : le détail ne suit pas l'ordre."""

    def mutate(d):
        interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|srv-x|eth9|"
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-x", "Gi0/1", ("station",)))
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-x", "GigabitEthernet0/1", ("station",)))

    base = variant(minimal, mutate)
    reference = canonical_json(run(base, SHA))
    found = checks(run(base), "description_disagrees_with_observed")
    mine = next(c for c in found if c.refs[0].name == "Ethernet1/5")
    assert mine.details["observed"] == [{"hostname": "srv-x", "interface": "GigabitEthernet0/1"}]
    swapped = copy.deepcopy(base)
    swapped["lldp"] = swapped["lldp"][::-1]
    assert canonical_json(run(swapped, SHA)) == reference


def test_m2_disagreement_is_judged_per_endpoint_whoever_observed(minimal):
    """sw-core-01/Ethernet1/3 observe fw-edge-01/x1 ; la description de x1 dit Ethernet1/5 : un câble, un désaccord."""

    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "x1"))
        interface(d, "fw-edge-01", "x1")["description"] = "C2|sw-core-01|Ethernet1/5|"

    snap = run(variant(minimal, mutate))
    link = find_link(snap, ("sw-core-01", "Ethernet1/3"), ("fw-edge-01", "x1"))
    assert link.status == "confirmed" and [e.source for e in link.evidence] == ["description", "lldp"]
    assert find_link(snap, ("sw-core-01", "Ethernet1/5"), ("fw-edge-01", "x1")) is None
    found = [c for c in checks(snap, "description_disagrees_with_observed") if c.refs[0].hostname == "fw-edge-01"]
    assert len(found) == 1 and found[0].refs[0].name == "x1"
    assert found[0].details["observed"] == [{"hostname": "sw-core-01", "interface": "Ethernet1/3"}]


def test_m2_a_description_never_adds_a_cable_to_a_port_that_has_an_observed_one(minimal):
    """x1 documente sw-core-01/Ethernet1/5, qui observe srv-a : l'observé garde le port, rien n'est dessiné en plus."""

    def mutate(d):
        interface(d, "fw-edge-01", "x1")["description"] = "C2|sw-core-01|Ethernet1/5|"
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0", ("station",)))

    snap = run(variant(minimal, mutate))
    assert find_link(snap, ("sw-core-01", "Ethernet1/5"), ("srv-a", "eth0")).status == "observed_only"
    assert find_link(snap, ("sw-core-01", "Ethernet1/5"), ("fw-edge-01", "x1")) is None
    found = [c for c in checks(snap, "description_disagrees_with_observed") if c.refs[0].hostname == "fw-edge-01"]
    assert len(found) == 1 and found[0].details == {
        "documented": {"hostname": "sw-core-01", "interface": "Ethernet1/5"},
        "observed_at": {"hostname": "sw-core-01", "interface": "Ethernet1/5"},
        "observed": [{"hostname": "srv-a", "interface": "eth0"}],
    }


def test_m3_unresolved_mac_on_a_collected_device_stays_one_cable(minimal):
    """sw-core-01/Ethernet1/3 observe fw-edge-01 par une MAC qu'aucune interface ne porte ; x1 documente Ethernet1/3.

    Le port a une observation : la description d'en face ne dessine pas un second câble (accord jugé sur le
    device) et ne s'y rattache pas non plus : une évidence témoigne depuis un bout du lien, et le bout reste
    `(fw-edge-01, MAC)`, stable que la description existe ou non.
    """
    mac = "70:4c:a5:ff:ff:01"
    snap = run(variant(minimal, lambda d: d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", mac))))
    link = find_link(snap, ("sw-core-01", "Ethernet1/3"), ("fw-edge-01", mac))
    assert link is not None and link.status == "confirmed"
    assert [(e.source, e.witness.hostname) for e in link.evidence] == [
        ("description", "sw-core-01"),
        ("lldp", "sw-core-01"),
    ]
    assert not [c for c in checks(snap, "description_disagrees_with_observed") if c.refs[0].hostname == "fw-edge-01"]
    assert find_link(snap, ("sw-core-01", "Ethernet1/3"), ("fw-edge-01", "x1")) is None
    assert len(checks(snap, "remote_port_is_mac")) == 2


def test_m4_a_description_without_port_confirms_only_when_there_is_one_candidate(minimal):
    def mutate(d):
        interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|sw-core-02|"
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"))
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/5"))

    snap = run(variant(minimal, mutate))
    for port in ("Ethernet1/4", "Ethernet1/5"):
        assert find_link(snap, ("sw-core-01", "Ethernet1/5"), ("sw-core-02", port)).status == "observed_only"
    assert len(checks(snap, "multiple_observed_neighbors")) == 2  # l'anomalie est déjà dite, pas de désaccord en plus
    assert not [c for c in checks(snap, "description_disagrees_with_observed") if c.refs[0].name == "Ethernet1/5"]


def test_m5_cisco_vendor_is_recognised_whatever_its_spelling(minimal):
    def mutate(d):
        next(dev for dev in d["devices"] if dev["hostname"] == "rt-wan-01")["vendor"] = "Cisco Systems"
        d["cdp"] = [c for c in d["cdp"] if c["local_interface"] != "Ethernet1/4"]

    snap = run(variant(minimal, mutate))
    link = find_link(snap, ("sw-core-01", "Ethernet1/4"), ("rt-wan-01", "GigabitEthernet0/0/0"))
    lldp = next(e for e in link.evidence if e.source == "lldp")
    assert lldp.remote_resolved.interface == "GigabitEthernet0/0/0"
    assert snap.report.applied_normalizations["ifname_short_to_long"] == 1


def test_m6_ipv6_is_matched_on_its_value_not_its_spelling(minimal):
    def mutate(d):
        interface(d, "sw-core-01", "Ethernet1/4")["ip_addresses"].append(
            {"address": "2001:db8::1", "prefix": 64, "family": 6, "role": "primary"}
        )
        d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "2001:DB8:0::1", "Ethernet1/4"))

    snap = run(variant(minimal, mutate))
    assert find_link(snap, ("fw-edge-01", "ha1"), ("sw-core-01", "Ethernet1/4")) is not None
    assert node(snap, "2001:db8::1") is None


def test_m7_membership_fallback_only_when_the_aggregates_topic_is_not_a_success(minimal):
    without_docs = run(variant(minimal, lambda d: d["aggregates"].clear()))
    assert (
        itf(without_docs, "sw-core-01", "Ethernet1/1").aggregate is None
    )  # topic collecté, aucun agrégat : rien à déduire

    def absent(d):
        d["aggregates"].clear()
        for t in d["tasks"]:
            t["status_per_subject"].pop("aggregates", None)

    fallback = run(variant(minimal, absent))
    assert itf(fallback, "sw-core-01", "Ethernet1/1").aggregate.name == "port-channel10"


def test_b10_only_cable_bearing_interfaces_are_flagged_for_free_text(minimal):
    snap = run(variant(minimal, lambda d: interface(d, "fw-edge-01", "agg-core").update(description="uplink core")))
    assert checks(snap, "description_unparseable") == [] and snap.report.unparseable_descriptions == 0
    assert itf(snap, "fw-edge-01", "agg-core").description == "uplink core"

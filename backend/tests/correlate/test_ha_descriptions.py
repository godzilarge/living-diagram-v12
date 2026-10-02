"""R2, forme HA (2026-10-02) : la configuration d'un cluster FortiGate est partagée, chaque membre lit sa paire.

Scénario 11 (`ha_pair_variant`) : les deux membres répondent, `x1` et `x2` portent la même description aux deux bouts,
chaque cœur documente son port vers le membre qu'il voit. Rien n'est observé : les firewalls n'ont pas de LLDP.
"""

import pytest

from tests.correlate.conftest import (
    CORE_1,
    CORE_2,
    FW_1,
    FW_2,
    checks,
    find_link,
    ha_pair_variant,
    interface,
    itf,
    lldp_doc,
    run,
    task_subject,
    variant,
)

HA_UNRESOLVED = "description_ha_unresolved"


@pytest.fixture(scope="module")
def pair(minimal):
    return run(variant(minimal, ha_pair_variant))


def test_each_member_gets_its_own_cable(pair):
    expected = [
        ((FW_1, "x1"), (CORE_1, "Ethernet1/3")),
        ((FW_2, "x1"), (CORE_1, "Ethernet1/5")),
        ((FW_1, "x2"), (CORE_2, "Ethernet1/4")),
        ((FW_2, "x2"), (CORE_2, "Ethernet1/6")),
    ]
    for a, b in expected:
        link = find_link(pair, a, b)
        assert link is not None and link.status == "documented_only", (a, b)
        assert {e.witness.hostname for e in link.evidence} == {a[0], b[0]}
    assert find_link(pair, (FW_2, "x1"), (CORE_1, "Ethernet1/3")) is None


def test_the_parsed_description_is_the_member_pair(pair):
    parsed = itf(pair, FW_2, "x1").description_parsed
    assert (parsed.criticality, parsed.neighbor, parsed.port, parsed.options) == ("C2", CORE_1, "Ethernet1/5", None)
    assert itf(pair, FW_1, "x1").description_parsed.port == "Ethernet1/3"


def test_nothing_is_left_unread(pair, snapshot):
    assert checks(pair, HA_UNRESOLVED) == [] and checks(pair, "description_unparseable") == []
    assert pair.report.unparseable_descriptions == 0
    disagreements = "description_disagrees_with_observed"  # la fixture en a un (scénario 5), pas un de plus
    assert len(checks(pair, disagreements)) == len(checks(snapshot, disagreements))


def test_the_real_case_lldp_to_the_aggregate_and_the_ha_form(minimal):
    """Le cas d'Orhan : le cœur voit `agg-core` en port-id (R1-bis), la description de chaque membre nomme son port."""

    def mutate(d):
        ha_pair_variant(d)
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/3", FW_1, "agg-core", ("router",)))
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/5", FW_2, "agg-core", ("router",)))
        d["aggregates"].append({**_aggregate(d, FW_1, "agg-core"), "hostname": FW_2})
        task_subject(d, FW_2, "aggregates", "success")

    snap = run(variant(minimal, mutate))
    assert find_link(snap, (FW_1, "x1"), (CORE_1, "Ethernet1/3")).status == "confirmed"
    assert find_link(snap, (FW_2, "x1"), (CORE_1, "Ethernet1/5")).status == "confirmed"
    assert checks(snap, "remote_port_is_aggregate") == [] and checks(snap, HA_UNRESOLVED) == []
    disagreements = checks(snap, "description_disagrees_with_observed")
    assert not [c for c in disagreements if {r.hostname for r in c.refs if r.kind == "interface"} & {FW_1, FW_2}]


def _aggregate(d: dict, hostname: str, name: str) -> dict:
    return next(a for a in d["aggregates"] if a["hostname"] == hostname and a["name"] == name)


def test_equal_priorities_draw_no_cable_from_the_firewalls(minimal):
    snap = run(variant(minimal, lambda d: ha_pair_variant(d, priorities=(200, 200))))
    found = checks(snap, HA_UNRESOLVED)
    assert sorted((c.refs[0].hostname, c.refs[0].name) for c in found) == [
        (FW_1, "x1"),
        (FW_1, "x2"),
        (FW_2, "x1"),
        (FW_2, "x2"),
    ]
    assert all(c.severity == "warning" and c.refs[0].kind == "interface" for c in found)
    assert all(c.details["reason"] == "priority_undecided" for c in found)
    assert found[0].details["priorities"] == [{"hostname": FW_1, "priority": 200}, {"hostname": FW_2, "priority": 200}]
    link = find_link(snap, (FW_2, "x1"), (CORE_1, "Ethernet1/5"))  # le cœur, lui, documente toujours son port
    assert [e.witness.hostname for e in link.evidence] == [CORE_1]
    assert itf(snap, FW_2, "x1").description_parsed is None and snap.report.unparseable_descriptions == 0


def test_more_pairs_than_members_draws_nothing(minimal):  # revue, H3 : un membre disparu décalerait les rangs
    def mutate(d):
        ha_pair_variant(d)
        text = f"C2|{CORE_1}|Ethernet1/1|{CORE_1}|Ethernet1/3|{CORE_1}|Ethernet1/5"
        interface(d, FW_1, "x1")["description"] = interface(d, FW_2, "x1")["description"] = text

    snap = run(variant(minimal, mutate))
    found = checks(snap, HA_UNRESOLVED)
    assert sorted((c.refs[0].hostname, c.refs[0].name) for c in found) == [(FW_1, "x1"), (FW_2, "x1")]
    expected = {"reason": "field_count_mismatch", "members": [FW_1, FW_2], "fields": 7, "expected_fields": 5}
    assert found[0].details == expected
    assert find_link(snap, (FW_2, "x1"), (CORE_1, "Ethernet1/3")) is None
    assert [e.witness.hostname for e in find_link(snap, (FW_1, "x1"), (CORE_1, "Ethernet1/3")).evidence] == [CORE_1]


def test_without_a_cluster_the_same_text_is_read_as_v1(minimal):  # revue, H1 : aucun câble V1 perdu
    def mutate(d):
        d["ha"] = []
        interface(d, FW_1, "x1")["description"] = f"C2|{CORE_1}|Ethernet1/3|{CORE_1}|Ethernet1/5"
        interface(d, CORE_1, "Ethernet1/4")["description"] = "C3|rt-wan-01|GigabitEthernet0/0/0|backup|10G"

    snap = run(variant(minimal, mutate))
    assert checks(snap, HA_UNRESOLVED) == [] and snap.report.unparseable_descriptions == 0
    parsed = itf(snap, FW_1, "x1").description_parsed
    assert (parsed.neighbor, parsed.port, parsed.options) == (CORE_1, "Ethernet1/3", f"{CORE_1}|Ethernet1/5")
    link = find_link(snap, (FW_1, "x1"), (CORE_1, "Ethernet1/3"))
    assert {e.witness.hostname for e in link.evidence} == {FW_1, CORE_1}
    assert itf(snap, CORE_1, "Ethernet1/4").description_parsed.options == "backup|10G"


def test_a_ghost_member_does_not_shift_the_ranks(minimal):  # revue, M2
    def mutate(d):
        ha_pair_variant(d)
        ghost = {"name": "fw-ghost", "serial": None, "role": "secondary", "state": "up", "priority": 10}
        d["ha"][1]["members"].append(ghost)

    snap = run(variant(minimal, mutate))
    assert checks(snap, HA_UNRESOLVED) == [] and len(snap.ha_clusters) == 1
    assert itf(snap, FW_2, "x1").description_parsed.port == "Ethernet1/5"


def test_only_cable_bearing_ports_are_checked(minimal):
    def mutate(d):
        ha_pair_variant(d)
        interface(d, FW_1, "agg-core")["description"] = f"C2|{CORE_1}|port-channel20|{CORE_2}|port-channel20|x"

    snap = run(variant(minimal, mutate))
    assert checks(snap, HA_UNRESOLVED) == [] and itf(snap, FW_1, "agg-core").description_parsed is None

"""R4 : agrégats, faisceaux, domaines MLAG et clusters HA (docs/05 §2.4, §2.5, R4 ; scénarios 2, 3, 8).

Décisions (2026-09-26) : `aggregates[]` du snapshot ne reprend que les documents `aggregates[]` du bundle ; la
paire MLAG se détermine par le peer-link câblé (un numéro de vPC est local à un domaine), à défaut par un
`mlag_id` partagé par exactement deux devices ; en HA, la vue d'un membre sur lui-même prime, les autres champs
suivent le premier rapporteur, tout désaccord est un `ha_view_mismatch`.
"""

import copy

import pytest
from ld_contracts.snapshot.serialize import canonical_json
from pydantic import ValidationError

from tests.correlate.conftest import checks, find_link, interface, itf, lldp_doc, run, task_subject, variant

CORE_1, CORE_2, FW_1, FW_2 = "sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02"


def aggregate(snapshot, hostname: str, name: str):
    return next((a for a in snapshot.aggregates if a.hostname == hostname and a.name == name), None)


def aggregate_doc(doc: dict, hostname: str, name: str) -> dict:
    return next(a for a in doc["aggregates"] if a["hostname"] == hostname and a["name"] == name)


def cluster(snapshot, *members: str):
    return next((c for c in snapshot.ha_clusters if tuple(m.hostname for m in c.members) == members), None)


def ends(link) -> set:
    return {(link.a.hostname, link.a.interface), (link.b.hostname, link.b.interface)}


# --- agrégats ---------------------------------------------------------------------------------------------------


def test_aggregates_are_copied_with_their_cables_and_counted(snapshot):
    assert [(a.hostname, a.name) for a in snapshot.aggregates] == [
        (FW_1, "agg-core"),
        (CORE_1, "port-channel10"),
        (CORE_1, "port-channel20"),
        (CORE_2, "port-channel10"),
        (CORE_2, "port-channel20"),
    ]
    peer = aggregate(snapshot, CORE_1, "port-channel10")
    assert (peer.protocol, peer.lacp_mode, peer.min_links, peer.mlag_peer_link, peer.degraded) == (
        "lacp",
        "active",
        1,
        True,
        False,
    )
    assert [m.name for m in peer.members] == ["Ethernet1/1", "Ethernet1/2"]
    assert [ends(c) for c in peer.cables] == [
        {(CORE_1, "Ethernet1/1"), (CORE_2, "Ethernet1/1")},
        {(CORE_1, "Ethernet1/2"), (CORE_2, "Ethernet1/2")},
    ]
    fortigate = aggregate(snapshot, FW_1, "agg-core")
    assert len(fortigate.cables) == 2 and all(FW_1 in {e[0] for e in ends(c)} for c in fortigate.cables)
    assert snapshot.report.counts.aggregates == 5
    assert itf(snapshot, CORE_1, "Ethernet1/1").roles == ("mlag_peer_link",)


def test_scenario_2_a_suspended_member_degrades_its_aggregate(snapshot):
    degraded = aggregate(snapshot, CORE_2, "port-channel10")
    assert degraded.degraded is True
    found = checks(snapshot, "aggregate_member_not_bundled")
    assert len(found) == 1
    check = found[0]
    assert check.severity == "warning" and check.details == {"member": "Ethernet1/2", "status": "suspended"}
    assert [(r.kind, r.hostname, r.name) for r in check.refs] == [
        ("aggregate", CORE_2, "port-channel10"),
        ("interface", CORE_2, "Ethernet1/2"),
    ]


def test_bundled_members_below_min_links_is_an_error(minimal):
    snap = run(variant(minimal, lambda d: aggregate_doc(d, CORE_2, "port-channel10").update(min_links=2)))
    found = checks(snap, "aggregate_below_min_links")
    assert len(found) == 1 and found[0].severity == "error"
    assert found[0].details == {"min_links": 2, "bundled": 1}
    assert [(r.kind, r.hostname, r.name) for r in found[0].refs] == [("aggregate", CORE_2, "port-channel10")]
    assert checks(run(minimal), "aggregate_below_min_links") == []


def test_protocol_mismatch_is_judged_per_beam(minimal):
    snap = run(variant(minimal, lambda d: aggregate_doc(d, FW_1, "agg-core").update(protocol="static", lacp_mode=None)))
    found = checks(snap, "aggregate_protocol_mismatch")
    assert [[(r.hostname, r.name) for r in c.refs] for c in found] == [
        [(FW_1, "agg-core"), (CORE_1, "port-channel20")],
        [(FW_1, "agg-core"), (CORE_2, "port-channel20")],
    ]
    assert found[0].severity == "error"
    assert found[0].details == {
        "protocols": [
            {"hostname": FW_1, "aggregate": "agg-core", "protocol": "static"},
            {"hostname": CORE_1, "aggregate": "port-channel20", "protocol": "lacp"},
        ],
        "cable_statuses": ["documented_only"],
    }


def test_a_member_known_only_through_interfaces_members_makes_no_aggregate_entry(minimal):
    def mutate(d):
        task_subject(d, FW_1, "aggregates", "failed")
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != FW_1]

    snap = run(variant(minimal, mutate))
    assert aggregate(snap, FW_1, "agg-core") is None
    membership = itf(snap, FW_1, "x1").aggregate
    assert (membership.name, membership.member_status) == ("agg-core", None)
    link = find_link(snap, (CORE_1, "Ethernet1/3"), (FW_1, "x1"))
    assert link.aggregate_a == "agg-core"  # l'appartenance reste visible sur le câble
    assert snap.mlag_domains[0].downstream == FW_1


def test_a_cable_stopped_at_the_aggregate_is_not_one_of_its_cables(minimal):
    """R1-bis indéterminé : le câble touche `agg-core` lui-même, pas un membre ; il n'entre pas dans `cables`."""

    def mutate(d):
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/3", FW_1, "agg-core", ("router",)))
        d["lldp"].append(lldp_doc(CORE_2, "Ethernet1/4", FW_1, "agg-core", ("router",)))
        for host, name in ((CORE_1, "Ethernet1/3"), (CORE_2, "Ethernet1/4"), (FW_1, "x1"), (FW_1, "x2")):
            interface(d, host, name)["description"] = None

    snap = run(variant(minimal, mutate))
    assert checks(snap, "remote_port_is_aggregate")
    assert aggregate(snap, FW_1, "agg-core").cables == ()
    assert aggregate(snap, CORE_1, "port-channel20").cables[0].a.interface == "agg-core"


# --- MLAG -------------------------------------------------------------------------------------------------------


def test_scenario_3_the_vpc_domain_is_paired_by_its_peer_link(snapshot):
    assert len(snapshot.mlag_domains) == 1 and snapshot.report.counts.mlag_domains == 1
    domain = snapshot.mlag_domains[0]
    assert domain.mlag_id == 20
    assert [(m.hostname, m.aggregate) for m in domain.members] == [
        (CORE_1, "port-channel20"),
        (CORE_2, "port-channel20"),
    ]
    assert (domain.peer_link.hostname, domain.peer_link.aggregate) == (CORE_1, "port-channel10")
    assert domain.downstream == FW_1
    assert checks(snapshot, "mlag_downstream_inconsistent") == [] and checks(snapshot, "mlag_pair_direct_link") == []


def test_the_same_vpc_number_in_two_pairs_gives_two_domains(minimal):
    """Un numéro de vPC est local à son domaine : deux paires de cœurs peuvent avoir chacune un vPC 20."""
    snap = run(variant(minimal, _second_pair_with_vpc_20))
    domains = [
        (d.mlag_id, [m.hostname for m in d.members], d.peer_link.hostname, d.downstream) for d in snap.mlag_domains
    ]
    assert domains == [
        (20, [CORE_1, CORE_2], CORE_1, FW_1),
        (20, ["sw-dist-01", "sw-dist-02"], "sw-dist-01", None),
    ]
    assert checks(snap, "mlag_downstream_inconsistent") == []  # aucun câble aval : rien à dire


def test_without_a_cabled_peer_link_two_devices_sharing_an_id_still_form_a_domain(minimal):
    def mutate(d):
        for host in (CORE_1, CORE_2):
            aggregate_doc(d, host, "port-channel10")["mlag_peer_link"] = False

    snap = run(variant(minimal, mutate))
    assert len(snap.mlag_domains) == 1
    domain = snap.mlag_domains[0]
    assert (domain.mlag_id, domain.peer_link, domain.downstream) == (20, None, FW_1)
    assert itf(snap, CORE_1, "Ethernet1/1").roles == ()


def test_an_id_shared_by_three_unpaired_devices_forms_no_domain(minimal):
    def mutate(d):
        _second_pair_with_vpc_20(d)
        for host in (CORE_1, CORE_2, "sw-dist-01", "sw-dist-02"):
            aggregate_doc(d, host, "port-channel10")["mlag_peer_link"] = False

    assert run(variant(minimal, mutate)).mlag_domains == ()


def test_cables_leading_to_two_different_devices_is_inconsistent(minimal):
    def mutate(d):
        interface(d, CORE_2, "Ethernet1/4")["description"] = "C2|fw-edge-02|x2|"
        interface(d, FW_1, "x2")["description"] = None

    snap = run(variant(minimal, mutate))
    domain = snap.mlag_domains[0]
    assert domain.downstream is None
    found = checks(snap, "mlag_downstream_inconsistent")
    assert len(found) == 1 and found[0].severity == "warning"
    assert found[0].details == {"mlag_id": 20, "downstream": [FW_1, FW_2]}
    assert [(r.kind, r.hostname, r.name) for r in found[0].refs] == [
        ("aggregate", CORE_1, "port-channel20"),
        ("aggregate", CORE_2, "port-channel20"),
    ]


def test_two_aggregates_with_the_same_id_cabled_to_each_other_is_a_mislabeled_peer_link(minimal):
    def mutate(d):
        for host in (CORE_1, CORE_2):
            aggregate_doc(d, host, "port-channel10").update(mlag_peer_link=False, mlag_id=10)

    snap = run(variant(minimal, mutate))
    assert [d.mlag_id for d in snap.mlag_domains] == [20]
    found = checks(snap, "mlag_pair_direct_link")
    assert len(found) == 1 and found[0].severity == "warning" and found[0].details == {"mlag_id": 10}
    assert [(r.hostname, r.name) for r in found[0].refs] == [(CORE_1, "port-channel10"), (CORE_2, "port-channel10")]


# --- HA ---------------------------------------------------------------------------------------------------------


def test_scenario_8_cluster_seen_from_one_member_with_the_other_down(snapshot):
    assert snapshot.report.counts.ha_clusters == 1
    edge = cluster(snapshot, FW_1, FW_2)
    assert (edge.mode, edge.cluster_name) == ("active_passive", "EDGE-CLUSTER")
    assert [(m.hostname, m.role, m.state, m.priority, m.reported_by) for m in edge.members] == [
        (FW_1, "primary", "up", 200, (FW_1,)),
        (FW_2, "secondary", "down", 100, (FW_1,)),
    ]
    assert [(h.hostname, h.interface, h.cable) for h in edge.heartbeat_interfaces] == [(FW_1, "ha1", None)]
    assert itf(snapshot, FW_1, "ha1").roles == ("heartbeat",)
    down = checks(snapshot, "ha_member_down")
    assert len(down) == 1 and down[0].severity == "error"
    assert down[0].details == {"role": "secondary", "reported_by": [FW_1]}
    assert [r.kind for r in down[0].refs] == ["cluster", "node"] and down[0].refs[1].hostname == FW_2
    assert down[0].refs[0].members == (FW_1, FW_2)
    heartbeat = checks(snapshot, "heartbeat_link_not_observed")
    assert len(heartbeat) == 1 and heartbeat[0].severity == "info"
    assert [(r.kind, getattr(r, "name", None)) for r in heartbeat[0].refs] == [("cluster", None), ("interface", "ha1")]
    assert checks(snapshot, "ha_view_mismatch") == []


def test_a_heartbeat_with_a_cable_points_to_it(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc(FW_1, "ha1", FW_2, "ha1", ("router",)))
        task_subject(d, FW_1, "lldp", "success")

    snap = run(variant(minimal, mutate))
    heartbeat = cluster(snap, FW_1, FW_2).heartbeat_interfaces[0]
    assert ends(heartbeat.cable) == {(FW_1, "ha1"), (FW_2, "ha1")}
    assert checks(snap, "heartbeat_link_not_observed") == []


def test_each_member_is_authoritative_on_itself_and_disagreements_are_reported(minimal):
    def mutate(d):
        d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [_task(FW_2, ha=True)]  # 02 répond
        d["ha"].append(
            _ha_doc(
                FW_2,
                mode="active_active",
                name="EDGE-CLUSTER",
                members=[(FW_2, "primary", "up", 300), (FW_1, "secondary", "up", 200)],
                heartbeats=[],
            )
        )

    snap = run(variant(minimal, mutate))
    edge = cluster(snap, FW_1, FW_2)
    assert edge.mode == "active_passive"  # premier rapporteur par hostname : fw-edge-01
    assert [(m.hostname, m.role, m.state, m.priority, m.reported_by) for m in edge.members] == [
        (FW_1, "primary", "up", 200, (FW_1, FW_2)),  # sa propre vue, pas celle de fw-edge-02
        (FW_2, "primary", "up", 300, (FW_1, FW_2)),
    ]
    down = checks(snap, "ha_member_down")  # fw-edge-01 dit 02 down : l'erreur reste, même si 02 se dit up (B5)
    assert len(down) == 1 and down[0].details == {"role": "primary", "reported_by": [FW_1]}
    found = checks(snap, "ha_view_mismatch")
    assert [c.details["field"] for c in found] == ["member", "member", "mode"]
    assert found[2].details == {
        "field": "mode",
        "views": [{"reported_by": FW_1, "value": "active_passive"}, {"reported_by": FW_2, "value": "active_active"}],
    }
    assert found[0].details == {
        "field": "member",
        "member": FW_1,
        "views": [
            {"reported_by": FW_1, "role": "primary", "state": "up", "priority": 200},
            {"reported_by": FW_2, "role": "secondary", "state": "up", "priority": 200},
        ],
    }
    assert all(c.severity == "warning" and c.refs[0].kind == "cluster" for c in found)


def test_a_member_unknown_to_the_nodes_is_left_out_of_the_cluster(minimal):
    def mutate(d):
        d["ha"][0]["members"].append(
            {"name": "fw-ghost", "serial": None, "role": "secondary", "state": "up", "priority": 50}
        )

    snap = run(variant(minimal, mutate))
    assert [m.hostname for m in cluster(snap, FW_1, FW_2).members] == [FW_1, FW_2]
    assert len(checks(snap, "ha_member_unknown")) == 1  # le constat du contrat d'entrée, recopié


def test_a_device_described_in_two_clusters_with_different_members_is_a_mismatch(minimal):
    def mutate(d):
        d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [_task(FW_2, ha=True)]
        d["ha"].append(
            _ha_doc(
                FW_2,
                mode="active_passive",
                name="EDGE-CLUSTER",
                members=[(FW_1, "primary", "up", 200), (FW_2, "secondary", "up", 100), (CORE_1, "member", "up", None)],
                heartbeats=[],
            )
        )

    snap = run(variant(minimal, mutate))
    assert [tuple(m.hostname for m in c.members) for c in snap.ha_clusters] == [(FW_1, FW_2), (FW_1, FW_2, CORE_1)]
    found = [c for c in checks(snap, "ha_view_mismatch") if c.details["field"] == "members"]
    assert [(c.refs[0].members, c.refs[1].hostname) for c in found] == [
        ((FW_1, FW_2), FW_1),
        ((FW_1, FW_2), FW_2),
        ((FW_1, FW_2, CORE_1), FW_1),
        ((FW_1, FW_2, CORE_1), FW_2),
    ]
    assert found[0].details["views"] == [[FW_1, FW_2], [FW_1, FW_2, CORE_1]]


def test_a_standalone_document_yields_no_cluster(minimal):
    """`standalone` ⇒ `members: []` (contrat, 2026-10-02) ⇒ aucun cluster, aucun contrôle : un firewall seul est un
    nœud comme un autre. Avant, il formait un cluster d'un membre."""

    def mutate(d):
        d["tasks"][0]["status_per_subject"]["ha"] = {
            "status": "success",
            "started_at": None,
            "ended_at": None,
            "error": None,
        }
        d["ha"].append(_ha_doc(CORE_1, mode="standalone", name="FGT-HA", members=[], heartbeats=["Ethernet1/5"]))

    snap = run(variant(minimal, mutate))
    assert cluster(snap, CORE_1) is None
    assert itf(snap, CORE_1, "Ethernet1/5").roles == ("heartbeat",)  # port réservé : le rôle tient sans cluster
    assert [c for c in snap.checks if c.refs[0].kind == "cluster" and CORE_1 in c.refs[0].members] == []
    assert [tuple(m.hostname for m in c.members) for c in snap.ha_clusters] == [(FW_1, FW_2)]


def test_structures_are_order_independent(minimal):
    reference = canonical_json(run(variant(minimal, _second_pair_with_vpc_20), "0" * 64))
    shuffled = variant(minimal, _second_pair_with_vpc_20)
    for section in ("aggregates", "ha", "interfaces", "lldp"):
        shuffled[section].reverse()
    assert canonical_json(run(shuffled, "0" * 64)) == reference


# --- revue du 2026-09-26 (docs/revues/2026-09-26-b1-r4-structures.md) --------------------------------------------


def test_h1_a_peer_link_cabled_to_a_stub_does_not_swallow_the_domain(minimal):
    """Un peer-link dont les câbles mènent à un voisin inconnu ne forme pas de paire : le repli par mlag_id joue."""

    def mutate(d):
        d["lldp"] = [doc for doc in d["lldp"] if doc["local_interface"] not in ("Ethernet1/1", "Ethernet1/2")]
        d["cdp"] = [doc for doc in d["cdp"] if doc["local_interface"] != "Ethernet1/1"]
        for host in (CORE_1, CORE_2):
            for name in ("Ethernet1/1", "Ethernet1/2", "port-channel10"):
                interface(d, host, name)["description"] = None
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/1", "unknown-peer", "Ethernet1/1"))
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/2", "unknown-peer", "Ethernet1/2"))

    snap = run(variant(minimal, mutate))
    assert len(snap.mlag_domains) == 1
    domain = snap.mlag_domains[0]
    assert (domain.mlag_id, domain.downstream) == (20, FW_1)
    assert (domain.peer_link.hostname, domain.peer_link.aggregate) == (CORE_1, "port-channel10")


def test_m1_a_member_of_another_infrastructure_becomes_an_external_node(minimal):
    def mutate(d):
        d["devices"].append(
            {**d["devices"][2], "hostname": "fw-dr-09", "infrastructure": "infra-dr", "serial_number": None}
        )
        d["ha"][0]["members"].append(
            {"name": "fw-dr-09", "serial": None, "role": "secondary", "state": "up", "priority": 50}
        )

    snap = run(variant(minimal, mutate))
    external = next(n for n in snap.nodes if n.hostname == "fw-dr-09")
    assert external.kind == "external" and external.evidence.seen_by == () and external.vendor == "fortinet"
    assert [m.hostname for m in cluster(snap, "fw-dr-09", FW_1, FW_2).members] == ["fw-dr-09", FW_1, FW_2]
    assert checks(snap, "ha_member_unknown") == []


def test_m2_null_never_contradicts_a_read_value(minimal):
    def mutate(d):
        d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [_task(FW_2, ha=True)]
        d["ha"].append(
            _ha_doc(
                FW_2,
                mode="active_passive",
                name=None,
                members=[(FW_1, "primary", "up", None), (FW_2, "secondary", "down", None)],
                heartbeats=[],
            )
        )

    snap = run(variant(minimal, mutate))
    edge = cluster(snap, FW_1, FW_2)
    assert edge.cluster_name == "EDGE-CLUSTER"
    assert [(m.hostname, m.priority) for m in edge.members] == [
        (FW_1, 200),
        (FW_2, 100),
    ]  # la valeur lue remplace le null
    assert checks(snap, "ha_view_mismatch") == []


def test_b5_split_brain_keeps_its_error(minimal):
    def mutate(d):
        d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [_task(FW_2, ha=True)]
        d["ha"].append(
            _ha_doc(
                FW_2,
                mode="active_passive",
                name="EDGE-CLUSTER",
                members=[(FW_1, "primary", "up", 200), (FW_2, "secondary", "up", 100)],
                heartbeats=[],
            )
        )

    snap = run(variant(minimal, mutate))
    member = next(m for m in cluster(snap, FW_1, FW_2).members if m.hostname == FW_2)
    assert member.state == "up"  # sa propre vue
    down = checks(snap, "ha_member_down")
    assert len(down) == 1 and down[0].details == {"role": "secondary", "reported_by": [FW_1]}  # mais l'erreur reste
    assert [c.details["member"] for c in checks(snap, "ha_view_mismatch")] == [FW_2]


def test_b1_a_flagged_peer_link_carrying_an_id_is_refused_at_the_door(minimal):
    """Revue R4, B1 : B1 le lisait comme peer-link en ignorant l'identifiant ; depuis le 2026-10-02 le contrat
    d'entrée le refuse (`mlag_peer_link_with_id`), B1 n'a plus à choisir. Doublon volontaire du test de
    `ld-contracts` : ici on prouve que c'est bien l'entrée qui refuse, pas le Snapshot derrière B1."""

    def mutate(d):
        for host in (CORE_1, CORE_2):
            aggregate_doc(d, host, "port-channel10")["mlag_id"] = 10

    with pytest.raises(ValidationError) as exc:
        run(variant(minimal, mutate))
    assert exc.value.title == "RunBundle", "refusé à la porte, pas entre les deux contrats"
    assert {e["type"] for e in exc.value.errors()} == {"mlag_peer_link_with_id"}


def test_an_unread_peer_link_flag_is_no_flag_and_the_id_fallback_still_pairs_the_domain(minimal):
    """`mlag_peer_link = null` = non lu (2026-10-02) : aucun rôle, aucune paire par peer-link ; le repli par
    `mlag_id` forme le domaine 20 sans peer-link, et le snapshot garde le `null` pour que la page dise « non lu »."""

    def mutate(d):
        for host in (CORE_1, CORE_2):
            aggregate_doc(d, host, "port-channel10")["mlag_peer_link"] = None

    snap = run(variant(minimal, mutate))
    assert aggregate(snap, CORE_1, "port-channel10").mlag_peer_link is None
    assert '"mlag_peer_link": null' in canonical_json(snap)
    assert itf(snap, CORE_1, "Ethernet1/1").roles == () and itf(snap, CORE_2, "Ethernet1/2").roles == ()
    assert [(d.mlag_id, d.peer_link, d.downstream) for d in snap.mlag_domains] == [(20, None, FW_1)]
    assert checks(snap, "mlag_pair_direct_link") == []


def test_b2_two_heartbeat_cables_toward_members_are_listed_as_candidates(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc(FW_1, "ha1", FW_2, "ha1", ("router",)))
        d["lldp"].append(lldp_doc(FW_1, "ha1", FW_2, "ha2", ("router",)))
        task_subject(d, FW_1, "lldp", "success")

    snap = run(variant(minimal, mutate))
    assert cluster(snap, FW_1, FW_2).heartbeat_interfaces[0].cable is None
    found = checks(snap, "heartbeat_link_not_observed")
    assert len(found) == 1
    assert found[0].details == {
        "candidates": [{"hostname": FW_2, "interface": "ha1"}, {"hostname": FW_2, "interface": "ha2"}]
    }


def test_m3_the_same_id_twice_on_one_device_forms_no_domain(minimal):
    """Parqué (revue M3) : comportement prudent, aucun domaine ; un refus d'entrée est proposé à Orhan."""

    def mutate(d):
        d["interfaces"].append({**interface(d, CORE_1, "Ethernet1/5"), "name": "Ethernet1/6", "oper_status": "up"})
        d["interfaces"].append(
            {**interface(d, CORE_1, "port-channel20"), "name": "port-channel21", "members": ["Ethernet1/6"]}
        )
        d["aggregates"].append(
            {
                **aggregate_doc(d, CORE_1, "port-channel20"),
                "name": "port-channel21",
                "members": [{"name": "Ethernet1/6", "status": "bundled"}],
            }
        )

    snap = run(variant(minimal, mutate))
    assert snap.mlag_domains == () and checks(snap, "mlag_pair_direct_link") == []


# --- fabriques --------------------------------------------------------------------------------------------------


def _task(hostname: str, **topics: bool) -> dict:
    subject = {"status": "success", "started_at": None, "ended_at": None, "error": None}
    return {
        "hostname": hostname,
        "status": "success",
        "status_per_subject": {name: copy.deepcopy(subject) for name, wanted in topics.items() if wanted},
        "error": None,
    }


def _ha_doc(hostname: str, *, mode: str, name: str | None, members: list, heartbeats: list) -> dict:
    return {
        "hostname": hostname,
        "mode": mode,
        "cluster_name": name,
        "members": [
            {"name": m, "serial": None, "role": role, "state": state, "priority": prio}
            for m, role, state, prio in members
        ],
        "heartbeat_interfaces": heartbeats,
        "extras": {},
    }


def _second_pair_with_vpc_20(d: dict) -> None:
    """Une seconde paire de cœurs, `sw-dist-01` / `sw-dist-02`, peer-link Po10 observé, vPC 20 sans câble aval."""
    model_device = next(dev for dev in d["devices"] if dev["hostname"] == CORE_1)
    model_task = next(t for t in d["tasks"] if t["hostname"] == CORE_1)
    physical = interface(d, CORE_1, "Ethernet1/1")
    po = interface(d, CORE_1, "port-channel10")
    for host, other in (("sw-dist-01", "sw-dist-02"), ("sw-dist-02", "sw-dist-01")):
        d["devices"].append({**model_device, "hostname": host, "serial_number": None})
        d["tasks"].append({**copy.deepcopy(model_task), "hostname": host})
        d["interfaces"].append({**physical, "hostname": host, "name": "Ethernet1/1", "description": None})
        d["interfaces"].append(
            {**physical, "hostname": host, "name": "Ethernet1/2", "description": None, "members": []}
        )
        d["interfaces"].append(
            {**po, "hostname": host, "name": "port-channel10", "description": None, "members": ["Ethernet1/1"]}
        )
        d["interfaces"].append(
            {**po, "hostname": host, "name": "port-channel20", "description": None, "members": ["Ethernet1/2"]}
        )
        d["lldp"].append(lldp_doc(host, "Ethernet1/1", other, "Ethernet1/1"))
        d["aggregates"].append(
            {
                **aggregate_doc(d, CORE_1, "port-channel10"),
                "hostname": host,
                "members": [{"name": "Ethernet1/1", "status": "bundled"}],
            }
        )
        d["aggregates"].append(
            {
                **aggregate_doc(d, CORE_1, "port-channel20"),
                "hostname": host,
                "members": [{"name": "Ethernet1/2", "status": "bundled"}],
            }
        )

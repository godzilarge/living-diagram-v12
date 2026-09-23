"""R1-bis : un port distant annoncé par le nom d'un agrégat désigne un de ses membres (Orhan, 2026-09-22).

Cas réel : un FortiGate dont LLDP est activé annonce en port-id le nom de son agrégat (`agg-core`) sur chacun de ses
membres ; le switch d'en face ne sait pas sur quel membre il tombe. B1 cherche le membre : observation inverse,
puis membre unique, puis description ; sinon le câble s'arrête à l'agrégat et un contrôle le dit.
"""

from tests.correlate.conftest import checks, find_link, interface, lldp_doc, run, task_subject, variant

CORE_1, CORE_2 = ("sw-core-01", "Ethernet1/3"), ("sw-core-02", "Ethernet1/4")
FW = "fw-edge-01"


def fortigate_announces_its_aggregate(d: dict) -> None:
    d["lldp"].append(lldp_doc(*CORE_1, FW, "agg-core", ("router",)))
    d["lldp"].append(lldp_doc(*CORE_2, FW, "agg-core", ("router",)))


def without_descriptions(d: dict) -> None:
    for host, name in (CORE_1, CORE_2, (FW, "x1"), (FW, "x2")):
        interface(d, host, name)["description"] = None


def fortigate_observes_back(d: dict, member: str, seen: tuple[str, str]) -> None:
    d["lldp"].append(lldp_doc(FW, member, *seen))
    task_subject(d, FW, "lldp", "success")


def test_description_designates_the_member_and_the_cable_lands_on_it(snapshot, minimal):
    snap = run(variant(minimal, fortigate_announces_its_aggregate))
    for core, member in ((CORE_1, "x1"), (CORE_2, "x2")):
        link = find_link(snap, core, (FW, member))
        assert link.status == "confirmed"
        assert [e.source for e in link.evidence] == ["description", "description", "lldp"]
        lldp = link.evidence[2]
        assert (lldp.remote_raw.port, lldp.remote_resolved.interface) == ("agg-core", member)
        assert (link.aggregate_a, link.aggregate_b) == ("agg-core", "port-channel20")
        assert find_link(snap, core, (FW, "agg-core")) is None
    disagreements = "description_disagrees_with_observed"
    assert checks(snap, disagreements) == checks(snapshot, disagreements)  # rien de plus que le scénario 2
    assert checks(snap, "multiple_observed_neighbors") == []
    assert checks(snap, "remote_port_is_aggregate") == []
    assert snap.report.applied_normalizations["aggregate_port_to_member"] == 2


def test_reverse_observation_designates_the_member_before_any_description(minimal):
    def mutate(d):
        fortigate_announces_its_aggregate(d)
        interface(d, *CORE_1)["description"] = "C2|fw-edge-01|x2|"  # la description se trompe : l'observé gagne
        fortigate_observes_back(d, "x1", CORE_1)

    snap = run(variant(minimal, mutate))
    link = find_link(snap, CORE_1, (FW, "x1"))
    assert link.status == "confirmed"  # la description de x1 cite bien Ethernet1/3
    assert [(e.source, e.witness.interface) for e in link.evidence] == [
        ("description", "x1"),
        ("lldp", "x1"),
        ("lldp", "Ethernet1/3"),
    ]
    assert find_link(snap, CORE_1, (FW, "x2")) is None
    wrong = [c for c in checks(snap, "description_disagrees_with_observed") if c.refs[0].hostname == "sw-core-01"]
    assert len(wrong) == 1 and wrong[0].details["documented"] == {"hostname": FW, "interface": "x2"}
    assert wrong[0].details["observed"] == [{"hostname": FW, "interface": "x1"}]
    assert all(c.refs[0].name != "Ethernet1/3" for c in checks(snap, "one_way_observation"))


def test_single_member_aggregate_needs_no_other_evidence(minimal):
    def mutate(d):
        d["lldp"].append(lldp_doc(*CORE_1, FW, "agg-core", ("router",)))
        without_descriptions(d)
        aggregate = next(a for a in d["aggregates"] if a["hostname"] == FW)
        aggregate["members"] = [m for m in aggregate["members"] if m["name"] == "x1"]
        interface(d, FW, "agg-core")["members"] = ["x1"]

    snap = run(variant(minimal, mutate))
    link = find_link(snap, CORE_1, (FW, "x1"))
    assert link.status == "observed_only" and link.evidence[0].remote_raw.port == "agg-core"
    assert checks(snap, "remote_port_is_aggregate") == []
    assert snap.report.applied_normalizations["aggregate_port_to_member"] == 1


def test_undetermined_member_stops_the_cable_at_the_aggregate_with_a_warning(minimal):
    def mutate(d):
        fortigate_announces_its_aggregate(d)
        without_descriptions(d)

    snap = run(variant(minimal, mutate))
    for core in (CORE_1, CORE_2):
        link = find_link(snap, core, (FW, "agg-core"))
        assert link.status == "observed_only" and link.aggregate_a is None
    found = checks(snap, "remote_port_is_aggregate")
    assert [(c.severity, c.refs[0].hostname, c.refs[0].name) for c in found] == [
        ("warning", "sw-core-01", "Ethernet1/3"),
        ("warning", "sw-core-02", "Ethernet1/4"),
    ]
    assert found[0].details == {"neighbor": FW, "aggregate": "agg-core", "members": ["x1", "x2"]}
    assert checks(snap, "multiple_observed_neighbors") == []  # un agrégat a autant de voisins que de membres
    assert snap.report.applied_normalizations["aggregate_port_to_member"] == 0


def test_ambiguous_descriptions_are_absorbed_without_disagreement(minimal):
    def mutate(d):
        fortigate_announces_its_aggregate(d)
        without_descriptions(d)
        interface(d, FW, "x1")["description"] = "C2|sw-core-01|Ethernet1/3|"
        interface(d, FW, "x2")["description"] = "C2|sw-core-01|Ethernet1/3|"  # deux membres citent le même port

    snap = run(variant(minimal, mutate))
    link = find_link(snap, CORE_1, (FW, "agg-core"))
    assert link is not None and link.status == "observed_only"
    assert [c.refs[0].hostname for c in checks(snap, "description_disagrees_with_observed")] == ["sw-core-02"]
    assert len(checks(snap, "remote_port_is_aggregate")) == 2


def test_members_come_from_interfaces_when_the_aggregates_topic_failed(minimal):
    def mutate(d):
        fortigate_announces_its_aggregate(d)
        task_subject(d, FW, "aggregates", "failed")
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != FW]

    snap = run(variant(minimal, mutate))
    assert find_link(snap, CORE_1, (FW, "x1")).status == "confirmed"
    assert find_link(snap, CORE_2, (FW, "x2")).status == "confirmed"


def test_aggregate_without_known_members_is_reported_with_an_empty_list(minimal):
    def mutate(d):
        fortigate_announces_its_aggregate(d)
        without_descriptions(d)
        d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != FW]  # topic en succès, aucun document
        interface(d, FW, "agg-core")["members"] = []

    snap = run(variant(minimal, mutate))
    found = checks(snap, "remote_port_is_aggregate")
    assert len(found) == 2 and found[0].details["members"] == []


def test_an_uncollected_neighbor_keeps_its_raw_aggregate_name(minimal):
    snap = run(variant(minimal, lambda d: d["lldp"].append(lldp_doc(*CORE_1, "fw-other", "agg-wan", ("router",)))))
    link = find_link(snap, CORE_1, ("fw-other", "agg-wan"))
    assert link is not None and checks(snap, "remote_port_is_aggregate") == []


# Revue indépendante du 2026-09-22 (docs/revues/2026-09-22-r1-bis-agregat-port-id.md) : H1, M1, M2, B4.


def test_description_citing_the_aggregate_agrees_with_its_member(minimal):
    """H1 : `agg-core` est ce que `show lldp neighbors` affiche, donc ce qu'un admin recopie : pas un désaccord."""

    def by_description(d):
        fortigate_announces_its_aggregate(d)
        interface(d, *CORE_1)["description"] = "C2|fw-edge-01|agg-core|"  # x1 désigné par la description de x1

    def by_reverse_observation(d):
        by_description(d)
        fortigate_observes_back(d, "x1", CORE_1)

    for mutate in (by_description, by_reverse_observation):
        snap = run(variant(minimal, mutate))
        link = find_link(snap, CORE_1, (FW, "x1"))
        assert link is not None and link.status == "confirmed"
        cited = [e for e in link.evidence if e.witness.interface == "Ethernet1/3" and e.source == "description"]
        assert [(e.remote_raw.port, e.remote_resolved.interface) for e in cited] == [("agg-core", "agg-core")]
        assert [c.refs[0].hostname for c in checks(snap, "description_disagrees_with_observed")] == ["sw-core-02"]


def test_self_observation_is_never_retargeted(minimal):
    """M1 : un agrégat qui s'annonce lui-même reste une auto-observation, jamais un câble vers son membre."""

    def mutate(d):
        d["lldp"].append(lldp_doc("sw-core-01", "port-channel20", "sw-core-01", "port-channel20"))
        d["lldp"].append(lldp_doc("sw-core-01", "port-channel10", "sw-core-01", "port-channel10"))

    snap = run(variant(minimal, mutate))
    assert not [link for link in snap.links if link.a.hostname == link.b.hostname == "sw-core-01"]
    found = checks(snap, "self_observation")
    assert sorted(c.refs[0].name for c in found) == ["port-channel10", "port-channel20"]
    assert checks(snap, "remote_port_is_aggregate") == []
    assert snap.report.applied_normalizations["aggregate_port_to_member"] == 0


def test_more_observers_than_members_is_still_a_hub(minimal):
    """M2 : un bout resté agrégat se tait tant qu'il n'a pas plus de voisins que de membres (entrée LLDP périmée)."""

    def mutate(d):
        fortigate_announces_its_aggregate(d)
        without_descriptions(d)
        d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", FW, "agg-core", ("router",)))

    snap = run(variant(minimal, mutate))
    found = checks(snap, "multiple_observed_neighbors")
    assert len(found) == 3 and {(c.refs[0].hostname, c.refs[0].name) for c in found} == {(FW, "agg-core")}
    assert found[0].details["neighbors"] == [
        {"hostname": "sw-core-01", "interface": "Ethernet1/3"},
        {"hostname": "sw-core-01", "interface": "Ethernet1/5"},
        {"hostname": "sw-core-02", "interface": "Ethernet1/4"},
    ]
    two = run(variant(minimal, lambda d: (fortigate_announces_its_aggregate(d), without_descriptions(d))))
    assert checks(two, "multiple_observed_neighbors") == []


def test_ambiguous_reverse_observation_resolves_nothing(minimal):
    """B4 : x1 et x2 observent tous deux le même port du switch ⇒ personne ne gagne, câbles visibles, hub signalé."""

    def mutate(d):
        d["lldp"].append(lldp_doc(*CORE_1, FW, "agg-core", ("router",)))
        without_descriptions(d)
        fortigate_observes_back(d, "x1", CORE_1)
        fortigate_observes_back(d, "x2", CORE_1)

    snap = run(variant(minimal, mutate))
    assert find_link(snap, CORE_1, (FW, "agg-core")) is not None
    assert find_link(snap, CORE_1, (FW, "x1")) is not None and find_link(snap, CORE_1, (FW, "x2")) is not None
    assert len(checks(snap, "remote_port_is_aggregate")) == 1
    assert {(c.refs[0].hostname, c.refs[0].name) for c in checks(snap, "multiple_observed_neighbors")} == {CORE_1}

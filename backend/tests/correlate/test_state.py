"""R5 : contrôles d'état (docs/05 R5 ; scénarios 2, 8, 9).

Précisions (2026-09-26) : « down » = tout état autre que `up`, `unknown` d'un bout ne conclut rien ; le mismatch
d'état se limite aux câbles confirmés ou observés, `link_down` vaut pour tous ; la vitesse se compare quand les deux
sont lues ; `documented_port_without_transceiver` ne vise que les ports `physical` / `management` ; une task
`failed` n'a pas de code au catalogue, aucun contrôle (parqué avec les statuts des tasks).
"""

from tests.correlate.conftest import checks, find_link, interface, lldp_doc, run, variant

CORE_1, CORE_2, FW_1, FW_2 = "sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02"
PEER_2 = ((CORE_1, "Ethernet1/2"), (CORE_2, "Ethernet1/2"))


def refs_of(check) -> list[tuple]:
    return [tuple(r.model_dump(mode="json").values()) for r in check.refs]


def ref_kinds(check) -> list[str]:
    return [r.kind for r in check.refs]


def on_link(snapshot, code: str, a: tuple[str, str], b: tuple[str, str]) -> list:
    """Les contrôles d'un code portés par le câble a ↔ b (la fixture en porte déjà un sur Eth1/2)."""
    link = find_link(snapshot, a, b)
    return [
        c for c in checks(snapshot, code) if any(r.kind == "link" and (r.a, r.b) == (link.a, link.b) for r in c.refs)
    ]


# --- état opérationnel ------------------------------------------------------------------------------------------


def test_scenario_2_one_end_up_the_other_down_is_a_mismatch(snapshot):
    found = checks(snapshot, "link_oper_mismatch")
    assert len(found) == 1 and found[0].severity == "warning"
    check = found[0]
    assert ref_kinds(check) == ["interface", "link"]
    assert (check.refs[0].hostname, check.refs[0].name) == (CORE_2, "Ethernet1/2")  # le bout down
    assert check.refs[1].a.interface == "Ethernet1/2" and check.refs[1].b.hostname == CORE_2
    assert check.details["states"] == [
        {"hostname": CORE_1, "interface": "Ethernet1/2", "oper_status": "up", "oper_reason": None},
        {"hostname": CORE_2, "interface": "Ethernet1/2", "oper_status": "down", "oper_reason": "suspended by LACP"},
    ]
    assert not checks(snapshot, "link_down")


def test_both_ends_down_is_link_down_and_the_cable_stays(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_1, "Ethernet1/2").update(oper_status="down"))
    snapshot = run(doc)
    assert find_link(snapshot, *PEER_2).oper == "down"
    assert not checks(snapshot, "link_oper_mismatch")
    found = checks(snapshot, "link_down")
    assert len(found) == 1 and found[0].severity == "info" and ref_kinds(found[0]) == ["link"]
    assert [s["oper_status"] for s in found[0].details["states"]] == ["down", "down"]


def test_any_state_other_than_up_counts_as_down(minimal):
    for state in ("lower_layer_down", "dormant", "testing", "not_present"):
        doc = variant(minimal, lambda d, s=state: interface(d, CORE_2, "Ethernet1/2").update(oper_status=s))
        found = checks(run(doc), "link_oper_mismatch")
        assert len(found) == 1 and found[0].details["states"][1]["oper_status"] == state


def test_unknown_state_draws_no_conclusion(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_2, "Ethernet1/2").update(oper_status="unknown"))
    snapshot = run(doc)
    assert find_link(snapshot, *PEER_2).oper == "unknown"
    assert not checks(snapshot, "link_oper_mismatch") and not checks(snapshot, "link_down")


def test_oper_mismatch_needs_an_observed_cable_but_link_down_does_not(minimal):
    """Eth1/3 ↔ x1 est documenté seulement : une description peu fiable ne fonde pas un désaccord d'état."""
    doc = variant(minimal, lambda d: interface(d, FW_1, "x1").update(oper_status="down"))
    snapshot = run(doc)
    fw_link = ((CORE_1, "Ethernet1/3"), (FW_1, "x1"))
    assert find_link(snapshot, *fw_link).oper == "down"
    assert not on_link(snapshot, "link_oper_mismatch", *fw_link)
    assert len(checks(snapshot, "link_oper_mismatch")) == 1  # celui du scénario 2, inchangé

    def both_down(d: dict) -> None:
        interface(d, FW_1, "x1")["oper_status"] = "down"
        interface(d, CORE_1, "Ethernet1/3")["oper_status"] = "down"

    snapshot = run(variant(minimal, both_down))
    assert find_link(snapshot, *fw_link).status == "documented_only"
    assert len(on_link(snapshot, "link_down", *fw_link)) == 1


def test_a_cable_toward_an_uncollected_end_has_no_state_check(snapshot):
    """rt-wan-01 est d'une autre infrastructure : un seul bout lu, aucune conclusion (le câble est `unknown`)."""
    link = find_link(snapshot, (CORE_1, "Ethernet1/4"), ("rt-wan-01", "GigabitEthernet0/0/0"))
    assert link.oper == "unknown"
    for code in ("link_oper_mismatch", "link_down", "link_speed_mismatch", "native_vlan_mismatch"):
        assert not [
            c for c in checks(snapshot, code) if any(r.kind == "link" and r.b.hostname == CORE_1 for r in c.refs)
        ]


# --- vitesse ----------------------------------------------------------------------------------------------------


def test_speed_mismatch_when_both_speeds_are_read_and_differ(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_2, "Ethernet1/1").update(speed_mbps=1000))
    snapshot = run(doc)
    link = find_link(snapshot, (CORE_1, "Ethernet1/1"), (CORE_2, "Ethernet1/1"))
    assert link.speed_mbps is None
    found = checks(snapshot, "link_speed_mismatch")
    assert len(found) == 1 and found[0].severity == "warning" and ref_kinds(found[0]) == ["link"]
    assert found[0].details["speeds"] == [
        {"hostname": CORE_1, "interface": "Ethernet1/1", "speed_mbps": 10000},
        {"hostname": CORE_2, "interface": "Ethernet1/1", "speed_mbps": 1000},
    ]


def test_speed_unread_on_one_end_draws_no_conclusion(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_2, "Ethernet1/1").update(speed_mbps=None))
    assert not checks(run(doc), "link_speed_mismatch")


def test_speed_is_compared_on_a_documented_cable_too(minimal):
    doc = variant(minimal, lambda d: interface(d, FW_1, "x1").update(speed_mbps=1000))
    found = checks(run(doc), "link_speed_mismatch")
    assert len(found) == 1 and found[0].refs[0].a.hostname == FW_1


# --- VLAN non tagué ---------------------------------------------------------------------------------------------


def test_fixture_has_no_native_vlan_mismatch(snapshot):
    assert not checks(snapshot, "native_vlan_mismatch")


def test_native_vlan_differs_between_two_trunks(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_2, "Ethernet1/1").update(native_vlan=99))
    found = checks(run(doc), "native_vlan_mismatch")
    assert len(found) == 1 and found[0].severity == "warning" and ref_kinds(found[0]) == ["link"]
    assert found[0].details["vlans"] == [
        {"hostname": CORE_1, "interface": "Ethernet1/1", "switchport_mode": "trunk", "vlan": 1},
        {"hostname": CORE_2, "interface": "Ethernet1/1", "switchport_mode": "trunk", "vlan": 99},
    ]


def test_access_vlan_is_compared_to_the_native_vlan_of_a_trunk(minimal):
    def access(d: dict) -> None:
        interface(d, CORE_2, "Ethernet1/1").update(
            switchport_mode="access", access_vlan=99, native_vlan=None, allowed_vlans=None
        )

    found = checks(run(variant(minimal, access)), "native_vlan_mismatch")
    assert len(found) == 1 and found[0].details["vlans"][1] == {
        "hostname": CORE_2,
        "interface": "Ethernet1/1",
        "switchport_mode": "access",
        "vlan": 99,
    }


def test_same_untagged_vlan_or_no_untagged_vlan_is_silent(minimal):
    def same(d: dict) -> None:
        interface(d, CORE_2, "Ethernet1/1").update(
            switchport_mode="access", access_vlan=1, native_vlan=None, allowed_vlans=None
        )

    assert not checks(run(variant(minimal, same)), "native_vlan_mismatch")

    def routed(d: dict) -> None:
        interface(d, CORE_2, "Ethernet1/1").update(
            switchport_mode="routed", access_vlan=None, native_vlan=None, allowed_vlans=None
        )

    assert not checks(run(variant(minimal, routed)), "native_vlan_mismatch")

    def unread(d: dict) -> None:
        interface(d, CORE_2, "Ethernet1/1").update(native_vlan=None)

    assert not checks(run(variant(minimal, unread)), "native_vlan_mismatch")


def test_native_vlan_needs_an_observed_cable(minimal):
    """Eth1/3 (access 100) ↔ x1 : documenté seul, rien ; observé par LLDP, le désaccord apparaît."""

    def fortigate_access(d: dict) -> None:
        interface(d, FW_1, "x1").update(switchport_mode="access", access_vlan=200)

    assert not checks(run(variant(minimal, fortigate_access)), "native_vlan_mismatch")

    def observed(d: dict) -> None:
        fortigate_access(d)
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/3", FW_1, "x1", ("router",)))

    found = checks(run(variant(minimal, observed)), "native_vlan_mismatch")
    assert len(found) == 1 and [v["vlan"] for v in found[0].details["vlans"]] == [200, 100]


# --- port documenté sans transceiver ----------------------------------------------------------------------------


def test_not_present_port_without_description_is_silent(snapshot):
    assert not checks(snapshot, "documented_port_without_transceiver")


def test_not_present_port_whose_description_cites_a_neighbor(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_1, "Ethernet1/5").update(description="C3|sw-dist-01|Eth1/1|"))
    snapshot = run(doc)
    found = checks(snapshot, "documented_port_without_transceiver")
    assert len(found) == 1 and found[0].severity == "warning"
    assert ref_kinds(found[0]) == ["interface"] and found[0].refs[0].name == "Ethernet1/5"
    assert found[0].details == {"neighbor": "sw-dist-01", "port": "Eth1/1", "oper_reason": "SFP not inserted"}
    assert find_link(snapshot, (CORE_1, "Ethernet1/5"), ("sw-dist-01", "Eth1/1")).status == "documented_only"


def test_not_present_needs_a_parseable_description_and_a_physical_port(minimal):
    doc = variant(minimal, lambda d: interface(d, CORE_1, "Ethernet1/5").update(description="uplink vers la dist"))
    assert not checks(run(doc), "documented_port_without_transceiver")

    def aggregate_not_present(d: dict) -> None:
        interface(d, CORE_1, "port-channel20").update(oper_status="not_present", description="C2|fw-edge-01|agg-core|")

    assert not checks(run(variant(minimal, aggregate_not_present)), "documented_port_without_transceiver")


# --- collecte ---------------------------------------------------------------------------------------------------


def test_scenario_8_unreachable_device(snapshot):
    found = checks(snapshot, "device_unreachable")
    assert len(found) == 1 and found[0].severity == "error"
    assert ref_kinds(found[0]) == ["node"] and found[0].refs[0].hostname == FW_2
    assert found[0].details == {"error": "ssh: connect timeout"}


def test_scenario_9_partial_collection_lists_the_failed_topics(snapshot):
    found = checks(snapshot, "device_partial_collection")
    assert len(found) == 1 and found[0].severity == "info"
    assert ref_kinds(found[0]) == ["node"] and found[0].refs[0].hostname == CORE_2
    assert found[0].details == {
        "error": None,
        "failed": [{"topic": "cdp", "error": "command timeout on sw-core-02 (10.10.0.2)"}],
    }


def test_partial_collection_reads_topic_aliases_and_sorts(minimal):
    def aliases(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == CORE_2)
        task["status_per_subject"]["lldp_neighbors"] = task["status_per_subject"].pop("lldp")
        task["status_per_subject"]["lldp_neighbors"].update(status="failed", error=None)
        task["status_per_subject"]["system"]["status"] = "failed"

    found = checks(run(variant(minimal, aliases)), "device_partial_collection")
    assert [f["topic"] for f in found[0].details["failed"]] == ["cdp", "lldp", "system"]
    assert found[0].details["failed"][1] == {"topic": "lldp", "error": None}


def test_partial_collection_lists_topics_b1_does_not_consume_and_the_global_error(minimal):
    """La raison d'un `partial` peut être un topic hors de B1 (`bgp`, demain `mac_table`) : il est listé sous son nom
    brut (revue, M1) ; l'erreur globale de la task est recopiée comme pour `device_unreachable` (revue, B3)."""

    def bgp(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == CORE_2)
        task["error"] = "2 topics timed out after 30s"
        task["status_per_subject"]["bgp"] = {"status": "failed", "error": "no bgp"}
        task["status_per_subject"]["arp"] = {"status": "success", "error": None}

    found = checks(run(variant(minimal, bgp)), "device_partial_collection")
    assert found[0].details == {
        "error": "2 topics timed out after 30s",
        "failed": [
            {"topic": "bgp", "error": "no bgp"},
            {"topic": "cdp", "error": "command timeout on sw-core-02 (10.10.0.2)"},
        ],
    }


def test_alias_failed_beside_its_canonical_name_in_success_is_lost(minimal):
    """Comportement figé, parqué (revue, Q-f) : le nom canonique gagne, comme pour la couverture ; deux clés pour un
    même topic dans une task sont un défaut du producteur, refus d'entrée `subject_alias_conflict` proposé à Orhan."""

    def conflict(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == CORE_2)
        task["status_per_subject"]["cdp"].update(status="success", error=None)
        task["status_per_subject"]["cdp_neighbors"] = {"status": "failed", "error": "alias en échec"}

    snapshot = run(variant(minimal, conflict))
    assert checks(snapshot, "device_partial_collection")[0].details["failed"] == []
    assert next(c for c in snapshot.coverage if c.hostname == CORE_2).topics.cdp == "success"


def test_a_cable_stopped_at_an_aggregate_has_no_state_check(minimal):
    """R1-bis indéterminé : le câble s'arrête à `agg-core`, déjà signalé ; sa vitesse (20 000, la somme des membres)
    n'est pas celle d'un port, son état ni son VLAN ne se comparent à ceux d'un brin (revue, H1)."""

    def stopped(d: dict) -> None:
        d["lldp"].append(lldp_doc(CORE_2, "Ethernet1/4", FW_1, "agg-core", ("router",)))
        interface(d, CORE_2, "Ethernet1/4")["description"] = None
        interface(d, FW_1, "x1")["description"] = "C2|sw-core-02|Ethernet1/4|"
        interface(d, FW_1, "x2")["description"] = "C2|sw-core-02|Ethernet1/4|"
        interface(d, FW_1, "agg-core").update(oper_status="down", oper_reason="No operational members")
        interface(d, FW_1, "agg-core").update(switchport_mode="trunk", native_vlan=99)

    snapshot = run(variant(minimal, stopped))
    link = find_link(snapshot, (CORE_2, "Ethernet1/4"), (FW_1, "agg-core"))
    assert link is not None and link.speed_mbps is None and link.oper == "down"
    assert len(checks(snapshot, "remote_port_is_aggregate")) == 1
    for code in ("link_oper_mismatch", "link_down", "link_speed_mismatch", "native_vlan_mismatch"):
        assert not on_link(snapshot, code, (CORE_2, "Ethernet1/4"), (FW_1, "agg-core")), code
    assert len(checks(snapshot, "link_oper_mismatch")) == 1  # celui du scénario 2


def test_a_hub_on_a_down_port_carries_one_mismatch_per_cable(minimal):
    """Deux câbles observés depuis un port down : deux `link_oper_mismatch`, même témoin, câbles distincts, aucun
    n'est perdu au dédoublonnage (revue, B7)."""

    def hub(d: dict) -> None:
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/5", CORE_2, "Ethernet1/4"))
        d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/5", FW_1, "x2", ("router",)))

    snapshot = run(variant(minimal, hub))
    found = [c for c in checks(snapshot, "link_oper_mismatch") if c.refs[0].name == "Ethernet1/5"]
    far_ends = {end.hostname for c in found for end in (c.refs[1].a, c.refs[1].b)} - {CORE_1}
    assert len(found) == 2 and far_ends == {CORE_2, FW_1}
    assert not checks(snapshot, "documented_port_without_transceiver")  # Eth1/5 n'a pas de description


def test_both_ends_not_present_on_a_documented_cable(minimal):
    """Le câble Eth1/3 ↔ x1 reste dessiné et dit `link_down` ; chaque bout documenté sans transceiver est signalé."""

    def no_sfp(d: dict) -> None:
        interface(d, CORE_1, "Ethernet1/3").update(oper_status="not_present", oper_reason="SFP not inserted")
        interface(d, FW_1, "x1").update(oper_status="not_present", oper_reason=None)

    snapshot = run(variant(minimal, no_sfp))
    assert len(on_link(snapshot, "link_down", (CORE_1, "Ethernet1/3"), (FW_1, "x1"))) == 1
    found = checks(snapshot, "documented_port_without_transceiver")
    assert sorted((c.refs[0].hostname, c.refs[0].name) for c in found) == [(FW_1, "x1"), (CORE_1, "Ethernet1/3")]


def test_a_management_port_without_transceiver_is_flagged_too(minimal):
    doc = variant(
        minimal, lambda d: interface(d, CORE_1, "Ethernet1/5").update(type="management", description="C3|oob-01|Gi0/1|")
    )
    assert len(checks(run(doc), "documented_port_without_transceiver")) == 1


def test_failed_task_has_no_check_yet_but_stays_visible(minimal):
    def failed(d: dict) -> None:
        task = next(t for t in d["tasks"] if t["hostname"] == FW_1)
        task["status"] = "failed"
        for subject in task["status_per_subject"].values():
            subject["status"] = "failed"

    snapshot = run(variant(minimal, failed))
    assert next(n for n in snapshot.nodes if n.hostname == FW_1).collection == "failed"
    assert not [c for c in snapshot.checks if c.code.startswith("device_") and c.refs[0].hostname == FW_1]


def test_state_checks_are_counted_in_the_report(snapshot):
    r5 = [
        c
        for c in snapshot.checks
        if c.code in {"link_oper_mismatch", "device_unreachable", "device_partial_collection"}
    ]
    assert len(r5) == 3 and snapshot.report.counts.checks == len(snapshot.checks)

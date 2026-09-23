"""Le document Snapshot : version, identités, ordre canonique, références, comptes, immuabilité."""

import copy
import json

import pytest
from pydantic import BaseModel, ValidationError

from ld_contracts.snapshot import SNAPSHOT_VERSION, Snapshot
from ld_contracts.snapshot.serialize import canonical_json
from tests.snapshot.conftest import (
    TOPICS,
    aggregate_doc,
    check_doc,
    coverage_doc,
    endpoint,
    error_types,
    evidence_doc,
    first_error,
    ha_cluster_doc,
    interface_doc,
    link_doc,
    mlag_domain_doc,
    node_doc,
    stub_doc,
    with_section,
)


def test_example_snapshot_is_valid(snap):
    snapshot = Snapshot.model_validate(snap)
    assert snapshot.snapshot_version == SNAPSHOT_VERSION
    assert len(snapshot.nodes) == 2 and len(snapshot.links) == 1


def test_major_version_must_be_supported(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate({**snap, "snapshot_version": "2.0.0"})
    assert first_error(exc)["type"] == "snapshot_major_unsupported"
    Snapshot.model_validate({**snap, "snapshot_version": "1.7.3"})


def test_unknown_top_level_key_and_missing_key_are_refused(snap):
    with pytest.raises(ValidationError):
        Snapshot.model_validate({**snap, "produced_by": "b1"})
    incomplete = dict(snap)
    del incomplete["ha_clusters"]
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(incomplete)
    assert first_error(exc)["type"] == "missing"


def test_no_field_of_any_snapshot_model_has_a_default():
    """Décision 2026-09-20 : B1 écrit toutes les clés ; une clé absente n'est jamais lue comme null."""
    from ld_contracts.defaults import nested_models

    seen: set[type[BaseModel]] = set()
    todo = [Snapshot]
    while todo:
        model = todo.pop()
        if model in seen:
            continue
        seen.add(model)
        for name, info in model.model_fields.items():
            assert info.is_required(), (model.__name__, name)
        todo.extend(nested_models(model))
    assert len(seen) > 15


def test_nodes_sorted_by_kind_then_hostname(snap):
    stub = stub_doc()
    ordered = with_section(snap, "nodes", [*snap["nodes"], stub])
    Snapshot.model_validate(ordered)
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "nodes", [stub, *snap["nodes"]]))
    err = first_error(exc)
    assert err["type"] == "not_canonical_order" and err["ctx"] == {"section": "nodes", "index": 1}


def test_duplicate_node_is_refused(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "nodes", [snap["nodes"][0], snap["nodes"][0]]))
    assert first_error(exc)["type"] == "duplicate_identity"


def test_interfaces_sorted_by_hostname_then_natural_name(snap):
    extra = interface_doc(name="Ethernet1/10", description=None, description_parsed=None)
    second = interface_doc(name="Ethernet1/2", description=None, description_parsed=None)
    good = with_section(snap, "interfaces", [snap["interfaces"][0], second, extra, snap["interfaces"][1]])
    Snapshot.model_validate(good)
    bad = with_section(snap, "interfaces", [snap["interfaces"][0], extra, second, snap["interfaces"][1]])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(bad)
    assert first_error(exc)["ctx"] == {"section": "interfaces", "index": 2}


def test_interface_of_unknown_node_is_refused(snap):
    ghost = interface_doc(hostname="sw-z", description=None, description_parsed=None)
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "interfaces", [*snap["interfaces"], ghost]))
    err = first_error(exc)
    assert err["type"] == "reference_unknown"
    assert "sw-z" not in err["msg"]
    assert err["ctx"] == {"section": "interfaces", "index": 2, "field": "hostname", "target": "nodes"}


def test_link_endpoint_on_unknown_node_is_refused_but_unknown_interface_is_allowed(snap):
    """Un device injoignable n'a pas d'interfaces : ses câbles documentés depuis l'autre bout restent (Q5)."""
    unreachable = node_doc(hostname="sw-c", collection="unreachable", reported_hostname=None, uptime_seconds=None)
    documented = link_doc(
        b=endpoint("sw-c", "Ethernet1/7"),
        status="documented_only",
        evidence=[
            {
                "source": "description",
                "witness": endpoint("sw-a", "Ethernet1/1"),
                "remote_raw": {"name": "sw-c", "port": "Ethernet1/7"},
                "remote_resolved": endpoint("sw-c", "Ethernet1/7"),
                "resolution": "hostname",
            }
        ],
        oper="unknown",
        speed_mbps=None,
    )
    doc = with_section(snap, "nodes", [*snap["nodes"], unreachable])
    doc = with_section(
        doc,
        "coverage",
        [*doc["coverage"], coverage_doc("sw-c", status="unreachable", topics=dict.fromkeys(TOPICS, "absent"))],
    )
    Snapshot.model_validate(with_section(doc, "links", [*doc["links"], documented]))
    ghost = {
        **documented,
        "b": endpoint("sw-z", "Ethernet1/7"),
        "evidence": [
            {
                **documented["evidence"][0],
                "remote_raw": {"name": "sw-z", "port": "Ethernet1/7"},
                "remote_resolved": endpoint("sw-z", "Ethernet1/7"),
            }
        ],
    }
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "links", [*doc["links"], ghost]))
    assert first_error(exc)["ctx"] == {"section": "links", "index": 1, "field": "b.hostname", "target": "nodes"}


def test_links_sorted_by_endpoint_pair(snap):
    other = link_doc(
        a=endpoint("sw-a", "Ethernet1/2"),
        b=endpoint("sw-b", "Ethernet1/2"),
        evidence=[
            evidence_doc(witness=endpoint("sw-a", "Ethernet1/2"), remote_resolved=endpoint("sw-b", "Ethernet1/2"))
        ],
        status="observed_only",
    )
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "links", [other, snap["links"][0]]))
    assert first_error(exc)["type"] == "not_canonical_order"


def test_check_refs_must_resolve(snap):
    doc = with_section(snap, "checks", [check_doc()])
    Snapshot.model_validate(doc)
    dangling = check_doc(refs=[{"kind": "interface", "hostname": "sw-a", "name": "Ethernet1/9"}])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "checks", [dangling]))
    assert first_error(exc)["ctx"] == {"section": "checks", "index": 0, "field": "refs[0]", "target": "interfaces"}
    for ref, target in (
        ({"kind": "node", "hostname": "sw-z"}, "nodes"),
        ({"kind": "aggregate", "hostname": "sw-a", "name": "port-channel99"}, "aggregates"),
        ({"kind": "cluster", "members": ["fw-1", "fw-2"]}, "ha_clusters"),
        ({"kind": "link", "a": endpoint("sw-a", "Ethernet1/9"), "b": endpoint("sw-b", "Ethernet1/9")}, "links"),
    ):
        with pytest.raises(ValidationError) as exc:
            Snapshot.model_validate(with_section(snap, "checks", [check_doc(refs=[ref])]))
        assert first_error(exc)["ctx"]["target"] == target, ref


def test_checks_sorted_by_code_refs_then_details(snap):
    first = check_doc(code="link_down", details={"a": 1})
    second = check_doc(code="link_down", details={"a": 2})
    third = check_doc(code="link_oper_mismatch", severity="warning")
    Snapshot.model_validate(with_section(snap, "checks", [first, second, third]))
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "checks", [third, first]))
    assert first_error(exc)["type"] == "not_canonical_order"
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "checks", [first, first]))
    assert first_error(exc)["type"] == "duplicate_identity"


def test_aggregate_cables_and_mlag_members_must_resolve(snap):
    doc = with_section(snap, "aggregates", [aggregate_doc()])
    Snapshot.model_validate(doc)
    broken = aggregate_doc(cables=[{"a": endpoint("sw-a", "Ethernet1/8"), "b": endpoint("sw-b", "Ethernet1/8")}])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "aggregates", [broken]))
    assert first_error(exc)["ctx"] == {"section": "aggregates", "index": 0, "field": "cables[0]", "target": "links"}
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "mlag_domains", [mlag_domain_doc()]))
    assert first_error(exc)["ctx"]["target"] == "aggregates"


def test_mlag_domain_resolves_when_its_aggregates_and_downstream_exist(snap):
    nodes = [node_doc(hostname="fw-1", type="firewall", reported_hostname="fw-1"), *snap["nodes"]]
    aggregates = [
        aggregate_doc(name="port-channel10"),
        aggregate_doc(name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[]),
        aggregate_doc(hostname="sw-b", name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[]),
    ]
    doc = with_section(snap, "nodes", nodes)
    doc = with_section(doc, "coverage", [coverage_doc("fw-1"), *doc["coverage"]])
    doc = with_section(doc, "aggregates", aggregates)
    Snapshot.model_validate(with_section(doc, "mlag_domains", [mlag_domain_doc()]))
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "mlag_domains", [mlag_domain_doc(downstream="fw-9")]))
    assert first_error(exc)["ctx"]["field"] == "downstream"


def test_ha_cluster_members_and_heartbeat_cables_must_resolve(snap):
    nodes = [
        node_doc(hostname="fw-1", type="firewall", reported_hostname="fw-1"),
        node_doc(
            hostname="fw-2", type="firewall", reported_hostname=None, uptime_seconds=None, collection="unreachable"
        ),
        *snap["nodes"],
    ]
    doc = with_section(snap, "nodes", nodes)
    doc = with_section(
        doc,
        "coverage",
        [
            coverage_doc("fw-1"),
            coverage_doc("fw-2", status="unreachable", topics=dict.fromkeys(TOPICS, "absent")),
            *doc["coverage"],
        ],
    )
    Snapshot.model_validate(with_section(doc, "ha_clusters", [ha_cluster_doc()]))
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "ha_clusters", [ha_cluster_doc()]))
    assert first_error(exc)["ctx"] == {
        "section": "ha_clusters",
        "index": 0,
        "field": "members[0].hostname",
        "target": "nodes",
    }
    hb = [
        {"hostname": "fw-1", "interface": "ha1", "cable": {"a": endpoint("fw-1", "ha1"), "b": endpoint("fw-2", "ha1")}}
    ]
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "ha_clusters", [ha_cluster_doc(heartbeat_interfaces=hb)]))
    assert first_error(exc)["ctx"]["target"] == "links"


def test_coverage_lists_exactly_the_device_nodes(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "coverage", snap["coverage"][:1]))
    assert first_error(exc)["type"] == "coverage_mismatch"
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "coverage", [*snap["coverage"], coverage_doc("sw-z")]))
    assert first_error(exc)["type"] == "coverage_mismatch"
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "coverage", list(reversed(snap["coverage"]))))
    assert first_error(exc)["type"] == "not_canonical_order"


def test_coverage_topics_are_the_six_canonical_topics(snap):
    """`topics` est un objet à six clés fixes : une clé manquante ou un alias amont sont refusés."""
    bad = coverage_doc("sw-a")
    del bad["topics"]["ha"]
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "coverage", [bad, coverage_doc("sw-b")]))
    assert "missing" in error_types(exc)
    bad = coverage_doc("sw-a")
    bad["topics"]["lldp_neighbors"] = "success"
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "coverage", [bad, coverage_doc("sw-b")]))
    assert "extra_forbidden" in error_types(exc)


def test_report_counts_must_match_sections(snap):
    bad = copy.deepcopy(snap)
    bad["report"]["counts"]["links"] = 2
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(bad)
    err = first_error(exc)
    assert err["type"] == "report_counts_mismatch" and err["ctx"] == {"section": "links", "declared": 2, "actual": 1}


def test_report_unresolved_names_sorted_unique(snap):
    bad = copy.deepcopy(snap)
    bad["report"]["unresolved_names"] = ["srv-b", "srv-a"]
    with pytest.raises(ValidationError):
        Snapshot.model_validate(bad)
    bad["report"]["unresolved_names"] = ["srv-a", "srv-b"]
    Snapshot.model_validate(bad)


def test_source_sha256_is_hex_of_64(snap):
    bad = copy.deepcopy(snap)
    bad["source"]["bundle_sha256"] = "abc"
    with pytest.raises(ValidationError):
        Snapshot.model_validate(bad)


def test_snapshot_is_immutable(snap):
    snapshot = Snapshot.model_validate(snap)
    with pytest.raises(ValidationError):
        snapshot.snapshot_version = "1.0.1"  # type: ignore[misc]


def test_canonical_json_is_byte_stable_under_key_permutation(snap):
    snapshot = Snapshot.model_validate(snap)
    shuffled = json.loads(json.dumps(snap, sort_keys=True))
    shuffled = {k: shuffled[k] for k in reversed(list(shuffled))}
    text = canonical_json(snapshot)
    assert text == canonical_json(Snapshot.model_validate(shuffled))
    assert text.endswith("\n") and not text.endswith("\n\n")
    assert '"snapshot_version"' in text and "\\u" not in text
    assert Snapshot.model_validate(json.loads(text)) == snapshot


def test_aggregate_and_peer_link_references_must_resolve(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "aggregates", [aggregate_doc(hostname="sw-z")]))
    assert first_error(exc)["ctx"] == {"section": "aggregates", "index": 0, "field": "hostname", "target": "nodes"}
    doc = with_section(
        snap,
        "aggregates",
        [
            aggregate_doc(name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[]),
            aggregate_doc(hostname="sw-b", name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[]),
        ],
    )
    domain = mlag_domain_doc(peer_link={"hostname": "sw-a", "aggregate": "port-channel99"}, downstream=None)
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "mlag_domains", [domain]))
    assert first_error(exc)["ctx"] == {
        "section": "mlag_domains",
        "index": 0,
        "field": "peer_link",
        "target": "aggregates",
    }


def test_snapshot_sha256_is_the_hash_of_the_canonical_bytes(snap):
    import hashlib

    from ld_contracts.snapshot.serialize import snapshot_sha256

    snapshot = Snapshot.model_validate(snap)
    assert snapshot_sha256(snapshot) == hashlib.sha256(canonical_json(snapshot).encode("utf-8")).hexdigest()


def test_hostname_is_unique_across_node_kinds_without_case(snap):
    """`hostname` est la clé des nœuds, toutes sortes confondues : un stub homonyme d'un device est un bug de R0."""
    evidence = stub_doc()["evidence"]
    for hostname in ("sw-a", "SW-A"):
        twin = node_doc(
            kind="external",
            hostname=hostname,
            collection=None,
            evidence=evidence,
            reported_hostname=None,
            uptime_seconds=None,
        )
        with pytest.raises(ValidationError) as exc:
            Snapshot.model_validate(with_section(snap, "nodes", [*snap["nodes"], twin]))
        err = first_error(exc)
        assert err["type"] == "duplicate_identity" and err["ctx"] == {"section": "nodes", "index": 2}


def test_coverage_status_must_match_the_node_collection_status(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(
            with_section(snap, "coverage", [coverage_doc("sw-a", status="partial"), coverage_doc("sw-b")])
        )
    err = first_error(exc)
    assert err["type"] == "coverage_status_mismatch" and err["ctx"] == {"index": 0}


def test_coverage_topics_are_all_absent_when_nothing_was_collected():
    from ld_contracts.snapshot.report import Coverage

    for status in ("unreachable", "not_collected"):
        with pytest.raises(ValidationError) as exc:
            Coverage.model_validate(coverage_doc("sw-a", status=status))
        assert first_error(exc)["type"] == "coverage_topics_for_status"
        Coverage.model_validate({**coverage_doc("sw-a", status=status), "topics": dict.fromkeys(TOPICS, "absent")})


def test_aggregate_cables_must_touch_one_of_its_members(snap):
    stranger = aggregate_doc(members=[{"name": "Ethernet1/2", "status": "bundled"}])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "aggregates", [stranger]))
    err = first_error(exc)
    assert err["type"] == "reference_inconsistent"
    assert err["ctx"] == {"section": "aggregates", "index": 0, "field": "cables[0]"}


def test_heartbeat_cable_must_touch_the_heartbeat_interface(snap):
    nodes = [
        node_doc(hostname="fw-1", type="firewall", reported_hostname="fw-1"),
        node_doc(
            hostname="fw-2", type="firewall", reported_hostname=None, uptime_seconds=None, collection="unreachable"
        ),
        *snap["nodes"],
    ]
    doc = with_section(snap, "nodes", nodes)
    absent = dict.fromkeys(TOPICS, "absent")
    doc = with_section(
        doc,
        "coverage",
        [coverage_doc("fw-1"), coverage_doc("fw-2", status="unreachable", topics=absent), *doc["coverage"]],
    )
    cable = {"a": endpoint("sw-a", "Ethernet1/1"), "b": endpoint("sw-b", "Ethernet1/1")}
    hb = [{"hostname": "fw-1", "interface": "ha1", "cable": cable}]
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(doc, "ha_clusters", [ha_cluster_doc(heartbeat_interfaces=hb)]))
    err = first_error(exc)
    assert err["type"] == "reference_inconsistent"
    assert err["ctx"] == {"section": "ha_clusters", "index": 0, "field": "heartbeat_interfaces[0].cable"}


def test_mlag_domain_members_share_the_id_and_peer_link_is_flagged(snap):
    nodes = [node_doc(hostname="fw-1", type="firewall", reported_hostname="fw-1"), *snap["nodes"]]
    doc = with_section(snap, "nodes", nodes)
    doc = with_section(doc, "coverage", [coverage_doc("fw-1"), *doc["coverage"]])
    vpc_a = aggregate_doc(name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[])
    vpc_b = aggregate_doc(hostname="sw-b", name="port-channel20", mlag_id=20, mlag_peer_link=False, cables=[])
    peer = aggregate_doc(name="port-channel10")
    doc = with_section(doc, "aggregates", [peer, vpc_a, vpc_b])
    Snapshot.model_validate(with_section(doc, "mlag_domains", [mlag_domain_doc()]))
    wrong_id = with_section(doc, "aggregates", [peer, {**vpc_a, "mlag_id": 21}, vpc_b])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(wrong_id, "mlag_domains", [mlag_domain_doc()]))
    assert first_error(exc)["ctx"] == {"section": "mlag_domains", "index": 0, "field": "members[0]"}
    not_peer = with_section(doc, "aggregates", [{**peer, "mlag_peer_link": False}, vpc_a, vpc_b])
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(not_peer, "mlag_domains", [mlag_domain_doc()]))
    assert first_error(exc)["ctx"] == {"section": "mlag_domains", "index": 0, "field": "peer_link"}
    third = with_section(
        doc, "aggregates", [aggregate_doc(hostname="fw-1", name="agg-core", cables=[]), peer, vpc_a, vpc_b]
    )
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(
            with_section(
                third, "mlag_domains", [mlag_domain_doc(peer_link={"hostname": "fw-1", "aggregate": "agg-core"})]
            )
        )
    assert first_error(exc)["ctx"] == {"section": "mlag_domains", "index": 0, "field": "peer_link"}


def test_link_aggregate_fields_match_the_interface_membership(snap):
    with pytest.raises(ValidationError) as exc:
        Snapshot.model_validate(with_section(snap, "links", [link_doc(aggregate_a="port-channel99")]))
    err = first_error(exc)
    assert err["type"] == "reference_inconsistent" and err["ctx"] == {
        "section": "links",
        "index": 0,
        "field": "aggregate_a",
    }
    member = interface_doc(aggregate={"name": "port-channel10", "member_status": "bundled"})
    doc = with_section(snap, "interfaces", [member, snap["interfaces"][1]])
    Snapshot.model_validate(with_section(doc, "links", [link_doc(aggregate_a="port-channel10")]))
    with pytest.raises(ValidationError):
        Snapshot.model_validate(with_section(doc, "links", [link_doc(aggregate_a=None)]))

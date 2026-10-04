"""Contrat Diff v1 : ce qu'il accepte, ce qu'il refuse, et pourquoi (docs/07 §2)."""

import pytest
from pydantic import BaseModel, ValidationError

from ld_contracts.diff import DIFF_VERSION, Diff
from ld_contracts.diff.codes import DIFF_ERROR_TYPES
from ld_contracts.diff.serialize import canonical_json
from tests.diff.conftest import (
    WEEK,
    cable_ref,
    diff_doc,
    entity_change,
    error_types,
    event,
    field_change,
    first_error,
    interface_ref,
    mlag_domain_ref,
    node_ref,
    run_after,
    section,
    with_counts,
)
from tests.snapshot.conftest import check_doc, interface_doc, link_doc, node_doc, stub_doc


def test_the_empty_diff_is_valid_and_says_only_the_volatile_count(empty):
    diff = Diff.model_validate(empty)
    assert diff.diff_version == DIFF_VERSION
    assert diff.elapsed_seconds == WEEK
    assert diff.summary.volatile_changes == 4
    assert diff.nodes.added == () and diff.checks.persisted == 0 and diff.events == ()


def test_no_field_of_any_diff_model_has_a_default():
    """Même règle que le snapshot : B3 écrit toutes les clés, une clé absente n'est jamais lue comme null."""
    from ld_contracts.defaults import nested_models

    seen: set[type[BaseModel]] = set()
    todo = [Diff]
    while todo:
        model = todo.pop()
        if model in seen:
            continue
        seen.add(model)
        for name, info in model.model_fields.items():
            assert info.is_required(), (model.__name__, name)
        todo.extend(nested_models(model))
    assert len(seen) > 10


def test_a_missing_key_and_an_unknown_key_are_refused(empty):
    del empty["events"]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(empty)
    assert first_error(exc)["type"] == "missing"
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**diff_doc(), "comment": "x"})
    assert first_error(exc)["type"] == "extra_forbidden"


def test_an_unsupported_major_is_refused(empty):
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**empty, "diff_version": "2.0.0"})
    error = first_error(exc)
    assert error["type"] == "diff_major_unsupported" and error["ctx"] == {"received": 2, "expected": 1}
    assert Diff.model_validate({**empty, "diff_version": "1.4.0"}).diff_version == "1.4.0"


def test_elapsed_seconds_must_be_the_gap_between_the_two_starts(empty):
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**empty, "elapsed_seconds": WEEK + 1})
    error = first_error(exc)
    assert error["type"] == "elapsed_mismatch"
    assert error["ctx"] == {"declared": WEEK + 1, "actual": WEEK}
    assert "2026" not in error["msg"]


def test_a_negative_gap_is_allowed_the_direction_is_the_callers(empty):
    reversed_doc = {**empty, "before": empty["after"], "after": empty["before"], "elapsed_seconds": -WEEK}
    assert Diff.model_validate(reversed_doc).elapsed_seconds == -WEEK


def test_summary_counts_must_match_the_sections(empty):
    doc = with_counts({**empty, "nodes": section(added=[stub_doc()])})
    assert Diff.model_validate(doc).summary.nodes.added == 1
    doc["summary"]["nodes"]["added"] = 2
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(doc)
    error = first_error(exc)
    assert error["type"] == "counts_mismatch"
    assert error["ctx"] == {"section": "nodes", "part": "added", "declared": 2, "actual": 1}


def test_check_and_event_counts_are_verified_too(empty):
    doc = with_counts({**empty, "checks": {"appeared": [check_doc()], "resolved": [], "persisted": 3}})
    assert Diff.model_validate(doc).checks.persisted == 3
    doc["summary"]["checks"]["persisted"] = 2
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(doc)
    assert first_error(exc)["ctx"]["section"] == "checks"
    rebooted = event("rebooted", node_ref("sw-a"), uptime_before=9000, uptime_after=10, elapsed_seconds=WEEK)
    doc = with_counts({**empty, "events": [rebooted]})
    assert Diff.model_validate(doc).summary.events.rebooted == 1
    doc["summary"]["events"]["flapped"] = 1
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(doc)
    assert first_error(exc)["ctx"] == {"section": "events", "part": "flapped", "declared": 1, "actual": 0}


def test_added_and_removed_lists_follow_the_canonical_order_of_the_snapshot(empty):
    nodes = [node_doc(hostname="sw-b", reported_hostname="sw-b"), node_doc()]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(removed=nodes)}))
    error = first_error(exc)
    assert error["type"] == "not_canonical_order" and error["ctx"] == {"section": "nodes.removed", "index": 1}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(added=[node_doc(), node_doc()])}))
    assert first_error(exc)["type"] == "duplicate_identity"
    interfaces = [interface_doc(name="Ethernet1/10"), interface_doc(name="Ethernet1/2")]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "interfaces": section(added=interfaces)}))
    assert first_error(exc)["ctx"] == {"section": "interfaces.added", "index": 1}, "ordre naturel : 1/2 avant 1/10"


def test_added_entities_are_validated_by_the_snapshot_types(empty):
    bad = link_doc(a=link_doc()["b"], b=link_doc()["a"])
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "links": section(added=[bad])}))
    assert "link_endpoints_unordered" in error_types(exc)


def test_a_change_must_reference_an_entity_of_its_section(empty):
    change = entity_change(interface_ref("sw-a", "Ethernet1/1"))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    error = first_error(exc)
    assert error["type"] == "change_ref_kind_mismatch"
    assert error["ctx"] == {"section": "nodes.changed", "index": 0, "ref_kind": "interface", "expected": "node"}
    ok = with_counts({**empty, "interfaces": section(changed=[change])})
    assert Diff.model_validate(ok).interfaces.changed[0].fields[0].path == "oper_status"


def test_changes_are_sorted_by_reference_and_fields_by_path(empty):
    changes = [entity_change(node_ref("sw-b")), entity_change(node_ref("sw-a"))]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=changes)}))
    assert first_error(exc)["ctx"] == {"section": "nodes.changed", "index": 1}
    fields = [field_change("site", "a", "b"), field_change("model", "x", "y")]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(
            with_counts({**empty, "nodes": section(changed=[entity_change(node_ref("sw-a"), *fields)])})
        )
    assert first_error(exc)["ctx"] == {"section": "fields", "index": 1}
    cables = [entity_change(cable_ref(b=("sw-c", "Ethernet1/1"))), entity_change(cable_ref())]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "links": section(changed=cables)}))
    assert first_error(exc)["type"] == "not_canonical_order"


def test_a_change_without_fields_or_without_difference_is_refused(empty):
    change = {"ref": node_ref("sw-a"), "fields": []}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    assert first_error(exc)["type"] == "too_short" and "too_short" in DIFF_ERROR_TYPES, "nommé au catalogue"
    change = entity_change(node_ref("sw-a"), field_change("site", None, None))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    error = first_error(exc)
    assert error["type"] == "field_change_equal" and error["ctx"] == {"path": "site"}


def test_field_values_are_any_json_including_whole_lists(empty):
    change = entity_change(
        node_ref("sw-a"),
        field_change("stack", None, {"member_count": 2, "members": []}),
        field_change("virtual_contexts", [], ["VDC-1"]),
    )
    diff = Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    assert diff.nodes.changed[0].fields[1].after == ["VDC-1"]


def test_mlag_domains_have_their_own_reference(empty):
    change = entity_change(mlag_domain_ref(), field_change("downstream", None, "fw-1"))
    diff = Diff.model_validate(with_counts({**empty, "mlag_domains": section(changed=[change])}))
    assert diff.mlag_domains.changed[0].ref.kind == "mlag_domain"
    unsorted = mlag_domain_ref(hosts=("sw-b", "sw-a"))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "mlag_domains": section(changed=[entity_change(unsorted)])}))
    assert first_error(exc)["type"] == "not_canonical_order"
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[entity_change(mlag_domain_ref())])}))
    assert first_error(exc)["type"] == "change_ref_kind_mismatch"


def test_an_event_references_the_kind_of_entity_its_fact_is_about(empty):
    wrong = event("flapped", node_ref("sw-a"), age_after=10, elapsed_seconds=WEEK)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [wrong]}))
    error = first_error(exc)
    assert error["type"] == "event_ref_kind_mismatch"
    assert error["ctx"] == {"event": "flapped", "ref_kind": "node", "expected": "interface"}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [event("stormed", node_ref("sw-a"))]}))
    assert first_error(exc)["type"] == "enum"


def test_events_are_sorted_by_kind_then_reference(empty):
    events = [
        event("flapped", interface_ref("sw-a", "Ethernet1/1"), age_after=10, elapsed_seconds=WEEK),
        event("rebooted", node_ref("sw-a"), uptime_before=9000, uptime_after=100, elapsed_seconds=WEEK),
    ]
    assert Diff.model_validate(with_counts({**empty, "events": events})).summary.events.flapped == 1
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": list(reversed(events))}))
    assert first_error(exc)["ctx"] == {"section": "events", "index": 1}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [events[0], events[0]]}))
    assert first_error(exc)["type"] == "duplicate_identity"


def test_checks_are_sorted_and_persisted_is_a_count(empty):
    checks = [check_doc(code="link_down"), check_doc(code="documented_not_observed", severity="warning")]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "checks": {"appeared": checks, "resolved": [], "persisted": 0}}))
    assert first_error(exc)["ctx"] == {"section": "checks.appeared", "index": 1}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "checks": {"appeared": [], "resolved": [], "persisted": -1}}))
    assert first_error(exc)["type"] == "greater_than_equal"


def test_coverage_changes_reference_nodes(empty):
    change = entity_change(node_ref("sw-a"), field_change("topics.lldp", "success", "failed"))
    assert Diff.model_validate(with_counts({**empty, "coverage": {"changed": [change]}})).summary.coverage.changed == 1
    wrong = entity_change(interface_ref("sw-a", "Ethernet1/1"))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "coverage": {"changed": [wrong]}}))
    assert first_error(exc)["ctx"]["section"] == "coverage.changed"


def test_run_refs_carry_the_identity_of_both_snapshots(empty):
    diff = Diff.model_validate(empty)
    assert diff.before.collector_run_id != diff.after.collector_run_id
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**empty, "after": run_after(bundle_sha256="not-hex")})
    assert first_error(exc)["type"] == "string_pattern_mismatch"
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**empty, "after": run_after(start_datetime=1_757_000_000)})
    assert first_error(exc)["type"] == "datetime_numeric"


def test_canonical_json_is_stable_and_round_trips(empty):
    doc = with_counts({**empty, "nodes": section(added=[stub_doc()])})
    text = canonical_json(Diff.model_validate(doc))
    assert text.endswith("}\n") and text.index('"after"') < text.index('"before"'), "clés triées"
    assert Diff.model_validate_json(text) == Diff.model_validate(doc)
    assert canonical_json(Diff.model_validate_json(text)) == text


# ---------------------------------------------------------------- refus ajoutés après la revue (2026-10-04, M3 et B1)


def test_events_need_a_positive_window_and_copy_it(empty):
    flap = event("flapped", interface_ref("sw-a", "Ethernet1/1"), age_after=10, elapsed_seconds=WEEK)
    reversed_doc = {**empty, "before": empty["after"], "after": empty["before"], "elapsed_seconds": -WEEK}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(
            with_counts({**reversed_doc, "events": [event("flapped", flap["ref"], age_after=0, elapsed_seconds=1)]})
        )
    error = first_error(exc)
    assert error["type"] == "events_without_elapsed" and error["ctx"] == {"elapsed_seconds": -WEEK, "events": 1}
    same_start = {**empty, "after": run_after(start_datetime=empty["before"]["start_datetime"]), "elapsed_seconds": 0}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(
            with_counts({**same_start, "events": [event("flapped", flap["ref"], age_after=0, elapsed_seconds=1)]})
        )
    assert first_error(exc)["type"] == "events_without_elapsed"
    stale = event("flapped", flap["ref"], age_after=10, elapsed_seconds=WEEK - 1)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [stale]}))
    error = first_error(exc)
    assert error["type"] == "event_elapsed_mismatch"
    assert error["ctx"] == {"index": 0, "declared": WEEK - 1, "actual": WEEK}


def test_event_details_are_typed_by_kind_and_must_fall_in_the_window(empty):
    wrong = event("rebooted", node_ref("sw-a"), age_after=10, elapsed_seconds=WEEK)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [wrong]}))
    error = first_error(exc)
    assert error["type"] == "event_details_mismatch" and error["ctx"] == {
        "event": "rebooted",
        "expected": "RebootedDetails",
    }
    late = event("rebooted", node_ref("sw-a"), uptime_before=None, uptime_after=WEEK, elapsed_seconds=WEEK)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [late]}))
    assert "event_not_in_window" in error_types(exc)
    flap = event("flapped", interface_ref("sw-a", "Ethernet1/1"), age_after=WEEK + 5, elapsed_seconds=WEEK)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [flap]}))
    assert "event_not_in_window" in error_types(exc)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "events": [event("rebooted", node_ref("sw-a"), uptime_after=10)]}))
    assert "missing" in error_types(exc), "les détails ont toutes leurs clés"
    unread = event("rebooted", node_ref("sw-a"), uptime_before=None, uptime_after=10, elapsed_seconds=WEEK)
    assert Diff.model_validate(with_counts({**empty, "events": [unread]})).events[0].details.uptime_before is None


def test_an_identity_lives_in_one_part_of_its_section_only(empty):
    both = section(added=[node_doc()], changed=[entity_change(node_ref("sw-a"))])
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": both}))
    error = first_error(exc)
    assert error["type"] == "identity_in_several_parts"
    assert error["ctx"] == {"section": "nodes", "parts": ["added", "changed"], "index": 0}
    gone_and_back = section(added=[node_doc()], removed=[stub_doc(hostname="sw-a")])
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": gone_and_back}))
    assert first_error(exc)["ctx"]["parts"] == ["added", "removed"], "un stub devenu device est un changé, pas les deux"
    cable = link_doc()
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(
            with_counts({**empty, "links": section(removed=[cable], changed=[entity_change(cable_ref())])})
        )
    assert first_error(exc)["ctx"]["section"] == "links"
    checks = {"appeared": [check_doc()], "resolved": [check_doc(details={"reason": "x"})], "persisted": 0}
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "checks": checks}))
    error = first_error(exc)
    assert error["type"] == "identity_in_several_parts"
    assert error["ctx"] == {"section": "checks", "parts": ["appeared", "resolved"], "index": 0}


def test_a_declared_volatile_field_never_enters_changed(empty):
    change = entity_change(node_ref("sw-a"), field_change("uptime_seconds", 100, 200))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    error = first_error(exc)
    assert error["type"] == "field_change_volatile"
    assert error["ctx"] == {"section": "nodes.changed", "index": 0, "path": "uptime_seconds"}
    change = entity_change(interface_ref("sw-a", "Ethernet1/1"), field_change("last_change_age_seconds", 5, 6))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "interfaces": section(changed=[change])}))
    assert first_error(exc)["type"] == "field_change_volatile"
    ok = entity_change(interface_ref("sw-a", "Ethernet1/1"), field_change("uptime_seconds", 1, 2))
    assert Diff.model_validate(with_counts({**empty, "interfaces": section(changed=[ok])})), (
        "volatil d'une autre section"
    )


def test_a_field_path_is_dotted_identifiers_never_a_list_index(empty):
    change = entity_change(node_ref("sw-a"), field_change("evidence.0.source", "lldp", "cdp"))
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "nodes": section(changed=[change])}))
    assert first_error(exc)["type"] == "string_pattern_mismatch"
    ok = entity_change(node_ref("sw-a"), field_change("topics.mac_table", "success", "failed"))
    assert Diff.model_validate(with_counts({**empty, "coverage": {"changed": [ok]}})).coverage.changed[0]


def test_shared_rules_of_the_snapshot_apply_to_the_diff_references(empty):
    same_device = mlag_domain_ref()
    same_device["members"] = [
        {"hostname": "sw-a", "aggregate": "port-channel20"},
        {"hostname": "sw-a", "aggregate": "port-channel21"},
    ]
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate(with_counts({**empty, "mlag_domains": section(changed=[entity_change(same_device)])}))
    assert "mlag_domain_same_device" in error_types(exc)
    with pytest.raises(ValidationError) as exc:
        Diff.model_validate({**empty, "after": run_after(snapshot_version="2.0.0")})
    error = first_error(exc)
    assert error["type"] == "snapshot_major_unsupported" and error["ctx"] == {"received": 2, "expected": 1}

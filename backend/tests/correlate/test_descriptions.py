"""R2 : grammaire `criticité|voisin|port|options` (V1, décision 2 du 2026-09-20) et forme HA positionnelle
(2026-10-02)."""

import pytest
from ld_contracts.models_ha import HaStatus

from ld_backend.correlate.descriptions import HaPlace, Unresolved, ha_places, parse_description


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("C1|sw-core-02|Ethernet1/1|", ("C1", "sw-core-02", "Ethernet1/1", None)),
        ("C1|sw-core-02|Ethernet1/1", ("C1", "sw-core-02", "Ethernet1/1", None)),
        ("C1|sw-core-02|", ("C1", "sw-core-02", None, None)),
        ("C1|sw-core-02", ("C1", "sw-core-02", None, None)),
        ("|sw-core-02|x1|", (None, "sw-core-02", "x1", None)),
        ("C2|fw-edge-01|x1|speed=10G;owner=net", ("C2", "fw-edge-01", "x1", "speed=10G;owner=net")),
        ("C2|fw-edge-01|x1|a=1|b=2", ("C2", "fw-edge-01", "x1", "a=1|b=2")),
        (" C1 | sw-core-02 | Ethernet1/1 ", ("C1", "sw-core-02", "Ethernet1/1", None)),
    ],
)
def test_grammar(text, expected):
    parsed = parse_description(text)
    assert parsed is not None
    assert (parsed.criticality, parsed.neighbor, parsed.port, parsed.options) == expected


@pytest.mark.parametrize(
    "text", [None, "", "   ", "uplink to core", "C1||Ethernet1/1|", "C1|not a name|x1|", "C1| |x1"]
)
def test_unparseable_or_empty_gives_none(text):
    assert parse_description(text) is None


# --- forme HA positionnelle (2026-10-02, revue appliquée) : une paire par membre, rang par priorité décroissante ---

HA_TEXT = "C1|monswitch1|Eth1/1|monswitch2|Eth1/2"
PAIR = ("fw-01", "fw-02")
TRIO = ("fw-01", "fw-02", "fw-03")


def place(rank: int, members: tuple[str, ...] = PAIR) -> HaPlace:
    return HaPlace(members=members, rank=rank)


@pytest.mark.parametrize(
    ("rank", "expected"),
    [(0, ("C1", "monswitch1", "Eth1/1", None)), (1, ("C1", "monswitch2", "Eth1/2", None))],
)
def test_ha_form_gives_each_member_its_own_pair(rank, expected):
    parsed = parse_description(HA_TEXT, place(rank))
    assert (parsed.criticality, parsed.neighbor, parsed.port, parsed.options) == expected


def test_a_three_member_cluster_reads_its_third_pair():
    parsed = parse_description("C1|sw1|E1|sw2|E2|sw3|E3", place(2, TRIO))
    assert (parsed.neighbor, parsed.port, parsed.options) == ("sw3", "E3", None)


def test_ha_form_with_an_empty_port_targets_the_device_only():
    parsed = parse_description(" C1 | sw1 | | sw2 | ", place(0))
    assert (parsed.criticality, parsed.neighbor, parsed.port, parsed.options) == ("C1", "sw1", None, None)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("C2|sw-core-01|Ethernet1/3|", ("sw-core-01", "Ethernet1/3", None)),
        ("C2|fw-edge-01|x1|a=1|b=2", ("fw-edge-01", "x1", "a=1|b=2")),
        ("C2|sw-core-01|Ethernet1/3|sw-core-01", ("sw-core-01", "Ethernet1/3", "sw-core-01")),  # M3, parqué
    ],
)
def test_v1_on_a_cluster_member_stays_v1(text, expected):
    parsed = parse_description(text, place(1))
    assert (parsed.neighbor, parsed.port, parsed.options) == expected


def test_without_a_cluster_five_fields_are_read_as_v1():  # revue, H1
    parsed = parse_description(HA_TEXT)
    assert (parsed.neighbor, parsed.port, parsed.options) == ("monswitch1", "Eth1/1", "monswitch2|Eth1/2")
    parsed = parse_description("C2|fw-edge-01|x1|uplink|10G")
    assert (parsed.neighbor, parsed.port, parsed.options) == ("fw-edge-01", "x1", "uplink|10G")


def test_on_a_member_an_option_with_a_separator_has_the_ha_form():  # revue, H2 : piège assumé, documenté
    parsed = parse_description("C2|sw-core-01|Ethernet1/3|uplink|10G", place(1))
    assert (parsed.neighbor, parsed.port) == ("uplink", "10G")


@pytest.mark.parametrize(
    ("text", "members", "fields"),
    [
        (HA_TEXT, TRIO, 5),  # moins de paires que de membres
        ("C1|sw1|E1|sw2|E2|sw3|E3", PAIR, 7),  # plus de paires que de membres (revue, H3)
        ("C1|sw1|E1|sw2|E2|speed=10G", PAIR, 6),  # aucune option en forme HA
    ],
)
def test_a_field_count_other_than_one_plus_two_per_member_is_unresolved(text, members, fields):
    found = parse_description(text, place(0, members))
    assert isinstance(found, Unresolved) and found.reason == "field_count_mismatch"
    assert found.details() == {
        "reason": "field_count_mismatch",
        "members": list(members),
        "fields": fields,
        "expected_fields": 1 + 2 * len(members),
    }


def test_a_device_field_that_is_not_a_name_is_unresolved():
    found = parse_description("C1|sw1|E1|sw2|E2|not a name|E3", place(0, TRIO))
    assert isinstance(found, Unresolved) and found.details() == {
        "reason": "device_not_a_name",
        "members": list(TRIO),
        "field": 6,
    }


def test_an_undecided_place_is_returned_with_its_reason():
    undecided = Unresolved("priority_undecided", PAIR, priorities=(("fw-01", 200), ("fw-02", 200)))
    assert parse_description(HA_TEXT, undecided) is undecided
    assert parse_description("C2|sw-core-01|Ethernet1/3|", undecided).neighbor == "sw-core-01"  # V1 reste lue


@pytest.mark.parametrize("text", ["uplink to core", "C1|not a name|x|sw2|E2"])
def test_text_outside_both_grammars_stays_none_on_a_member(text):
    assert parse_description(text, place(0)) is None


# --- la place d'un membre dans son cluster ------------------------------------------------------------------------


def _doc(hostname: str, members: list, mode: str = "active_passive") -> HaStatus:
    return HaStatus.model_validate(
        {
            "hostname": hostname,
            "mode": mode,
            "cluster_name": None,
            "members": [
                {"name": name, "serial": None, "role": role, "state": "up", "priority": priority}
                for name, role, priority in members
            ],
            "heartbeat_interfaces": [],
            "extras": {},
        }
    )


def places(docs: list[HaStatus], known: tuple[str, ...] = TRIO) -> dict:
    return dict(ha_places(docs, frozenset(known)))


def test_rank_follows_priorities_descending_from_one_reporter():
    found = places([_doc("fw-02", [("fw-01", "primary", 200), ("fw-02", "secondary", 100)])])
    assert found == {"fw-01": HaPlace(members=PAIR, rank=0), "fw-02": HaPlace(members=PAIR, rank=1)}


def test_a_member_is_authoritative_on_its_own_priority():
    docs = [
        _doc("fw-01", [("fw-01", "primary", 200), ("fw-02", "secondary", 100)]),
        _doc("fw-02", [("fw-01", "secondary", 200), ("fw-02", "primary", 300)]),
    ]
    found = places(docs)
    assert (found["fw-01"].rank, found["fw-02"].rank) == (1, 0)


def test_an_unread_own_priority_falls_back_to_the_single_value_read():
    docs = [
        _doc("fw-01", [("fw-01", "primary", 200), ("fw-02", "secondary", 100)]),
        _doc("fw-02", [("fw-01", "primary", None), ("fw-02", "secondary", None)]),
    ]
    found = places(docs)
    assert (found["fw-01"].rank, found["fw-02"].rank) == (0, 1)


def test_two_values_read_without_an_own_view_leave_the_rank_undecided():  # revue, M1
    docs = [
        _doc("fw-02", [("fw-01", "primary", 200), ("fw-02", "secondary", 100), ("fw-03", "secondary", 50)]),
        _doc("fw-03", [("fw-01", "primary", 50), ("fw-02", "secondary", 100), ("fw-03", "secondary", 50)]),
    ]
    found = places(docs)["fw-02"]
    assert found.reason == "priority_undecided"
    assert found.details() == {
        "reason": "priority_undecided",
        "members": list(TRIO),
        "priorities": [
            {"hostname": "fw-01", "priority": None},
            {"hostname": "fw-02", "priority": 100},
            {"hostname": "fw-03", "priority": 50},
        ],
        "disputed": [{"hostname": "fw-01", "values": [50, 200]}],
    }


@pytest.mark.parametrize("priorities", [(200, 200), (200, None)])
def test_equal_or_unread_priorities_leave_the_rank_undecided(priorities):
    doc = _doc("fw-01", [("fw-01", "primary", priorities[0]), ("fw-02", "secondary", priorities[1])])
    found = places([doc])["fw-02"]
    assert isinstance(found, Unresolved) and found.members == PAIR
    expected = [{"hostname": "fw-01", "priority": priorities[0]}, {"hostname": "fw-02", "priority": priorities[1]}]
    assert found.details() == {"reason": "priority_undecided", "members": list(PAIR), "priorities": expected}


def test_standalone_gives_no_place():
    assert places([_doc("fw-01", [("fw-01", "member", None)], mode="standalone")]) == {}


def test_a_member_unknown_to_devices_does_not_count():  # revue, M2 : la clé de cluster est celle de R4
    docs = [
        _doc("fw-01", [("fw-01", "primary", 200), ("fw-02", "secondary", 100)]),
        _doc("fw-02", [("fw-01", "primary", 200), ("fw-02", "secondary", 100), ("fw-ghost", "secondary", 10)]),
    ]
    found = places(docs, known=PAIR)
    assert found == {"fw-01": HaPlace(members=PAIR, rank=0), "fw-02": HaPlace(members=PAIR, rank=1)}


def test_a_device_listed_in_two_clusters_is_ambiguous():
    docs = [
        _doc("fw-01", [("fw-01", "primary", 200), ("fw-02", "secondary", 100)]),
        _doc("fw-03", [("fw-01", "primary", 200), ("fw-03", "secondary", 50)]),
    ]
    found = places(docs)
    clusters = [["fw-01", "fw-02"], ["fw-01", "fw-03"]]
    assert found["fw-01"].details() == {"reason": "cluster_ambiguous", "clusters": clusters}
    assert (found["fw-02"].rank, found["fw-03"].rank) == (1, 1)

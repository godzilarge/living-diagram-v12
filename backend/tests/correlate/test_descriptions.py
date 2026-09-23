"""R2 : grammaire `criticité|voisin|port|options` (V1, décision 2 du 2026-09-20)."""

import pytest

from ld_backend.correlate.descriptions import parse_description


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

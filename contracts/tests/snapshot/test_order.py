"""Ordre canonique (R6) : clé naturelle et vérification d'une liste triée sans doublon."""

import pytest
from pydantic_core import PydanticCustomError

from ld_contracts.snapshot.order import natural_key, require_canonical


def test_natural_key_orders_numbers_by_value_not_by_text():
    names = ["Ethernet1/10", "Ethernet1/2", "Ethernet1/1", "Ethernet2/1", "port-channel10", "port-channel2"]
    assert sorted(names, key=natural_key) == [
        "Ethernet1/1",
        "Ethernet1/2",
        "Ethernet1/10",
        "Ethernet2/1",
        "port-channel2",
        "port-channel10",
    ]


def test_natural_key_is_total_between_text_and_numbers():
    assert natural_key("x1") < natural_key("x2") < natural_key("x10")
    assert natural_key("1") < natural_key("a")
    assert natural_key("") < natural_key("0")
    assert natural_key("Ethernet1/1") == natural_key("Ethernet1/1")


def test_require_canonical_accepts_a_strictly_increasing_sequence():
    require_canonical(["a", "b", "c"], key=natural_key, section="nodes")
    require_canonical([], key=natural_key, section="nodes")


def test_require_canonical_rejects_wrong_order_with_position_and_no_value():
    with pytest.raises(PydanticCustomError) as exc:
        require_canonical(["Ethernet1/10", "Ethernet1/2"], key=natural_key, section="interfaces")
    assert exc.value.type == "not_canonical_order"
    assert "Ethernet" not in exc.value.message()
    assert exc.value.context == {"section": "interfaces", "index": 1}


def test_require_canonical_rejects_duplicates():
    with pytest.raises(PydanticCustomError) as exc:
        require_canonical(["a", "a"], key=natural_key, section="nodes")
    assert exc.value.type == "duplicate_identity"
    assert exc.value.context == {"section": "nodes", "index": 1}


def test_natural_key_only_parses_what_the_split_captured():
    """`²` répond vrai à isdigit() mais n'est pas un chiffre décimal : il reste du texte, sans exception."""
    chunks, _ = natural_key("Eth1²")
    assert chunks == ((1, "Eth"), (0, 1), (1, "²"))
    assert natural_key("Eth1²") < natural_key("Eth2")

import pytest
from pydantic import ValidationError

from ld_contracts.models_devices import SystemInfo
from ld_contracts.models_interfaces import Aggregate, Interface
from ld_contracts.models_neighbors import CdpNeighbor, LldpNeighbor
from tests.conftest import first_error, interface_doc, system_doc

RANGE_10_20 = {"first": 10, "last": 20}
RANGE_ALL = {"first": 1, "last": 4094}


def test_interface_accepts_target_document():
    itf = Interface.model_validate(interface_doc())
    assert itf.name == "Ethernet1/1"
    assert itf.type == "physical"


@pytest.mark.parametrize(
    "field,value",
    [
        ("duplex", "full-duplex"),
        ("mac_address", "aaaa.bbbb.cccc"),
        ("type", "VLAN"),
        ("oper_status", "notconnect"),
        ("speed_mbps", "10000"),
    ],
)
def test_interface_rejects_unnormalized_values(field, value):
    with pytest.raises(ValidationError):
        Interface.model_validate(interface_doc(**{field: value}))


def test_interface_rejects_unknown_top_level_field():
    with pytest.raises(ValidationError):
        Interface.model_validate(interface_doc(bandwidth="10000000 Kbit"))


@pytest.mark.parametrize("value", [0, 8121600, "never", None])
def test_interface_last_change_age_accepts_three_states(value):
    """Connu (entier ≥ 0), jamais changé (`\"never\"`), non lu (null) : trois faits distincts (2026-09-16)."""
    itf = Interface.model_validate(interface_doc(last_change_age_seconds=value))
    assert itf.last_change_age_seconds == value


@pytest.mark.parametrize("value", [-1, -2, "Never", "NEVER", "unknown", "", "8121600", 1.5, True])
def test_interface_last_change_age_rejects_sentinels_and_other_strings(value):
    """Ni sentinelle numérique, ni chaîne libre : un `-1` passerait sinon pour « a flappé il y a -1 s »."""
    with pytest.raises(ValidationError):
        Interface.model_validate(interface_doc(last_change_age_seconds=value))


@pytest.mark.parametrize("value", [1, 20, 4094, None])
def test_interface_access_vlan_accepts_1_to_4094_or_null(value):
    """`access_vlan` : VLAN d'un port `access`, entier 1..4094 ; null sinon (2026-09-16)."""
    itf = Interface.model_validate(interface_doc(switchport_mode="access", access_vlan=value))
    assert itf.access_vlan == value


@pytest.mark.parametrize("field,mode", [("access_vlan", "access"), ("native_vlan", "trunk"), ("vlan_id", None)])
@pytest.mark.parametrize("value", [0, 4095, -1, "20", 1.5, True])
def test_interface_vlan_numbers_share_the_same_bounds(field, mode, value):
    """Les trois numéros de VLAN sont bornés 1..4094 ; `native_vlan` n'avait aucune borne."""
    with pytest.raises(ValidationError) as exc:
        Interface.model_validate(interface_doc(switchport_mode=mode, **{field: value}))
    err = first_error(exc)
    assert err["loc"] == (field,) and err["type"] in {"greater_than_equal", "less_than_equal", "int_type"}


@pytest.mark.parametrize(
    "doc,code,fields",
    [
        ({"switchport_mode": "trunk", "access_vlan": 20}, "access_vlan_outside_access_mode", ["access_vlan"]),
        ({"switchport_mode": "routed", "access_vlan": 20}, "access_vlan_outside_access_mode", ["access_vlan"]),
        ({"switchport_mode": "none", "access_vlan": 20}, "access_vlan_outside_access_mode", ["access_vlan"]),
        ({"switchport_mode": None, "access_vlan": 20}, "access_vlan_outside_access_mode", ["access_vlan"]),
        ({"switchport_mode": "access", "native_vlan": 1}, "trunk_vlans_outside_trunk_mode", ["native_vlan"]),
        (
            {"switchport_mode": "access", "allowed_vlans": [RANGE_10_20]},
            "trunk_vlans_outside_trunk_mode",
            ["allowed_vlans"],
        ),
        ({"switchport_mode": "access", "allowed_vlans": []}, "trunk_vlans_outside_trunk_mode", ["allowed_vlans"]),
        (
            {"switchport_mode": "routed", "native_vlan": 1, "allowed_vlans": [RANGE_ALL]},
            "trunk_vlans_outside_trunk_mode",
            ["native_vlan", "allowed_vlans"],
        ),
        ({"switchport_mode": None, "native_vlan": 1}, "trunk_vlans_outside_trunk_mode", ["native_vlan"]),
    ],
)
def test_interface_vlan_fields_must_match_switchport_mode(doc, code, fields):
    """IOS et NX-OS affichent un « Access Mode VLAN » et un « Trunking Native Mode VLAN » sur tout port : le
    producteur met à null la valeur inactive (mode `null` compris), sinon le document est refusé
    (incohérence interne, pas un désaccord réseau)."""
    with pytest.raises(ValidationError) as exc:
        Interface.model_validate(interface_doc(**doc))
    err = first_error(exc)
    assert err["type"] == code
    assert err["ctx"] == {
        "hostname": "sw-core-01",
        "name": "Ethernet1/1",
        "switchport_mode": doc["switchport_mode"],
        "fields": fields,
    }
    assert "20" not in err["msg"] and "10-20" not in err["msg"]


@pytest.mark.parametrize(
    "doc",
    [
        {"switchport_mode": "access", "access_vlan": None},
        {"switchport_mode": "trunk", "native_vlan": None, "allowed_vlans": None},
        {"switchport_mode": "trunk", "native_vlan": 1, "allowed_vlans": [RANGE_10_20, {"first": 100, "last": 100}]},
        {"switchport_mode": None},
    ],
)
def test_interface_vlan_fields_may_be_unread_whatever_the_mode(doc):
    """La cohérence ne va que dans un sens : un mode connu n'oblige pas à connaître ses VLAN."""
    Interface.model_validate(interface_doc(**doc))


@pytest.mark.parametrize("value", [[], [RANGE_10_20, {"first": 45, "last": 45}], [RANGE_ALL], None])
def test_interface_allowed_vlans_is_a_list_of_int_ranges_or_null(value):
    """`allowed_vlans` (2026-09-16) : liste d'intervalles `{first, last}` d'entiers 1..4094, VLAN unique =
    `first == last` ; `[]` = aucun VLAN autorisé, `all` = `[{1, 4094}]`, null = non lu. Plus de chaîne brute."""
    itf = Interface.model_validate(interface_doc(switchport_mode="trunk", allowed_vlans=value))
    if value is None:
        assert itf.allowed_vlans is None
    else:
        assert [r.model_dump() for r in itf.allowed_vlans] == value


@pytest.mark.parametrize(
    "value,code,loc",
    [
        ("10-20,100", "tuple_type", ("allowed_vlans",)),
        ({"first": 10, "last": 20}, "tuple_type", ("allowed_vlans",)),
        (["10-20"], "model_type", ("allowed_vlans", 0)),
        ([10, 20], "model_type", ("allowed_vlans", 0)),
        ([{"first": "10", "last": 20}], "int_type", ("allowed_vlans", 0, "first")),
        ([{"first": 1.0, "last": 20}], "int_type", ("allowed_vlans", 0, "first")),
        ([{"first": True, "last": 20}], "int_type", ("allowed_vlans", 0, "first")),
        ([{"first": 0, "last": 20}], "greater_than_equal", ("allowed_vlans", 0, "first")),
        ([{"first": 10, "last": 4095}], "less_than_equal", ("allowed_vlans", 0, "last")),
        ([{"first": 20, "last": 10}], "vlan_range_inverted", ("allowed_vlans", 0)),
        ([RANGE_10_20, {"first": 30, "last": 25}], "vlan_range_inverted", ("allowed_vlans", 1)),
        ([{"first": 10}], "missing", ("allowed_vlans", 0, "last")),
        ([{"first": 10, "last": 20, "vlan": 1}], "extra_forbidden", ("allowed_vlans", 0, "vlan")),
    ],
)
def test_interface_allowed_vlans_rejects_text_and_bad_ranges(value, code, loc):
    """Deux entiers stricts bornés, `first ≤ last` : chaîne, objet seul, flottant, booléen, intervalle inversé
    sont refusés, et le chemin désigne l'intervalle fautif."""
    with pytest.raises(ValidationError) as exc:
        Interface.model_validate(interface_doc(switchport_mode="trunk", allowed_vlans=value))
    err = first_error(exc)
    assert err["type"] == code and err["loc"] == loc
    if code == "vlan_range_inverted":
        assert err["ctx"] == {"first": value[loc[1]]["first"], "last": value[loc[1]]["last"]}
        assert not any(ch.isdigit() for ch in err["msg"])


@pytest.mark.parametrize(
    "value",
    [
        [RANGE_10_20, RANGE_10_20],
        [RANGE_10_20, {"first": 15, "last": 25}],
        [{"first": 100, "last": 100}, RANGE_ALL],
        [{"first": 45, "last": 45}, {"first": 45, "last": 45}],
    ],
)
def test_interface_allowed_vlans_rejects_overlapping_ranges(value):
    """Aucun équipement n'imprime `10-20,15-25` : un chevauchement ou un doublon vient d'un parseur cassé et
    est refusé à la porte, comme `ha_member_duplicate` (revue du 2026-09-16)."""
    with pytest.raises(ValidationError) as exc:
        Interface.model_validate(interface_doc(switchport_mode="trunk", allowed_vlans=value))
    err = first_error(exc)
    assert err["type"] == "vlan_ranges_overlap" and err["loc"] == ()
    assert err["ctx"]["hostname"] == "sw-core-01" and err["ctx"]["name"] == "Ethernet1/1"
    assert not any(ch.isdigit() for ch in err["msg"])


@pytest.mark.parametrize(
    "value",
    [
        [RANGE_10_20, {"first": 21, "last": 30}],
        [{"first": 100, "last": 100}, RANGE_10_20],
        [RANGE_ALL],
    ],
)
def test_interface_allowed_vlans_accepts_adjacent_and_unordered_ranges(value):
    """Adjacence (`10-20, 21-30`) et ordre libres : c'est de la présentation, B1 fusionne et trie en R6."""
    itf = Interface.model_validate(interface_doc(switchport_mode="trunk", allowed_vlans=value))
    assert [r.model_dump() for r in itf.allowed_vlans] == value


def test_interface_down_access_port_keeps_its_vlan():
    """`switchport_mode` est le mode configuré résolu, jamais « down » : un port access `notconnect` garde
    `access` et son `access_vlan` (IOS affiche « Operational Mode: down », c'est l'administratif qui compte)."""
    itf = Interface.model_validate(
        interface_doc(
            oper_status="down",
            oper_reason="notconnect",
            speed_mbps=None,
            duplex=None,
            switchport_mode="access",
            access_vlan=100,
        )
    )
    assert itf.switchport_mode == "access" and itf.access_vlan == 100


def test_interface_extras_is_free_form():
    itf = Interface.model_validate(interface_doc(extras={"bandwidth": "10000000 Kbit", "n": 1}))
    assert itf.extras["n"] == 1


def test_interface_ip_address_must_be_a_string():
    with pytest.raises(ValidationError):
        Interface.model_validate(
            interface_doc(ip_addresses=[{"address": 1, "prefix": 29, "family": 4, "role": "primary"}])
        )


def test_aggregate_member_status_is_closed_enum():
    doc = {
        "hostname": "sw",
        "name": "port-channel10",
        "oper_status": "up",
        "protocol": "lacp",
        "lacp_mode": "active",
        "min_links": None,
        "members": [{"name": "Ethernet1/1", "status": "P"}],
        "mlag_id": None,
        "mlag_peer_link": False,
        "extras": {},
    }
    with pytest.raises(ValidationError):
        Aggregate.model_validate(doc)
    doc["members"][0]["status"] = "bundled"
    assert Aggregate.model_validate(doc).members[0].status == "bundled"


NEIGHBOR_FIELDS = {"hostname", "local_interface", "neighbor", "neighbor_interface", "neighbor_capabilities", "extras"}
REMOVED_NEIGHBOR_FIELDS = {
    LldpNeighbor: (
        "neighbor_interface_subtype",
        "neighbor_port_description",
        "neighbor_chassis_id",
        "neighbor_chassis_id_subtype",
        "neighbor_management_ip",
        "neighbor_system_description",
        "ttl_seconds",
    ),
    CdpNeighbor: (
        "neighbor_serial",
        "neighbor_platform",
        "neighbor_management_ip",
        "neighbor_native_vlan",
        "neighbor_duplex",
        "neighbor_software_version",
    ),
}


def neighbor_doc(**overrides):
    doc = {
        "hostname": "sw",
        "local_interface": "Ethernet1/1",
        "neighbor": "x",
        "neighbor_interface": "Gi1/0/1",
        "neighbor_capabilities": [],
        "extras": {},
    }
    return {**doc, **overrides}


@pytest.mark.parametrize("model", [LldpNeighbor, CdpNeighbor])
def test_neighbor_topics_carry_only_what_b1_consumes(model):
    """2026-09-18 : ce qu'un voisin collecté dit déjà de lui-même dans ses propres topics sort du contrat."""
    assert set(model.model_fields) == NEIGHBOR_FIELDS
    model.model_validate(neighbor_doc())
    for removed in REMOVED_NEIGHBOR_FIELDS[model]:
        with pytest.raises(ValidationError) as exc:
            model.model_validate(neighbor_doc(**{removed: None}))
        assert first_error(exc)["type"] == "extra_forbidden" and first_error(exc)["loc"] == (removed,)


NON_CANONICAL_MACS = [
    "003a.9c11.2201",
    "00-3a-9c-11-22-01",
    "3C:EC:EF:12:34:56",
    "3c:ec:ef:12:34:5F",
    " 3c:ec:ef:12:34:56",
    "3c:ec:ef:12:34:56\n",
    "\t003a.9c11.2201 ",
]


@pytest.mark.parametrize("model", [LldpNeighbor, CdpNeighbor])
@pytest.mark.parametrize("field", ["neighbor", "neighbor_interface"])
@pytest.mark.parametrize("value", NON_CANONICAL_MACS)
def test_neighbor_identifier_shaped_like_a_mac_must_be_canonical(model, field, value):
    """Sans sous-type annoncé, une MAC se reconnaît à sa forme : B1 la joint à `interfaces[].mac_address`.
    Espaces de bord compris : une MAC entourée de blancs n'est pas une MAC normalisée."""
    with pytest.raises(ValidationError) as exc:
        model.model_validate(neighbor_doc(**{field: value}))
    assert first_error(exc)["type"] == "mac_not_normalized" and first_error(exc)["loc"] == (field,)


def test_both_mac_shaped_identifiers_are_reported_each_on_its_own_field():
    with pytest.raises(ValidationError) as exc:
        LldpNeighbor.model_validate(neighbor_doc(neighbor="003a.9c11.2201", neighbor_interface="003a.9c11.2202"))
    assert [e["loc"] for e in exc.value.errors()] == [("neighbor",), ("neighbor_interface",)]


@pytest.mark.parametrize("model", [LldpNeighbor, CdpNeighbor])
@pytest.mark.parametrize(
    "value", ["3c:ec:ef:12:34:56", "Gi1/0/1", "port 003a.9c11.2201", "10.10.0.254", "003a9c112201", "003a9c-112201"]
)
def test_neighbor_identifier_canonical_mac_or_anything_else_is_accepted(model, value):
    """Seules trois notations sont reconnues comme MAC (`:`, `-`, points Cisco). Douze chiffres hexadécimaux
    sans séparateur ou la notation HP peuvent être un vrai nom ou un serial : acceptés, jamais lus comme MAC."""
    doc = model.model_validate(neighbor_doc(neighbor=value, neighbor_interface=value))
    assert doc.neighbor == value and doc.neighbor_interface == value


@pytest.mark.parametrize("model", [LldpNeighbor, CdpNeighbor])
@pytest.mark.parametrize("value,ok", [("wlan_access_point", True), ("Router", False), ("", False), ("sw-core", False)])
def test_neighbor_capabilities_are_lowercase_tokens(model, value, ok):
    """Vocabulaire ouvert mais forme fermée : c'est sur ces jetons que la vue réseau masque les stubs."""
    doc = neighbor_doc(neighbor_capabilities=[value])
    if ok:
        assert model.model_validate(doc).neighbor_capabilities == (value,)
    else:
        with pytest.raises(ValidationError) as exc:
            model.model_validate(doc)
        assert first_error(exc)["loc"] == ("neighbor_capabilities", 0)


def test_system_document_accepts_target_document():
    info = SystemInfo.model_validate(system_doc())
    assert info.hostname == "sw-core-01" and info.chassis_members == ()


def test_system_document_no_longer_carries_platform():
    """Aucune règle de B1 ne consomme une famille d'OS : le champ est retiré, sa présence est refusée (2026-09-14)."""
    with pytest.raises(ValidationError) as exc:
        SystemInfo.model_validate(system_doc(platform="cisco_nxos"))
    err = first_error(exc)
    assert err["type"] == "extra_forbidden" and err["loc"][-1] == "platform"


def test_two_chassis_members_on_the_same_slot_are_rejected():
    """Contre-revue B1 du 2026-09-20 (M2) : accepté ici, le doublon faisait lever le contrat de sortie dans B1."""
    member = {"slot": 1, "serial": "S1", "model": "C9300", "role": "active", "state": "ready", "priority": 15}
    with pytest.raises(ValidationError) as exc:
        SystemInfo.model_validate(system_doc(chassis_members=[member, {**member, "serial": "S2", "role": "member"}]))
    err = first_error(exc)
    assert err["type"] == "chassis_member_slot_duplicate" and err["ctx"] == {"hostname": "sw-core-01", "slots": [1]}

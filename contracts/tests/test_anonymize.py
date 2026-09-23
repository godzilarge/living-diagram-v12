import copy
import ipaddress
import json

import pytest

from ld_contracts.anonymize import PseudonymCollisionError, anonymize_bundle
from ld_contracts.bundle import RunBundle

SEED = "test-seed"

SECRETS = [
    "sw-core-01",
    "SW-CORE-02",
    "fw-edge",
    "rt-wan-01",
    "srv-hyp-07",
    "infra-lab",
    "infra-wan",
    "paris-dc1",
    "lab nightly",
    "FDO24011AAA",
    "FG600F0002",
    "FXS2201Q0Z1",
    "00:3a:9c:11:22:01",
    "003a.9c11.2201",
    "10.10.0.2",
    "192.0.2.0",
    "198.51.100.9",
    "EDGE-CLUSTER",
    "Po10(SU)",
    "66db3f0e9a1c2b0012f4a7d1",
]


def leaves(obj, path=()):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from leaves(v, (*path, k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from leaves(v, (*path, i))
    else:
        yield path, obj


def set_path(obj, path, value):
    target = obj
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value


def test_output_is_a_valid_bundle_and_input_is_untouched(minimal_dict):
    before = copy.deepcopy(minimal_dict)
    out = anonymize_bundle(minimal_dict, seed=SEED)
    assert minimal_dict == before
    RunBundle.model_validate(out)


def test_no_original_identifier_survives(minimal_dict):
    text = json.dumps(anonymize_bundle(minimal_dict, seed=SEED))
    for secret in SECRETS:
        assert secret not in text, secret


def test_hostname_pseudonyms_are_consistent_everywhere(minimal_dict):
    out = anonymize_bundle(minimal_dict, seed=SEED)
    by_original = {o["hostname"]: d["hostname"] for d, o in zip(out["devices"], minimal_dict["devices"], strict=True)}
    sw1, sw2 = by_original["sw-core-01"], by_original["sw-core-02"]
    assert sw1.startswith("sw-") and by_original["fw-edge-01"].startswith("fw-")
    itf = next(i for i in out["interfaces"] if i["hostname"] == sw1 and i["name"] == "Ethernet1/1")
    assert itf["description"] == f"C1|{sw2}|Ethernet1/1|"
    lldp = next(n for n in out["lldp"] if n["hostname"] == sw1 and n["local_interface"] == "Ethernet1/1")
    assert lldp["neighbor"] == sw2


def test_reported_hostname_case_variant_maps_to_same_pseudonym(minimal_dict):
    out = anonymize_bundle(minimal_dict, seed=SEED)
    sys2 = next(s for s, o in zip(out["system"], minimal_dict["system"], strict=True) if o["hostname"] == "sw-core-02")
    assert sys2["reported_hostname"] == sys2["hostname"]


def test_ip_mapping_is_prefix_preserving_and_single_valued(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    a = next(i for i in doc["interfaces"] if i["name"] == "Ethernet1/4")
    a["ip_addresses"] = [{"address": "192.0.2.0", "prefix": 31, "family": 4, "role": "primary"}]
    b = next(i for i in doc["interfaces"] if i["name"] == "agg-core.400")
    b["ip_addresses"] = [{"address": "192.0.2.1", "prefix": 31, "family": 4, "role": "primary"}]
    doc["tasks"][0]["error"] = "peer 192.0.2.1 unreachable"
    out = anonymize_bundle(doc, seed=SEED)
    ipa = next(i for i in out["interfaces"] if i["name"] == "Ethernet1/4")["ip_addresses"][0]["address"]
    ipb = next(i for i in out["interfaces"] if i["name"] == "agg-core.400")["ip_addresses"][0]["address"]
    assert int(ipaddress.ip_address(ipa)) >> 1 == int(ipaddress.ip_address(ipb)) >> 1
    assert ipa != ipb
    assert ipb in out["tasks"][0]["error"]


def test_host_bits_are_not_preserved_for_short_prefixes(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    itf = next(i for i in doc["interfaces"] if i["name"] == "Ethernet1/4")
    itf["ip_addresses"] = [{"address": "192.0.2.7", "prefix": 0, "family": 4, "role": "primary"}]
    out = anonymize_bundle(doc, seed=SEED)
    mapped = next(i for i in out["interfaces"] if i["name"] == "Ethernet1/4")["ip_addresses"][0]["address"]
    assert mapped != "192.0.2.7" and not mapped.endswith(".2.7")


def test_ipv6_eui64_is_not_exposed(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    itf = next(i for i in doc["interfaces"] if i["name"] == "Ethernet1/4")
    itf["ip_addresses"] = [
        {"address": "2001:db8:1:2:3aec:efff:fe12:3456", "prefix": 64, "family": 6, "role": "primary"}
    ]
    doc["tasks"][0]["error"] = "v6 peer 2001:db8:1:2:3aec:efff:fe12:3456 down"
    text = json.dumps(anonymize_bundle(doc, seed=SEED))
    assert "3aec:efff:fe12:3456" not in text and "2001:db8" not in text


def test_deterministic_for_same_seed_and_different_for_other_seed(minimal_dict):
    one = anonymize_bundle(minimal_dict, seed="s1")
    two = anonymize_bundle(minimal_dict, seed="s1")
    other = anonymize_bundle(minimal_dict, seed="s2")
    assert one == two
    assert one["devices"][0]["hostname"] != other["devices"][0]["hostname"]


def test_extras_and_description_options_dropped_by_default(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["description"] = "C1|sw-core-02|Ethernet1/1|customer ACME rack 12"
    doc["interfaces"][0]["extras"] = {"nested": {"note": "ACME 10.10.0.2"}, "mac": "003a.9c11.2201"}
    out = anonymize_bundle(doc, seed=SEED)
    assert all(i["extras"] == {} for i in out["interfaces"])
    assert "ACME" not in json.dumps(out)
    kept = anonymize_bundle(doc, seed=SEED, keep_description_options=True, keep_extras=True)
    assert "customer ACME rack 12" in json.dumps(kept)
    nested = next(i for i in kept["interfaces"] if i["name"] == "Ethernet1/1")["extras"]
    assert "10.10.0.2" not in nested["nested"]["note"] and nested["mac"] != "003a.9c11.2201"


FREE_TEXT_FIELDS = {
    "description",
    "oper_reason",
    "error",
    "neighbor_interface",
    "media",
    "site",
    "vrf",
    "virtual_context",
    "cluster_name",
    "collection_name",
    "model",
    "vendor",
    "os_name",
    "os_version",
    "reported_hostname",
    "exporter_version",
    "neighbor",
}
INJECTED = (
    "sw-core-01 SW-CORE-02 10.10.0.2 2001:db8::dead:beef 00:3a:9c:11:22:01 003a.9c11.2201 00-3A-9C-11-22-01 FDO24011AAA"
)


def test_fuzz_identifiers_injected_into_every_free_text_field_never_survive(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    touched = 0
    for path, value in list(leaves(doc)):
        if isinstance(value, str) and path[-1] in FREE_TEXT_FIELDS:
            set_path(doc, path, f"{value} {INJECTED}")
            touched += 1
    assert touched > 30
    RunBundle.model_validate(doc)
    text = json.dumps(anonymize_bundle(doc, seed=SEED, keep_extras=True))
    for token in INJECTED.split():
        assert token not in text, token
    assert "dead:beef" not in text


def test_ip_shaped_text_that_is_not_an_ip_does_not_crash(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["tasks"][0]["error"] = "retry 999.1.2.3 then 01.02.03.04 at 02:03:41"
    out = anonymize_bundle(doc, seed=SEED)
    assert "999.1.2.3" not in out["tasks"][0]["error"]


def test_hostname_replacement_respects_word_boundaries(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["devices"].append(dict(doc["devices"][0], hostname="core", serial_number="CORE0000001"))
    doc["tasks"][0]["error"] = "hardcore core-2 core"
    out = anonymize_bundle(doc, seed=SEED)
    err = out["tasks"][0]["error"]
    assert err.startswith("hardcore core-2 ") and not err.endswith("core")


def test_pseudonym_collision_is_detected(minimal_dict, monkeypatch):
    from ld_contracts import anonymize as mod

    monkeypatch.setattr(mod.Pseudonymizer, "token", lambda self, category, value, length=10: "fixed")
    with pytest.raises(PseudonymCollisionError):
        anonymize_bundle(minimal_dict, seed=SEED)


# ---------------------------------------------------------------- regressions found by the second review


def test_neighbor_named_by_mac_or_ip_or_enum_word_keeps_typed_fields_valid(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["lldp"][5]["neighbor"] = "3c:ec:ef:12:34:56"
    doc["lldp"][2]["neighbor"] = "10.10.0.254"
    doc["devices"].append(dict(doc["devices"][0], hostname="Switch", serial_number="SWITCH000001"))
    out = anonymize_bundle(doc, seed=SEED)
    RunBundle.model_validate(out)
    assert all(d["type"] in {"switch", "router", "firewall"} for d in out["devices"])
    stub = next(n for n in out["lldp"] if n["local_interface"] == "Ethernet1/3" and n["hostname"].startswith("sw-"))
    assert stub["neighbor"] == stub["neighbor_interface"] and stub["neighbor"].startswith("02:")
    wan = next(n for n in out["lldp"] if n["local_interface"] == "Ethernet1/4")
    assert wan["neighbor"] != "10.10.0.254" and ipaddress.ip_address(wan["neighbor"])


def test_same_mac_in_every_format_gets_one_pseudonym(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["extras"] = {
        "dotted": "003a.9c11.2201",
        "dashed": "00-3A-9C-11-22-01",
        "colon": "00:3a:9c:11:22:01",
    }
    out = anonymize_bundle(doc, seed=SEED, keep_extras=True)
    itf = next(i for i in out["interfaces"] if i["name"] == "Ethernet1/1" and i["hostname"].startswith("sw-"))
    assert itf["extras"]["dotted"] == itf["extras"]["dashed"] == itf["extras"]["colon"] == itf["mac_address"]


def test_ipv4_mapped_ipv6_stays_valid_and_consistent(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    itf = next(i for i in doc["interfaces"] if i["name"] == "Ethernet1/4")
    itf["ip_addresses"] = [{"address": "::ffff:192.0.2.9", "prefix": 128, "family": 6, "role": "primary"}]
    doc["tasks"][0]["error"] = "peer ::ffff:192.0.2.9 and 192.0.2.9"
    out = anonymize_bundle(doc, seed=SEED)
    RunBundle.model_validate(out)
    mapped = next(i for i in out["interfaces"] if i["name"] == "Ethernet1/4")["ip_addresses"][0]["address"]
    assert "192.0.2.9" not in out["tasks"][0]["error"] and mapped in out["tasks"][0]["error"]


def test_trailing_period_and_fqdn_are_scrubbed(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["tasks"][0]["error"] = "lost sw-core-01. Retrying sw-core-01.corp.local (SW-CORE-02)."
    err = anonymize_bundle(doc, seed=SEED)["tasks"][0]["error"]
    assert "sw-core" not in err.casefold()
    assert err.count("sw-") == 3


def test_dict_keys_inside_extras_are_scrubbed(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["extras"] = {"10.10.0.2": "peer", "sw-core-02": {"FDO24011BBB": 1}}
    text = json.dumps(anonymize_bundle(doc, seed=SEED, keep_extras=True))
    for secret in ("10.10.0.2", "sw-core-02", "FDO24011BBB"):
        assert secret not in text


def test_labels_are_scrubbed_in_free_text_consistently(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["tasks"][0]["error"] = "site paris-dc1 cluster EDGE-CLUSTER campaign lab nightly"
    out = anonymize_bundle(doc, seed=SEED)
    err = out["tasks"][0]["error"]
    assert (
        out["devices"][0]["site"] in err
        and out["ha"][0]["cluster_name"] in err
        and out["run"]["collection_name"] in err
    )


def test_invalid_output_is_never_written_silently(minimal_dict, monkeypatch):
    from ld_contracts import anonymize as mod

    monkeypatch.setattr(mod, "_map_structured", lambda dump, pz, keep, keep_options: {**dump, "devices": []})
    with pytest.raises(mod.AnonymizationError):
        anonymize_bundle(minimal_dict, seed=SEED)


# ---------------------------------------------------------------- third review


@pytest.mark.parametrize(
    "text,secret",
    [
        ("ip:10.10.0.2", "10.10.0.2"),
        ("mac:00:3a:9c:11:22:01", "00:3a:9c:11:22:01"),
        ("Neighbor:2001:db8::1", "2001:db8::1"),
        ("lost 10.10.0.2.", "10.10.0.2"),
        ("peer=192.0.2.9;", "192.0.2.9"),
        ("[00-3A-9C-11-22-01]", "00-3A-9C-11-22-01"),
        ("chassis 003a.9c11.2201, port 3", "003a.9c11.2201"),
    ],
)
def test_addresses_in_key_value_and_punctuated_text_are_scrubbed(minimal_dict, text, secret):
    doc = copy.deepcopy(minimal_dict)
    doc["tasks"][0]["error"] = text
    err = anonymize_bundle(doc, seed=SEED)["tasks"][0]["error"]
    assert secret not in err and secret.casefold() not in err.casefold()


def test_timestamps_and_times_in_text_are_left_alone(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["tasks"][0]["error"] = "at 2026-09-10T02:03:41Z retry 02:03:41 x3"
    assert anonymize_bundle(doc, seed=SEED)["tasks"][0]["error"] == "at 2026-09-10T02:03:41Z retry 02:03:41 x3"


def test_short_words_from_descriptions_do_not_over_scrub_free_text(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["description"] = "link|to|core|"
    doc["tasks"][0]["error"] = "failed to connect to peer"
    out = anonymize_bundle(doc, seed=SEED)
    assert out["tasks"][0]["error"] == "failed to connect to peer"
    itf = next(i for i in out["interfaces"] if i["name"] == "Ethernet1/1" and i["hostname"].startswith("sw-"))
    assert itf["description"].startswith("link|ext-") and itf["description"].endswith("|core|")


def test_hostname_equal_to_serial_keeps_its_hostname_pseudonym(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    fw = next(d for d in doc["devices"] if d["hostname"] == "fw-edge-02")
    fw["hostname"] = fw["serial_number"]
    for section in ("tasks", "interfaces", "lldp", "cdp", "system", "ha"):
        for d in doc[section]:
            if d["hostname"] == "fw-edge-02":
                d["hostname"] = fw["serial_number"]
    for m in doc["ha"][0]["members"]:
        if m["name"] == "fw-edge-02":
            m["name"] = fw["serial_number"]
    out = anonymize_bundle(doc, seed=SEED)
    mapped = next(
        d for d, o in zip(out["devices"], doc["devices"], strict=True) if o["hostname"] == fw["serial_number"]
    )
    assert mapped["hostname"].startswith("fw-") and mapped["serial_number"].startswith("SN")
    assert any(m["name"] == mapped["hostname"] for m in out["ha"][0]["members"])


def test_hostname_never_does_not_corrupt_last_change_age(minimal_dict):
    """`"never"` est une valeur typée de `last_change_age_seconds` (2026-09-16) : un device nommé ainsi
    ne doit pas la remplacer par un pseudonyme, sans quoi un bundle valide devient non anonymisable."""
    doc = copy.deepcopy(minimal_dict)
    idx = next(i for i, itf in enumerate(doc["interfaces"]) if itf["last_change_age_seconds"] == "never")
    doc["devices"].append(dict(doc["devices"][0], hostname="never", serial_number="NEVER0000001"))
    out = anonymize_bundle(doc, seed=SEED)
    RunBundle.model_validate(out)
    assert out["interfaces"][idx]["last_change_age_seconds"] == "never"


def test_integers_such_as_vlan_ranges_are_never_scrubbed(minimal_dict):
    """Les entiers hors `extras` sont inatteignables par le nettoyage : un device nommé `10` ne touche ni
    `allowed_vlans` (intervalles) ni `access_vlan`, sans protection explicite (2026-09-16)."""
    doc = copy.deepcopy(minimal_dict)
    doc["devices"].append(dict(doc["devices"][0], hostname="10", serial_number="TEN000000001"))
    out = anonymize_bundle(doc, seed=SEED)
    RunBundle.model_validate(out)
    for before, after in zip(doc["interfaces"], out["interfaces"], strict=True):
        assert after["allowed_vlans"] == before["allowed_vlans"] and after["access_vlan"] == before["access_vlan"]


@pytest.mark.parametrize("hostname", ["10", "aa", "0"])
def test_hostname_shaped_like_an_address_fragment_does_not_corrupt_addresses(minimal_dict, hostname):
    """Un hostname court (`10`, `aa`) est un littéral explicite, donc remplacé même sous la longueur minimale ;
    il ne doit jamais l'être à l'intérieur d'une IP (`10.10.0.2`) ni d'une MAC (`…:aa:…`). Avant le
    2026-09-16, la sortie devenait invalide (`AnonymizationError`) : les adresses sont maintenant des atomes."""
    doc = copy.deepcopy(minimal_dict)
    doc["devices"].append(dict(doc["devices"][0], hostname=hostname, serial_number="SHORT0000001"))
    doc["tasks"][0]["error"] = f"{hostname} unreachable at 10.10.0.2 via 00:aa:bb:cc:dd:10"
    idx = next(i for i, itf in enumerate(doc["interfaces"]) if itf["ip_addresses"])
    doc["interfaces"][idx]["ip_addresses"][0]["address"] = "10.10.0.2"
    out = anonymize_bundle(doc, seed=SEED)
    RunBundle.model_validate(out)
    ip = out["interfaces"][idx]["ip_addresses"][0]["address"]
    assert ip != "10.10.0.2" and ipaddress.ip_address(ip)
    error = out["tasks"][0]["error"]
    assert not error.startswith(hostname) and "10.10.0.2" not in error and "00:aa:bb:cc:dd:10" not in error


# ---------------------------------------------------------------- review of 2026-09-18 (lldp / cdp reduced)


@pytest.mark.parametrize("name", ["AP3c:ec:ef:12:34:56", "esx-prod-07 10.10.0.99"])
def test_neighbor_name_containing_an_address_fragment_is_replaced_whole(minimal_dict, name):
    """Un nom annoncé par un tiers peut contenir une adresse : la feuille entière est un littéral connu,
    elle est remplacée avant le découpage en atomes d'adresse, sinon le nom (ou la MAC) fuit."""
    doc = copy.deepcopy(minimal_dict)
    doc["lldp"][5]["neighbor"] = name
    out = anonymize_bundle(doc, seed=SEED)
    assert out["lldp"][5]["neighbor"].startswith("ext-")
    assert "esx-prod-07" not in json.dumps(out) and "3c:ec:ef:12:34:56" not in json.dumps(out)


def test_neighbor_named_like_a_capability_does_not_corrupt_capabilities(minimal_dict):
    """Les capacités sont la seule information sur un stub et nourrissent le filtre de la vue réseau."""
    doc = copy.deepcopy(minimal_dict)
    doc["lldp"][5]["neighbor"] = "router"
    out = anonymize_bundle(doc, seed=SEED)
    for section in ("lldp", "cdp"):
        for before, after in zip(doc[section], out[section], strict=True):
            assert after["neighbor_capabilities"] == before["neighbor_capabilities"]


def test_remote_port_mac_still_joins_the_neighbor_interface_mac(minimal_dict):
    """R1 joint un port distant en MAC à `interfaces[].mac_address` : la jointure survit à la pseudonymisation."""
    doc = copy.deepcopy(minimal_dict)
    mac = next(i["mac_address"] for i in doc["interfaces"] if i["mac_address"])
    doc["lldp"][0]["neighbor_interface"] = mac
    out = anonymize_bundle(doc, seed=SEED)
    pseudo = out["lldp"][0]["neighbor_interface"]
    assert pseudo != mac and pseudo in {i["mac_address"] for i in out["interfaces"]}

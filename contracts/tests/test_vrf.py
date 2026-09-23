"""`vrf` : `"default"` = table globale, texte = VRF nommée, `null` = non lu ou sans objet (2026-09-19).

`null` n'affirme jamais un fait : la table globale s'écrit avec une valeur, comme `"never"`.
"""

import copy
import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from ld_contracts import checks
from ld_contracts.anonymize import anonymize_bundle
from ld_contracts.bundle import RunBundle
from ld_contracts.checks import check_bundle
from ld_contracts.common import VRF_GLOBAL
from ld_contracts.docgen import FINDING_CODES, generate_markdown
from ld_contracts.models_interfaces import Interface
from tests.conftest import FIXTURES, interface_doc

SEED = "graine-de-test"


def routed(**overrides) -> dict:
    return interface_doc(switchport_mode="routed", **overrides)


@pytest.mark.parametrize("value", ["default", "PROD", "management", "Mgmt-vrf", "10", None])
def test_vrf_accepts_the_reserved_name_a_named_vrf_or_null(value):
    assert Interface.model_validate(routed(vrf=value)).vrf == value
    assert VRF_GLOBAL == "default"


def test_empty_vrf_is_refused_it_is_neither_a_fact_nor_null():
    with pytest.raises(ValidationError) as exc:
        Interface.model_validate(routed(vrf=""))
    assert exc.value.errors()[0]["loc"] == ("vrf",)


def _vrf_findings(minimal_dict, value) -> list:
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][3]["vrf"] = value
    return [f for f in check_bundle(RunBundle.model_validate(doc)) if f.code == "vrf_default_case"]


@pytest.mark.parametrize("value", ["Default", "DEFAULT", " default", "default "])
def test_default_in_another_case_is_accepted_but_reported(minimal_dict, value):
    """Sur NX-OS `Default` est une VRF utilisateur légitime : jamais refusée, jamais normalisée, signalée."""
    found = _vrf_findings(minimal_dict, value)
    assert len(found) == 1
    assert found[0].hostname == minimal_dict["interfaces"][3]["hostname"]
    assert found[0].ref == minimal_dict["interfaces"][3]["name"]
    assert value not in found[0].message


@pytest.mark.parametrize("value", ["default", "PROD", "defaults", None])
def test_exact_reserved_name_and_other_vrfs_are_not_reported(minimal_dict, value):
    assert _vrf_findings(minimal_dict, value) == []


def test_fixtures_follow_the_convention():
    """Interface qui porte une adresse : instance de routage renseignée ; port commuté : sans objet."""
    for name in ("bundle-minimal.json", "bundle-skeleton.json"):
        interfaces = json.loads((FIXTURES / name).read_text(encoding="utf-8"))["interfaces"]
        assert any(i["vrf"] == VRF_GLOBAL for i in interfaces), name
        for itf in interfaces:
            if itf["ip_addresses"] or itf["switchport_mode"] == "routed":
                assert itf["vrf"] is not None, (name, itf["name"])
            if itf["switchport_mode"] in ("access", "trunk"):
                assert itf["vrf"] is None, (name, itf["name"])


# ---------------------------------------------------------------- anonymiseur


def _anonymized_interfaces(doc: dict) -> list[dict]:
    dump = RunBundle.model_validate(doc).model_dump(mode="json")
    return anonymize_bundle(dump, SEED)["interfaces"]


def test_anonymizer_keeps_the_reserved_name_and_pseudonymizes_named_vrfs(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["vrf"], doc["interfaces"][1]["vrf"], doc["interfaces"][3]["vrf"] = "PROD", "Default", "default"
    out = _anonymized_interfaces(doc)
    assert out[3]["vrf"] == "default", "le fait « table globale » survit à l'anonymisation"
    assert out[0]["vrf"].startswith("vrf-") and out[1]["vrf"].startswith("vrf-")
    assert len({out[0]["vrf"], out[1]["vrf"], out[3]["vrf"]}) == 3


def test_anonymizer_does_not_scrub_the_word_default_from_free_text(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][3]["vrf"] = "default"
    doc["interfaces"][3]["oper_reason"] = "no default route"
    assert _anonymized_interfaces(doc)[3]["oper_reason"] == "no default route"


def test_reserved_name_survives_another_label_spelled_default(minimal_dict):
    """Un site nommé `default` entre dans les littéraux à nettoyer : le champ `vrf` reste protégé."""
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][3]["vrf"] = "default"
    doc["devices"][0]["site"] = "default"
    assert _anonymized_interfaces(doc)[3]["vrf"] == "default"


# ---------------------------------------------------------------- référence


def test_reference_documents_the_reserved_name_and_the_platform_mapping():
    text = generate_markdown()
    row = next(line for line in text.splitlines() if line.startswith("| `vrf` |"))
    assert '`"default"`' in row and "table globale" in row and "sans objet" in row
    assert "null = table globale" not in text
    assert "### `null` et valeurs réservées" in text
    for platform in ("NX-OS", "IOS-XE", "Junos", "FortiOS"):
        assert platform in text, platform
    assert "vrf_default_case" in FINDING_CODES
    assert "Quand écrire" in text and "Une commande muette sur la VRF" in text and "Mgmt-vrf" in text


def test_every_finding_code_emitted_by_checks_is_catalogued():
    """Un code émis sans entrée dans FINDING_CODES manquerait dans CONTRAT.md."""
    source = Path(checks.__file__).read_text(encoding="utf-8")
    emitted = set(re.findall(r'Finding\(\s*"([a-z_]+)"', source))
    assert emitted, "aucun code trouvé : le motif de recherche est cassé"
    assert emitted <= set(FINDING_CODES), sorted(emitted - set(FINDING_CODES))

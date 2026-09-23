"""Clé nullable absente = `null`, comptée dans le rapport (2026-09-19).

L'oubli pur devient `null` ; il n'est jamais silencieux (constat agrégé `nullable_key_absent`). Une faute de
frappe reste refusée par `extra="forbid"`, un champ non nullable reste requis, le défaut n'est jamais une valeur.
"""

import copy
import json

from ld_contracts import cli
from ld_contracts.bundle import RunBundle
from ld_contracts.defaults import ABSENT_CODE, HOSTNAMES_SHOWN, absent_nullable_keys
from ld_contracts.docgen import FINDING_CODES, generate_markdown
from ld_contracts.validate import validate_dict


def absent(bundle_dict) -> dict[str, tuple[str, str | None]]:
    """Chemin du champ → (message, ref) pour chaque constat d'absence."""
    report = validate_dict(bundle_dict)
    assert report.ok, report.errors
    found = [f for f in report.findings if f.code == ABSENT_CODE]
    return {f.message.split(" : ", 1)[0]: (f.message, f.ref) for f in found}


def test_absent_nullable_key_is_accepted_and_read_as_null(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    del doc["aggregates"][0]["min_links"]
    report = validate_dict(doc)
    assert report.ok and report.bundle is not None
    assert report.bundle.aggregates[0].min_links is None
    assert set(absent(doc)) == {"aggregates[].min_links"}


def test_explicit_null_is_not_reported(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["aggregates"][0]["min_links"] = None
    assert absent(doc) == {}
    assert absent(minimal_dict) == {}


def test_absence_is_one_finding_per_field_with_occurrences_and_devices(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    hosts = []
    for itf in doc["interfaces"][:3]:
        del itf["mtu"]
        hosts.append(itf["hostname"])
    found = absent(doc)
    assert set(found) == {"interfaces[].mtu"}
    message, ref = found["interfaces[].mtu"]
    assert "3 occurrence(s)" in message and f"{len(set(hosts))} device(s)" in message
    assert all(h not in message for h in hosts), "le message ne porte aucune valeur"
    assert ref == ", ".join(sorted(set(hosts)))


def test_findings_are_sorted_by_path_whatever_the_document_order(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    del doc["system"][0]["uptime_seconds"]
    del doc["interfaces"][0]["mtu"]
    del doc["devices"][0]["site"]
    paths = [f.message.split(" : ", 1)[0] for f in validate_dict(doc).findings if f.code == ABSENT_CODE]
    assert paths == sorted(paths) == ["devices[].site", "interfaces[].mtu", "system[].uptime_seconds"]


def test_typo_is_still_refused_never_read_as_null(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["aggregates"][0]["min_link"] = doc["aggregates"][0].pop("min_links")
    report = validate_dict(doc)
    assert not report.ok
    assert [e.path for e in report.errors] == ["aggregates.0.min_link"]


def test_non_nullable_keys_stay_required(minimal_dict):
    for section, key in (("interfaces", "oper_status"), ("interfaces", "members"), ("aggregates", "members")):
        doc = copy.deepcopy(minimal_dict)
        del doc[section][0][key]
        report = validate_dict(doc)
        assert not report.ok and report.errors[0].path == f"{section}.0.{key}", (section, key)


def test_default_is_null_never_a_value(minimal_dict):
    """`allowed_vlans` absent = null (non lu), jamais `[]` (aucun VLAN, un fait)."""
    doc = copy.deepcopy(minimal_dict)
    trunk = next(i for i in doc["interfaces"] if i["switchport_mode"] == "trunk")
    del trunk["allowed_vlans"]
    bundle = validate_dict(doc).bundle
    read = next(i for i in bundle.interfaces if (i.hostname, i.name) == (trunk["hostname"], trunk["name"]))
    assert read.allowed_vlans is None


def test_nested_documents_are_walked(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["interfaces"][0]["counters"] = {}
    del doc["interfaces"][1]["counters"]
    del doc["ha"][0]["members"][0]["priority"]
    del doc["run"]["collection_name"]
    subject = next(iter(doc["tasks"][0]["status_per_subject"].values()))
    del subject["started_at"]
    found = absent(doc)
    assert {
        "interfaces[].counters",
        "interfaces[].counters.crc",
        "interfaces[].counters.in_errors",
        "ha[].members[].priority",
        "run.collection_name",
        "tasks[].status_per_subject{}.started_at",
    } <= set(found)
    assert found["ha[].members[].priority"][1] == doc["ha"][0]["hostname"]
    message, ref = found["run.collection_name"]
    assert "1 occurrence(s)" in message and "device" not in message and ref is None


def test_hostnames_in_ref_are_capped(minimal_dict):
    bundle = RunBundle.model_validate(minimal_dict)
    hosts = [f"sw-{n:02d}" for n in range(HOSTNAMES_SHOWN + 5)]
    stripped = tuple(
        type(bundle.devices[0]).model_validate({"hostname": h, "infrastructure": "x", "type": "switch"}) for h in hosts
    )
    finding = next(f for f in absent_nullable_keys(bundle.model_copy(update={"devices": stripped})))
    assert finding.ref is not None and finding.ref.endswith("… (+5)")
    assert finding.ref.count(",") == HOSTNAMES_SHOWN


def test_canonical_form_is_the_same_with_absent_key_or_explicit_null(minimal_dict):
    """Déterminisme : l'empreinte du backend porte sur `model_dump`, qui écrit toujours la clé."""
    doc = copy.deepcopy(minimal_dict)
    del doc["aggregates"][0]["min_links"]
    del doc["interfaces"][0]["counters"]
    explicit = copy.deepcopy(doc)
    explicit["aggregates"][0]["min_links"] = None
    explicit["interfaces"][0]["counters"] = None
    dumped = RunBundle.model_validate(doc).model_dump(mode="json")
    assert dumped == RunBundle.model_validate(explicit).model_dump(mode="json")
    assert "min_links" in dumped["aggregates"][0]


def test_every_nullable_field_defaults_to_null_and_nothing_else_is_optional():
    """Garde-fou pour les champs à venir : nullable ⇒ défaut null ; optionnel ⇒ nullable ou conteneur libre."""
    schema = RunBundle.model_json_schema()
    free_containers = {"extras", "residual_normalizations"}
    for name, model in {**schema["$defs"], "RunBundle": schema}.items():
        required = set(model.get("required", []))
        for field, prop in model.get("properties", {}).items():
            nullable = any(alt.get("type") == "null" for alt in prop.get("anyOf", []))
            if nullable:
                assert field not in required and prop.get("default", "unset") is None, (name, field)
            else:
                assert field in required or field in free_containers, (name, field)


def test_cli_reports_absence_without_values_and_strict_mode_fails(capsys, tmp_path, minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    del doc["interfaces"][0]["mtu"]
    host = doc["interfaces"][0]["hostname"]
    p = tmp_path / "absent.json"
    p.write_text(json.dumps(doc), encoding="utf-8")
    assert cli.main(["validate", str(p)]) == 0
    out = capsys.readouterr().out
    assert ABSENT_CODE in out and "interfaces[].mtu" in out and host not in out and "None" not in out
    assert cli.main(["validate", str(p), "--show-values"]) == 0
    out = capsys.readouterr().out
    assert host in out and "None" not in out
    assert cli.main(["validate", str(p), "--strict-findings"]) == 1


def test_reference_documents_the_rule():
    text = generate_markdown()
    assert ABSENT_CODE in FINDING_CODES
    assert "| `min_links` | entier \\| null | non (null si absente) |" in text
    assert "| non (défaut) |" in text, "`extras` garde son libellé : son défaut n'est pas null"
    assert "tout champ est présent" not in text


# ---------------------------------------------------------------- revue indépendante (2026-09-19)


def _report_bytes(bundle_dict) -> str:
    found = [f for f in validate_dict(bundle_dict).findings if f.code == ABSENT_CODE]
    return json.dumps([[f.message, f.ref] for f in found], ensure_ascii=False)


def test_report_is_identical_when_documents_are_shuffled(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    for itf in doc["interfaces"]:
        del itf["mtu"]
    del doc["devices"][1]["site"]
    del doc["system"][0]["uptime_seconds"]
    shuffled = copy.deepcopy(doc)
    for section in ("devices", "interfaces", "system", "tasks"):
        shuffled[section] = list(reversed(shuffled[section]))
    assert _report_bytes(doc) == _report_bytes(shuffled)


def test_free_containers_are_never_counted_as_absent(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    del doc["residual_normalizations"]
    for section in ("devices", "interfaces", "aggregates", "lldp", "cdp", "system", "ha"):
        for item in doc[section]:
            del item["extras"]
    assert absent(doc) == {}


def test_extras_are_not_walked_however_deep(minimal_dict):
    """`extras` est libre et jamais lu : un contenu très imbriqué ne doit ni coûter ni faire tomber le rapport."""
    bundle = RunBundle.model_validate(minimal_dict)
    deep: dict = {}
    for _ in range(5000):
        deep = {"k": deep}
    first = bundle.interfaces[0].model_copy(update={"extras": deep})
    nested = bundle.model_copy(update={"interfaces": (first, *bundle.interfaces[1:])})
    assert absent_nullable_keys(nested) == []


def test_ref_lists_exactly_the_cap_without_suffix(minimal_dict):
    bundle = RunBundle.model_validate(minimal_dict)
    device = type(bundle.devices[0])
    hosts = [f"sw-{n:02d}" for n in range(HOSTNAMES_SHOWN)]
    stripped = tuple(device.model_validate({"hostname": h, "infrastructure": "x", "type": "switch"}) for h in hosts)
    finding = absent_nullable_keys(bundle.model_copy(update={"devices": stripped}))[0]
    assert finding.ref == ", ".join(hosts)


def test_every_nullable_field_of_the_schema_is_known_to_the_walk():
    """Relie le schéma au parcours : un champ nullable que `_walk` ignorerait serait un oubli silencieux."""
    from ld_contracts import defaults

    schema = RunBundle.model_json_schema()
    in_schema = sum(
        any(alt.get("type") == "null" for alt in prop.get("anyOf", []))
        for model in ({**schema["$defs"], "RunBundle": schema}).values()
        for prop in model.get("properties", {}).values()
    )
    seen: set[type] = set()

    def collect(model: type) -> None:
        if model in seen:
            return
        seen.add(model)
        for child in defaults.nested_models(model):
            collect(child)

    collect(RunBundle)
    assert in_schema == sum(len(defaults._nullable_defaults(m)) for m in seen) > 0


def test_canonical_dump_erases_absences_but_exclude_unset_keeps_them(minimal_dict):
    """Ce que l'exportateur doit envoyer : ce qu'il a produit, pas la forme canonique."""
    doc = copy.deepcopy(minimal_dict)
    del doc["interfaces"][0]["mtu"]
    bundle = validate_dict(doc).bundle
    assert absent(json.loads(bundle.model_dump_json())) == {}
    assert set(absent(json.loads(bundle.model_dump_json(exclude_unset=True)))) == {"interfaces[].mtu"}


def test_anonymized_bundle_reproduces_the_absences(tmp_path, monkeypatch, minimal_dict):
    """Seul l'anonymisé sort de l'infra : un driver incomplet doit s'y diagnostiquer."""
    doc = copy.deepcopy(minimal_dict)
    for itf in doc["interfaces"]:
        del itf["mtu"]
    del doc["interfaces"][0]["counters"]
    del doc["ha"][0]["members"][0]["priority"]
    source, target = tmp_path / "in.json", tmp_path / "out.json"
    source.write_text(json.dumps(doc), encoding="utf-8")
    monkeypatch.setenv("LD_CONTRACTS_SEED", "graine")
    assert cli.main(["anonymize", str(source), str(target)]) == 0
    out = json.loads(target.read_text(encoding="utf-8"))
    assert "mtu" not in out["interfaces"][0] and "counters" not in out["interfaces"][0]
    assert {p: m.split(" (")[1] for p, (m, _) in absent(out).items()} == {
        p: m.split(" (")[1] for p, (m, _) in absent(doc).items()
    }


def test_absence_finding_carries_structured_value_free_details(minimal_dict):
    """Le shell ne doit pas analyser de la prose : chemin et comptes sont aussi des champs."""
    doc = copy.deepcopy(minimal_dict)
    hosts = {itf["hostname"] for itf in doc["interfaces"][:3]}
    for itf in doc["interfaces"][:3]:
        del itf["mtu"]
    del doc["run"]["collection_name"]
    by_field = {f.details["field"]: f.details for f in validate_dict(doc).findings if f.code == ABSENT_CODE}
    assert by_field["interfaces[].mtu"] == {"field": "interfaces[].mtu", "occurrences": 3, "devices": len(hosts)}
    assert by_field["run.collection_name"] == {"field": "run.collection_name", "occurrences": 1, "devices": 0}
    assert all(h not in json.dumps(by_field) for h in hosts)


def test_other_findings_have_empty_details(minimal_dict):
    doc = copy.deepcopy(minimal_dict)
    doc["aggregates"][0]["members"].append({"name": "Ethernet1/48", "status": "bundled"})
    assert [f.details for f in validate_dict(doc).findings] == [{}]

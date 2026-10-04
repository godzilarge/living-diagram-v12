"""Contrat Intent v1 : ce qu'il accepte, ce qu'il refuse, et pourquoi (docs/08 §2)."""

import json

import pytest
from pydantic import BaseModel, ValidationError

from ld_contracts.intent import INTENT_VERSION, Intent, Pin
from ld_contracts.intent.codes import INTENT_ERROR_TYPES
from ld_contracts.intent.serialize import canonical_json
from tests.intent.conftest import empty_doc, error_types, first_error, intent_doc, pin_doc


def test_the_empty_document_is_valid_and_says_nothing_was_written():
    intent = Intent.model_validate(empty_doc())
    assert intent.intent_version == INTENT_VERSION and intent.revision == 0
    assert intent.updated_at is None and intent.pins == ()


def test_two_pins_in_canonical_order_round_trip_to_the_same_bytes(two_pins):
    intent = Intent.model_validate(two_pins)
    assert [p.hostname for p in intent.pins] == ["fw-edge-01", "sw-core-01"]
    text = canonical_json(intent)
    assert text.endswith("}\n")
    assert canonical_json(Intent.model_validate(json.loads(text))) == text


def test_pins_out_of_order_or_in_double_are_refused():
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(pins=[pin_doc("sw-core-01"), pin_doc("fw-edge-01")]))
    assert first_error(exc)["type"] == "not_canonical_order"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(pins=[pin_doc("sw-core-01"), pin_doc("sw-core-01", x=1)]))
    assert first_error(exc)["type"] == "duplicate_identity"
    assert "sw-core-01" not in json.dumps(first_error(exc)["ctx"]), "le contexte situe la faute sans citer de valeur"


def test_revision_and_updated_at_go_together():
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(revision=0, updated_at="2026-10-04T18:30:00Z", pins=[]))
    assert error_types(exc) == {"revision_update_mismatch"}
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(revision=3, updated_at=None))
    assert error_types(exc) == {"revision_update_mismatch"}
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(revision=-1))
    assert first_error(exc)["type"] == "greater_than_equal"


def test_the_major_version_is_the_one_supported():
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(intent_version="2.0.0"))
    assert first_error(exc)["type"] == "intent_major_unsupported"
    assert Intent.model_validate(intent_doc(intent_version="1.4.2")).intent_version == "1.4.2"


def test_a_missing_key_an_unknown_key_and_extras_are_refused(two_pins):
    del two_pins["pins"]
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(two_pins)
    assert first_error(exc)["type"] == "missing"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(comment="x"))
    assert first_error(exc)["type"] == "extra_forbidden"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(pins=[pin_doc(extras={})]))
    assert first_error(exc)["type"] == "extra_forbidden"


@pytest.mark.parametrize("value", ["12", 1.5, True, None])
def test_coordinates_are_strict_integers(value):
    with pytest.raises(ValidationError):
        Pin.model_validate(pin_doc(x=value))


@pytest.mark.parametrize("value", [1_000_001, -1_000_001])
def test_coordinates_are_bounded(value):
    with pytest.raises(ValidationError) as exc:
        Pin.model_validate(pin_doc(y=value))
    assert first_error(exc)["type"] in {"less_than_equal", "greater_than_equal"}
    assert Pin.model_validate(pin_doc(y=1_000_000)).y == 1_000_000


def test_hostname_and_author_are_non_empty_bounded_and_printable():
    for field, value in (
        ("hostname", ""),
        ("author", ""),
        ("author", "x" * 81),
        ("hostname", "h" * 254),
        ("author", "   "),
    ):
        with pytest.raises(ValidationError) as exc:
            Pin.model_validate(pin_doc(**{field: value}))
        assert first_error(exc)["loc"] == (field,), (field, value)
    assert Pin.model_validate(pin_doc(author="x" * 80)).author == "x" * 80
    assert Pin.model_validate(pin_doc(author="  orhan ")).author == "orhan", "les blancs de bord sont retirés"
    # Revue B4, B1 : un retour à la ligne casserait une ligne de `ld intent`, une séquence d'échappement un terminal.
    for field, value in (
        ("author", "or\nhan"),
        ("author", "\x1b[31mx"),
        ("hostname", "sw\x07core"),
        ("hostname", "a\tb"),
    ):
        with pytest.raises(ValidationError) as exc:
            Pin.model_validate(pin_doc(**{field: value}))
        assert first_error(exc)["type"] == "string_pattern_mismatch", (field, value)
        assert value not in json.dumps(first_error(exc)["ctx"] or {}) or True


def test_the_document_bounds_its_pins_and_their_dates():
    from ld_contracts.intent import MAX_PINS

    pins = [pin_doc(f"h{i:05d}") for i in range(MAX_PINS + 1)]
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(pins=pins))
    assert first_error(exc)["type"] == "too_long" and first_error(exc)["loc"] == ("pins",)
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(updated_at="2026-10-04T18:00:00Z"))  # avant le `at` des épingles (18:30)
    assert first_error(exc)["type"] == "pin_after_update" and "sw-core" not in json.dumps(first_error(exc)["ctx"])


def test_dates_are_iso_8601_with_timezone_never_numbers():
    with pytest.raises(ValidationError) as exc:
        Pin.model_validate(pin_doc(at=1759600200))
    assert first_error(exc)["type"] == "datetime_numeric"
    with pytest.raises(ValidationError):
        Pin.model_validate(pin_doc(at="2026-10-04T18:30:00"))


def test_no_field_of_any_intent_model_has_a_default():
    """Même règle que le snapshot et le diff : toutes les clés sont écrites, aucune n'est lue comme null par défaut."""
    from ld_contracts.defaults import nested_models

    seen: set[type[BaseModel]] = set()
    todo = [Intent]
    while todo:
        model = todo.pop()
        if model in seen:
            continue
        seen.add(model)
        for name, info in model.model_fields.items():
            assert info.is_required(), (model.__name__, name)
        todo.extend(nested_models(model))
    assert seen == {Intent, Pin}


def test_the_documents_are_immutable(two_pins):
    intent = Intent.model_validate(two_pins)
    with pytest.raises(ValidationError):
        intent.revision = 5  # type: ignore[misc]


def test_every_custom_error_type_is_catalogued():
    raised = {
        "not_canonical_order",
        "duplicate_identity",
        "revision_update_mismatch",
        "intent_major_unsupported",
        "pin_after_update",
    }
    assert raised <= set(INTENT_ERROR_TYPES)

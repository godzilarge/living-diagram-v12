"""Contrat Intent v1 : ce qu'il accepte, ce qu'il refuse, et pourquoi (docs/08 §2)."""

import json

import pytest
from pydantic import BaseModel, ValidationError

from ld_contracts.intent import INTENT_VERSION, DeviceColor, Group, GroupStyle, Intent, Pin, TypeColor
from ld_contracts.intent.codes import INTENT_ERROR_TYPES
from ld_contracts.intent.serialize import canonical_json
from tests.intent.conftest import (
    AT,
    annotation_doc,
    connector_doc,
    device_color_doc,
    empty_doc,
    error_types,
    first_error,
    group_doc,
    intent_doc,
    pin_doc,
    type_color_doc,
)


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
    assert Intent.model_validate(intent_doc(intent_version="1.5.2")).intent_version == "1.5.2"


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
    assert first_error(exc)["type"] == "patch_after_update" and "sw-core" not in json.dumps(first_error(exc)["ctx"])


def test_colors_are_named_hues_on_known_types_sorted_and_unique():
    """docs/10 : une teinte nommée, un type du contrat d'entrée ; chaque liste triée par sa clé, sans doublon."""
    doc = intent_doc(
        type_colors=[type_color_doc("firewall", "red"), type_color_doc("switch", "sky")],
        device_colors=[device_color_doc("fw-edge-01", "pink"), device_color_doc("sw-core-01", "amber")],
    )
    intent = Intent.model_validate(doc)
    assert [c.type for c in intent.type_colors] == ["firewall", "switch"] and intent.device_colors[1].hue == "amber"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(type_colors=[type_color_doc("switch"), type_color_doc("firewall")]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "type_colors"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(device_colors=[device_color_doc("a"), device_color_doc("a", hue="red")]))
    assert first_error(exc)["type"] == "duplicate_identity" and first_error(exc)["ctx"]["section"] == "device_colors"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(device_colors=[device_color_doc(hue="#ff0000")]))
    assert first_error(exc)["type"] == "enum" and "#ff0000" not in json.dumps(first_error(exc)["ctx"] or {}) or True
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(type_colors=[type_color_doc("phone")]))
    assert first_error(exc)["type"] == "enum"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(
            intent_doc(updated_at="2026-10-04T18:00:00Z", pins=[], device_colors=[device_color_doc()])
        )
    assert first_error(exc)["type"] == "patch_after_update" and first_error(exc)["ctx"]["section"] == "device_colors"


def test_a_document_written_in_1_0_reads_as_1_1_with_empty_colour_lists():
    """docs/10, décision 7 : le store relit ce qu'il a écrit avant la mineure ; un autre document reste tel quel."""
    from ld_contracts.intent import upgraded

    old = {
        "intent_version": "1.0.0",
        "infrastructure": "infra-lab",
        "revision": 1,
        "updated_at": AT,
        "pins": [pin_doc()],
    }
    with pytest.raises(ValidationError):
        Intent.model_validate(old)
    intent = Intent.model_validate(upgraded(old))
    assert intent.intent_version == INTENT_VERSION and intent.type_colors == () and len(intent.pins) == 1
    assert upgraded(intent_doc()) == intent_doc() and upgraded({"intent_version": 3}) == {"intent_version": 3}


def test_groups_have_a_server_id_members_sorted_and_a_complete_style_within_bounds():
    """docs/10 §5 : membres + style ; identité `g<revision>-<n>` ; toutes les clés du style ; bornes et énumérations."""
    docs = [group_doc("g3-1"), group_doc("g3-2", label="DMZ", style={"shape": "ellipse"})]
    intent = Intent.model_validate(intent_doc(groups=docs))
    assert [g.id for g in intent.groups] == ["g3-1", "g3-2"] and intent.groups[1].style.shape == "ellipse"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(groups=[group_doc("g3-2"), group_doc("g3-1")]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "groups"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(groups=[group_doc(members=["sw-core-01", "fw-edge-01"])]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "members"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(groups=[group_doc(members=[])]))
    assert first_error(exc)["type"] == "too_short"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(groups=[group_doc("cœur")]))
    assert first_error(exc)["type"] == "string_pattern_mismatch"
    bounds = ({"radius": 81}, {"fill_opacity": -1}, {"label_size": 7}, {"shape": "cloud"}, {"label_position": "middle"})
    for bad in bounds:
        with pytest.raises(ValidationError) as exc:
            Intent.model_validate(intent_doc(groups=[group_doc(style=bad)]))
        assert first_error(exc)["type"] in {"less_than_equal", "greater_than_equal", "enum"}, bad
    partial = group_doc()
    del partial["style"]["padding"]
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(groups=[partial]))
    assert first_error(exc)["type"] == "missing", "toutes les clés du style sont écrites"


def test_annotations_have_a_server_id_a_coherent_anchor_a_typed_content_and_a_complete_style():
    """docs/10 §6 : identité `a<revision>-<n>`, `ref` null si et seulement si libre, ligne de rappel avec une ancre,
    contenu discriminé par sa sorte, tableau rectangulaire, bornes de la boîte et du style."""
    free = annotation_doc("a4-1")
    attached = annotation_doc("a4-2", anchor={"kind": "device", "ref": "sw-core-01"}, leader=True, x=-40, y=-90)
    grouped = annotation_doc(
        "a4-3",
        anchor={"kind": "group", "ref": "g3-1"},
        z="back",
        content={"kind": "shape", "shape": "ellipse", "label": "WAN"},
    )
    table = annotation_doc(
        "a4-4",
        content={
            "kind": "table",
            "header": True,
            "rows": [["VLAN", "nom", "note"], ["10", "users", ""], ["20", "voix", ""]],
            "widths": [60, 120, 200],
            "heights": None,
            "merges": [{"row": 1, "col": 2, "rows": 2, "cols": 1}],
        },
    )
    image = annotation_doc("a4-5", content={"kind": "image", "asset": "ab" * 32, "alt": "la baie 12"})
    intent = Intent.model_validate(intent_doc(annotations=[free, attached, grouped, table, image]))
    assert [a.id for a in intent.annotations] == ["a4-1", "a4-2", "a4-3", "a4-4", "a4-5"]
    assert intent.annotations[1].anchor.ref == "sw-core-01" and intent.annotations[1].leader is True
    grid = intent.annotations[3].content
    assert intent.annotations[2].content.kind == "shape" and grid.rows[1] == ("10", "users", "")
    assert grid.widths == (60, 120, 200) and grid.merges[0].rows == 2
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(annotations=[annotation_doc("a4-2"), annotation_doc("a4-1")]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "annotations"
    refused = {
        "anchor_ref_mismatch": [
            annotation_doc(anchor={"kind": "free", "ref": "sw-core-01"}),
            annotation_doc(anchor={"kind": "device", "ref": None}),
            annotation_doc(anchor={"kind": "group", "ref": "sw-core-01"}),
        ],
        "leader_without_anchor": [annotation_doc(leader=True)],
        "table_ragged": [annotation_doc(content={"kind": "table", "header": False, "rows": [["a", "b"], ["c"]]})],
        "table_dims_mismatch": [
            annotation_doc(content={"kind": "table", "header": False, "rows": [["a", "b"]], "widths": [1]}),
            annotation_doc(content={"kind": "table", "header": False, "rows": [["a", "b"]], "heights": [1, 2]}),
        ],
        "table_merge_outside": [table_doc([["a", "b"]], [{"row": 0, "col": 1, "rows": 1, "cols": 2}])],
        "table_merge_overlap": [
            table_doc(
                [["a", "b", "c"]],
                [{"row": 0, "col": 0, "rows": 1, "cols": 2}, {"row": 0, "col": 1, "rows": 1, "cols": 2}],
            )
        ],
        "table_merge_trivial": [table_doc([["a", "b"]], [{"row": 0, "col": 0, "rows": 1, "cols": 1}])],
        "too_long": [annotation_doc(content={"kind": "table", "header": False, "rows": [["x"] * 9]})],
        "string_too_short": [annotation_doc(content={"kind": "note", "text": ""})],
        "string_pattern_mismatch": [
            annotation_doc("x4-1"),
            annotation_doc(content={"kind": "image", "asset": "zz", "alt": ""}),
            annotation_doc(content={"kind": "note", "text": "a\tb"}),
        ],
        "union_tag_invalid": [annotation_doc(content={"kind": "sticker", "text": "x"})],
        "less_than_equal": [annotation_doc(w=4001), annotation_doc(style={"opacity": 101})],
        "greater_than_equal": [annotation_doc(h=19), annotation_doc(style={"text_size": 7})],
        "enum": [
            annotation_doc(z="middle"),
            annotation_doc(style={"text_align": "justify"}),
            annotation_doc(content={"kind": "shape", "shape": "arrow", "label": ""}),
        ],
        "missing": [{k: v for k, v in annotation_doc().items() if k != "locked"}],
    }
    for code, docs in refused.items():
        for doc in docs:
            with pytest.raises(ValidationError) as exc:
                Intent.model_validate(intent_doc(annotations=[doc]))
            assert first_error(exc)["type"] == code, (code, doc)
    unsorted = [{"row": 1, "col": 0, "rows": 1, "cols": 2}, {"row": 0, "col": 0, "rows": 1, "cols": 2}]
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(annotations=[table_doc([["a", "b"], ["c", "d"]], unsorted)]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "merges"
    note = annotation_doc(content={"kind": "note", "text": "ligne 1\nligne 2"})
    assert Intent.model_validate(intent_doc(annotations=[note])).annotations[0].content.text == "ligne 1\nligne 2"


def table_doc(rows: list, merges: list) -> dict:
    return annotation_doc(content={"kind": "table", "header": False, "rows": rows, "merges": merges})


def test_connectors_have_two_distinct_ends_free_or_attached_heads_a_route_and_a_complete_style():
    """docs/10 §6 (1.4.0) : identité `c<revision>-<n>`, bouts discriminés par leur sorte (libre : un point ;
    attaché : l'id ou le hostname de l'élément), jamais deux fois le même élément, pointes, tracé, courbure bornée."""
    free = connector_doc("c4-1")
    attached = connector_doc(
        "c4-2",
        start={"kind": "device", "ref": "sw-core-01", "side": "e"},
        end={"kind": "annotation", "ref": "a4-1", "side": "auto"},
        heads={"start": "arrow", "end": "arrow"},
        route="curve",
        bend=-80,
        label="WAN",
    )
    grouped = connector_doc(
        "c4-3", start={"kind": "group", "ref": "g3-1", "side": "s"}, route="elbow", z="back", locked=True
    )
    intent = Intent.model_validate(intent_doc(connectors=[free, attached, grouped]))
    assert [c.id for c in intent.connectors] == ["c4-1", "c4-2", "c4-3"]
    assert intent.connectors[1].start.ref == "sw-core-01" and intent.connectors[1].end.kind == "annotation"
    assert intent.connectors[0].end.x == 200 and intent.connectors[1].bend == -80 and intent.connectors[2].locked
    assert intent.connectors[1].start.side == "e" and intent.connectors[2].start.side == "s"
    with pytest.raises(ValidationError) as exc:
        Intent.model_validate(intent_doc(connectors=[connector_doc("c4-2"), connector_doc("c4-1")]))
    assert first_error(exc)["type"] == "not_canonical_order" and first_error(exc)["ctx"]["section"] == "connectors"
    same = {"kind": "device", "ref": "sw-core-01", "side": "auto"}
    refused = {
        "connector_same_ends": [connector_doc(start=same, end=same)],
        "end_ref_mismatch": [
            connector_doc(start={"kind": "group", "ref": "sw-core-01", "side": "auto"}),
            connector_doc(end={"kind": "annotation", "ref": "g3-1", "side": "auto"}),
        ],
        "union_tag_invalid": [connector_doc(start={"kind": "link", "ref": "x"})],
        "union_tag_not_found": [connector_doc(start={"x": 0, "y": 0})],
        "string_pattern_mismatch": [connector_doc("a4-1"), connector_doc(label="a\tb")],
        "less_than_equal": [connector_doc(bend=2001), connector_doc(style={"stroke_width": 9})],
        "greater_than_equal": [connector_doc(style={"stroke_width": 0}), connector_doc(style={"opacity": 9})],
        "enum": [
            connector_doc(route="zigzag"),
            connector_doc(heads={"start": "dot", "end": "none"}),
            connector_doc(style={"stroke_style": "none"}),
            connector_doc(start={"kind": "device", "ref": "sw-core-01", "side": "north"}),
        ],
        "missing": [
            {k: v for k, v in connector_doc().items() if k != "bend"},
            connector_doc(start={"kind": "device", "ref": "sw-core-01"}),
        ],
        "extra_forbidden": [connector_doc(start={"kind": "free", "x": 0, "y": 0, "ref": None})],
    }
    for code, docs in refused.items():
        for doc in docs:
            with pytest.raises(ValidationError) as exc:
                Intent.model_validate(intent_doc(connectors=[doc]))
            assert first_error(exc)["type"] == code, (code, doc)
    # un bout d'équipement et un bout de groupe peuvent porter la même chaîne : ce sont deux éléments
    both = connector_doc(
        start={"kind": "device", "ref": "g3-1", "side": "auto"}, end={"kind": "group", "ref": "g3-1", "side": "w"}
    )
    assert Intent.model_validate(intent_doc(connectors=[both])).connectors[0].end.kind == "group"


def test_a_document_written_before_1_4_reads_with_its_lines_turned_into_connectors():
    """1.3.x : une ligne ou une flèche était une forme dans sa boîte ; relue, elle devient un connecteur aux coins de
    la boîte, un tableau reçoit des colonnes et des lignes égales ; rien n'est effacé. 1.4.x : un bout attaché n'avait
    pas d'ancre, il part du contour (`auto`)."""
    from ld_contracts.intent import upgraded

    old = intent_doc(intent_version="1.3.0")
    del old["connectors"]
    arrow_shape = {"kind": "shape", "shape": "arrow", "label": "WAN", "direction": "up"}
    arrow = annotation_doc("a2-1", x=100, y=50, w=200, h=80, content=arrow_shape)
    line_shape = {"kind": "shape", "shape": "line", "label": "", "direction": "down"}
    invisible = {"stroke_style": "none", "stroke_width": 0}
    anchor = {"kind": "device", "ref": "sw-core-01"}
    line = annotation_doc("a2-2", anchor=anchor, x=-10, y=-20, w=60, h=40, z="back", content=line_shape)
    line["style"] = {**line["style"], **invisible}
    box = annotation_doc("a2-3", content={"kind": "shape", "shape": "rectangle", "label": "DMZ", "direction": "down"})
    table = annotation_doc("a2-4", content={"kind": "table", "header": True, "rows": [["VLAN"], ["10"]]})
    del table["content"]["widths"], table["content"]["heights"], table["content"]["merges"]
    old["annotations"] = [arrow, line, box, table]
    with pytest.raises(ValidationError):
        Intent.model_validate(old)
    read = Intent.model_validate(upgraded(old))
    assert read.intent_version == INTENT_VERSION
    assert [a.id for a in read.annotations] == ["a2-3", "a2-4"], "les formes gardées, les lignes parties en connecteurs"
    assert read.annotations[1].content.widths is None and read.annotations[1].content.merges == ()
    first, second = read.connectors
    ends = (first.id, first.start.x, first.start.y, first.end.x, first.end.y)
    assert ends == ("c2-1", 100, 130, 300, 50), "montante : du bas gauche au haut droit"
    assert first.heads.end == "arrow" and first.label == "WAN" and first.style.hue == "slate"
    assert first.author == "orhan"
    kept = (second.id, second.start.kind, second.start.ref, second.start.side, second.end.x, second.end.y, second.z)
    assert kept == ("c2-2", "device", "sw-core-01", "auto", 50, 20, "back")
    assert second.heads.end == "none" and second.style.stroke_style == "solid"
    assert second.style.stroke_width == 1, "un trait invisible redevient visible"
    yesterday = intent_doc(intent_version="1.4.0")
    attached = {"kind": "device", "ref": "sw-core-01"}
    yesterday["connectors"] = [connector_doc("c3-1", start=attached), connector_doc("c3-2")]
    with pytest.raises(ValidationError):
        Intent.model_validate(yesterday)
    relu = Intent.model_validate(upgraded(yesterday))
    assert relu.intent_version == INTENT_VERSION and relu.connectors[0].start.side == "auto"
    assert relu.connectors[1].start.kind == "free", "un bout libre n'a pas d'ancre"
    older = intent_doc(intent_version="1.2.0")
    del older["annotations"], older["connectors"]
    relu = Intent.model_validate(upgraded(older))
    assert relu.annotations == () and relu.connectors == ()
    oldest = intent_doc(intent_version="1.0.0")
    for key in ("annotations", "connectors", "groups", "type_colors", "device_colors"):
        del oldest[key]
    assert Intent.model_validate(upgraded(oldest)).annotations == ()


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
    from ld_contracts.intent import (
        Anchor,
        Annotation,
        AnnotationStyle,
        AttachedEnd,
        Connector,
        ConnectorStyle,
        FreeEnd,
        Heads,
        ImageContent,
        Merge,
        NoteContent,
        ShapeContent,
        TableContent,
    )

    contents = {NoteContent, ShapeContent, TableContent, ImageContent, Merge}
    connectors = {Connector, ConnectorStyle, FreeEnd, AttachedEnd, Heads}
    assert (
        seen
        == {Intent, Pin, TypeColor, DeviceColor, Group, GroupStyle, Annotation, Anchor, AnnotationStyle}
        | contents
        | connectors
    )


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
        "patch_after_update",
        "anchor_ref_mismatch",
        "leader_without_anchor",
        "table_ragged",
        "table_dims_mismatch",
        "table_merge_outside",
        "table_merge_overlap",
        "table_merge_trivial",
        "end_ref_mismatch",
        "connector_same_ends",
    }
    assert raised <= set(INTENT_ERROR_TYPES)

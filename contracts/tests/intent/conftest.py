"""Constructeurs de documents Intent valides ; chaque test ne modifie que ce qu'il teste."""

import pytest

INTENT_VERSION = "1.5.0"
AT = "2026-10-04T18:30:00Z"


def pin_doc(hostname: str = "sw-core-01", **overrides) -> dict:
    return {"hostname": hostname, "x": 120, "y": -40, "author": "orhan", "at": AT, **overrides}


def intent_doc(**overrides) -> dict:
    pins = overrides.pop("pins", [pin_doc("fw-edge-01"), pin_doc("sw-core-01")])
    base = {"intent_version": INTENT_VERSION, "infrastructure": "infra-lab", "revision": 2, "updated_at": AT}
    base["pins"] = pins
    base["type_colors"] = overrides.pop("type_colors", [])
    base["device_colors"] = overrides.pop("device_colors", [])
    base["groups"] = overrides.pop("groups", [])
    base["annotations"] = overrides.pop("annotations", [])
    base["connectors"] = overrides.pop("connectors", [])
    return {**base, **overrides}


def group_doc(group_id: str = "g3-1", **overrides) -> dict:
    from ld_contracts.intent import DEFAULT_GROUP_STYLE

    style = {**DEFAULT_GROUP_STYLE, **overrides.pop("style", {})}
    base = {
        "id": group_id,
        "label": "Cœur",
        "description": "",
        "members": ["fw-edge-01", "sw-core-01"],
        "style": style,
        "author": "orhan",
        "at": AT,
    }
    return {**base, **overrides}


def annotation_doc(annotation_id: str = "a4-1", **overrides) -> dict:
    """Une note libre par défaut ; `content`, `anchor` et `style` se remplacent en entier ou par clés."""
    from ld_contracts.intent import DEFAULT_ANNOTATION_STYLE

    content = overrides.pop("content", {"kind": "note", "text": "Baie 12, rangée B"})
    if content.get("kind") == "table":
        content = {"widths": None, "heights": None, "merges": [], **content}
    style = {
        **DEFAULT_ANNOTATION_STYLE.get(content["kind"], DEFAULT_ANNOTATION_STYLE["note"]),
        **overrides.pop("style", {}),
    }
    base = {
        "id": annotation_id,
        "anchor": {"kind": "free", "ref": None},
        "x": 300,
        "y": -120,
        "w": 220,
        "h": 80,
        "z": "front",
        "locked": False,
        "leader": False,
        "content": content,
        "style": style,
        "author": "orhan",
        "at": AT,
    }
    return {**base, **overrides}


def connector_doc(connector_id: str = "c4-1", **overrides) -> dict:
    """Une flèche libre par défaut, de (0, 0) à (200, 100) ; `start`, `end`, `heads` et `style` se remplacent."""
    from ld_contracts.intent import DEFAULT_CONNECTOR_STYLE, DEFAULT_HEADS

    style = {**DEFAULT_CONNECTOR_STYLE, **overrides.pop("style", {})}
    base = {
        "id": connector_id,
        "start": {"kind": "free", "x": 0, "y": 0},
        "end": {"kind": "free", "x": 200, "y": 100},
        "heads": dict(DEFAULT_HEADS),
        "route": "straight",
        "bend": 0,
        "label": "",
        "z": "front",
        "locked": False,
        "style": style,
        "author": "orhan",
        "at": AT,
    }
    return {**base, **overrides}


def type_color_doc(device_type: str = "firewall", hue: str = "red", **overrides) -> dict:
    return {"type": device_type, "hue": hue, "author": "orhan", "at": AT, **overrides}


def device_color_doc(hostname: str = "sw-core-01", hue: str = "amber", **overrides) -> dict:
    return {"hostname": hostname, "hue": hue, "author": "orhan", "at": AT, **overrides}


def empty_doc(**overrides) -> dict:
    return intent_doc(revision=0, updated_at=None, pins=[], **overrides)


@pytest.fixture
def two_pins() -> dict:
    return intent_doc()


def first_error(exc_info) -> dict:
    return exc_info.value.errors()[0]


def error_types(exc_info) -> set[str]:
    return {e["type"] for e in exc_info.value.errors()}

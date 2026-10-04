"""Constructeurs de documents Intent valides ; chaque test ne modifie que ce qu'il teste."""

import pytest

INTENT_VERSION = "1.0.0"
AT = "2026-10-04T18:30:00Z"


def pin_doc(hostname: str = "sw-core-01", **overrides) -> dict:
    return {"hostname": hostname, "x": 120, "y": -40, "author": "orhan", "at": AT, **overrides}


def intent_doc(**overrides) -> dict:
    pins = overrides.pop("pins", [pin_doc("fw-edge-01"), pin_doc("sw-core-01")])
    base = {"intent_version": INTENT_VERSION, "infrastructure": "infra-lab", "revision": 2, "updated_at": AT}
    base["pins"] = pins
    return {**base, **overrides}


def empty_doc(**overrides) -> dict:
    return intent_doc(revision=0, updated_at=None, pins=[], **overrides)


@pytest.fixture
def two_pins() -> dict:
    return intent_doc()


def first_error(exc_info) -> dict:
    return exc_info.value.errors()[0]


def error_types(exc_info) -> set[str]:
    return {e["type"] for e in exc_info.value.errors()}

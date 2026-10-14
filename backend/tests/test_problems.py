"""Les refus de l'API en anglais, avec un code que la page traduit (2026-10-10, lot 7 de la langue).

Chaque code de `problems.py` a son texte dans les deux langues de la page (`common:http.problem` / `common:http.field`),
écrit avec les mêmes valeurs ; l'anglais de la page est la phrase de l'API. Aucun refus n'échappe au registre : les
routes lèvent `ApiError`, jamais un `HTTPException` écrit à la main.
"""

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ld_backend.problems import FIELD_CODES, PROBLEMS

LOCALES = Path(__file__).resolve().parents[2] / "engine" / "src" / "i18n" / "locales"
SOURCES = Path(__file__).resolve().parents[1] / "src" / "ld_backend"


def _http(language: str) -> dict:
    return json.loads((LOCALES / language / "common.json").read_text(encoding="utf-8"))["http"]


def _server_vars(text: str) -> set[str]:
    return set(re.findall(r"\{(\w+)\}", text))


def _page_vars(text: str) -> set[str]:
    return set(re.findall(r"\{\{(\w+)\}\}", text))


@pytest.mark.parametrize("language", ["fr", "en"])
@pytest.mark.parametrize(("family", "registry"), [("problem", PROBLEMS), ("field", FIELD_CODES)])
def test_every_code_has_its_text_in_each_language_with_the_same_values(language, family, registry):
    texts = _http(language)[family]
    assert set(texts) == set(registry)
    for code, english in registry.items():
        assert texts[code].strip() and _page_vars(texts[code]) == _server_vars(english), (language, code)


@pytest.mark.parametrize(("family", "registry"), [("problem", PROBLEMS), ("field", FIELD_CODES)])
def test_the_english_page_says_what_the_api_says(family, registry):
    texts = _http("en")[family]
    assert {code: re.sub(r"\{\{(\w+)\}\}", r"{\1}", text) for code, text in texts.items()} == registry


def test_the_api_speaks_english():
    for text in (*PROBLEMS.values(), *FIELD_CODES.values()):
        assert not re.search(r"[àâçéèêëîïôûùüÿœ]", text), text


def test_every_action_word_of_the_api_has_its_text():
    actions = set(re.findall(r'_require_runs\(store, infrastructure, "(\w+)"\)', (SOURCES / "api.py").read_text()))
    assert actions == {"modify", "illustrate", "place"}
    for language in ("fr", "en"):
        assert set(_http(language)["action"]) == actions


def test_no_refusal_is_written_outside_the_registry():
    for name in ("api.py", "bodies.py"):
        assert "HTTPException(" not in (SOURCES / name).read_text(encoding="utf-8"), name


def test_a_framework_refusal_has_a_code_too(client: TestClient, auth):
    res = client.get("/api/nothing-here", headers=auth)
    assert res.status_code == 404 and res.json() == {"code": "not_found", "detail": "not found"}
    res = client.put("/api/health")
    assert res.status_code == 405 and res.json()["code"] == "method_not_allowed"


def test_a_field_code_of_the_api_is_never_a_code_of_the_contract_or_of_a_model():
    """La page traduit un champ fautif d'après son code (`common:http.field`) sans savoir qui l'a levé : un code du
    contrat ou d'un modèle qui prendrait le nom d'un code de l'API serait écrit avec une phrase qui ne lui va pas, et
    des valeurs absentes (revue de l'interface bilingue, B6). Les deux familles restent disjointes."""
    from ld_contracts.intent.codes import INTENT_ERROR_TYPES

    roots = (SOURCES.parents[2] / "contracts" / "src", SOURCES)
    raised = {
        code
        for root in roots
        for path in root.rglob("*.py")
        if path.name != "problems.py"
        for code in re.findall(r'PydanticCustomError\(\s*"(\w+)"', path.read_text(encoding="utf-8"))
    }
    assert raised, "le balayage lit bien les sources"
    assert set(FIELD_CODES).isdisjoint(raised | set(INTENT_ERROR_TYPES))

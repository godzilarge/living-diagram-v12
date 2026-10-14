"""Le sens des contrôles dans les deux langues de la page (2026-10-10, lot 6 de la langue).

Le catalogue fermé des codes vit dans le contrat (`ld_contracts.snapshot.codes`) ; la page en a une copie par langue
(`engine/src/i18n/locales/<langue>/checks.json`), le code pour clé. Le français est recopié du contrat à l'octet, chaque
code a son texte anglais, et un identifiant écrit en code (`details`, `min_links`) est le même dans les deux langues.
"""

import json
import re
from pathlib import Path

import pytest
from ld_contracts.snapshot.codes import CATALOGUE, CheckCode

LOCALES = Path(__file__).resolve().parents[2] / "engine" / "src" / "i18n" / "locales"
LANGUAGES = ("fr", "en")


def _meanings(language: str) -> dict[str, str]:
    return json.loads((LOCALES / language / "checks.json").read_text(encoding="utf-8"))["meaning"]


def _identifiers(text: str) -> list[str]:
    return sorted(re.findall(r"`([^`]+)`", text))


@pytest.mark.parametrize("language", LANGUAGES)
def test_every_check_code_has_a_meaning_in_each_language(language: str) -> None:
    meanings = _meanings(language)
    assert set(meanings) == {code.value for code in CheckCode}
    assert all(text.strip() for text in meanings.values())
    assert all(text.count("`") % 2 == 0 for text in meanings.values())


def test_the_french_meanings_are_the_contract_word_for_word() -> None:
    assert _meanings("fr") == {code.value: spec.meaning for code, spec in CATALOGUE.items()}


def test_a_field_name_is_the_same_in_both_languages() -> None:
    french, english = _meanings("fr"), _meanings("en")
    for code, text in french.items():
        assert _identifiers(english[code]) == _identifiers(text), code

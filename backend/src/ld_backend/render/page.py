"""Assemble la page : gabarit, feuille de style, visualiseur et données, en un seul fichier sans ressource externe.

Trois garde-fous contre une chaîne hostile (une description est du texte libre, un voisin LLDP annonce ce qu'il veut) :
- les données voyagent dans un bloc `application/json`, où `<`, `>` et `&` sont échappés : rien ne peut le fermer ;
- le visualiseur n'écrit jamais de HTML (`textContent` seulement, vérifié par un test sur ses sources) ;
- une CSP par empreinte n'autorise que le script et la feuille de style de la page : ni URL, ni script ajouté.

Même entrée ⇒ même page, à l'octet : aucune horloge ici non plus.
"""

import base64
import hashlib
import html
import json
import re
from collections.abc import Mapping
from importlib.resources import files
from typing import Any

from ld_contracts.snapshot.codes import CATALOGUE

ASSETS = files("ld_backend.render") / "assets"
JS_FILES = ("model.js", "layout.js", "dom.js", "graph.js", "inspect.js", "tables.js", "main.js")
PLACEHOLDER = re.compile(r"\{\{([A-Z]+)\}\}")
JSON_ESCAPES = {"<": "\\u003c", ">": "\\u003e", "&": "\\u0026", " ": "\\u2028", " ": "\\u2029"}


def build_page_data(snapshot: Mapping[str, Any], ingest: Mapping[str, Any] | None, *, origin: str) -> dict[str, Any]:
    """Ce que la page embarque : le snapshot, le rapport de la livraison s'il existe, le sens de chaque code."""
    catalogue = {code.value: {"meaning": spec.meaning, "rule": spec.rule} for code, spec in CATALOGUE.items()}
    return {"snapshot": snapshot, "ingest": ingest, "origin": origin, "catalogue": catalogue}


def _embed(data: Mapping[str, Any]) -> str:
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "".join(JSON_ESCAPES.get(char, char) for char in text)


def _csp_source(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii") + "'"


def _asset(*parts: str) -> str:
    return ASSETS.joinpath(*parts).read_text(encoding="utf-8")


def render_page(data: Mapping[str, Any]) -> str:
    source = data["snapshot"]["source"]
    style = _asset("viewer.css")
    script = "\n".join(_asset("js", name) for name in JS_FILES)
    if "</script" in script.lower() or "</style" in style.lower():
        raise ValueError("une source du visualiseur contient une balise fermante : le bloc en ligne serait coupé")
    csp = (
        f"default-src 'none'; script-src {_csp_source(script)}; style-src {_csp_source(style)}; "
        "base-uri 'none'; form-action 'none'"
    )
    parts = {
        "TITLE": html.escape(f"Living Diagram · {source['infrastructure']} · {source['collector_run_id']}"),
        "CSP": csp,  # ni guillemet double ni chevron : des mots-clés et du base64
        "STYLE": style,
        "SCRIPT": script,
        "DATA": _embed(data),
    }
    return PLACEHOLDER.sub(lambda found: parts[found.group(1)], _asset("page.html"))  # une passe : rien n'est relu

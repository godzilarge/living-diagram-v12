"""L'application servie à `/` : la face « utilisateur » de la toile (React, `engine/src/app/`), à côté de `/view`, la
page de lecture de B1, gelée (2026-10-06).

La page est un gabarit sans donnée de run : elle se sert sans jeton, comme `/view` et `/docs`. Elle charge ses deux
fichiers (`/assets/app/app.js`, `/assets/app/app.css`) et ses polices (`/assets/app/fonts/*.woff2`) depuis sa propre
origine, **lus à la requête** dans les assets du paquet (jamais assemblés au démarrage) ; la CSP n'ouvre que
`'self'` pour les scripts, les styles, les polices et `fetch` : aucun CDN, aucune ressource externe. Le jeton se
saisit dans l'application (`sessionStorage`), l'adresse porte la run et l'état de vue, comme `/view`.

La page embarque le catalogue des codes de contrôle (sens, règle), comme `/view` : une constante du contrat, pas une
donnée.
"""

import base64
import hashlib
import html
import json
from importlib.resources import files
from importlib.resources.abc import Traversable

from ld_contracts.snapshot.codes import CATALOGUE

APP_ASSETS = files("ld_backend.render") / "assets" / "app"
APP_ROUTE = "/"
APP_ASSET_PREFIX = "/assets/app/"
MEDIA_TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2"}
APP_CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; "
    "img-src 'self' blob:; "
    "base-uri 'none'; form-action 'none'"
)
JSON_ESCAPES = {"<": "\\u003c", ">": "\\u003e", "&": "\\u0026", " ": "\\u2028", " ": "\\u2029"}

PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<title>{title}</title>
<link rel="stylesheet" href="{prefix}app.css">
<script src="{prefix}app.js" defer></script>
</head>
<body>
<div id="app"></div>
<noscript><p class="fatal">Cette application a besoin de JavaScript : tout le rendu se fait dans le \
navigateur.</p></noscript>
<script type="application/json" id="ld-catalogue">{catalogue}</script>
</body>
</html>
"""


def _embed(data: object) -> str:
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "".join(JSON_ESCAPES.get(char, char) for char in text)


def catalogue_data() -> dict[str, dict[str, str]]:
    return {code.value: {"meaning": spec.meaning, "rule": spec.rule} for code, spec in CATALOGUE.items()}


def render_app() -> str:
    """La page de l'application : même entrée ⇒ même page, à l'octet."""
    return PAGE.format(
        csp=APP_CSP, title=html.escape("Living Diagram"), prefix=APP_ASSET_PREFIX, catalogue=_embed(catalogue_data())
    )


def _walk(root: Traversable, prefix: str = "") -> list[str]:
    names: list[str] = []
    for entry in root.iterdir():
        if entry.is_dir():
            names.extend(_walk(entry, prefix + entry.name + "/"))
        else:
            names.append(prefix + entry.name)
    return sorted(names)


def app_asset_names() -> list[str]:
    """Les fichiers servables, par leur chemin relatif : la liste fait foi, jamais une concaténation de chemin."""
    try:
        return _walk(APP_ASSETS)
    except FileNotFoundError, OSError:
        return []


def read_app_asset(name: str) -> tuple[bytes, str, str] | None:
    """Le contenu, le type et l'ETag (empreinte du contenu) d'un fichier de l'application, lu à la requête ; `None`
    si le nom n'est pas dans la liste (chemin inventé, `..`, extension inconnue)."""
    if name not in app_asset_names():
        return None
    suffix = name[name.rfind(".") :] if "." in name else ""
    media_type = MEDIA_TYPES.get(suffix)
    if media_type is None:
        return None
    target: Traversable = APP_ASSETS
    for part in name.split("/"):
        target = target / part
    content = target.read_bytes()
    etag = '"' + base64.urlsafe_b64encode(hashlib.sha256(content).digest()).decode("ascii").rstrip("=") + '"'
    return content, media_type, etag

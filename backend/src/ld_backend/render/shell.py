"""La page servie par le backend (`GET /view`) : le visualiseur sans données, qui lit le snapshot par l'API.

La coquille ne contient aucune donnée de run : elle se sert sans jeton, comme `/docs`. Le jeton se saisit dans la
page (jamais dans l'URL), est gardé dans `sessionStorage` (l'onglet, pas le disque) et voyage en `Authorization`
vers `/api/snapshot`, `/api/ingest/report` et `/api/ingest/bundles`. L'adresse porte la run
(`?infrastructure=&run_id=`) et l'état de vue (`#view=…`) : elle se partage, le jeton non.
"""

from ld_backend.render.page import JS_FILES, assemble_page, build_page_data

SHELL_SCRIPTS = (*JS_FILES, "shell.js")


def render_shell() -> str:
    data = {**build_page_data({}, None, origin="api"), "snapshot": None}
    return assemble_page(data, title="Living Diagram · lecture d'une run", scripts=SHELL_SCRIPTS, connect_self=True)

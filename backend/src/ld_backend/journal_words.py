"""Les mots de la vue Journal, pour la recherche (revue Impeccable du 2026-10-10).

En une phrase : **la recherche du journal trouve les mots que la page affiche, en français comme en anglais.** Avant,
elle ne lisait que les opérations telles que reçues (`group_delete`, `red`, `pin`) : chercher « supprimé », « rouge » ou
« placé » ne trouvait rien, un faux négatif silencieux dans un registre d'audit. Ici, le vocabulaire des phrases de la
page (catalogue `journal` de `engine/src/i18n/locales/<langue>/`, clés `say.*` et `batch.*` : un test vérifie que chaque
verbe et chaque nom y est, dans chaque langue), les teintes et les types (`common`), les mots des champs modifiés, et
les mots d'un objet sans nom, par sa sorte, dans les deux langues. La comparaison se fait sans la casse
**et sans les accents** (`fold`) : « supprime » trouve « supprimé ». Les deux langues sont cherchées à la fois : le
serveur ne connaît pas la langue de la page, et un mot de l'autre langue ne trouve que ce qu'il dit.
"""

import unicodedata
from collections.abc import Iterator
from typing import Any

# les verbes et noms de chaque phrase, tels que la page les écrit (français, puis anglais)
OP_WORDS: dict[str, tuple[str, ...]] = {
    "pin": ("placé", "équipement", "équipements", "position", "placed", "device", "devices"),
    "unpin": ("désépinglé", "équipement", "équipements", "position", "unpinned", "device", "devices"),
    "color": (
        "coloré",
        "couleur",
        "teinte",
        "équipement",
        "équipements",
        "coloured",
        "colour",
        "hue",
        "device",
        "devices",
    ),
    "uncolor": (
        "rendu",
        "couleur de son type",
        "couleur de leur type",
        "teinte",
        "équipement",
        "équipements",
        "returned",
        "its type colour",
        "their type colour",
        "hue",
        "device",
        "devices",
    ),
    "color_type": ("coloré", "le type", "couleur", "teinte", "coloured", "type", "colour", "hue"),
    "uncolor_type": ("rendu", "le type", "teinte par défaut", "returned", "type", "default hue"),
    "group_create": (
        "créé",
        "groupe",
        "groupes",
        "membre",
        "membres",
        "created",
        "group",
        "groups",
        "member",
        "members",
    ),
    "group_update": ("modifié", "groupe", "modified", "group"),
    "group_add": ("ajouté", "membre", "membres", "groupe", "added", "member", "members", "group"),
    "group_remove": ("retiré", "membre", "membres", "groupe", "removed", "member", "members", "group"),
    "group_delete": ("supprimé", "groupe", "groupes", "deleted", "group", "groups"),
    "annotation_create": ("ajouté", "annotation", "annotations", "added"),
    "annotation_update": ("modifié", "annotation", "annotations", "modified"),
    "annotation_delete": ("supprimé", "annotation", "annotations", "deleted"),
    "connector_create": ("tracé", "connecteur", "connecteurs", "drew", "connector", "connectors"),
    "connector_update": ("modifié", "connecteur", "connecteurs", "modified", "connector", "connectors"),
    "connector_delete": ("supprimé", "connecteur", "connecteurs", "deleted", "connector", "connectors"),
    "journal_prune": (
        "purgé",
        "purge du journal",
        "entrée",
        "entrées",
        "antérieure",
        "antérieures",
        "purged",
        "purged the log",
        "entry",
        "entries",
        "before",
    ),
}
# une entrée de plusieurs opérations : « … et 2 autres modifications », « … and 2 other changes »
MANY_WORDS = ("autre modification", "autres modifications", "other change", "other changes")
# les catégories, comme la page les dit (une trace de purge les cite)
CATEGORY_WORDS: dict[str, tuple[str, ...]] = {
    "positions": ("positions",),
    "colors": ("couleurs", "colours"),
    "groups": ("groupes", "groups"),
    "annotations": ("annotations",),
    "connectors": ("connecteurs", "connectors"),
    "other": ("autres", "other"),
}
# la sorte d'une annotation, comme la phrase la nomme (« la note », « le tableau », « the table »)
KIND_WORDS: dict[str, tuple[str, ...]] = {
    "note": ("note",),
    "shape": ("forme", "shape"),
    "table": ("tableau", "table"),
    "image": ("image",),
}
HUE_WORDS: dict[str, tuple[str, ...]] = {
    "blue": ("bleu", "blue"),
    "sky": ("ciel", "sky"),
    "indigo": ("indigo",),
    "violet": ("violet",),
    "pink": ("rose", "pink"),
    "red": ("rouge", "red"),
    "orange": ("orange",),
    "amber": ("ambre", "amber"),
    "lime": ("citron", "lime"),
    "green": ("vert", "green"),
    "teal": ("turquoise", "teal"),
    "slate": ("ardoise", "slate"),
}
TYPE_WORDS: dict[str, tuple[str, ...]] = {
    "switch": ("switch",),
    "router": ("routeur", "router"),
    "firewall": ("firewall",),
    "load_balancer": ("répartiteur", "balancer", "load balancer"),
    "wireless_controller": ("WLC", "contrôleur Wi-Fi", "Wi-Fi controller"),
    "server": ("serveur", "server"),
    "other": ("autre", "other"),
}
# les champs modifiés, comme la page les dit (« : position, style »)
FIELD_WORDS: dict[str, tuple[str, ...]] = {
    "x": ("position",),
    "y": ("position",),
    "w": ("taille", "size"),
    "h": ("taille", "size"),
    "content": ("contenu", "content"),
    "style": ("style",),
    "anchor": ("ancrage", "anchor"),
    "z": ("plan", "layer"),
    "locked": ("verrou", "lock"),
    "leader": ("ligne de rappel", "leader line"),
    "label": ("nom", "name"),
    "description": ("description",),
    "members": ("membres", "members"),
    "start": ("bouts", "ends"),
    "end": ("bouts", "ends"),
    "heads": ("pointes", "heads"),
    "route": ("tracé", "route"),
    "bend": ("courbure", "bend"),
}
# un objet sans nom, par sa sorte (`journal_replay.UNNAMED_TEXT`), dans les deux langues de la page
UNNAMED_WORDS: dict[str, tuple[str, str]] = {
    "note": ("note vide", "empty note"),
    "shape": ("forme sans titre", "untitled shape"),
    "table": ("tableau vide", "empty table"),
    "image": ("image sans titre", "untitled image"),
    "annotation": ("annotation sans titre", "untitled annotation"),
    "group": ("groupe sans nom", "unnamed group"),
    "connector": ("connecteur sans nom", "unnamed connector"),
    "free": ("point libre", "free point"),
}


def fold(text: str) -> str:
    """Le texte comparable, sans la casse ni les accents : « Supprimé » vaut « supprime » (« Œ » reste « œ »)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def op_words(op: dict[str, Any]) -> Iterator[str]:
    """Les mots que la page écrit pour une opération, dans les deux langues : son verbe, sa sorte, la teinte et le type,
    les champs qu'elle modifie (les clés nulles ne disent rien, comme dans la page)."""
    name = str(op.get("op", ""))
    yield from OP_WORDS.get(name, ())
    content = op.get("content")
    if isinstance(content, dict) and content.get("kind") in KIND_WORDS:
        yield from KIND_WORDS[content["kind"]]
    if isinstance(op.get("hue"), str):
        yield from HUE_WORDS.get(op["hue"], (op["hue"],))
    if isinstance(op.get("type"), str):
        yield from TYPE_WORDS.get(op["type"], (op["type"],))
    if name == "journal_prune" and isinstance(op.get("categories"), list):
        for c in op["categories"]:
            if isinstance(c, str):
                yield from CATEGORY_WORDS.get(c, (c,))
    if name.endswith("_update"):
        for key, value in op.items():
            if key in FIELD_WORDS and value is not None:
                yield from FIELD_WORDS[key]

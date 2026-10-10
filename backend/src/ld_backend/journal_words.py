"""Les mots de la vue Journal, pour la recherche (revue Impeccable du 2026-10-10).

En une phrase : **la recherche du journal trouve les mots que la page affiche.** Avant, elle ne lisait que les
opérations telles que reçues (`group_delete`, `red`, `pin`) : chercher « supprimé », « rouge » ou « placé » ne trouvait
rien, un faux négatif silencieux dans un registre d'audit. Ici, le vocabulaire des phrases de la page
(`engine/src/app/state/journal-text.ts`, `sentenceOf` : un test vérifie que chaque verbe y est), les teintes et les
types en français (`canvas/hues.ts`, `canvas/format.ts`), et les mots des champs modifiés. La comparaison se fait sans
la casse **et sans les accents** (`fold`) : « supprime » trouve « supprimé ».
"""

import unicodedata
from collections.abc import Iterator
from typing import Any

# les verbes et noms de chaque phrase, tels que la page les écrit
OP_WORDS: dict[str, tuple[str, ...]] = {
    "pin": ("placé", "équipement", "équipements", "position"),
    "unpin": ("désépinglé", "équipement", "équipements", "position"),
    "color": ("coloré", "couleur", "teinte", "équipement", "équipements"),
    "uncolor": ("rendu", "couleur de son type", "couleur de leur type", "teinte", "équipement", "équipements"),
    "color_type": ("coloré", "le type", "couleur", "teinte"),
    "uncolor_type": ("rendu", "le type", "teinte par défaut"),
    "group_create": ("créé", "groupe", "groupes", "membre", "membres"),
    "group_update": ("modifié", "groupe"),
    "group_add": ("ajouté", "membre", "membres", "groupe"),
    "group_remove": ("retiré", "membre", "membres", "groupe"),
    "group_delete": ("supprimé", "groupe", "groupes"),
    "annotation_create": ("ajouté", "annotation", "annotations"),
    "annotation_update": ("modifié", "annotation", "annotations"),
    "annotation_delete": ("supprimé", "annotation", "annotations"),
    "connector_create": ("tracé", "connecteur", "connecteurs"),
    "connector_update": ("modifié", "connecteur", "connecteurs"),
    "connector_delete": ("supprimé", "connecteur", "connecteurs"),
    "journal_prune": ("purgé", "purge du journal", "entrée", "entrées", "antérieure", "antérieures"),
}
# une entrée de plusieurs opérations : « … et 2 autres modifications »
MANY_WORDS = ("autre modification", "autres modifications")
# les catégories, comme la page les dit (une trace de purge les cite)
CATEGORY_WORDS = {
    "positions": "positions", "colors": "couleurs", "groups": "groupes", "annotations": "annotations",
    "connectors": "connecteurs", "other": "autres",
}  # fmt: skip
# la sorte d'une annotation, comme la phrase la nomme (« la note », « le tableau »)
KIND_WORDS = {"note": "note", "shape": "forme", "table": "tableau", "image": "image"}
HUE_WORDS = {
    "blue": "bleu", "sky": "ciel", "indigo": "indigo", "violet": "violet", "pink": "rose", "red": "rouge",
    "orange": "orange", "amber": "ambre", "lime": "citron", "green": "vert", "teal": "turquoise", "slate": "ardoise",
}  # fmt: skip
TYPE_WORDS = {
    "switch": "switch", "router": "routeur", "firewall": "firewall", "load_balancer": "répartiteur",
    "wireless_controller": "WLC contrôleur Wi-Fi", "server": "serveur", "other": "autre",
}  # fmt: skip
# les champs modifiés, comme la page les dit (« : position, style »)
FIELD_WORDS = {
    "x": "position", "y": "position", "w": "taille", "h": "taille", "content": "contenu", "style": "style",
    "anchor": "ancrage", "z": "plan", "locked": "verrou", "leader": "ligne de rappel", "label": "nom",
    "description": "description", "members": "membres", "start": "bouts", "end": "bouts", "heads": "pointes",
    "route": "tracé", "bend": "courbure",
}  # fmt: skip


def fold(text: str) -> str:
    """Le texte comparable, sans la casse ni les accents : « Supprimé » vaut « supprime » (« Œ » reste « œ »)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def op_words(op: dict[str, Any]) -> Iterator[str]:
    """Les mots que la page écrit pour une opération : son verbe, sa sorte, la teinte et le type en français, les champs
    qu'elle modifie (les clés nulles ne disent rien, comme dans la page)."""
    name = str(op.get("op", ""))
    yield from OP_WORDS.get(name, ())
    content = op.get("content")
    if isinstance(content, dict) and content.get("kind") in KIND_WORDS:
        yield KIND_WORDS[content["kind"]]
    if isinstance(op.get("hue"), str):
        yield HUE_WORDS.get(op["hue"], op["hue"])
    if isinstance(op.get("type"), str):
        yield TYPE_WORDS.get(op["type"], op["type"])
    if name == "journal_prune" and isinstance(op.get("categories"), list):
        yield from (CATEGORY_WORDS.get(c, c) for c in op["categories"] if isinstance(c, str))
    if name.endswith("_update"):
        for key, value in op.items():
            if key in FIELD_WORDS and value is not None:
                yield FIELD_WORDS[key]

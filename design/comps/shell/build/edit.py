"""Edit mode: the tool palette, the contextual bars (device, note) and their volets.

Placement rule: a bar sits 12 px above its element, centred on it; a volet sits 12 px above its bar, under its
trigger. If the bar would come closer than 12 px to the top islands (y < 76), it flips below the element, and its
volets open below the bar.
"""

from __future__ import annotations

from build import esc, ibtn, ic, tip

TOOLS = [
    [("mouse-pointer-2", "Sélectionner", "V", True)],
    [("cable", "Déclarer un câble", "L", False), ("spline", "Connecteur", "K", False)],
    [("sticky-note", "Note", "N", False), ("shapes", "Forme", "S", False), ("table", "Tableau", "T", False),
     ("image", "Image", "I", False), ("square-code", "Bloc de code", "B", False)],
    [("group", "Grouper", "G", False)],
]

HUES = [("Gris", "#8A8F96"), ("Ardoise", "#4F6475"), ("Bleu", "#2F6FD6"), ("Ciel", "#4FA3E0"), ("Sarcelle", "#1F8A84"),
        ("Vert", "#2E9A52"), ("Olive", "#7D8B2E"), ("Jaune", "#D8B22A"), ("Ambre", "#E08A1E"), ("Orange", "#D9622B"),
        ("Rouge", "#C93A3A"), ("Rose", "#D2547E")]

NOTE = {"x": 680, "y": 420, "w": 232}
SEP = '<span class="sep"></span>'


def palette() -> str:
    groups = []
    for group in TOOLS:
        btns = []
        for icon, label, key, on in group:
            demo = " tip-demo-edit" if icon == "cable" else ""
            btns.append(ibtn(icon, label, key, "right", "rail" + demo, f'aria-pressed="{str(on).lower()}"'))
        groups.append("".join(btns))
    body = '<span class="hsep"></span>'.join(groups)
    return (f'<div class="surf edit-tools" data-float="outils-edition" data-bar="edition" role="toolbar" '
            f'aria-orientation="vertical" aria-label="Outils d\'édition">{body}</div>')


def opener(icon: str, label: str, cls: str = "", inner: str | None = None, pressed: bool = False) -> str:
    """An icon (or value) control that opens a volet: the chevron says so."""
    tid, t = tip(label, None, "")
    face = inner if inner is not None else ic(icon)
    state = ' aria-expanded="true"' if pressed else ' aria-expanded="false"'
    return (f'<button class="btn opener has-tip {cls}" aria-label="{esc(label)}" aria-haspopup="true"{state} '
            f'aria-describedby="{tid}">{face}{ic("chevron-down", "ico chev")}{t}</button>')


def bar(name: str, x: int, y: int, body: str, cls: str) -> str:
    return (f'<div class="surf bar ctx-bar {cls}" data-float="{name}" data-bar="{name}" role="toolbar" '
            f'style="left:{x}px;top:{y}px">{body}</div>')


def device_bar(cx: float, node_top: float) -> str:
    """Above the selected device; the align volet open above it."""
    width, height = 392, 48
    x, y = round(cx - width / 2), round(node_top - 12 - height)
    hue = opener("", "Teinte", "hue", '<span class="sw-btn" style="background:#4F6475"></span>')
    body = (hue + SEP + ibtn("pin", "Épingler la position", "P") + ibtn("lock", "Verrouiller", None) + SEP
            + ibtn("group", "Grouper", "G") + opener("align-center-vertical", "Aligner et répartir", "align-open", None, True)
            + SEP + ibtn("eye-off", "Masquer", "H") + ibtn("focus", "Isoler ses voisins", None) + SEP
            + ibtn("ellipsis", "Plus : annoter, copier l'identité, retirer l'intention", None, "end"))
    align = [("align-start-vertical", "Aligner à gauche"), ("align-center-vertical", "Centrer horizontalement"),
             ("align-end-vertical", "Aligner à droite"), ("align-start-horizontal", "Aligner en haut"),
             ("align-center-horizontal", "Centrer verticalement"), ("align-end-horizontal", "Aligner en bas")]
    dist = [("align-horizontal-distribute-center", "Répartir horizontalement"),
            ("align-vertical-distribute-center", "Répartir verticalement")]
    vbody = ("".join(ibtn(i, l, None, "up") for i, l in align) + SEP + "".join(ibtn(i, l, None, "up") for i, l in dist)
             + SEP + ibtn("layout-grid", "Caler sur la grille", None, "up"))
    volet = bar("volet-alignement", round(cx - 170), y - 12 - height, vbody, "for-edit volet")
    hues = "".join(f'<button class="btn icon has-tip" aria-label="{n}">'
                   f'<span class="sw-btn" style="background:{c}"></span>{tip(n, None, "up")[1]}</button>' for n, c in HUES)
    hue_volet = bar("volet-teinte", x, y - 12 - height, hues, "for-hue volet")
    return bar("barre-equipement", x, y, body, "for-edit") + volet + hue_volet


def note() -> str:
    n = NOTE
    return (f'<div class="note" style="left:{n["x"]}px;top:{n["y"]}px;width:{n["w"]}px" role="note">'
            f'<b>Maintenance le 22 janv. à 06:00</b>'
            f'<p>Remplacement du transceiver Ethernet1/54 de dc01-core-01. Prévenir l\'astreinte réseau.</p>'
            f'<i class="h h1"></i><i class="h h2"></i><i class="h h3"></i><i class="h h4"></i></div>')


def note_bar() -> str:
    width, height = 552, 48
    n = NOTE
    x, y = round(n["x"] + n["w"] / 2 - width / 2), n["y"] - 12 - height
    size = opener("", "Taille du texte", "size", '<span class="val">14</span>', True)
    body = (size + SEP + ibtn("bold", "Gras", "Ctrl B") + ibtn("italic", "Italique", "Ctrl I")
            + ibtn("underline", "Souligné", "Ctrl U") + SEP + ibtn("align-left", "Alignement du texte", None)
            + ibtn("baseline", "Couleur du texte", None) + ibtn("panel-top", "Position du titre", None) + SEP
            + ibtn("send-to-back", "Mettre dessous", None, "", "rail", 'aria-pressed="false"')
            + ibtn("bring-to-front", "Mettre dessus", None, "", "rail", 'aria-pressed="true"') + SEP
            + ibtn("lock", "Verrouiller", None) + ibtn("copy", "Dupliquer", "Ctrl D")
            + ibtn("trash-2", "Supprimer", "Suppr", "end"))
    sizes = "".join(f'<button class="btn rail" aria-pressed="{str(s == 14).lower()}">{s}</button>' for s in (12, 14, 16, 20, 24, 32))
    vh = 6 * 32 + 5 * 4 + 16
    volet = (f'<div class="surf ctx-bar for-note volet vlist" data-float="volet-taille" data-bar="volet-taille" '
             f'style="left:{x}px;top:{y - 12 - vh}px" role="listbox" aria-label="Taille du texte">{sizes}</div>')
    return bar("barre-note", x, y, body, "for-note") + volet


def layer(cx: float, node_top: float) -> str:
    return palette() + device_bar(cx, node_top) + note_bar()

"""Build the three bench pages (t1, t2, t3) from the approved mockup of the Contrôle view.

Reads design/comps/shell/control.html as it is (its CSS, its header, its data), embeds its font in base64 so each
page stands alone, swaps its column flow for absolute places and adds each direction's CSS and script.
Run: python3 build.py (from this folder; the pages are rewritten here with the font embedded).
"""
import base64
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHELL = HERE.parent.parent.parent / "design" / "comps" / "shell"  # design/rounds/<round>/ -> repository root
SRC = HERE / "src"

TITLES = {
    "t1": "T1, les poignées",
    "t2": "T2, les tailles",
    "t3": "T3, les places",
}
SPRITE = (
    '<symbol id="i-layout-panel-left" viewBox="0 0 24 24"><rect width="7" height="18" x="3" y="3" rx="1"/>'
    '<rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></symbol>'
)


def icon_button(name: str, label: str, icon: str, attrs: str = "", cls: str = "") -> str:
    return (
        f'<button class="btn icon has-tip {cls}" aria-label="{label}" aria-describedby="tip-{name}" {attrs}>'
        f'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-{icon}"/></svg>'
        f'<span class="tip end" role="tooltip" id="tip-{name}">{label}</span></button>'
    )


def sections(page: str) -> dict[str, str]:
    found = re.findall(r'<section class="surf w[^"]*" data-float="(\w+)".*?</section>', page, re.S)
    blocks = re.findall(r'(<section class="surf w[^"]*" data-float="\w+".*?</section>)', page, re.S)
    return dict(zip(found, blocks, strict=True))


def adapt(wid: str, html: str, direction: str) -> str:
    html = html.replace('class="surf w grow"', 'class="surf w"', 1)
    if wid == "verdicts":
        html = html.replace('<header class="w-head"', '<header class="w-head wraps"', 1)
        end = html.index("</span>", html.index('<span class="filter">')) + len("</span>")
        html = html[:end] + icon_button("f-v", "Filtrer les verdicts", "search", cls="filter-ico") + html[end:]
    if direction == "t2":
        if wid == "verdicts":
            html = html.replace(
                'class="btn icon has-tip " aria-label="Réglages du widget"',
                'class="btn icon has-tip rail" data-wset aria-haspopup="dialog" aria-expanded="false" '
                'aria-label="Réglages du widget"',
                1,
            )
        else:
            close = html.index("</span></header>")
            html = html[:close] + icon_button(
                f"s-{wid}", "Réglages du widget", "sliders-horizontal",
                'data-wset aria-haspopup="dialog" aria-expanded="false"', "rail",
            ) + html[close:]
    if direction == "t3":
        html = html.replace(
            '<span class="act">', '<span class="act">' + icon_button(f"p-{wid}", "Mettre en avant", "layout-panel-left", "data-promote"), 1
        )
    return html


POPOVER = """<div class="popover wset" data-popover="widget" role="dialog" aria-label="Réglages du widget">
  <div class="pop-row" role="group" aria-label="Taille"><span class="pop-l">Taille</span><button class="btn rail" data-size="compact">Compacte<span class="tip" role="tooltip"></span></button><button class="btn rail" data-size="normal">Normale<span class="tip" role="tooltip"></span></button><button class="btn rail" data-size="big">Grande<span class="tip" role="tooltip"></span></button></div>
  <div class="pop-row" role="group" aria-label="Place"><span class="pop-l">Place</span><button class="btn" data-first>Mettre en premier<span class="tip" role="tooltip"></span></button></div>
</div>"""


def bench(direction: str) -> str:
    links = "".join(
        f'<a href="{d}.html" aria-pressed="{str(d == direction).lower()}">{d.upper()}</a>' for d in TITLES
    )
    return (
        '<div class="surf bench on-bench" data-float="banc" aria-label="Banc d\'essai, hors produit">\n'
        '  <b>Banc</b><button data-bench="theme:light">Clair</button><button data-bench="theme:dark">Sombre</button><i></i>\n'
        '  <button data-bench="accent:a">Cobalt</button><button data-bench="accent:c">Encre</button><i></i>\n'
        f"  {links}<i></i>\n"
        '  <button data-act="forward">Couverture en avant</button><button data-act="reset">Réinitialiser</button><i></i>\n'
        '  <span class="chk" data-check aria-live="polite">16 / 16 px</span>\n'
        "</div>"
    )


def build(direction: str, mockup: str, font: str) -> str:
    page = mockup.replace("url(fonts/archivo-latin.woff2)", f"url(data:font/woff2;base64,{font})")
    page = re.sub(r"<title>.*?</title>", f"<title>Living Diagram, banc tuiles, {TITLES[direction]}</title>", page)
    page = page.replace("</svg>", SPRITE + "</svg>", 1)
    blocks = sections(page)
    start = page.index('<div class="space">')
    end = page.index('<div class="surf bench on-bench"')
    space = f'<div class="space" data-dir="{direction}">' + "".join(
        adapt(wid, html, direction) for wid, html in blocks.items()
    ) + "</div>"
    extra = POPOVER if direction == "t2" else ""
    bench_end = page.index("</div>", end) + len("</div>")
    page = page[:start] + space + extra + bench(direction) + page[bench_end:]
    css = (SRC / "common.css").read_text() + (SRC / f"{direction}.css").read_text()
    page = page.replace("</style>", css + "</style>", 1)
    js = (SRC / "common.js").read_text() + (SRC / f"{direction}.js").read_text()
    page = re.sub(r"<script>.*?</script>", lambda _: f"<script>\n{js}</script>", page, count=1, flags=re.S)
    return page


def main() -> None:
    mockup = (SHELL / "control.html").read_text()
    font = base64.b64encode((SHELL / "fonts" / "archivo-latin.woff2").read_bytes()).decode()
    for direction in TITLES:
        (HERE / f"{direction}.html").write_text(build(direction, mockup, font))
        print(f"{direction}.html")


if __name__ == "__main__":
    main()

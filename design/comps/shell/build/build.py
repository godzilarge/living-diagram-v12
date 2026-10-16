"""Build shell/index.html and shell/home.html from the shared CSS, Lucide icons and demo-dc data.

Run from anywhere: python3 bac-a-sable/directions/shell/build/build.py
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHELL = HERE.parent
DIRECTIONS = SHELL.parent
ROOT = DIRECTIONS.parents[1]
LUCIDE = ROOT / "engine" / "node_modules" / "lucide-react" / "dist" / "esm" / "icons"
DATA = json.loads((DIRECTIONS / "data" / "demo-dc.json").read_text(encoding="utf-8"))

ICONS = [
    "search", "download", "pencil", "settings", "scan", "zoom-in", "zoom-out", "plus", "minus", "grid-3x3", "map", "x",
    "ellipsis", "chevron-down", "chevron-right", "crosshair", "history", "arrow-left-right", "route", "brick-wall",
    "git-compare", "layout-dashboard", "corner-down-left", "arrow-up", "arrow-down", "network", "maximize-2",
    "circle-alert", "clock", "list-filter", "chevrons-left-right", "maximize-2", "mouse-pointer-2", "cable", "spline",
    "sticky-note", "shapes", "table", "image", "square-code", "group", "palette", "pin", "align-horizontal-distribute-center",
    "chevrons-up-down", "columns-3", "lock", "eye-off", "focus", "align-start-vertical", "align-center-vertical",
    "align-end-vertical", "align-start-horizontal", "align-center-horizontal", "align-end-horizontal",
    "align-vertical-distribute-center", "layout-grid", "bold", "italic", "underline", "align-left", "baseline",
    "panel-top", "send-to-back", "bring-to-front", "copy", "trash-2",
]

esc = html.escape


def sprite() -> str:
    out = []
    for name in ICONS:
        src = (LUCIDE / f"{name}.mjs").read_text(encoding="utf-8")
        alias = re.search(r"export \{ default \} from '\./([\w-]+)\.mjs'", src)
        if alias:  # lucide keeps old names as re-exports
            src = (LUCIDE / f"{alias.group(1)}.mjs").read_text(encoding="utf-8")
        parts = []
        for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', src):
            kv = dict(re.findall(r'(\w+): "([^"]*)"', attrs))
            kv.pop("key", None)
            parts.append(f"<{tag} " + " ".join(f'{k}="{v}"' for k, v in kv.items()) + "/>")
        out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{"".join(parts)}</symbol>')
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + "".join(out) + "</svg>"


def ic(name: str, cls: str = "ico") -> str:
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-{name}"/></svg>'


_tip_id = [0]


def tip(text: str, key: str | None = None, place: str = "") -> tuple[str, str]:
    _tip_id[0] += 1
    tid = f"tip{_tip_id[0]}"
    k = f'<span class="tk">{esc(key)}</span>' if key else ""
    return tid, f'<span class="tip {place}" role="tooltip" id="{tid}">{esc(text)}{k}</span>'


def ibtn(icon: str, label: str, key: str | None = None, place: str = "", cls: str = "", attrs: str = "") -> str:
    tid, t = tip(label, key, place)
    toggle = {"settings-toggle": "settings", "edit-toggle": "edit", "wide-toggle": "panel-wide", "focus-toggle": "panel-focus"}
    for k, v in toggle.items():
        if k in cls.split():
            attrs += f' data-toggle-state="{v}" aria-pressed="false"'
    return (f'<button class="btn icon has-tip {cls}" aria-label="{esc(label)}" aria-describedby="{tid}" {attrs}>'
            f"{ic(icon)}{t}</button>")


LOGO = (
    '<svg viewBox="0 0 24 24" aria-hidden="true">'
    '<rect class="mark-ink" x="2" y="2" width="9" height="9" rx="1.5"/>'
    '<path class="mark-wire" d="M11 6.5H17.5V13"/>'
    '<rect class="mark-acc" x="13" y="13" width="9" height="9" rx="1.5"/>'
    "</svg>"
)


def logo(href: str) -> str:
    tid, t = tip("Accueil", None, "start")
    return f'<a class="btn logo has-tip" href="{href}" aria-label="Living Diagram, accueil" aria-describedby="{tid}">{LOGO}{t}</a>'


def search_trigger() -> str:
    tid, t = tip("Rechercher partout", "Ctrl K", "")
    return (f'<button class="btn search-trigger has-tip" data-open-search aria-label="Rechercher" aria-describedby="{tid}">'
            f'{ic("search")}<span class="kbd">Ctrl K</span>{t}</button>')


def user_btn() -> str:
    tid, t = tip("orhan, compte et langue", None, "end")
    return f'<button class="btn user has-tip" aria-label="orhan" aria-describedby="{tid}"><span class="avatar">O</span>{t}</button>'


# ---------------------------------------------------------------- palette (shared)

def pal_row(icon: str, text: str, meta: str, on: bool = False) -> str:
    cls = "pal-row on" if on else "pal-row"
    enter = f'<span class="kbd enter">{ic("corner-down-left")}</span>'
    return f'<div class="{cls}" role="option" aria-selected="{str(on).lower()}">{ic(icon)}<span class="t">{text}</span><span class="m">{esc(meta)}</span>{enter}</div>'


def hl(s: str, q: str = "core") -> str:
    return esc(s).replace(q, f"<b>{q}</b>")


def palette() -> str:
    scopes = [("Tout", 12, True), ("Équipements", 4, False), ("Ports", 3, False), ("Groupes", 2, False),
              ("Infrastructures", 1, False), ("Actions", 2, False)]
    scope_html = "".join(
        f'<button class="btn rail" role="tab" aria-selected="{str(on).lower()}">{esc(n)} <span class="n">{c}</span></button>'
        for n, c, on in scopes)
    groups = [
        ("Équipements", [("arrow-left-right", hl("dc01-core-01"), "Commutateur, dc01", True),
                         ("arrow-left-right", hl("dc01-core-02"), "Commutateur, dc01", False),
                         ("arrow-left-right", hl("dc02-core-01"), "Commutateur, dc02", False),
                         ("arrow-left-right", hl("dc02-core-02"), "Commutateur, dc02", False)]),
        ("Ports", [("network", "Ethernet1/54 de " + hl("dc01-core-01"), "vers dc02-core-01", False),
                   ("network", "Ethernet1/53 de " + hl("dc02-core-01"), "vers dc01-core-01", False),
                   ("network", "Ethernet1/49 de " + hl("dc01-core-01"), "lien de pair", False)]),
        ("Groupes", [("layout-dashboard", "Paire MLAG " + hl("dc01-core-01") + " et " + hl("dc01-core-02"), "2 équipements", False),
                     ("layout-dashboard", "Paire MLAG " + hl("dc02-core-01") + " et " + hl("dc02-core-02"), "2 équipements", False)]),
        ("Infrastructures", [("route", hl("wan-core"), "14 équipements", False)]),
        ("Actions", [("crosshair", "Centrer la vue sur " + hl("dc01-core-01"), "", False),
                     ("git-compare", "Comparer " + hl("dc01-core-01") + " avec le 12 janv.", "", False)]),
    ]
    body = []
    for name, rows in groups:
        body.append(f'<div class="pal-group" role="presentation"><span>{esc(name)}</span><span>{len(rows)}</span></div>')
        body.extend(pal_row(*r) for r in rows)
    preview = f"""
      <div style="display:flex;gap:12px;align-items:center">
        <div class="tile">{ic("arrow-left-right")}</div>
        <div><div style="font-size:var(--t-l);font-weight:650;line-height:22px">dc01-core-01</div>
        <div class="muted" style="font-size:var(--t-xs)">Commutateur Cisco, site dc01</div></div>
      </div>
      <dl class="facts" style="grid-template-columns:88px 1fr;font-size:var(--t-xs)">
        <dt>Modèle</dt><dd>N9K-C93180YC-FX</dd><dt>Système</dt><dd>NX-OS 10.4.2</dd>
        <dt>Câbles</dt><dd>16</dd><dt>Paire MLAG</dt><dd>dc01-core-02</dd>
      </dl>
      <div class="st" style="font-size:var(--t-xs)"><span class="mark err"></span><span>2 agrégats hors service vers les pare-feu</span></div>
      <div class="pal-sub">Où mènent ses 16 câbles</div>
      <dl class="facts" style="grid-template-columns:88px 1fr;font-size:var(--t-xs);margin-top:-4px">
        <dt>Eth1/49, 1/50</dt><dd>dc01-core-02, lien de pair</dd><dt>Eth1/54</dt><dd>dc02-core-01</dd>
        <dt>Eth1/41, 1/42</dt><dd class="t-err">dc01-fw-01 et fw-02</dd><dt>Eth1/1 à 1/10</dt><dd>dc01-acc-01 à 10</dd>
      </dl>
      <div class="bar" data-bar="apercu" style="height:auto;padding:0;margin-top:auto">
        <button class="btn primary">Ouvrir la fiche</button>
        {ibtn("crosshair", "Centrer la vue", None, "up", "line")}
      </div>"""
    return f"""
<div class="scrim" aria-hidden="true"></div>
<div class="palette" role="dialog" aria-modal="true" aria-label="Recherche" data-modal="palette">
  <div class="pal-input" data-bar="palette-saisie">{ic("search")}<input value="core" aria-label="Rechercher" spellcheck="false"><span class="kbd">Échap</span></div>
  <div class="pal-scope" role="tablist" data-bar="palette-portee">{scope_html}</div>
  <div class="pal-body"><div class="pal-list" role="listbox">{"".join(body)}</div><div class="pal-preview">{preview}</div></div>
  <div class="pal-foot">
    <span><span class="kbd">{ic("arrow-up")}</span><span class="kbd">{ic("arrow-down")}</span>parcourir</span>
    <span><span class="kbd">{ic("corner-down-left")}</span>ouvrir</span>
    <span><span class="kbd">Tab</span>changer de type</span>
    <span style="margin-left:auto">12 résultats dans 3 infrastructures</span>
  </div>
</div>"""


BENCH_JS = """
<script>
(() => {
  const root = document.documentElement;
  const defaults = { theme: 'light', accent: 'a', state: 'none' };
  const get = k => root.getAttribute('data-' + k) || defaults[k];
  const set = (k, v) => { if (v === defaults[k]) root.removeAttribute('data-' + k); else root.setAttribute('data-' + k, v); };
  const sync = () => {
    document.querySelectorAll('[data-bench]').forEach(b => {
      const [k, v] = b.dataset.bench.split(':');
      b.setAttribute('aria-pressed', String(get(k) === v));
    });
    document.querySelectorAll('[data-toggle-state]').forEach(b => { const s = get('state'), v = b.dataset.toggleState; b.setAttribute('aria-pressed', String(s === v || s.startsWith(v + '-'))); });
    const sel = document.querySelector('[data-bench-state]');
    if (sel) sel.value = get('state');
  };
  document.querySelectorAll('[data-bench]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.bench.split(':'); set(k, v); }));
  document.querySelectorAll('[data-toggle-state]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.toggleState; set('state', get('state') === v ? 'none' : v);
  }));
  const sel = document.querySelector('[data-bench-state]');
  if (sel) sel.addEventListener('change', () => set('state', sel.value));
  document.querySelectorAll('[data-open-search]').forEach(b => b.addEventListener('click', () => set('state', 'search')));
  document.querySelector('.scrim').addEventListener('click', () => set('state', 'none'));
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set('state', 'search'); }
    if (e.key === 'Escape') set('state', 'none');
  });
  new MutationObserver(sync).observe(root, { attributes: true });
  sync();
})();
</script>"""


def bench(cls: str, states: list[tuple[str, str]]) -> str:
    opts = "".join(f'<option value="{v}">{esc(t)}</option>' for v, t in states)
    return f"""<div class="surf bench {cls}" data-float="banc" aria-label="Banc d'essai, hors produit">
  <b>Banc</b><button data-bench="theme:light">Clair</button><button data-bench="theme:dark">Sombre</button><i></i>
  <button data-bench="accent:a">Cobalt</button><button data-bench="accent:c">Encre</button><i></i>
  <select data-bench-state aria-label="État">{opts}</select>
</div>"""


def settings() -> str:
    def seg(k: str, items: list[tuple[str, str, str]]) -> str:
        return "".join(f'<button class="btn rail" data-bench="{k}:{v}">{sw}{esc(t)}</button>' for v, t, sw in items)
    sw = lambda c: f'<span class="sw sw-{c}"></span>'  # noqa: E731
    return f"""<div class="popover settings" data-popover="reglages" role="dialog" aria-label="Réglages">
  <div class="pop-row" data-bar="reglage-theme"><span class="pop-l">Thème</span>{seg("theme", [("light", "Clair", ""), ("dark", "Sombre", "")])}</div>
  <div class="pop-row" data-bar="reglage-accent"><span class="pop-l">Accent</span>{seg("accent", [("a", "cobalt", sw("a")), ("c", "encre", sw("c"))])}</div>
  <div class="pop-row" data-bar="reglage-langue"><span class="pop-l">Langue</span><button class="btn rail" aria-pressed="true">Français</button><button class="btn rail" aria-pressed="false">English</button></div>
</div>"""


def page(title: str, css: str, body_cls: str, body: str) -> str:
    shared = (HERE / "shell.css").read_text(encoding="utf-8")
    return f"""<!doctype html>
<html lang="fr" data-theme="light" data-accent="a">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1440">
<title>{esc(title)}</title>
<style>
{shared}
{css}
</style>
</head>
<body class="{body_cls}">
{sprite()}
{body}
{palette()}
{BENCH_JS}
</body>
</html>
"""


if __name__ == "__main__":
    import diagram
    import home

    (SHELL / "index.html").write_text(diagram.build(), encoding="utf-8")
    (SHELL / "home.html").write_text(home.build(), encoding="utf-8")
    print("written", SHELL / "index.html", SHELL / "home.html")

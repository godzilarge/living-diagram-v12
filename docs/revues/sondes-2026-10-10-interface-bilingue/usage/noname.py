"""Sans nom : glisser un équipement, lire la ligne d'état ; fiche en lecture seule."""
from __future__ import annotations

import sys

from lib import BASE, center, chrome, open_app, prefs, select, settle, shot

LANG = sys.argv[1]
with chrome(1440, 900, "en-US") as c:
    tab = c.open(f"{BASE}/")
    prefs(tab, LANG, "dark", author=None)
    open_app(tab)
    p = center(tab, '.react-flow__node[data-id="dc02-core-01"] .node')
    tab.drag((p[0], p[1]), (p[0] + 60, p[1] + 40), steps=8)
    settle(0.6)
    print("status:", tab.js("[...document.querySelectorAll('.toast, .status-line, [role=status]')].map((e) => e.textContent.trim()).filter(Boolean).join(' || ')"))
    shot(tab, f"{LANG}-dark-1440-noname-drag")
    select(tab, "node", "dc02-core-01")
    shot(tab, f"{LANG}-dark-1440-noname-card")
    print("panel:", tab.js("document.querySelector('.panel').innerText.slice(0, 400)"))

"""Un clic droit sans mouvement sur un connecteur le modifie-t-il ?"""
from __future__ import annotations

import json

import httpx

from lib import BASE, TOKEN, chrome, key, open_app, prefs, right_click, settle, shot, wait

AUTH = {"Authorization": f"Bearer {TOKEN}"}


def conn():
    c = httpx.get(f"{BASE}/api/intent?infrastructure=demo-dc", headers=AUTH).json()
    return c["revision"], [(x["id"], x.get("route"), x.get("bend")) for x in c["connectors"]]


with chrome(1440, 900) as c:
    tab = c.open(f"{BASE}/")
    prefs(tab, "en", "dark")
    open_app(tab)
    print("before", conn())
    cid = conn()[1][0][0]
    tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'connector', id:{json.dumps(cid)}}})")
    settle(1.0)
    tab.js("LDApp.debug.handle().toile.select(null)")
    settle(0.5)
    p = json.loads(tab.js(f"""(() => {{ const p = document.querySelector('.react-flow__node[data-id="connector:{cid}"] .connector-line');
      const m = p.getPointAtLength(p.getTotalLength() / 2); const q = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM()); return JSON.stringify([q.x, q.y]); }})()"""))
    tab.mouse_move(*p)
    settle(0.4)
    right_click(tab, *p)
    wait(tab, "!!document.querySelector('.context-menu')", 40)
    settle(1.5)
    print("after right-click", conn())
    shot(tab, "rclick-connector")
    key(tab, "Escape")
    settle(1.0)
    print("after escape", conn())
    # un clic gauche simple au milieu, sans mouvement
    tab.mouse_press(*p)
    tab.mouse_release(*p)
    settle(1.5)
    print("after left click", conn())

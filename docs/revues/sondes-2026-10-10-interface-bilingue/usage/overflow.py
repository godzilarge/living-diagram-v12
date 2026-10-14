"""Textes coupés : éléments dont le contenu dépasse la boîte, par langue et largeur."""
from __future__ import annotations

import json

from lib import BASE, chrome, open_app, prefs, select, settle, wait

PROBE = r"""(() => {
  const out = [];
  for (const el of document.querySelectorAll('.bar *, .toolbar *, .panel *, .band *, .walk *, .display *, .menu *, .journal *, .search *, .controls *, .sheet *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.right < 0 || r.left > innerWidth) continue;
    const text = (el.innerText || '').trim(); if (!text || el.children.length > 3) continue;
    if (el.scrollWidth > el.clientWidth + 1 && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis')) out.push('clip ' + el.className + ' :: ' + text.slice(0, 60) + ' (' + el.scrollWidth + '>' + el.clientWidth + ')');
  }
  // la barre : ce qui sort de son groupe ou passe sous le groupe de droite
  const c = document.querySelector('.bar-center'), right = document.querySelector('.bar-right');
  if (c && right) { const a = c.getBoundingClientRect(), b = right.getBoundingClientRect(); const counts = document.querySelector('.counts');
    const k = counts ? counts.getBoundingClientRect() : null;
    out.push('bar center ' + Math.round(a.left) + '-' + Math.round(a.right) + ' right ' + Math.round(b.left) + ' counts ' + (k ? Math.round(k.left) + '-' + Math.round(k.right) + ' scroll ' + counts.scrollWidth + '/' + counts.clientWidth : '-')); }
  return JSON.stringify(out);
})()"""


def probe(tab, label):
    res = json.loads(tab.js(PROBE))
    for r in res:
        print(label, r, flush=True)


with chrome(1440, 900) as c:
    tab = c.open(f"{BASE}/")
    for w, h in ((1440, 900), (1280, 800), (1024, 768)):
        tab.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
        for lang in ("en", "fr"):
            for mode in ("", "#mode=control"):
                prefs(tab, lang, "dark")
                open_app(tab, mode)
                probe(tab, f"{lang} {w} {mode or 'diagram'} bare")
                select(tab, "node", "dc01-fw-01")
                probe(tab, f"{lang} {w} {mode or 'diagram'} fw-card")
                tab.js("LDApp.debug.handle().toile.selectHosts(['dc01-acc-01','dc01-acc-02','dc01-acc-03'])")
                settle(0.7)
                probe(tab, f"{lang} {w} {mode or 'diagram'} multi")
            prefs(tab, lang, "dark")
            open_app(tab, "#mode=journal", ready=False)
            wait(tab, "!!document.querySelector('.j-row-head')")
            settle(1.0)
            probe(tab, f"{lang} {w} journal")

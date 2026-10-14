"""Menu, palette des types, bascule de langue à chaud. Usage : extras.py LANG THEME W H"""
from __future__ import annotations

import json
import sys
import traceback

from lib import BASE, chrome, click, key, open_app, prefs, select, settle, shot, wait

LANG, THEME, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
OTHER = "fr" if LANG == "en" else "en"
TAG = f"{LANG}-{THEME}-{W}"
OPEN_MENU = "(() => { const b = document.querySelector('.writer-name').closest('button'); b.click(); return true; })()"
LANG_BTN = "(() => {{ const b = [...document.querySelectorAll('.menu button, .sheet button')].find((b) => b.textContent.trim() === {0}); if (!b) return false; b.click(); return true; }})()"


def step(label, fn, tab):
    try:
        fn(tab)
        print("ok", label, flush=True)
    except Exception:
        print("FAIL", label, traceback.format_exc()[-500:], flush=True)


def menu(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    tab.js(OPEN_MENU)
    wait(tab, "!!document.querySelector('.menu')")
    settle(0.5)
    shot(tab, f"{TAG}-menu")
    ok = tab.js("(() => { const b = [...document.querySelectorAll('.menu button')].find((b) => b.querySelector('svg.lucide-palette')); if (!b) return false; b.click(); return true; })()")
    wait(tab, "!!document.querySelector('.palette-types')", 40)
    settle(0.5)
    shot(tab, f"{TAG}-palette")
    key(tab, "Escape")


def toolbar_titles(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    tab.js("LDApp.debug.handle().toile.selectHosts(['dc01-acc-01','dc01-acc-02','dc01-acc-03'])")
    settle(0.8)
    shot(tab, f"{TAG}-toolbar-multi")


def live_switch(tab):
    """Une fiche ouverte, la recherche ouverte : changer de langue par le menu, sans recharger."""
    for mode, sel in (("", ("node", "dc01-core-01")), ("#mode=control", ("node", "dc01-fw-01")), ("#mode=control", ("cluster", None))):
        prefs(tab, LANG, THEME)
        open_app(tab, mode)
        ident = sel[1] or tab.js("LDApp.debug.handle().toile.model.clusters[0].id")
        select(tab, sel[0], ident)
        tab.js(OPEN_MENU)
        wait(tab, "!!document.querySelector('.menu')")
        target = "Français" if OTHER == "fr" else "English"
        tab.js(LANG_BTN.format(json.dumps(target)))
        settle(0.8)
        key(tab, "Escape")
        settle(0.5)
        shot(tab, f"{TAG}-live-to-{OTHER}-{sel[0]}{'-ctl' if mode else ''}")
    # le Journal, sans recharger
    prefs(tab, LANG, THEME)
    open_app(tab, "#mode=journal", ready=False)
    wait(tab, "!!document.querySelector('.j-row-head')")
    settle(1.0)
    tab.js("document.querySelectorAll('.j-row-head')[0].click()")
    settle(0.5)
    tab.js(OPEN_MENU)
    wait(tab, "!!document.querySelector('.menu')")
    tab.js(LANG_BTN.format(json.dumps("Français" if OTHER == "fr" else "English")))
    settle(1.0)
    key(tab, "Escape")
    settle(0.5)
    shot(tab, f"{TAG}-live-to-{OTHER}-journal")


def main():
    with chrome(W, H, "en-US" if LANG == "en" else "fr-FR") as c:
        tab = c.open(f"{BASE}/")
        for label, fn in (("menu", menu), ("toolbar", toolbar_titles), ("live", live_switch)):
            step(label, fn, tab)


main()

"""Journal (aide, plage, export, historique, lien) et cas d'erreur, dans une langue. Usage : journal_err.py LANG"""
from __future__ import annotations

import json
import sys

import httpx

from lib import BASE, TOKEN, chrome, click, key, open_app, prefs, select, settle, shot, type_text, wait

LANG = sys.argv[1]
TAG = f"{LANG}-dark-1440"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def journal(tab):
    prefs(tab, LANG, "dark")
    open_app(tab, "#mode=journal", ready=False)
    wait(tab, "!!document.querySelector('.j-row-head')")
    settle(1.0)
    click(tab, ".j-help-open"); settle(0.6)
    shot(tab, f"{TAG}-j-help")
    click(tab, ".j-help-close"); settle(0.3)
    click(tab, ".j-range-open"); settle(0.6)
    shot(tab, f"{TAG}-j-range")
    key(tab, "Escape"); settle(0.3)
    # export CSV : le contenu produit
    csv = tab.js("(async () => { const m = LDApp.journalCsv; return Object.keys(m).join(','); })()")
    print("csv helpers", csv)
    click(tab, ".j-export"); settle(1.5)
    shot(tab, f"{TAG}-j-export")
    print("said", tab.js("(document.querySelector('.j-said') || {}).textContent"))
    # facette Supprimé / Deleted
    tab.js("(() => { const b = [...document.querySelectorAll('.j-facet')].find((b) => /Deleted|Supprimé/.test(b.textContent)); if (b) b.click(); })()")
    settle(1.2)
    shot(tab, f"{TAG}-j-facet-deleted")
    tab.js("(() => { const b = [...document.querySelectorAll('.j-facet')].find((b) => /Deleted|Supprimé/.test(b.textContent)); if (b) b.click(); })()")
    settle(1.0)
    # le détail d'une entrée « groupe », historique de l'objet, lien copié
    tab.js("(() => { const r = [...document.querySelectorAll('.j-row-head')].find((r) => /Accès DC02/.test(r.textContent)); r.click(); })()")
    settle(0.6)
    shot(tab, f"{TAG}-j-detail-group")
    tab.js("(() => { const b = [...document.querySelectorAll('.j-row.open button')].find((b) => /History|Historique/.test(b.textContent)); if (b) b.click(); })()")
    settle(1.2)
    shot(tab, f"{TAG}-j-history")
    tab.js("(() => { const r = document.querySelector('.j-row-head'); r.click(); })()")
    settle(0.5)
    tab.js("(() => { const b = [...document.querySelectorAll('.j-row.open button')].find((b) => /Copy link|Copier le lien/.test(b.textContent)); if (b) b.click(); })()")
    settle(0.6)
    shot(tab, f"{TAG}-j-copied")
    # recherche sans résultat
    tab.js("(() => { const i = document.querySelector('.j-search input'); i.focus(); })()")
    type_text(tab, "zzzzqq")
    settle(1.2)
    shot(tab, f"{TAG}-j-empty")


def stale(tab):
    """Une fiche de groupe ouverte ; le groupe est supprimé ailleurs ; on le renomme depuis la page."""
    prefs(tab, LANG, "dark")
    r = httpx.post(f"{BASE}/api/intent/patches?infrastructure=demo-dc", headers=AUTH,
                   json={"author": "bob", "ops": [{"op": "group_create", "label": "Stale", "members": ["dc02-rt-01"]}]})
    gid = [g for g in httpx.get(f"{BASE}/api/intent?infrastructure=demo-dc", headers=AUTH).json()["groups"] if g["label"] == "Stale"][-1]["id"]
    open_app(tab)
    select(tab, "group", gid)
    httpx.post(f"{BASE}/api/intent/patches?infrastructure=demo-dc", headers=AUTH, json={"author": "bob", "ops": [{"op": "group_delete", "id": gid}]})
    tab.js("(() => { const i = document.querySelector('.panel .insp-title-input'); i.focus(); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'Renamed'); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); })()")
    settle(0.3)
    key(tab, "Enter")
    settle(1.5)
    shot(tab, f"{TAG}-err-stale")
    print("status", tab.js("[...document.querySelectorAll('.toast, [role=status], [role=alert]')].map((e) => e.textContent).join(' || ')"))
    # infrastructure inconnue
    open_app(tab, query="?infrastructure=nope", ready=False)
    settle(2.5)
    shot(tab, f"{TAG}-err-noinfra")
    print("noinfra", tab.js("document.body.innerText.slice(0, 600)"))


with chrome(1440, 900, "en-US" if LANG == "en" else "fr-FR") as c:
    tab = c.open(f"{BASE}/")
    for fn in (journal, stale):
        try:
            fn(tab)
            print("ok", fn.__name__)
        except Exception as e:  # noqa: BLE001
            import traceback
            print("FAIL", fn.__name__, traceback.format_exc()[-500:])

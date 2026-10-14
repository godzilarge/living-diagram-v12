import json, time
from tests.conftest import bundle_dict, settings  # noqa: F401
from tests.test_app import CHROMIUM, READY, PICK_LANGUAGE
from tests.test_view import _serve, _wait

def test_probe(settings, bundle_dict):
    import httpx
    from tests.browser import Chrome
    from tests.conftest import TOKEN
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM, lang="fr-FR") as chrome:
            tab = chrome.open(f"{base}/?infrastructure=infra-lab")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'sw-core-01' })")
            time.sleep(0.5)
            before = tab.js("document.getElementById('live').textContent")
            tab.js("document.querySelector('.writer-name').closest('button').click()")
            _wait(tab, "!!document.querySelector('.menu .language-switch')")
            tab.js(PICK_LANGUAGE.format(json.dumps(".menu"), "en"))
            time.sleep(1.0)
            after = tab.js("document.getElementById('live').textContent")
            mode = tab.js("document.querySelector('.mode-item .word').textContent")
            menu_open = tab.js("!!document.querySelector('.menu')")
            edges = tab.js("JSON.stringify(Array.from(document.querySelectorAll('.react-flow__edge')).slice(0,3).map(e=>[e.getAttribute('role'),e.getAttribute('aria-label'),e.getAttribute('aria-roledescription')]))")
            nedges = tab.js("document.querySelectorAll('.react-flow__edge[role=img]').length")
            noderd = tab.js("document.querySelector('.react-flow__node').getAttribute('aria-roledescription')")
            print("\nEDGES", edges, nedges, "NODE_RD", noderd)
            print("\nBEFORE", repr(before), "\nAFTER", repr(after), "\nMODE", mode, "MENU_OPEN", menu_open)
    finally:
        server.should_exit = True
        thread.join()

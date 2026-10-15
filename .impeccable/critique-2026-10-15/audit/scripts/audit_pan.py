"""Audit du 2026-10-15 : ce que coûte la barre contextuelle au panoramique, à la jauge (500 équipements). Une même
sélection (un équipement), la barre montrée puis masquée par sa préférence (Ctrl+.) ; trois passages chacun.
Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <bundle 500>"""
from __future__ import annotations

import json
import statistics
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import audit_perf as P  # noqa: E402
from scene import key, wait  # noqa: E402

H = P.H


def main() -> None:
    bundle = Path(sys.argv[1])
    settings = P.Settings(api_token=P.TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-audit-pan-")), max_bundle_bytes=30_000_000)
    server, thread, base = P._serve(settings)
    out: dict = {}
    try:
        infra = P.ingest(base, [bundle])
        with P.Chrome(P.CHROMIUM, window=(1440, 900)) as chrome:
            tab = chrome.open(f"{base}/")
            P._wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(P.TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure={infra}")
            P._wait(tab, P.READY)
            wait(3.0)
            host = tab.js(f"Array.from({H}.state.positions.keys()).filter((k) => /core-01$/.test(k)).sort()[0]")
            tab.js(f"(() => {{ const t = {H}, c = t.state.positions.get({json.dumps(host)}); t.restoreView({{ zoom: 1, x: 560 - c.x, y: 450 - c.y }}); }})()")
            wait(1.0)
            for label, select, bar in (("rien", False, True), ("équipement, barre montrée", True, True), ("équipement, barre masquée", True, False), ("équipement, barre montrée (bis)", True, True)):
                tab.js(f"{H}.select(null)")
                wait(0.5)
                showing = tab.js("LDApp.debug.state().prefs.fbar")
                if showing != bar:
                    key(tab, ".", "Period", 190, 2)
                    wait(0.5)
                if select:
                    tab.js(f"{H}.selectHosts([{json.dumps(host)}])")
                    wait(1.0)
                runs = [tab.js(P.PAN % H) for _ in range(3)]
                out[label] = {"barre dans le DOM": tab.js("!!document.querySelector('.fbar .fb')"), "p50": statistics.median(r["p50"] for r in runs), "p95": statistics.median(r["p95"] for r in runs), "max": max(r["max"] for r in runs)}
                print(label, out[label])
    finally:
        server.should_exit = True
        thread.join(timeout=5)
    (HERE.parent / "mesures-pan.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))


main()

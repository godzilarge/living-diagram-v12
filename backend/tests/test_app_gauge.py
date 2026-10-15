"""La toile de l'application à la jauge (lot 13 de docs/11) : 500 équipements du générateur, dans Chromium.

Bornes larges (la machine qui lance la suite n'est pas celle des mesures) : une sélection peinte en moins de 200 ms, un
glissé sans image de plus de 100 ms. Et ce que la performance a changé, vérifié : React Flow ne monte que ce qui se voit
(`onlyRenderVisibleElements`) sans rien perdre (un nœud arrive en vue, tout est là après « cadrer tout » et une bascule
de couche, un connecteur dont le coin est hors champ reste dessiné), un nœud remonté ne rejoue pas une demande
d'édition, un champ d'édition qui sort de la vue enregistre, Tab va à un élément hors champ, une pastille montée à sa
première apparition garde son fondu, et les pastilles replacées après un déplacement sont celles d'un calcul immédiat."""

from __future__ import annotations

import json
import threading

import pytest

from tests.test_app import READY, _click, _press
from tests.test_render import CHROMIUM

wait = threading.Event().wait
TOILE = "LDApp.debug.handle().toile"
TWO_FRAMES = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
# De l'appui (pointerdown, à la capture) à la fiche ouverte et à la carte sélectionnée, peintes (deux images).
ARM = (
    "window.__t0 = 0; window.addEventListener('pointerdown',"
    " () => { window.__t0 = performance.now(); }, { capture: true, once: true })"
)
SELECTED = (
    """(async (id) => {
  for (let i = 0; i < 4000; i++) {
    const node = document.querySelector('.react-flow__node[data-id="' + id + '"]');
    if (document.querySelector('.panel .panel-scroll') && node && node.classList.contains('selected')) break;
    await new Promise((r) => setTimeout(r, 1));
  }
  await """
    + TWO_FRAMES
    + """;
  return performance.now() - window.__t0;
})({0})"""
)
FRAMES = """window.__frames = (async () => {
  const t = []; let go = true; window.__stopFrames = () => { go = false; };
  await new Promise((done) => {
    const step = (now) => { t.push(now); if (go) requestAnimationFrame(step); else done(); };
    requestAnimationFrame(step);
  });
  return t.slice(1).map((x, i) => x - t[i]);
})(); 0"""
# Le premier état peint d'une pastille de vitesse qui arrive : son opacité dans la première image où elle existe.
FADE = """window.__fade = (async () => {
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const pill = document.querySelector('.speed-pill.on.selected');
    if (pill) return parseFloat(getComputedStyle(pill).opacity);
  }
  return null;
})(); 0"""
PILLS = (
    "JSON.stringify(Array.from(document.querySelectorAll('.react-flow__edge-speed, .react-flow__edge-beamLabel'))"
    ".map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.id, Math.round(r.x), Math.round(r.y)]; })"
    ".sort((a, b) => (a[0] < b[0] ? -1 : 1)))"
)


def _mouse(tab, kind: str, x: float, y: float, buttons: int) -> None:
    event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1}
    tab.call("Input.dispatchMouseEvent", event)


def _center_on(tab, kind: str, ident: str) -> None:
    """L'élément au milieu de la vue (zoom de lecture au moins), puis plus rien de sélectionné."""
    tab.js(f"{TOILE}.reveal({{ kind: {json.dumps(kind)}, id: {json.dumps(ident)} }})")
    wait(0.8)
    tab.js(f"{TOILE}.select(null)")
    wait(0.5)
    tab.mouse_move(5, 450)


def _node(ident: str) -> str:
    return f"document.querySelector('.react-flow__node[data-id={json.dumps(ident)}]')"


def _center(tab, ident: str) -> tuple[float, float]:
    r = tab.js(f"JSON.parse(JSON.stringify({_node(ident)}.getBoundingClientRect()))")
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2


def _away(tab) -> None:
    """La vue loin de tout (la toile ne monte plus rien) : un équipement, une note y sont démontés."""
    tab.js(f"{TOILE}.restoreView({{ x: 900000, y: 900000, zoom: 1 }})")
    wait(0.6)


def _drawn_everything(tab) -> dict:
    """Après « cadrer tout » : chaque équipement de la scène monté, aucun caché faute de mesure."""
    return tab.js(
        f"(() => {{ const ids = {TOILE}.scene().nodes.map((n) => n.hostname);"
        " const dom = new Map(Array.from(document.querySelectorAll('.react-flow__node'))"
        ".map((e) => [e.dataset.id, e]));"
        " return { scene: ids.length, missing: ids.filter((i) => !dom.has(i)).length,"
        " hidden: ids.filter((i) => dom.has(i) && dom.get(i).style.visibility === 'hidden').length }; })()"
    )


@pytest.mark.slow
@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_at_the_gauge(settings):
    from dataclasses import replace
    from datetime import UTC, datetime

    import httpx
    from ld_contracts.synth import GenerationSpec, generate_series

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    series = generate_series(GenerationSpec(seed="lot13", devices=500, start=datetime(2026, 1, 5, 2, tzinfo=UTC)))
    infrastructure = series.bundles[0]["infrastructure"]
    server, thread, base = _serve(replace(settings, max_bundle_bytes=40_000_000))
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        posted = httpx.post(f"{base}/api/ingest/bundles", json=series.bundles[0], headers=auth, timeout=180)
        assert posted.status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            url = f"{base}/?infrastructure={infrastructure}"
            tab.navigate(url)
            _wait(tab, READY)
            wait(2.0)  # la première ouverture mémorise le placement
            core = tab.js(f"Array.from({TOILE}.state.positions.keys()).filter((h) => /core-01$/.test(h)).sort()[0]")
            near = tab.js(
                f"(() => {{ const t = {TOILE}, c = t.state.positions.get({json.dumps(core)});"
                " const far = (p) => Math.hypot(p[1].x - c.x, p[1].y - c.y);"
                " return Array.from(t.state.positions.entries())"
                " .filter(([h]) => t.model.nodeByHost.get(h).kind !== 'stub')"
                " .sort((a, b) => far(a) - far(b) || (a[0] < b[0] ? -1 : 1))"
                " .slice(0, 6).map(([h]) => h); })()"
            )
            # React Flow ne monte que ce qui se voit : au zoom de lecture, une partie des 500 cartes
            mounted, cards = tab.js(
                "[document.querySelectorAll('.react-flow__node-card').length,"
                f" {TOILE}.scene().nodes.filter((n) => n.kind !== 'stub').length]"
            )
            assert cards >= 500 and 0 < mounted < cards, (mounted, cards)

            # la sélection : du clic à la fiche et à la carte sélectionnée peintes, sous 200 ms (médiane de trois)
            times = []
            for host in near[1:4]:
                _center_on(tab, "node", host)
                x, y = _center(tab, host)
                tab.js(ARM)
                _click(tab, x, y)
                times.append(tab.js(SELECTED.replace("{0}", json.dumps(host))))
            times.sort()
            assert times[1] < 200, f"sélection : {times} ms"

            # le glissé d'une carte : aucune image de plus de 100 ms pendant le geste
            _center_on(tab, "node", near[4])
            x, y = _center(tab, near[4])
            tab.mouse_move(x, y)
            _mouse(tab, "mousePressed", x, y, 1)
            tab.js(FRAMES)
            for i in range(1, 41):
                _mouse(tab, "mouseMoved", x + 3 * i, y + 1.5 * i, 1)
                wait(0.016)
            tab.js("window.__stopFrames()")
            gaps = tab.js("window.__frames")
            _mouse(tab, "mouseReleased", x + 120, y + 60, 0)
            assert len(gaps) > 20 and max(gaps) <= 100, f"glissé : {max(gaps):.0f} ms au plus, {len(gaps)} images"
            wait(1.0)

            # un nœud arrive en vue : monté à son arrivée, mesuré (jamais caché faute de mesure)
            _away(tab)
            assert tab.js("document.querySelectorAll('.react-flow__node-card').length") == 0
            _center_on(tab, "node", core)
            _wait(tab, f"!!{_node(core)} && {_node(core)}.style.visibility !== 'hidden'")
            # « cadrer tout » et une bascule de couche : tout est là, rien de caché (le défaut `measured` du 2026-10-07)
            tab.js(f"{TOILE}.fit()")
            _wait(tab, f"document.querySelectorAll('.react-flow__node-card').length >= {cards}")
            for stubs in ("1", "0"):
                tab.js(f"location.hash = 'stubs={stubs}'")
                wait(1.0)
            tab.js(f"{TOILE}.fit()")
            wait(1.2)
            everything = _drawn_everything(tab)
            assert everything["missing"] == 0 and everything["hidden"] == 0, everything

            # un connecteur dont le coin de la boîte est hors champ : il se dessine dès que son tracé est en vue ; une
            # note attachée à côté du cœur pour l'édition en place
            c = tab.js(f"{TOILE}.state.positions.get({json.dumps(core)})")
            cx, cy = round(c["x"]), round(c["y"])
            note_op = {"op": "annotation_create", "content": {"kind": "note", "text": "avant"}}
            far_end = {"kind": "free", "x": cx - 6000, "y": cy - 4000}
            ops = [
                {**note_op, "x": cx - 80, "y": cy - 200, "w": 160, "h": 60},
                {"op": "connector_create", "start": far_end, "end": {"kind": "device", "ref": core, "side": "auto"}},
            ]
            params = {"infrastructure": infrastructure}
            body = {"author": "orhan", "ops": ops}
            doc = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json=body, timeout=30).json()
            note, line = doc["annotations"][-1]["id"], doc["connectors"][-1]["id"]
            tab.navigate(url)
            _wait(tab, f"{READY} && {TOILE}.frames.has({json.dumps(note)})")
            _center_on(tab, "node", core)
            _wait(tab, f"!!{_node('connector:' + line)}")

            # l'édition en place d'une note, puis la note sort de la vue : le champ enregistre (comme quitté)
            tab.js(f"{TOILE}.select({{ kind: 'annotation', id: {json.dumps(note)} }})")
            wait(0.4)
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "F2", 113)
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('note-editor')")
            tab.call("Input.insertText", {"text": " puis après"})
            _away(tab)
            _wait(tab, f"!{_node('annotation:' + note)}")

            def text_of() -> str:
                got = httpx.get(f"{base}/api/intent", params=params, headers=auth, timeout=30).json()
                return next(a for a in got["annotations"] if a["id"] == note)["content"]["text"]

            for _ in range(100):
                if text_of() != "avant":
                    break
                wait(0.05)
            assert text_of() == "avant puis après", "le champ sorti de la vue a enregistré son texte"
            # remontée, la note ne rejoue pas la demande d'édition déjà prise
            _center_on(tab, "annotation", note)
            _wait(tab, f"!!{_node('annotation:' + note)}")
            wait(0.4)
            assert not tab.js("!!document.querySelector('.note-editor')"), "une demande d'édition ne se rejoue pas"

            # Tab vers un élément hors champ : la vue va à lui, le focus le suit
            _center_on(tab, "node", core)
            tab.js(f"{TOILE}.restoreView({{ zoom: 5, x: 720 - {cx} * 5, y: 450 - {cy} * 5 }})")  # le cœur, de très près
            wait(0.5)
            tab.js(f"{TOILE}.select({{ kind: 'node', id: {json.dumps(core)} }})")
            wait(0.3)
            tab.js(f"{_node(core)}.focus()")
            before = tab.js(f"JSON.stringify({TOILE}.viewport())")
            _press(tab, "Tab", 9)
            _wait(tab, f"JSON.stringify({TOILE}.viewport()) !== {json.dumps(before)}")
            _wait(
                tab,
                "document.activeElement && document.activeElement.classList.contains('react-flow__node')"
                f" && document.activeElement.dataset.id !== {json.dumps(core)}",
            )

            # une pastille de vitesse montée à sa première apparition : son fondu part de l'état caché (un équipement
            # loin du cœur, dont aucun câble n'a encore été éclairé : sa pastille n'est pas encore dans le dessin)
            far = tab.js(
                f"(() => {{ const t = {TOILE}, c = t.state.positions.get({json.dumps(core)});"
                " return t.scene().links.map((l) => [l, t.state.positions.get(l.a.hostname)])"
                " .filter(([l, p]) => p && t.model.nodeByHost.get(l.b.hostname).kind !== 'stub')"
                " .sort((x, y) => Math.hypot(y[1].x - c.x, y[1].y - c.y) - Math.hypot(x[1].x - c.x, x[1].y - c.y))"
                "[0][0].id; })()"
            )
            link = far
            mid = tab.js(
                f"(() => {{ const t = {TOILE}, l = t.scene().links.find((x) => x.id === {json.dumps(link)});"
                " const a = t.state.positions.get(l.a.hostname), b = t.state.positions.get(l.b.hostname);"
                " return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })()"
            )
            tab.js(f"{TOILE}.select(null)")
            tab.js(f"{TOILE}.restoreView({{ zoom: 0.8, x: 720 - {mid['x']} * 0.8, y: 450 - {mid['y']} * 0.8 }})")
            wait(0.8)
            assert not tab.js("!!document.querySelector('.speed-pill.on')"), "aucune vitesse montrée avant la sélection"
            tab.js(FADE)
            tab.js(f"{TOILE}.select({{ kind: 'link', id: {json.dumps(link)} }})")
            first = tab.js("window.__fade")
            assert first is not None and first < 0.9, f"la pastille arrive en fondu (première image : {first})"
            _wait(tab, "parseFloat(getComputedStyle(document.querySelector('.speed-pill.on.selected')).opacity) === 1")

            # un déplacement replace les pastilles une fois les positions calmes, comme un calcul immédiat
            tab.js("location.hash = 'speeds=1&beams=1'")
            _center_on(tab, "node", core)
            _wait(tab, "document.querySelectorAll('.speed-pill.on').length > 3")
            tab.js(f"{TOILE}.select({{ kind: 'node', id: {json.dumps(core)} }})")
            tab.js("document.querySelector('.app').focus()")
            for _ in range(5):
                _press(tab, "ArrowRight", 39, 8)  # Maj + → : cinq pas de 100
            wait(1.5)  # le calme (120 ms), l'écriture des épingles et sa réponse
            settled = tab.js(PILLS)
            tab.js(f"{TOILE}.render(true)")  # une scène neuve : la place des pastilles recalculée tout de suite
            wait(0.8)
            assert tab.js(PILLS) == settled, "les pastilles replacées après le geste sont celles d'un calcul immédiat"
        errors = [entry for entry in chrome.console if "exceptionDetails" in entry or entry.get("level") == "error"]
        assert not errors, errors[:2]
    finally:
        server.should_exit = True
        thread.join(timeout=10)

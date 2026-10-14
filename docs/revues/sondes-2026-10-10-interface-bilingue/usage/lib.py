"""Aides d'audit : ouvrir l'application dans une langue, un thème, une taille ; capturer ; vider le texte visible."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from tests.browser import Chrome
from tests.test_render import CHROMIUM

S = Path("/tmp/claude-1000/-home-otosun-development-applications-demo-living-diagram-v12-biturbo/b83f1eef-1619-448a-b662-7c62ccd93626/scratchpad/audit-usage")
SHOTS = S / "shots"
DUMPS = S / "dumps"
TOKEN = "tok-audit"
import os
BASE = (S / os.environ.get("LD_BASE_FILE", "base.txt")).read_text().strip()
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"

TEXT = r"""(() => {
  const out = { text: document.body.innerText, attrs: [], svg: [] };
  for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt],[aria-description],[aria-roledescription]')) {
    for (const a of ['aria-label','title','placeholder','alt','aria-description','aria-roledescription']) {
      const v = el.getAttribute(a); if (v) out.attrs.push(a + '=' + v);
    }
  }
  for (const t of document.querySelectorAll('svg text, svg title')) { const v = t.textContent.trim(); if (v) out.svg.push(v); }
  for (const t of document.querySelectorAll('[role=status],[aria-live]')) { const v = t.textContent.trim(); if (v) out.attrs.push('live=' + v); }
  out.panel = (document.querySelector('.panel') || {}).innerText || ''; out.menu = (document.querySelector('.context-menu, .menu, .display, .search-results, .walk, .tip') || {}).innerText || ''; out.ctx = [...document.querySelectorAll('.context-menu')].map((e) => e.innerText).join(' || '); out.tip = [...document.querySelectorAll('.tip text')].map((e) => e.textContent).join(' | '); out.walk = (document.querySelector('.walk') || {}).innerText || ''; out.journal = (document.querySelector('.journal') || {}).innerText || ''; out.lang = document.documentElement.lang; out.title = document.title;
  return JSON.stringify(out);
})()"""


def settle(s: float = 0.6) -> None:
    threading.Event().wait(s)


def wait(tab, expression: str, tries: int = 200) -> bool:
    for _ in range(tries):
        try:
            if tab.js(expression):
                return True
        except RuntimeError:
            pass
        threading.Event().wait(0.05)
    print("TIMEOUT", expression[:120], flush=True)
    return False


def chrome(w: int, h: int, lang: str = "en-US") -> Chrome:
    return Chrome(CHROMIUM, window=(w, h), lang=lang)


def prefs(tab, language: str | None, theme: str = "dark", token: bool = True, author: str | None = "orhan") -> None:
    p = {"theme": theme}
    if language:
        p["language"] = language
    tab.js(f"localStorage.setItem('ld-prefs', {json.dumps(json.dumps(p))})")
    if token:
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
    else:
        tab.js("sessionStorage.removeItem('ld-api-token')")
    if author:
        tab.js(f"localStorage.setItem('ld-author', {json.dumps(author)})")
    else:
        tab.js("localStorage.removeItem('ld-author')")


def open_app(tab, fragment: str = "", query: str = "?infrastructure=demo-dc", ready: bool = True) -> None:
    tab.navigate("about:blank")
    tab.navigate(f"{BASE}/{query}{fragment}")
    if ready:
        wait(tab, READY)
        settle(1.2)


def shot(tab, name: str) -> str:
    path = SHOTS / f"{name}.png"
    tab.screenshot(path)
    (DUMPS / f"{name}.json").write_text(tab.js(TEXT))
    return str(path)


def select(tab, kind: str, ident: str) -> None:
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: {json.dumps(kind)}, id: {json.dumps(ident)} }})")
    wait(tab, "!!document.querySelector('.panel')")
    settle(0.7)


def click(tab, selector: str) -> bool:
    return bool(tab.js(f"(() => {{ const e = document.querySelector({json.dumps(selector)}); if (!e) return false; e.click(); return true; }})()"))


def center(tab, selector: str):
    v = tab.js(f"(() => {{ const e = document.querySelector({json.dumps(selector)}); if (!e) return null;"
               " const r = e.getBoundingClientRect(); return JSON.stringify([r.x + r.width / 2, r.y + r.height / 2]); })()")
    return json.loads(v) if v else None


def right_click(tab, x: float, y: float) -> None:
    for kind in ("mousePressed", "mouseReleased"):
        tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "right", "buttons": 2, "clickCount": 1})


def key(tab, key: str, code: str = "", text: str = "", modifiers: int = 0) -> None:
    tab.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": key, "code": code or key, "text": text, "modifiers": modifiers,
                                        "windowsVirtualKeyCode": {"Escape": 27, "Enter": 13, "ArrowDown": 40, "ArrowUp": 38}.get(key, 0)})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code or key, "modifiers": modifiers})


def type_text(tab, text: str) -> None:
    tab.call("Input.insertText", {"text": text})

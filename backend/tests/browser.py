"""Un pilote minimal de Chromium headless par le protocole DevTools (`--remote-debugging-pipe`), sans dépendance.

Ce que le faux DOM de `tests/js/` ne peut pas rejouer : un survol réel (propagation, capture du pointeur), le focus
clavier, la CSP appliquée par le navigateur. Les messages voyagent sur les descripteurs 3 (entrée) et 4 (sortie),
en JSON terminé par un octet nul. Aide de test seulement : rien ici ne tourne en production.
"""

from __future__ import annotations

import contextlib
import json
import os
import select
import subprocess
from pathlib import Path
from typing import Any

READ_TIMEOUT = 20.0


class Chrome:
    """Un navigateur, ouvert à l'entrée du `with`, fermé à la sortie."""

    def __init__(self, binary: Path, *, window: tuple[int, int] = (1440, 900)) -> None:
        self.binary, self.window = binary, window
        self.console: list[dict[str, Any]] = []
        self._events: list[dict[str, Any]] = []
        self._buffer = b""
        self._next_id = 1

    def __enter__(self) -> Chrome:
        read_in, write_in = os.pipe()
        read_out, write_out = os.pipe()
        flags = ["--remote-debugging-pipe", "--no-sandbox", "--disable-gpu", "--hide-scrollbars"]
        flags += [f"--window-size={self.window[0]},{self.window[1]}", "--enable-logging=stderr", "--v=0"]
        self._process = subprocess.Popen(  # noqa: S603 - binaire local, arguments fixes
            [str(self.binary), *flags, "about:blank"],
            pass_fds=(3, 4),
            preexec_fn=lambda: (os.dup2(read_in, 3), os.dup2(write_out, 4)),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        os.close(read_in)
        os.close(write_out)
        self._write, self._read = write_in, read_out
        return self

    def __exit__(self, *_: object) -> None:
        with contextlib.suppress(RuntimeError, OSError, TimeoutError):
            self.call("Browser.close")
        self._process.wait(timeout=10)
        os.close(self._write)
        os.close(self._read)

    def _message(self) -> dict[str, Any]:
        while b"\0" not in self._buffer:
            ready, _, _ = select.select([self._read], [], [], READ_TIMEOUT)
            if not ready:
                raise TimeoutError("Chromium ne répond plus")
            chunk = os.read(self._read, 65536)
            if not chunk:
                raise RuntimeError("tube DevTools fermé")
            self._buffer += chunk
        raw, _, self._buffer = self._buffer.partition(b"\0")
        return json.loads(raw)

    def _note(self, got: dict[str, Any]) -> None:
        if got.get("method") in ("Runtime.consoleAPICalled", "Log.entryAdded", "Runtime.exceptionThrown"):
            self.console.append(got["params"])
        else:
            self._events.append(got)

    def call(self, method: str, params: dict[str, Any] | None = None, session: str | None = None) -> dict[str, Any]:
        message: dict[str, Any] = {"id": self._next_id, "method": method, "params": params or {}}
        if session:
            message["sessionId"] = session
        self._next_id += 1
        os.write(self._write, json.dumps(message).encode() + b"\0")
        while True:
            got = self._message()
            if got.get("id") == message["id"]:
                if "error" in got:
                    raise RuntimeError(f"{method}: {got['error']}")
                return got.get("result", {})
            self._note(got)

    def wait_event(self, name: str) -> dict[str, Any]:
        for event in self._events:
            if event.get("method") == name:
                self._events.remove(event)
                return event
        while True:
            got = self._message()
            if got.get("method") == name:
                return got
            self._note(got)

    def open(self, url: str) -> Tab:
        return Tab(self, url)


class Tab:
    """Un onglet : évaluation de script, souris, clavier, capture."""

    def __init__(self, chrome: Chrome, url: str) -> None:
        self.chrome = chrome
        target = chrome.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.session = chrome.call("Target.attachToTarget", {"targetId": target, "flatten": True})["sessionId"]
        for domain in ("Page", "Runtime", "Log"):
            self.call(f"{domain}.enable")
        self.call("Page.navigate", {"url": url})
        chrome.wait_event("Page.loadEventFired")

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        return self.chrome.call(method, params, self.session)

    def js(self, expression: str) -> Any:
        result = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in result:
            raise RuntimeError(json.dumps(result["exceptionDetails"])[:800])
        return result["result"].get("value")

    def mouse_move(self, x: float, y: float) -> None:
        self.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})

    def screenshot(self, path: Path) -> None:
        import base64

        data = self.call("Page.captureScreenshot", {"format": "png"})["data"]
        path.write_bytes(base64.b64decode(data))

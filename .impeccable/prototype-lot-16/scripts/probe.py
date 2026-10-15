"""Une capture rapide et les erreurs de la console (mise au point)."""
import sys, threading
from pathlib import Path
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE.parent.parent / "backend"))
from tests.browser import Chrome  # noqa: E402
CHROMIUM = next(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"))
OUT = Path(sys.argv[1]); JS = sys.argv[2] if len(sys.argv) > 2 else ""
with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(f"file://{HERE / 'index.html'}")
    tab.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
    tab.js("document.fonts.ready.then(() => true)")
    threading.Event().wait(0.4)
    if JS:
        print(tab.js(JS))
        threading.Event().wait(0.5)
    tab.screenshot(OUT)
    print([c for c in chrome.console if c.get("type") == "error" or "exceptionDetails" in c or c.get("entry", {}).get("level") == "error"])

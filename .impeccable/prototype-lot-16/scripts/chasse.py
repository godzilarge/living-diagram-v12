"""La chasse de chaque police de code, mesurée dans Chromium (avance d'un caractère, en em) : c'est elle qui coupe les
lignes et règle la gouttière sur la toile (CODE_FONTS[].em dans src/code.js). Une estimation trop large coupe un peu
tôt (sans danger) ; trop étroite, le texte déborde du bloc. Lancer depuis le dossier du prototype : python3 scripts/chasse.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE.parent.parent / "backend"))
from tests.browser import Chrome  # noqa: E402

CHROMIUM = next(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"))
FAMILIES = ["JetBrains Mono Variable", "IBM Plex Mono", "Source Code Pro", "Cascadia Mono", "monospace"]
JS = """Promise.all(%s.filter((f) => f !== 'monospace').map((f) => document.fonts.load('400 100px "' + f + '"'))).then(() => {
  const c = document.createElement('canvas').getContext('2d'), probe = 'interface GigabitEthernet1/0/1 ip 10.0.0.1 é ç <removed> |{}~';
  return JSON.stringify(%s.map((f) => { c.font = '400 100px ' + (f === 'monospace' ? f : '"' + f + '"');
    const widths = [...new Set([...probe].map((ch) => (c.measureText(ch).width / 100).toFixed(4)))];
    return [f, (c.measureText(probe).width / probe.length / 100).toFixed(4), widths.length === 1 ? 'chasse fixe' : 'largeurs : ' + widths.join(' ')]; }));
})""" % (FAMILIES, FAMILIES)
with Chrome(CHROMIUM) as chrome:
    tab = chrome.open(f"file://{HERE / 'index.html'}")
    for family, em, note in __import__("json").loads(tab.js(JS)):
        print(f"{family:26} {em} em  {note}")

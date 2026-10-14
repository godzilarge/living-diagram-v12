"""Lot 13 (docs/11) : compare chaque capture « avant » à son « après », pixel à pixel, dans Chromium (canvas,
`getImageData`) : nombre de pixels différents (écart > 8 sur un canal), leur boîte, et une image des différences
(`diff-*.png`, en rouge sur l'« après » estompé). Lancer depuis backend/ :
PYTHONPATH=. uv run python <ce fichier> <dossier des captures>"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

from tests.browser import Chrome
from tests.test_render import CHROMIUM

DIR = Path(sys.argv[1])
COMPARE = """(async (a, b) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const [x, y] = await Promise.all([load(a), load(b)]);
  const w = x.width, h = x.height;
  const ctx = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [c, g]; };
  const [, gx] = ctx(x), [cy, gy] = ctx(y);
  const dx = gx.getImageData(0, 0, w, h).data, dy = gy.getImageData(0, 0, w, h).data;
  const out = gy.getImageData(0, 0, w, h);
  let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < dx.length; i += 4) {
    const diff = Math.max(Math.abs(dx[i] - dy[i]), Math.abs(dx[i + 1] - dy[i + 1]), Math.abs(dx[i + 2] - dy[i + 2]));
    const p = i / 4, px = p %% w, py = Math.floor(p / w);
    if (diff > 8) { n++; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; }
    else { out.data[i] = out.data[i] / 4; out.data[i + 1] = out.data[i + 1] / 4; out.data[i + 2] = out.data[i + 2] / 4; }
  }
  gy.putImageData(out, 0, 0);
  return { size: [w, h], same: w === y.width && h === y.height, pixels: n, box: n ? [x0, y0, x1, y1] : null, png: n ? cy.toDataURL('image/png') : null };
})(%s, %s)"""


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open("about:blank")
    for before in sorted(DIR.glob("avant-*.png")):
        after = DIR / before.name.replace("avant-", "apres-", 1)
        got = tab.js(COMPARE % (json.dumps(data_url(before)), json.dumps(data_url(after))))
        if got["png"]:
            (DIR / before.name.replace("avant-", "diff-", 1)).write_bytes(base64.b64decode(got["png"].split(",", 1)[1]))
        print(f"{before.name[6:]:40s} pixels différents : {got['pixels']:7d}  boîte : {got['box']}")

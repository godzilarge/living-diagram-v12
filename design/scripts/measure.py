"""Measure a direction mockup: screenshot at 1440 x 900 and a DOM audit of every `[data-bar]`, `[data-float]` and `[role=tooltip]`.

Usage (from the repository root): cd backend && uv run python ../bac-a-sable/directions/scripts/measure.py <id>

For each bar: the controls (button, a, input, select, [data-control]) that belong to it and to no nested bar; their
heights, vertical centres and horizontal gaps. Flags: heights differing by more than 0.5 px, centres off by more than
1 px, more than two distinct gaps (1 px tolerance). Also: external URLs in the HTML, fonts not loaded, SVG icon
sizes inside controls. Exit code 1 when something is flagged.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "tests"))
from browser import Chrome  # noqa: E402

BENCH = Path(__file__).resolve().parents[1] / "comps"

AUDIT_JS = r"""
(() => {
  const bars = [...document.querySelectorAll('[data-bar]')];
  const out = [];
  for (const bar of bars) {
    const name = bar.getAttribute('data-bar');
    const all = [...bar.querySelectorAll('button, a, input, select, [data-control]')];
    const own = all.filter(el => el.closest('[data-bar]') === bar);
    const rows = own.map(el => {
      const r = el.getBoundingClientRect();
      const svg = el.querySelector('svg');
      const s = svg ? svg.getBoundingClientRect() : null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
               x: r.left, y: r.top, w: r.width, h: r.height, cy: r.top + r.height / 2,
               icon: s ? [Math.round(s.width * 10) / 10, Math.round(s.height * 10) / 10] : null,
               radius: cs.borderRadius, font: cs.fontSize + ' ' + cs.fontWeight + ' ' + cs.fontFamily.split(',')[0] };
    }).filter(r => r.w > 0 && r.h > 0);
    // group by row (same centre line within 3 px)
    const rowsSorted = [...rows].sort((a, b) => a.cy - b.cy || a.x - b.x);
    const lines = [];
    for (const r of rowsSorted) {
      const line = lines.find(l => Math.abs(l.cy - r.cy) <= 3);
      if (line) { line.items.push(r); line.cy = (line.cy * (line.items.length - 1) + r.cy) / line.items.length; }
      else lines.push({ cy: r.cy, items: [r] });
    }
    const flags = [];
    for (const line of lines) {
      const items = line.items.sort((a, b) => a.x - b.x);
      const hs = items.map(i => Math.round(i.h * 2) / 2);
      const distinctH = [...new Set(hs)];
      if (distinctH.length > 1) flags.push(`heights ${distinctH.join('/')} on one row: ${items.map(i => i.text || i.tag).join(' | ')}`);
      const cys = items.map(i => i.cy);
      const dev = Math.max(...cys) - Math.min(...cys);
      if (dev > 1) flags.push(`centres off by ${dev.toFixed(1)} px: ${items.map(i => i.text || i.tag).join(' | ')}`);
      const gaps = [];
      for (let i = 1; i < items.length; i++) gaps.push(Math.round((items[i].x - (items[i - 1].x + items[i - 1].w)) * 2) / 2);
      const distinctG = [...new Set(gaps.map(g => Math.round(g)))].filter(g => g >= 0);
      if (distinctG.length > 2) flags.push(`irregular gaps ${gaps.join(', ')}`);
      const icons = items.map(i => i.icon).filter(Boolean).map(i => i.join('x'));
      const distinctI = [...new Set(icons)];
      if (distinctI.length > 1) flags.push(`icon sizes ${distinctI.join(' / ')}`);
    }
    out.push({ bar: name, controls: rows.length, rows: lines.length, flags, items: rows });
  }
  // floating surfaces: margins to the viewport and to each other, no overlap
  const floats = [...document.querySelectorAll('[data-float]')].map(el => {
    const r = el.getBoundingClientRect();
    return { name: el.getAttribute('data-float'), x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
  }).filter(f => f.w > 0 && f.h > 0);
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const floatFlags = [];
  const MIN_EDGE = 12, MIN_GAP = 8;
  for (const f of floats) {
    const edges = { left: f.x, top: f.y, right: vw - f.r, bottom: vh - f.b };
    for (const [side, d] of Object.entries(edges)) if (d > -0.5 && d < MIN_EDGE) floatFlags.push(`${f.name}: ${d.toFixed(1)} px from the ${side} edge (< ${MIN_EDGE})`);
  }
  for (let i = 0; i < floats.length; i++) for (let j = i + 1; j < floats.length; j++) {
    const a = floats[i], b = floats[j];
    const dx = Math.max(a.x - b.r, b.x - a.r), dy = Math.max(a.y - b.b, b.y - a.b);
    const gap = Math.max(dx, dy);
    if (gap < 0) floatFlags.push(`${a.name} overlaps ${b.name}`);
    else if (gap < MIN_GAP) floatFlags.push(`${a.name} and ${b.name} only ${gap.toFixed(1)} px apart (< ${MIN_GAP})`);
  }
  // tooltip grammar: every [role=tooltip] shares one computed style
  const tips = [...document.querySelectorAll('[role="tooltip"]')].map(el => {
    const cs = getComputedStyle(el);
    return { text: (el.textContent || '').trim().slice(0, 20), key: [cs.backgroundColor, cs.color, cs.fontSize, cs.fontWeight, cs.borderRadius, cs.paddingTop, cs.paddingLeft, cs.boxShadow].join(' | ') };
  });
  const tipKeys = [...new Set(tips.map(t => t.key))];
  const tipFlags = tips.length === 0 ? ['no [role=tooltip] element found'] : (tipKeys.length > 1 ? [`${tipKeys.length} different tooltip styles among ${tips.length} tooltips`] : []);
  return { bars: out, floats: { count: floats.length, flags: floatFlags, items: floats }, tooltips: { count: tips.length, styles: tipKeys.length, flags: tipFlags, sample: tipKeys[0] || null },
           theme: document.documentElement.getAttribute('data-theme'), accent: document.documentElement.getAttribute('data-accent'), fonts: document.fonts.status, loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).slice(0, 12),
           title: document.title, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
})()
"""


def chromium() -> Path:
    found = sorted(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"))
    if not found:
        raise SystemExit("Chromium headless shell not found in ~/.cache/ms-playwright")
    return found[-1]


def main(direction: str, page_name: str = "index.html", theme: str | None = None, accent: str | None = None, state: str | None = None) -> int:
    folder = BENCH / direction
    page = folder / page_name
    tag = direction + ("" if page_name == "index.html" else "-" + page_name.rsplit(".", 1)[0]) + (f"-{theme}" if theme else "") + (f"-{accent}" if accent else "") + (f"-{state}" if state else "")
    if not page.exists():
        raise SystemExit(f"{page} not found")
    html = page.read_text(encoding="utf-8")
    external = sorted(set(re.findall(r"https?://[^\s\"')]+", html)))
    captures = BENCH / "captures"
    captures.mkdir(exist_ok=True)
    with Chrome(chromium(), window=(1440, 900)) as chrome:
        tab = chrome.open(page.resolve().as_uri())
        sets = []
        if theme:
            sets.append(f"document.documentElement.setAttribute('data-theme', {json.dumps(theme)})")
        if accent:
            sets.append(f"document.documentElement.setAttribute('data-accent', {json.dumps(accent)})")
        if state:
            sets.append(f"document.documentElement.setAttribute('data-state', {json.dumps(state)})")
        if sets:
            tab.js(";".join(sets))
        tab.js("new Promise(r => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(r, 450)))")
        audit = tab.js(AUDIT_JS)
        tab.screenshot(captures / f"{tag}-1440.png")
    report = {"direction": direction, "page": page_name, "external_urls": external, **audit}
    (captures / f"{tag}-measure.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    flagged = 0
    print(f"{tag}: {report['width']}x{report['height']}, theme {report.get('theme')}, accent {report.get('accent')}, fonts {report['fonts']}, loaded {', '.join(report['loaded']) or 'none'}")
    fl = report.get("floats", {})
    print(f"  floating surfaces: {fl.get('count', 0)}" + ("" if not fl.get("flags") else " FLAG"))
    for f in fl.get("flags", []):
        flagged += 1
        print("      -", f)
    tp = report.get("tooltips", {})
    print(f"  tooltips: {tp.get('count', 0)} in {tp.get('styles', 0)} style(s)" + ("" if not tp.get("flags") else " FLAG"))
    for f in tp.get("flags", []):
        flagged += 1
        print("      -", f)
    if external:
        flagged += 1
        print("  EXTERNAL URLS:", ", ".join(external))
    for bar in report["bars"]:
        status = "ok" if not bar["flags"] else "FLAG"
        print(f"  [{status}] {bar['bar']}: {bar['controls']} controls on {bar['rows']} row(s)")
        for f in bar["flags"]:
            flagged += 1
            print("      -", f)
    if not report["bars"]:
        flagged += 1
        print("  NO [data-bar] FOUND: the measurement contract is not met")
    print(f"screenshot: {captures / (tag + '-1440.png')}")
    return 1 if flagged else 0


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("direction")
    ap.add_argument("--page", default="index.html", help="another page of the folder, e.g. home.html")
    ap.add_argument("--theme", help="sets data-theme on <html> before measuring (light, dark)")
    ap.add_argument("--accent", help="sets data-accent on <html> before measuring")
    ap.add_argument("--state", help="sets data-state on <html> before measuring, e.g. search")
    a = ap.parse_args()
    sys.exit(main(a.direction, a.page, a.theme, a.accent, a.state))

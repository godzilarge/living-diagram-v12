// Bench common to the three directions: theme and accent, the places of the widgets, the measure of a widget at a
// given width, the 16 / 16 px check, the stored state. Not the product: what `app/` would do with `ld-prefs`.
const Banc = (() => {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  const IDS = ['verdicts', 'couverture', 'sources', 'livraison'];
  const SPACE = Object.freeze({ w: 1408, h: 804, left: 16, top: 80, gap: 16, pad: 12, fade: 32 });
  const NAMES = { verdicts: 'Verdicts', couverture: 'Couverture', sources: 'Câbles et sources', livraison: 'Livraison' };
  const space = document.querySelector('.space');
  const el = (id) => space.querySelector(`.w[data-float="${id}"]`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () => (reduced.matches ? 1 : 240);

  // ---------- theme and accent (control.html's bench) ----------
  const defaults = { theme: 'light', accent: 'a' };
  const get = (k) => root.getAttribute('data-' + k) || defaults[k];
  const set = (k, v) => { if (v === defaults[k]) root.removeAttribute('data-' + k); else root.setAttribute('data-' + k, v); };
  const syncBench = () => document.querySelectorAll('[data-bench]').forEach((b) => {
    const [k, v] = b.dataset.bench.split(':');
    b.setAttribute('aria-pressed', String(get(k) === v));
  });
  if (q.get('theme')) set('theme', q.get('theme'));
  if (q.get('accent')) set('accent', q.get('accent'));
  if (q.get('bench') === '0') root.setAttribute('data-clean', '');
  document.querySelectorAll('[data-bench]').forEach((b) => b.addEventListener('click', () => {
    const [k, v] = b.dataset.bench.split(':'); set(k, v);
  }));
  document.querySelectorAll('.bench a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const u = new URL(a.getAttribute('href'), location.href);
    u.search = '?theme=' + get('theme') + '&accent=' + get('accent');
    location.href = u.toString();
  }));
  new MutationObserver(syncBench).observe(root, { attributes: true });
  syncBench();

  // ---------- stored state (in the product: a field of `ld-prefs`, never an intent) ----------
  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; }
  };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
  const forget = (key) => { try { localStorage.removeItem(key); } catch { /* private mode */ } };

  // ---------- measure: a clone at a given width, its natural height and the bottom of its lines ----------
  const host = document.createElement('div');
  host.className = 'measure';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  const lineEls = (w) => {
    const rows = [...w.querySelectorAll('.w-body tbody tr:not(.sevhead):not(.detail), .w-body dd')]
      .filter((r) => r.offsetParent !== null);
    const strip = w.querySelector('.strip');
    return strip ? [strip, ...rows] : rows;
  };
  function measure(id, width, size = '') {
    const c = el(id).cloneNode(true);
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    c.style.setProperty('--w', width + 'px');
    if (size) c.dataset.size = size; else delete c.dataset.size;
    host.append(c);
    const top = c.getBoundingClientRect().top;
    const lines = lineEls(c).map((n) => n.getBoundingClientRect().bottom - top);
    const head = c.querySelector('.w-head').getBoundingClientRect().bottom - top;
    const hasStrip = !!c.querySelector('.strip');
    const natural = c.offsetHeight;
    c.remove();
    // the bottom of line n, with the body's 12 px below it and the widget's hairline (a strip carries its own)
    const at = (n) => Math.ceil(lines[Math.min(n, lines.length) - 1] + (hasStrip && n === 1 ? 0 : SPACE.pad) + 1);
    return { natural, head, lines: lines.length, at, hasStrip };
  }

  // ---------- places ----------
  let checkTimer = 0;
  function apply(layout, { animate = true } = {}) {
    if (!animate) space.setAttribute('data-still', '');
    for (const id of IDS) {
      const r = layout[id]; const w = el(id);
      w.style.setProperty('--x', r.x + 'px'); w.style.setProperty('--y', r.y + 'px');
      w.style.setProperty('--w', r.w + 'px'); w.style.setProperty('--h', r.h + 'px');
      if (r.size) w.dataset.size = r.size; else delete w.dataset.size;
    }
    if (!animate) { space.offsetHeight; space.removeAttribute('data-still'); }
    clearTimeout(checkTimer);
    checkTimer = setTimeout(settle, animate ? motion() + 40 : 0);
  }
  function settle() {
    for (const id of IDS) {
      const w = el(id); const b = w.querySelector('.w-body');
      b.toggleAttribute('data-overflow', b.scrollHeight > b.clientHeight + 1);
      // a compact widget is a summary: a line it cannot show whole is not shown at all
      const edge = b.getBoundingClientRect().bottom + 0.5; const compact = w.dataset.size === 'compact';
      b.querySelectorAll('tbody tr, dl > dt, dl > dd').forEach((r) => r.classList.toggle('cut', compact && r.getBoundingClientRect().bottom > edge));
    }
    report(check());
  }

  // ---------- the check: 16 px from the edges, 16 px between neighbours, no overlap ----------
  function check() {
    const rs = IDS.map((id) => ({ id, r: el(id).getBoundingClientRect() }));
    const bad = [];
    const off = (a, b) => Math.abs(a - b) > 0.6;
    const px = (v) => Math.round(v * 10) / 10 + ' px';
    const minL = Math.min(...rs.map((x) => x.r.left)); const maxR = Math.max(...rs.map((x) => x.r.right));
    const minT = Math.min(...rs.map((x) => x.r.top)); const maxB = Math.max(...rs.map((x) => x.r.bottom));
    if (off(minL, 16)) bad.push('bord gauche ' + px(minL));
    if (off(innerWidth - maxR, 16)) bad.push('bord droit ' + px(innerWidth - maxR));
    if (off(minT, 80)) bad.push('16 px sous la barre : ' + px(minT - 64));
    if (innerHeight - maxB < 15.4) bad.push('bord bas ' + px(innerHeight - maxB));
    for (const a of rs) {
      let right = Infinity; let below = Infinity; let rightOf = ''; let belowOf = '';
      for (const b of rs) {
        if (a === b) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 0.6 && oy > 0.6) bad.push(`${NAMES[a.id]} couvre ${NAMES[b.id]}`);
        if (oy > 0.6 && b.r.left >= a.r.right - 0.6 && b.r.left - a.r.right < right) { right = b.r.left - a.r.right; rightOf = b.id; }
        if (ox > 0.6 && b.r.top >= a.r.bottom - 0.6 && b.r.top - a.r.bottom < below) { below = b.r.top - a.r.bottom; belowOf = b.id; }
      }
      if (right !== Infinity && off(right, 16)) bad.push(`${px(right)} entre ${NAMES[a.id]} et ${NAMES[rightOf]}`);
      if (below !== Infinity && off(below, 16)) bad.push(`${px(below)} entre ${NAMES[a.id]} et ${NAMES[belowOf]}`);
    }
    return [...new Set(bad)];
  }
  function report(bad) {
    const out = document.querySelector('.bench [data-check]');
    out.dataset.ok = String(bad.length === 0);
    out.textContent = bad.length === 0 ? '16 / 16 px ✓' : '✗ ' + bad[0];
    out.title = bad.length === 0 ? '16 px des bords, 16 px entre widgets, aucun chevauchement' : bad.join('\n');
    root.dataset.spacing = bad.length === 0 ? 'ok' : 'ko';
  }

  // ---------- the bench's two actions ----------
  function actions({ forward, reset }) {
    document.querySelector('[data-act="forward"]').addEventListener('click', () => forward());
    document.querySelector('[data-act="reset"]').addEventListener('click', () => reset());
  }

  return { root, q, IDS, SPACE, NAMES, space, el, motion, load, save, forget, measure, apply, check, settle, actions };
})();

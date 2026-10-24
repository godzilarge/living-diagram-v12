// T1, the handles: one between the two columns (the left width), one between each pair of widgets stacked on the
// right (their heights). Drag snaps to 8 px, the keyboard moves 8 px (Shift 32), a double click goes back to the
// mockup. Minimum: a header and one line; no column under 480 px (the mockup's narrow column).
document.fonts.ready.then(() => {
  const { SPACE, space, el, apply, load, save, forget, measure, q } = Banc;
  const KEY = 'ld-bench-tiles-t1';
  const RIGHT = ['couverture', 'sources', 'livraison'];
  const MIN_COL = 480;
  const STEP = 8; const BIG = 32;
  const inner = SPACE.h - SPACE.gap * (RIGHT.length - 1);

  // what the mockup gives: Verdicts 912 wide, Sources and Livraison at their content, Couverture the rest
  const metrics = (right) => Object.fromEntries(RIGHT.map((id) => [id, measure(id, right)]));
  const minOf = (m) => m.at(1);
  function mockup() {
    const m = metrics(SPACE.w - 912 - SPACE.gap);
    const sources = m.sources.natural; const livraison = m.livraison.natural;
    return { left: 912, h: { couverture: inner - sources - livraison, sources, livraison } };
  }
  const MOCKUP = mockup();

  let state = normalise(load(KEY, MOCKUP));
  function normalise(s) {
    const left = Math.min(Math.max(Number(s.left) || 912, MIN_COL), SPACE.w - SPACE.gap - MIN_COL);
    const m = metrics(SPACE.w - left - SPACE.gap);
    const h = {};
    for (const id of RIGHT) h[id] = Math.max(Number(s.h?.[id]) || MOCKUP.h[id], minOf(m[id]));
    const extra = inner - RIGHT.reduce((t, id) => t + h[id], 0);
    h.couverture += extra; // the widget that grows in the mockup takes up the difference
    if (h.couverture < minOf(m.couverture)) return structuredClone(MOCKUP);
    return { left, h };
  }

  function layout(s) {
    const right = SPACE.w - s.left - SPACE.gap;
    const m = metrics(right);
    const out = { verdicts: { x: 0, y: 0, w: s.left, h: SPACE.h } };
    let y = 0;
    for (const id of RIGHT) {
      const compact = s.h[id] <= minOf(m[id]) + SPACE.fade;
      out[id] = { x: s.left + SPACE.gap, y, w: right, h: s.h[id], size: compact ? 'compact' : '' };
      y += s.h[id] + SPACE.gap;
    }
    return { out, m };
  }

  // ---------- the handles ----------
  const grips = [];
  function grip(kind, i) {
    const g = document.createElement('div');
    g.className = 'grip ' + kind;
    g.tabIndex = 0;
    g.setAttribute('role', 'separator');
    g.setAttribute('aria-orientation', kind === 'col' ? 'vertical' : 'horizontal');
    g.setAttribute('aria-label', kind === 'col'
      ? 'Largeur des colonnes'
      : `Hauteur entre ${Banc.NAMES[RIGHT[i]]} et ${Banc.NAMES[RIGHT[i + 1]]}`);
    g.dataset.kind = kind; g.dataset.i = String(i);
    space.append(g);
    grips.push(g);
    return g;
  }
  grip('col', 0); grip('row', 0); grip('row', 1);

  function render({ animate = true } = {}) {
    const { out, m } = layout(state);
    for (const g of grips) {
      if (g.dataset.kind === 'col') {
        place(g, state.left, 0, SPACE.gap, SPACE.h);
        value(g, state.left, MIN_COL, SPACE.w - SPACE.gap - MIN_COL);
      } else {
        const i = Number(g.dataset.i); const a = out[RIGHT[i]];
        place(g, a.x, a.y + a.h, a.w, SPACE.gap);
        const lo = minOf(m[RIGHT[i]]); const hi = state.h[RIGHT[i]] + state.h[RIGHT[i + 1]] - minOf(m[RIGHT[i + 1]]);
        value(g, state.h[RIGHT[i]], lo, hi);
      }
    }
    apply(out, { animate }); // after the handles: a still render recomputes both without a transition
  }
  function place(g, x, y, w, h) {
    g.style.setProperty('--x', x + 'px'); g.style.setProperty('--y', y + 'px');
    g.style.setProperty('--w', w + 'px'); g.style.setProperty('--h', h + 'px');
  }
  function value(g, now, min, max) {
    g.setAttribute('aria-valuenow', String(Math.round(now)));
    g.setAttribute('aria-valuemin', String(Math.round(min)));
    g.setAttribute('aria-valuemax', String(Math.round(max)));
  }

  // move a handle by d px from a starting state: clamped so that nothing falls under its minimum
  function moved(from, g, d) {
    if (g.dataset.kind === 'col') {
      const left = Math.min(Math.max(from.left + d, MIN_COL), SPACE.w - SPACE.gap - MIN_COL);
      return normalise({ left, h: from.h });
    }
    const i = Number(g.dataset.i); const a = RIGHT[i]; const b = RIGHT[i + 1];
    const m = metrics(SPACE.w - from.left - SPACE.gap);
    const lo = minOf(m[a]) - from.h[a]; const hi = from.h[b] - minOf(m[b]);
    const dd = Math.min(Math.max(d, lo), hi);
    return { left: from.left, h: { ...from.h, [a]: from.h[a] + dd, [b]: from.h[b] - dd } };
  }

  let drag = null;
  space.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.grip');
    if (!g || e.button !== 0) return;
    e.preventDefault();
    g.setPointerCapture(e.pointerId);
    g.focus({ preventScroll: true });
    drag = { g, from: structuredClone(state), x: e.clientX, y: e.clientY };
    Banc.root.dataset.drag = g.dataset.kind;
    g.dataset.active = '';
  });
  space.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const raw = drag.g.dataset.kind === 'col' ? e.clientX - drag.x : e.clientY - drag.y;
    const d = Math.round(raw / STEP) * STEP;
    state = moved(drag.from, drag.g, d);
    render({ animate: false });
  });
  const end = () => {
    if (!drag) return;
    delete drag.g.dataset.active;
    delete Banc.root.dataset.drag;
    drag = null;
    save(KEY, state);
  };
  space.addEventListener('pointerup', end);
  space.addEventListener('pointercancel', end);
  space.addEventListener('dblclick', (e) => {
    const g = e.target.closest('.grip');
    if (!g) return;
    state = g.dataset.kind === 'col' ? normalise({ left: MOCKUP.left, h: state.h }) : normalise({ left: state.left, h: MOCKUP.h });
    save(KEY, state); render();
  });
  space.addEventListener('keydown', (e) => {
    const g = e.target.closest('.grip');
    if (!g) return;
    const col = g.dataset.kind === 'col';
    const keys = col ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    state = moved(state, g, keys[e.key] * (e.shiftKey ? BIG : STEP));
    save(KEY, state); render({ animate: false });
  });

  // ---------- the bench ----------
  function forward() {
    // the gesture of this direction: the right column as wide as it goes, Couverture as tall as it goes
    const left = MIN_COL;
    const m = metrics(SPACE.w - left - SPACE.gap);
    const sources = minOf(m.sources); const livraison = minOf(m.livraison);
    state = { left, h: { couverture: inner - sources - livraison, sources, livraison } };
    save(KEY, state); render();
  }
  function reset() { forget(KEY); state = structuredClone(MOCKUP); render(); }
  Banc.actions({ forward, reset });

  if (q.get('state') === 'cov') { forward(); render({ animate: false }); } else render({ animate: false });
  if (q.get('grip')) { const g = grips[Number(q.get('grip'))]; g.dataset.active = ''; }
  Banc.space.setAttribute('data-ready', '');
});

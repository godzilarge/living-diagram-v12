// T3, the places: four places of fixed size (the mockup's: one large on the left, three on the right). A widget is
// dragged by its header onto another place and the two exchange; "Mettre en avant" sends it to the large place in
// one click (the keyboard's way). The dragged widget takes the layer shadow; the target place is framed, line-2 dashed.
document.fonts.ready.then(() => {
  const { SPACE, IDS, space, el, apply, load, save, forget, measure, q } = Banc;
  const KEY = 'ld-bench-tiles-t3';
  const LEFT = 912; const RIGHT_W = SPACE.w - LEFT - SPACE.gap;
  const MOCKUP = Object.freeze(['verdicts', 'couverture', 'sources', 'livraison']); // the widget at each place

  // the mockup's places: Sources and Livraison at their content, Couverture's place the rest
  const hS = measure('sources', RIGHT_W).natural; const hL = measure('livraison', RIGHT_W).natural;
  const hC = SPACE.h - 2 * SPACE.gap - hS - hL;
  const PLACES = Object.freeze([
    { x: 0, y: 0, w: LEFT, h: SPACE.h },
    { x: LEFT + SPACE.gap, y: 0, w: RIGHT_W, h: hC },
    { x: LEFT + SPACE.gap, y: hC + SPACE.gap, w: RIGHT_W, h: hS },
    { x: LEFT + SPACE.gap, y: hC + hS + 2 * SPACE.gap, w: RIGHT_W, h: hL },
  ]);

  const stored = load(KEY, null);
  let at = Array.isArray(stored?.at) && new Set(stored.at).size === 4 && stored.at.every((id) => IDS.includes(id)) ? stored.at : [...MOCKUP];
  const layout = () => Object.fromEntries(at.map((id, i) => [id, { ...PLACES[i] }]));
  function render({ animate = true } = {}) {
    apply(layout(), { animate });
    for (const id of IDS) {
      const b = el(id).querySelector('[data-promote]');
      const lead = at[0] === id;
      b.setAttribute('aria-disabled', String(lead));
      b.querySelector('.tip').textContent = lead ? 'Déjà en avant' : 'Mettre en avant';
    }
  }
  function swap(i, j, { animate = true } = {}) {
    const next = [...at]; [next[i], next[j]] = [next[j], next[i]]; at = next;
    save(KEY, { at }); render({ animate });
  }

  // ---------- the button: one click to the large place ----------
  space.addEventListener('click', (e) => {
    const b = e.target.closest('[data-promote]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    swap(0, at.indexOf(b.closest('.w').dataset.float));
  });

  // ---------- the drag, by the header ----------
  const frame = (cls) => { const f = document.createElement('div'); f.className = 'place-frame ' + cls; f.setAttribute('aria-hidden', 'true'); space.append(f); return f; };
  const origin = frame('origin'); const target = frame('target');
  const show = (f, p) => {
    if (!p) { delete f.dataset.on; return; }
    for (const k of ['x', 'y', 'w', 'h']) f.style.setProperty('--' + k, p[k] + 'px');
    f.dataset.on = '';
  };
  const box = () => space.getBoundingClientRect();
  const placeAt = (x, y) => PLACES.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);

  let drag = null;
  space.addEventListener('pointerdown', (e) => {
    const head = e.target.closest('.w-head');
    if (!head || e.button !== 0 || e.target.closest('button, input, a, .seg, .filter')) return;
    const w = head.closest('.w');
    drag = { w, id: w.dataset.float, from: at.indexOf(w.dataset.float), x: e.clientX, y: e.clientY, lifted: false, to: -1 };
    head.setPointerCapture(e.pointerId);
  });
  space.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (!drag.lifted && Math.hypot(dx, dy) < 4) return;
    if (!drag.lifted) { drag.lifted = true; drag.w.dataset.lifted = ''; Banc.root.dataset.drag = 'w'; show(origin, PLACES[drag.from]); }
    drag.w.style.setProperty('--dx', dx + 'px'); drag.w.style.setProperty('--dy', dy + 'px');
    const b = box(); const i = placeAt(e.clientX - b.left, e.clientY - b.top);
    drag.to = i === drag.from ? -1 : i;
    show(target, drag.to >= 0 ? PLACES[drag.to] : null);
  });
  function drop(commit) {
    if (!drag) return;
    const { w, from, to, lifted } = drag;
    drag = null;
    show(origin, null); show(target, null);
    delete Banc.root.dataset.drag;
    if (!lifted) return;
    // from where the pointer left it: the widget's place becomes its dragged position, then it travels (240 ms)
    const p = PLACES[from]; const dx = parseFloat(w.style.getPropertyValue('--dx')) || 0; const dy = parseFloat(w.style.getPropertyValue('--dy')) || 0;
    w.dataset.still = '';
    w.style.setProperty('--x', p.x + dx + 'px'); w.style.setProperty('--y', p.y + dy + 'px');
    w.style.removeProperty('--dx'); w.style.removeProperty('--dy');
    delete w.dataset.lifted;
    w.offsetHeight;
    delete w.dataset.still;
    if (commit && to >= 0) swap(from, to); else render();
  }
  space.addEventListener('pointerup', () => drop(true));
  space.addEventListener('pointercancel', () => drop(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drop(false); });

  // ---------- the bench ----------
  Banc.actions({
    forward: () => { const i = at.indexOf('couverture'); if (i > 0) swap(0, i); },
    reset: () => { forget(KEY); at = [...MOCKUP]; render(); },
  });
  if (q.get('state') === 'cov') { at = [...MOCKUP]; swap(0, 1, { animate: false }); } else render({ animate: false });
  if (q.get('lift')) {
    // a frozen drag for the capture: Sources lifted over the large place
    const w = el('sources'); w.dataset.lifted = ''; w.style.setProperty('--dx', '-560px'); w.style.setProperty('--dy', '-180px');
    show(origin, PLACES[at.indexOf('sources')]); show(target, PLACES[0]);
  }
  Banc.space.setAttribute('data-ready', '');
});

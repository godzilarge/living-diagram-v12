// T2, the sizes: no gesture. Each widget's settings (SlidersHorizontal) open a popover of rail buttons: Taille
// (Compacte, Normale, Grande) and Place (Mettre en premier). One widget is "Grande" (the left column, full height);
// the others stack on the right in the chosen order; a compact one shows its header and its strip of facts, or its
// first two lines; the normal ones share the rest (each gets what it needs up to an equal share: the mockup again).
document.fonts.ready.then(() => {
  const { SPACE, IDS, el, apply, load, save, forget, measure, q } = Banc;
  const KEY = 'ld-bench-tiles-t2';
  const LEFT = 912; const RIGHT_W = SPACE.w - LEFT - SPACE.gap;
  const MOCKUP = Object.freeze({ big: 'verdicts', stack: ['couverture', 'sources', 'livraison'], size: { couverture: 'normal', sources: 'normal', livraison: 'normal' } });
  const LABEL = { compact: 'Compacte', normal: 'Normale', big: 'Grande' };

  const valid = (s) => s && IDS.includes(s.big) && Array.isArray(s.stack) && s.stack.length === 3
    && new Set([s.big, ...s.stack]).size === 4 && s.stack.every((id) => ['compact', 'normal'].includes(s.size?.[id]));
  let state = valid(load(KEY, null)) ? load(KEY, null) : structuredClone(MOCKUP);

  const compactHeight = (id) => measure(id, RIGHT_W, 'compact').at(id === 'couverture' ? 1 : 2);

  // max-min fair share: a widget that needs less than an equal share gets what it needs; the rest share equally
  function share(ids, room) {
    const need = Object.fromEntries(ids.map((id) => [id, measure(id, RIGHT_W).natural]));
    const out = {}; let left = room; let rest = [...ids].sort((a, b) => need[a] - need[b]);
    while (rest.length) {
      const each = Math.floor(left / rest.length);
      if (need[rest[0]] > each) {
        rest.forEach((id, i) => { out[id] = each + (i === 0 ? left - each * rest.length : 0); });
        return { out, spare: 0 };
      }
      out[rest[0]] = need[rest[0]]; left -= need[rest[0]]; rest = rest.slice(1);
    }
    return { out, spare: left };
  }

  function layout(s) {
    const out = { [s.big]: { x: 0, y: 0, w: LEFT, h: SPACE.h } };
    const h = {};
    for (const id of s.stack) if (s.size[id] === 'compact') h[id] = compactHeight(id);
    const normal = s.stack.filter((id) => s.size[id] === 'normal');
    const room = SPACE.h - SPACE.gap * (s.stack.length - 1) - Object.values(h).reduce((t, v) => t + v, 0);
    const { out: fair, spare } = share(normal, room);
    Object.assign(h, fair);
    if (normal.length) h[normal[normal.length - 1]] += spare; // the column fills: the last normal widget grows
    let y = 0;
    for (const id of s.stack) {
      out[id] = { x: LEFT + SPACE.gap, y, w: RIGHT_W, h: h[id], size: s.size[id] === 'compact' ? 'compact' : '' };
      y += h[id] + SPACE.gap;
    }
    return out;
  }

  const sizeOf = (id) => (id === state.big ? 'big' : state.size[id]);
  function setSize(id, size) {
    if (size === sizeOf(id)) return;
    if (size === 'big') {
      const was = state.big;
      const stack = state.stack.map((x) => (x === id ? was : x)); // they exchange places
      const sz = { ...state.size, [was]: 'normal' }; delete sz[id];
      state = { big: id, stack, size: sz };
    } else if (id !== state.big) {
      state = { ...state, size: { ...state.size, [id]: size } };
    }
    commit();
  }
  function first(id) {
    if (id === state.big || state.stack[0] === id) return;
    state = { ...state, stack: [id, ...state.stack.filter((x) => x !== id)] };
    commit();
  }
  function commit({ animate = true } = {}) { save(KEY, state); apply(layout(state), { animate }); }

  // ---------- the popover: under the header, aligned on the widget's right edge, 8 px below ----------
  const pop = document.querySelector('.popover.wset');
  const tip = (b, text) => { b.querySelector('.tip').textContent = text; };
  let owner = null;
  function open(id, trigger, keyboard = false) {
    owner = { id, trigger };
    const r = el(id).getBoundingClientRect(); const head = el(id).querySelector('.w-head').getBoundingClientRect();
    pop.style.setProperty('--top', head.bottom + 8 + 'px');
    pop.style.setProperty('--right', innerWidth - r.right + 'px');
    for (const b of pop.querySelectorAll('[data-size]')) {
      const v = b.dataset.size; const locked = id === state.big && v !== 'big';
      b.setAttribute('aria-pressed', String(sizeOf(id) === v));
      b.setAttribute('aria-disabled', String(locked));
      tip(b, locked ? 'La grande place n’est jamais vide : passez un autre widget en Grande' : LABEL[v]);
      b.classList.toggle('has-tip', locked);
    }
    const f = pop.querySelector('[data-first]');
    const why = id === state.big ? 'Ce widget est la grande place' : state.stack[0] === id ? 'Déjà en premier à droite' : '';
    f.setAttribute('aria-disabled', String(!!why)); f.classList.toggle('has-tip', !!why); tip(f, why || 'En haut de la colonne de droite');
    pop.setAttribute('aria-label', 'Réglages du widget ' + Banc.NAMES[id]);
    pop.dataset.open = '';
    trigger.setAttribute('aria-expanded', 'true');
    if (keyboard) pop.querySelector('[data-size][aria-pressed="true"]').focus();
  }
  function close(refocus = true) {
    if (!owner) return;
    delete pop.dataset.open;
    owner.trigger.setAttribute('aria-expanded', 'false');
    if (refocus) owner.trigger.focus({ preventScroll: true });
    owner = null;
  }
  document.querySelectorAll('[data-wset]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.closest('.w').dataset.float;
    if (owner && owner.id === id) close(); else { close(false); open(id, b, e.detail === 0); }
  }));
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b || b.getAttribute('aria-disabled') === 'true' || !owner) return;
    const id = owner.id;
    close(false);
    if (b.dataset.size) setSize(id, b.dataset.size); else if ('first' in b.dataset) first(id);
    setTimeout(() => el(id).querySelector('[data-wset]').focus({ preventScroll: true }), Banc.motion());
  });
  document.addEventListener('click', () => close(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // ---------- the bench ----------
  Banc.actions({
    forward: () => { close(false); setSize('couverture', 'big'); },
    reset: () => { close(false); forget(KEY); state = structuredClone(MOCKUP); apply(layout(state)); },
  });
  if (q.get('state') === 'cov') { state = structuredClone(MOCKUP); setSize('couverture', 'big'); }
  apply(layout(state), { animate: false });
  if (q.get('pop')) open(q.get('pop'), el(q.get('pop')).querySelector('[data-wset]'));
  Banc.space.setAttribute('data-ready', '');
});

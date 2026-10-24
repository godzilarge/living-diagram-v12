// Bench « grille »: the Check view's four widgets on a free grid (react-grid-layout 2.3), two directions:
//   G1, bounded to the window: a board of 12 × 24 cells under the top row, the page never scrolls; the tiles are
//       placed freely like windows on a desk (no compaction), never overlap (a move into occupied space snaps
//       back, a resize stops at its neighbour), never leave the board: the library is told to allow overlaps and
//       the board rule (`board`) judges every change (its `preventCollision` keeps a dragged tile from following
//       the pointer over occupied cells, its `isBounded` froze the drag);
//   G2, the page scrolls: rows of 32 px (48 with the gutter), the grid is as tall as its rows, the window scrolls;
//   G3, the page scrolls and the tiles are placed freely (Orhan, 2026-10-24, after G1 and G2): no compaction, no
//       overlap (the board rule, no bottom), always room below, nothing else moves during a drag, the placeholder
//       turns red where the drop would be refused, "Resserrer" closes the gaps once, on demand.
// Common: 12 columns, 16 px gutters, the header is the drag handle (its controls excepted), eight resize handles,
// a dashed placeholder, 240 ms on the design's ease, a widget adapts to its width (container query), "Agrandir"
// puts one widget over the whole space (Escape or the button brings it back), the layout is remembered per
// direction (in the product: a field of `ld-prefs`, never an intent), "Réinitialiser" returns to the mockup.
// The bench bar also offers a locked layout (no handles, no drag), to feel both. Not the product.
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useContainerWidth } from "react-grid-layout";
// the v1 API (`legacy`, 100 % of the runtime): the v2 component has neither `allowOverlap` nor `compactType`, which G1 needs
import GridLayout from "react-grid-layout/legacy";
import { createPortal } from "react-dom";
import { WIDGETS } from "./mockup.js";
import { Register } from "./register.jsx";

const IDS = ["verdicts", "couverture", "sources", "livraison"];
const NAMES = { verdicts: "Verdicts", couverture: "Couverture", sources: "Câbles et sources", livraison: "Livraison" };
const COLS = 12;
const GAP = 16;
const ROWS_G1 = 24;
const ROW_G2 = 32;
const MIN = { minW: 3, minH: 3 };
// the mockup's layout, in grid units: 912 / 480 ≈ 8 / 4 columns; the right column's heights in rows
const MOCKUP = {
  g1: [
    { i: "verdicts", x: 0, y: 0, w: 8, h: 24 },
    { i: "couverture", x: 8, y: 0, w: 4, h: 7 },
    { i: "sources", x: 8, y: 7, w: 4, h: 8 },
    { i: "livraison", x: 8, y: 15, w: 4, h: 9 },
  ],
  g2: [
    { i: "verdicts", x: 0, y: 0, w: 8, h: 17 },
    { i: "couverture", x: 8, y: 0, w: 4, h: 5 },
    { i: "sources", x: 8, y: 5, w: 4, h: 6 },
    { i: "livraison", x: 8, y: 11, w: 4, h: 6 },
  ],
};
MOCKUP.g3 = MOCKUP.g2;

/** "Resserrer": every tile moved up as far as it goes, in reading order, without overlap. Pure. */
function tighten(layout) {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const item of sorted) {
    const it = { ...item };
    while (it.y > 0 && !placed.some((o) => overlap({ ...it, y: it.y - 1 }, o))) it.y -= 1;
    placed.push(it);
  }
  return placed;
}
const withMin = (layout) => layout.map((item) => ({ ...MIN, ...item }));

// ---------- G1's board rule (pure): never an overlap, never outside 12 × 24; a resize stops at its neighbour or
// at the board's edge (its height gives way first, then its width), a move into occupied space snaps back ----------
const inBounds = (it, rows) => it.x >= 0 && it.y >= 0 && it.x + it.w <= COLS && it.y + it.h <= rows;
const overlap = (a, b) => a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fits = (it, others, rows) => inBounds(it, rows) && !others.some((o) => overlap(it, o));
export function board(prev, next, rows, axis = null) {
  const before = Object.fromEntries(prev.map((it) => [it.i, it]));
  const out = next.map((it) => ({ ...it }));
  const changed = out.filter((it) => { const q = before[it.i]; return !q || q.x !== it.x || q.y !== it.y || q.w !== it.w || q.h !== it.h; });
  if (changed.length === 0) return { layout: out, refused: false };
  if (changed.length === 1) {
    const it = changed[0];
    const q = before[it.i];
    const others = out.filter((o) => o.i !== it.i);
    if (q.x === it.x && q.y === it.y) {
      // a pull on a side changes one dimension only (the library rounds the other from the pixels it measured)
      if (axis === "e" || axis === "w") it.h = q.h;
      if (axis === "n" || axis === "s") it.w = q.w;
      while (it.h > MIN.minH && !fits(it, others, rows)) it.h -= 1;
      while (it.w > MIN.minW && !fits(it, others, rows)) it.w -= 1;
    }
    return fits(it, others, rows) ? { layout: out, refused: false } : { layout: prev, refused: true };
  }
  const valid = out.every((it) => inBounds(it, rows)) && out.every((a) => out.every((b) => !overlap(a, b)));
  return valid ? { layout: out, refused: false } : { layout: prev, refused: true };
}

const q = new URLSearchParams(location.search);
const DIR = ["g1", "g2", "g3"].includes(q.get("d")) ? q.get("d") : "g3";
const FREE = DIR !== "g2";
const ROWS = DIR === "g1" ? ROWS_G1 : Infinity;
const KEY = `ld-bench-grille-${DIR}`;

// ---------- stored state (in the product: a field of `ld-prefs`) ----------
const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(v) || v.length !== 4 || !IDS.every((id) => v.some((it) => it.i === id))) return null;
    return v.map((it) => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h }));
  } catch {
    return null;
  }
};
const save = (layout) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))));
  } catch {
    /* private mode */
  }
};
const forget = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
};

// ---------- theme and accent (the mockup's bench) ----------
const root = document.documentElement;
const defaults = { theme: "light", accent: "a", density: "a", reg: "v0" };
const REGISTERS = [["v0", "V0", "Registre actuel (l'application)"], ["v1", "V1", "Colonnes"], ["v2", "V2", "Le nombre en tête"], ["v3", "V3", "Par règle"], ["v4", "V4", "La phrase seule"]];
const getPref = (k) => root.getAttribute("data-" + k) || defaults[k];
const setPref = (k, v) => {
  if (v === defaults[k]) root.removeAttribute("data-" + k);
  else root.setAttribute("data-" + k, v);
};
if (q.get("theme")) setPref("theme", q.get("theme"));
if (q.get("accent")) setPref("accent", q.get("accent"));
if (q.get("bench") === "0") root.setAttribute("data-clean", "");
if (q.get("density") === "b") root.setAttribute("data-density", "b");
if (REGISTERS.some(([v]) => v === q.get("reg"))) setPref("reg", q.get("reg"));
document.body.dataset.dir = DIR;

function Icon({ name }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

function IconButton({ label, icon, onClick, pressed, tip = "end" }) {
  return (
    <button className={`btn icon has-tip${pressed === undefined ? "" : " rail"}`} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Icon name={icon} />
      <span className={`tip ${tip}`} role="tooltip">{label}</span>
    </button>
  );
}

/** One widget of the mockup, its HTML as it is; the actions slot gets 'Agrandir' (or 'Réduire'). The body's fade
 *  only shows while it overflows (ResizeObserver on the body). */
function Widget({ id, focused, onFocus, register, shown, onToggleSeverity }) {
  const ref = useRef(null);
  const [body, setBody] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = WIDGETS[id];
    const body = el.querySelector(".w-body");
    if (id === "verdicts" && register !== "v0") {
      body.innerHTML = "";
      setBody(body);
    } else setBody(null);
    const update = () => body.toggleAttribute("data-overflow", body.scrollHeight > body.clientHeight + 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(body);
    return () => ro.disconnect();
  }, [id, register]);
  // the severity toggles of the mockup's header filter the register rendered from data
  useEffect(() => {
    const el = ref.current;
    if (id !== "verdicts" || !el) return;
    const buttons = [...el.querySelectorAll(".seg .btn")];
    const sev = ["error", "warning", "info"];
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(shown[sev[i]] ?? true)));
    const onClick = (e) => {
      const b = e.target.closest(".seg .btn");
      if (!b) return;
      onToggleSeverity(sev[buttons.indexOf(b)]);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [id, shown, onToggleSeverity, register]);
  // the actions slot is inside the injected HTML: a portal would do in the product; here a small render by hand
  useEffect(() => {
    const slot = ref.current?.querySelector("[data-actions]");
    if (!slot) return;
    slot.innerHTML = "";
    const b = document.createElement("button");
    b.className = "btn icon has-tip";
    b.setAttribute("aria-label", focused ? "Réduire" : "Agrandir");
    b.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${focused ? "minimize-2" : "maximize-2"}"/></svg><span class="tip end" role="tooltip">${focused ? "Réduire" : "Agrandir"}<span class="tk">${focused ? "Échap" : ""}</span></span>`;
    b.addEventListener("click", () => onFocus(focused ? null : id));
    slot.append(b);
  }, [id, focused, onFocus]);
  return (
    <>
      <div ref={ref} className="w-host" />
      {body && register !== "v0" ? createPortal(<Register variant={register} shown={shown} />, body) : null}
    </>
  );
}

/** The 16 / 16 px check: 16 px from the edges (G1: the bottom too), 16 px between neighbours, no overlap. */
function check(spaceEl) {
  if (!spaceEl) return { ok: true, text: "…" };
  const rs = IDS.map((id) => ({ id, r: spaceEl.querySelector(`[data-float="${id}"]`)?.getBoundingClientRect() })).filter((x) => x.r);
  const bad = [];
  const off = (a, b) => Math.abs(a - b) > 0.6;
  const px = (v) => Math.round(v * 10) / 10 + " px";
  const minL = Math.min(...rs.map((x) => x.r.left));
  const maxR = Math.max(...rs.map((x) => x.r.right));
  const minT = Math.min(...rs.map((x) => x.r.top));
  const maxB = Math.max(...rs.map((x) => x.r.bottom));
  if (off(minL, 16)) bad.push("bord gauche " + px(minL));
  if (off(innerWidth - maxR, 16)) bad.push("bord droit " + px(innerWidth - maxR));
  if (DIR === "g1" && off(minT, 80)) bad.push("16 px sous la barre : " + px(minT - 64));
  if (DIR === "g1" && innerHeight - maxB < 15.4) bad.push("bord bas " + px(innerHeight - maxB));
  for (const a of rs) {
    for (const b of rs) {
      if (a === b) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 0.6 && oy > 0.6) bad.push(`${NAMES[a.id]} couvre ${NAMES[b.id]}`);
      if (oy > 0.6 && b.r.left >= a.r.right - 0.6 && b.r.left - a.r.right < 15.4) bad.push(`${px(b.r.left - a.r.right)} entre ${NAMES[a.id]} et ${NAMES[b.id]}`);
      if (ox > 0.6 && b.r.top >= a.r.bottom - 0.6 && b.r.top - a.r.bottom < 15.4) bad.push(`${px(b.r.top - a.r.bottom)} entre ${NAMES[a.id]} et ${NAMES[b.id]}`);
    }
  }
  return bad.length ? { ok: false, text: bad[0] } : { ok: true, text: "16 / 16 px ✓" };
}

function Bench({ free, setFree, onReset, onTighten, result, size }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => tick((n) => n + 1));
    mo.observe(root, { attributes: true });
    return () => mo.disconnect();
  }, []);
  const pressed = (k, v) => String(getPref(k) === v);
  const link = (d) => `?d=${d}&theme=${getPref("theme")}&accent=${getPref("accent")}&reg=${getPref("reg")}`;
  return (
    <div className="surf bench on-bench" data-float="banc" aria-label="Banc d'essai, hors produit">
      <b>Banc</b>
      <button data-bench="theme:light" aria-pressed={pressed("theme", "light")} onClick={() => setPref("theme", "light")}>Clair</button>
      <button data-bench="theme:dark" aria-pressed={pressed("theme", "dark")} onClick={() => setPref("theme", "dark")}>Sombre</button>
      <i />
      <button aria-pressed={pressed("accent", "a")} onClick={() => setPref("accent", "a")}>Cobalt</button>
      <button aria-pressed={pressed("accent", "c")} onClick={() => setPref("accent", "c")}>Encre</button>
      <i />
      <a href={link("g3")} title="Libre, la page défile" aria-pressed={String(DIR === "g3")}>G3</a>
      <a href={link("g2")} title="Compactée, la page défile" aria-pressed={String(DIR === "g2")}>G2</a>
      <a href={link("g1")} title="Bornée à la fenêtre" aria-pressed={String(DIR === "g1")}>G1</a>
      <i />
      <span className="dim">Registre</span>
      {REGISTERS.map(([v, label, title]) => (
        <button key={v} title={title} aria-pressed={pressed("reg", v)} onClick={() => setPref("reg", v)}>{label}</button>
      ))}
      <i />
      <button aria-pressed={String(free)} onClick={() => setFree(true)}>Libre</button>
      <button aria-pressed={String(!free)} onClick={() => setFree(false)}>Verrouillée</button>
      {FREE ? <button onClick={onTighten}>Resserrer</button> : null}
      <button onClick={onReset}>Réinitialiser</button>
      <i />
      <span className="chk" data-check aria-live="polite" data-ok={String(result.ok)}>{result.text}</span>
      <span className="dim">{size}</span>
    </div>
  );
}

function App() {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layout, setLayout] = useState(() => withMin(load() ?? MOCKUP[DIR]));
  const [free, setFree] = useState(true);
  const [register, setRegister] = useState(getPref("reg"));
  useEffect(() => {
    const mo = new MutationObserver(() => setRegister(getPref("reg")));
    mo.observe(root, { attributes: true, attributeFilter: ["data-reg"] });
    return () => mo.disconnect();
  }, []);
  const [shown, setShown] = useState({ error: true, warning: true, info: true });
  const onToggleSeverity = useCallback((sev) => setShown((s) => ({ ...s, [sev]: !s[sev] })), []);
  const [focus, setFocus] = useState(null);
  const [height, setHeight] = useState(() => Math.max(240, innerHeight - 96));
  const [result, setResult] = useState({ ok: true, text: "…" });
  const [size, setSize] = useState(`${innerWidth} × ${innerHeight}`);
  const spaceRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      setHeight(Math.max(240, innerHeight - 96));
      setSize(`${innerWidth} × ${innerHeight}`);
    };
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setFocus(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    root.toggleAttribute("data-free", free && !focus);
  }, [free, focus]);
  // the check, after the motion
  useEffect(() => {
    const t = setTimeout(() => setResult(focus ? { ok: true, text: "agrandi" } : check(spaceRef.current)), 300);
    return () => clearTimeout(t);
  }, [layout, height, width, focus]);

  const rowHeight = DIR === "g1" ? (height - (ROWS_G1 - 1) * GAP) / ROWS_G1 : ROW_G2;
  const axis = useRef(null);
  const onResizeStart = useCallback((_layout, _old, _item, _placeholder, event) => {
    const handle = event?.target?.closest?.(".react-resizable-handle");
    axis.current = handle ? (handle.className.match(/react-resizable-handle-(\w+)/)?.[1] ?? null) : null;
  }, []);
  // a refused change (G1) remounts the grid: the library keeps a dropped item where the pointer left it when the
  // layout it is given reads the same as before
  const [epoch, setEpoch] = useState(0);
  const [refused, setRefused] = useState(false);
  const onDrag = useCallback((_layout, _old, item) => {
    if (!FREE) return;
    setRefused(!fits(item, _layout.filter((o) => o.i !== item.i), ROWS));
  }, []);
  const onDragStop = useCallback(() => setRefused(false), []);
  const onLayoutChange = useCallback((next) => {
    setLayout((prev) => {
      if (!FREE) {
        save(next);
        return withMin(next);
      }
      const { layout: kept, refused: no } = board(prev, next, ROWS, axis.current);
      if (no) setEpoch((e) => e + 1);
      save(kept);
      return withMin(kept);
    });
  }, []);
  const onTighten = () => {
    setLayout((prev) => {
      const next = withMin(tighten(prev));
      save(next);
      return next;
    });
    setEpoch((e) => e + 1);
  };
  const reset = () => {
    forget();
    setFocus(null);
    setLayout(withMin(MOCKUP[DIR]));
  };
  const onFocus = useCallback((id) => setFocus(id), []);

  return (
    <>
      <div className="space" ref={spaceRef} data-focus={focus ? "" : undefined} data-refused={refused ? "" : undefined}>
        <div ref={containerRef} style={DIR === "g1" ? { height } : undefined}>
          {mounted ? (
            <GridLayout
              key={epoch}
              width={width}
              layout={layout}
              cols={COLS}
              rowHeight={rowHeight}
              margin={[GAP, GAP]}
              containerPadding={[0, 0]}
              maxRows={DIR === "g1" ? ROWS_G1 : Infinity}
              compactType={FREE ? null : "vertical"}
              allowOverlap={FREE}
              isDraggable={free && !focus}
              isResizable={free && !focus}
              draggableHandle="[data-drag-handle]"
              draggableCancel="button, input, a, .seg, .filter"
              resizeHandles={["se", "sw", "ne", "nw", "e", "s", "w", "n"]}
              autoSize={DIR !== "g1"}
              onDrag={onDrag}
              onDragStop={onDragStop}
              onResizeStart={onResizeStart}
              onLayoutChange={onLayoutChange}
            >
              {IDS.map((id) => (
                <div key={id} data-focus={focus === id ? "" : undefined}>
                  <Widget id={id} focused={focus === id} onFocus={onFocus} register={register} shown={shown} onToggleSeverity={onToggleSeverity} />
                </div>
              ))}
            </GridLayout>
          ) : null}
        </div>
      </div>
      <Bench free={free} setFree={setFree} onReset={reset} onTighten={onTighten} result={result} size={size} />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

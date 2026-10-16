// The DOM audit, ported from design/scripts/measure.py (AUDIT_JS): it runs inside the page (`page.evaluate`) and
// returns facts and flags; the spec asserts. Self-contained: no import, no closure over this module.
export type AuditReport = {
  bars: { bar: string; controls: number; flags: string[] }[];
  floats: { count: number; flags: string[] };
  layers: { count: number; flags: string[] };
  tooltips: { count: number; styles: string[]; flags: string[] };
  contrast: { checked: number; flags: string[] };
  opacity: { flags: string[] };
  font: { archivo: boolean };
};

export function audit(limits: { edge: number; gap: number; contrast: number; tooltip: number }): AuditReport {
  type Box = { name: string; x: number; y: number; r: number; b: number };
  const docW = document.documentElement.scrollWidth;
  const docH = document.documentElement.scrollHeight;
  const box = (el: Element, name: string): Box => {
    const r = el.getBoundingClientRect();
    return { name, x: r.left + scrollX, y: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY };
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el: Element) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 28);
  const separation = (a: Box, b: Box) => Math.max(a.x - b.r, b.x - a.r, a.y - b.b, b.y - a.b);
  const edgeFlags = (f: Box, min: number) =>
    Object.entries({ left: f.x, top: f.y, right: docW - f.r, bottom: docH - f.b })
      .filter(([, d]) => d < min)
      .map(([side, d]) => `${f.name}: ${d.toFixed(1)} px from the ${side} edge (< ${min})`);

  // bars: the controls that belong to each bar and to no nested bar
  const parentBar = (el: Element) => (el.hasAttribute("data-bar") ? el.parentElement?.closest("[data-bar]") : el.closest("[data-bar]"));
  const bars = [...document.querySelectorAll("[data-bar]")].filter(visible).map((bar) => {
    const name = bar.getAttribute("data-bar") || "";
    const own = [...bar.querySelectorAll("button, a, input, select, [data-control]")].filter((el) => parentBar(el) === bar && visible(el));
    const items = own.map((el) => {
      const r = el.getBoundingClientRect();
      const svg = el.querySelector("svg");
      const s = svg ? svg.getBoundingClientRect() : null;
      return { text: label(el), x: r.left, w: r.width, h: r.height, cy: r.top + r.height / 2, icon: s ? `${Math.round(s.width)}x${Math.round(s.height)}` : null };
    });
    const lines: { cy: number; items: typeof items }[] = [];
    for (const item of [...items].sort((a, b) => a.cy - b.cy || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l.cy - item.cy) <= 3);
      if (line) line.items.push(item);
      else lines.push({ cy: item.cy, items: [item] });
    }
    const flags: string[] = [];
    for (const line of lines) {
      const row = line.items.sort((a, b) => a.x - b.x);
      const names = row.map((i) => i.text).join(" | ");
      const heights = row.map((i) => i.h);
      if (Math.max(...heights) - Math.min(...heights) > 0.5) flags.push(`${name}: heights ${heights.join("/")} on one row: ${names}`);
      const cys = row.map((i) => i.cy);
      if (Math.max(...cys) - Math.min(...cys) > 1) flags.push(`${name}: centres off by ${(Math.max(...cys) - Math.min(...cys)).toFixed(1)} px: ${names}`);
      const gaps = row.slice(1).map((item, i) => Math.round(item.x - (row[i].x + row[i].w)));
      const distinct = [...new Set(gaps)];
      if (distinct.length > 2) flags.push(`${name}: irregular gaps ${gaps.join(", ")}`);
      if (gaps.some((g) => g < 0)) flags.push(`${name}: overlapping controls ${gaps.join(", ")}`);
      const icons = [...new Set(row.map((i) => i.icon).filter(Boolean))];
      if (icons.length > 1) flags.push(`${name}: icon sizes ${icons.join(" / ")}`);
    }
    return { bar: name, controls: items.length, flags };
  });

  // floating surfaces: ≥ edge from the document's edges, ≥ gap from each other
  const floats = [...document.querySelectorAll("[data-float]")].filter(visible).map((el) => box(el, el.getAttribute("data-float") || ""));
  const floatFlags = floats.flatMap((f) => edgeFlags(f, limits.edge));
  for (let i = 0; i < floats.length; i++)
    for (let j = i + 1; j < floats.length; j++) {
      const gap = separation(floats[i], floats[j]);
      if (gap < 0) floatFlags.push(`${floats[i].name} overlaps ${floats[j].name}`);
      else if (gap < limits.gap) floatFlags.push(`${floats[i].name} and ${floats[j].name} only ${gap.toFixed(1)} px apart (< ${limits.gap})`);
    }

  // layers (popovers, lists): ≥ edge from the document's edges, never over their own trigger
  const layerEls = [...document.querySelectorAll("[data-layer]")].filter(visible);
  const layerFlags = layerEls.flatMap((el) => {
    const own = box(el, el.getAttribute("data-layer") || "");
    const trigger = el.id ? document.querySelector(`[aria-controls="${CSS.escape(el.id)}"]`) : null;
    const over = trigger && separation(own, box(trigger, "trigger")) < 0 ? [`${own.name} covers its trigger`] : [];
    return [...edgeFlags(own, limits.edge), ...over, ...(trigger ? [] : [`${own.name}: no trigger names it (aria-controls)`])];
  });

  // tooltips: one computed style, and the edge distance; a tooltip not rendered (the canvas's hover bubble at rest,
  // an SVG kept hidden) is not measured
  const tips = [...document.querySelectorAll('[role="tooltip"]')].filter(visible);
  const styleOf = (el: Element) => {
    const cs = getComputedStyle(el);
    return [cs.backgroundColor, cs.color, cs.fontFamily, cs.fontSize, cs.fontWeight, cs.lineHeight, cs.borderRadius, cs.paddingTop, cs.paddingLeft, cs.boxShadow, cs.outlineColor, cs.outlineWidth, cs.letterSpacing, cs.height].join(" | ");
  };
  const styles = [...new Set(tips.map(styleOf))];
  const tipFlags = [
    ...(tips.length === 0 ? ["no [role=tooltip] element"] : []),
    ...(styles.length > 1 ? [`${styles.length} tooltip styles among ${tips.length} tooltips`] : []),
    ...tips.flatMap((el) => edgeFlags(box(el, `tooltip "${label(el)}"`), limits.edge).filter((f) => !/top|bottom/.test(f))),
  ];
  const tipBoxes = tips.filter(visible).map((el) => ({ el, own: box(el, `tooltip "${label(el)}"`) }));
  for (const { el, own } of tipBoxes) {
    const control = el.id ? document.querySelector(`[aria-describedby~="${CSS.escape(el.id)}"]`) : null;
    if (!control) tipFlags.push(`${own.name}: no control names it (aria-describedby)`);
    else if (separation(own, box(control, "control")) < limits.tooltip - 0.5)
      tipFlags.push(`${own.name}: ${separation(own, box(control, "control")).toFixed(1)} px from its control (< ${limits.tooltip})`);
  }
  const layerBoxes = layerEls.map((el) => box(el, el.getAttribute("data-layer") || ""));
  for (const { own } of tipBoxes)
    for (const layer of layerBoxes) if (separation(own, layer) < 0) tipFlags.push(`${own.name} covers the layer ${layer.name}`);
  for (let i = 0; i < tipBoxes.length; i++)
    for (let j = i + 1; j < tipBoxes.length; j++)
      if (separation(tipBoxes[i].own, tipBoxes[j].own) < 0) tipFlags.push(`${tipBoxes[i].own.name} overlaps ${tipBoxes[j].own.name}`);

  // contrast: every element with its own text, rendered colours, against its effective background
  const parse = (value: string): number[] | null => {
    const m = /^rgba?\(([^)]+)\)$/.exec(value) || /^color\(srgb ([^)]+)\)$/.exec(value);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const scale = value.startsWith("color(") ? 255 : 1;
    return [parts[0] * scale, parts[1] * scale, parts[2] * scale, parts.length > 3 ? parts[3] : 1];
  };
  const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const background = (el: Element | null): number[] => {
    const layers: number[][] = [];
    for (let node = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let colour = [255, 255, 255, 1];
    for (const layer of layers.reverse()) colour = over(layer, colour);
    return colour;
  };
  const luminance = (c: number[]) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  let checked = 0;
  const contrastFlags: string[] = [];
  const opacityFlags: string[] = [];
  const opacity = (el: Element | null): number => (el ? Number(getComputedStyle(el).opacity) * opacity(el.parentElement) : 1);
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim());
    if (!own || !visible(el) || el.closest('[aria-disabled="true"], :disabled, [aria-hidden="true"], script, style')) continue;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) {
      contrastFlags.push(`unreadable colour ${getComputedStyle(el).color} on "${label(el)}"`);
      continue;
    }
    const seen = opacity(el);
    if (seen < 1) opacityFlags.push(`"${label(el)}": rendered at opacity ${seen.toFixed(2)}`);
    const bg = background(el);
    const value = ratio(over(fg, bg), bg);
    checked += 1;
    if (value < limits.contrast) contrastFlags.push(`"${label(el)}": ${value.toFixed(2)}:1 (${getComputedStyle(el).color} on rgb(${bg.slice(0, 3).map(Math.round).join(", ")}))`);
  }

  const archivo = [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Archivo" && f.status === "loaded");
  return {
    bars,
    floats: { count: floats.length, flags: floatFlags },
    layers: { count: layerEls.length, flags: layerFlags },
    tooltips: { count: tips.length, styles, flags: tipFlags },
    contrast: { checked, flags: contrastFlags },
    opacity: { flags: opacityFlags },
    font: { archivo },
  };
}

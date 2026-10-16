// Generates `src/styles/tokens.css` from the frontmatter of DESIGN.md (repository root), the only source of the
// design tokens. `node scripts/tokens.mjs` writes the file; `--check` compares without writing and fails on a drift
// (part of `npm run check`). Light is the default; `data-theme="dark"` and `data-accent="ink"` on `<html>` switch the
// theme and the accent (cobalt is the default accent). Deterministic: same DESIGN.md, same file, byte for byte.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
export const DESIGN = resolve(here, "../../DESIGN.md");
export const OUTPUT = resolve(here, "../src/styles/tokens.css");

const DARK = "dark-";
const INK_OPTION = "accent-ink-option";
const COLOUR = /^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|transparent)$/;
const REFERENCE = /^\{(\w+)\.([\w-]+)\}$/;
const GROUP_PREFIX = { colors: "color", rounded: "radius", spacing: "space", shadows: "shadow", motion: "motion" };
// Motion that is a duration collapses to 1 ms under reduced motion (DESIGN.md, Don'ts); a delay to 0 ms.
const REDUCED = (name, value) => (/ms$/.test(String(value)) ? (name.endsWith("delay") ? "0ms" : "1ms") : null);

const kebab = (name) => name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/^rounded$/, "radius");

/** The YAML frontmatter of a Markdown document, parsed; an error names what is missing. */
export function frontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) throw new Error("DESIGN.md has no frontmatter");
  return parse(match[1]);
}

function requireGroup(data, name) {
  const group = data[name];
  if (!group || typeof group !== "object") throw new Error(`DESIGN.md frontmatter: missing group \`${name}\``);
  return group;
}

/** Splits a group into its light entries and its dark overrides (`dark-x` overrides `x`). */
function split(group, name, { skip = () => false } = {}) {
  const light = [];
  const dark = [];
  for (const [key, value] of Object.entries(group)) {
    if (skip(key)) continue;
    if (key.startsWith(DARK)) {
      const base = key.slice(DARK.length);
      if (!(base in group)) throw new Error(`DESIGN.md frontmatter: \`${name}.${key}\` has no light \`${base}\``);
      dark.push([base, value]);
    } else light.push([key, value]);
  }
  return { light, dark };
}

function checkColours(colors) {
  for (const [key, value] of Object.entries(colors)) {
    if (!COLOUR.test(String(value))) throw new Error(`DESIGN.md frontmatter: \`colors.${key}\` is not a colour`);
  }
}

function fontFamily(typography) {
  const families = new Set(Object.values(typography).map((style) => style.fontFamily));
  if (families.size !== 1) throw new Error("DESIGN.md frontmatter: one font family expected across `typography`");
  return [...families][0];
}

function typographyTokens(typography) {
  const out = [];
  for (const [name, style] of Object.entries(typography)) {
    out.push([`--text-${name}-size`, style.fontSize], [`--text-${name}-weight`, style.fontWeight]);
    out.push([`--text-${name}-leading`, style.lineHeight]);
  }
  return out;
}

/** A component property: a reference to another token becomes a `var()`, a typography reference expands. */
function componentTokens(components, data) {
  const out = [];
  for (const [component, props] of Object.entries(components)) {
    for (const [prop, value] of Object.entries(props)) {
      const ref = REFERENCE.exec(String(value));
      const name = `--${component}-${kebab(prop)}`;
      if (!ref) {
        out.push([name, value]);
        continue;
      }
      const [, group, key] = ref;
      if (!data[group] || !(key in data[group])) throw new Error(`DESIGN.md frontmatter: unknown reference ${value}`);
      if (group === "typography") {
        for (const part of ["size", "weight", "leading"]) out.push([`--${component}-font-${part}`, `var(--text-${key}-${part})`]);
      } else if (GROUP_PREFIX[group]) out.push([name, `var(--${GROUP_PREFIX[group]}-${key})`]);
      else throw new Error(`DESIGN.md frontmatter: reference to an unsupported group in ${value}`);
    }
  }
  return out;
}

function inkAccent(colors, prefix) {
  const get = (key) => colors[prefix + key];
  if (!get(INK_OPTION)) throw new Error(`DESIGN.md frontmatter: missing \`colors.${prefix}${INK_OPTION}\``);
  return [
    ["--color-accent", get(INK_OPTION)],
    ["--color-accent-ink", get(INK_OPTION)],
    ["--color-accent-weak", get(INK_OPTION + "-weak")],
    ["--color-on-accent", get(INK_OPTION + "-on")],
  ];
}

const block = (selector, entries, extra = []) =>
  `${selector} {\n${[...extra, ...entries.map(([name, value]) => `${name}: ${value};`)].map((line) => "  " + line).join("\n")}\n}\n`;

/** The whole stylesheet for a DESIGN.md text. Pure. */
export function generate(markdown) {
  const data = frontmatter(markdown);
  const colors = requireGroup(data, "colors");
  checkColours(colors);
  const typography = requireGroup(data, "typography");
  const isInkOption = (key) => key.replace(DARK, "").startsWith(INK_OPTION);
  const palette = split(colors, "colors", { skip: isInkOption });
  const shadows = split(requireGroup(data, "shadows"), "shadows");
  const motion = Object.entries(requireGroup(data, "motion"));
  const named = (prefix, entries) => entries.map(([key, value]) => [`--${prefix}-${key}`, value]);
  const light = [
    ["--font-sans", fontFamily(typography)],
    ...named("color", palette.light),
    ...named("radius", Object.entries(requireGroup(data, "rounded"))),
    ...named("space", Object.entries(requireGroup(data, "spacing"))),
    ...typographyTokens(typography),
    ...named("shadow", shadows.light),
    ...named("motion", motion),
    ...componentTokens(requireGroup(data, "components"), data),
  ];
  const reduced = motion.map(([key, value]) => [`--motion-${key}`, REDUCED(key, value)]).filter(([, value]) => value);
  return [
    "/* Generated by app/scripts/tokens.mjs from the frontmatter of DESIGN.md: do not edit, run `npm run tokens`. */\n",
    block(":root", light, ["color-scheme: light;"]),
    block(':root[data-accent="ink"]', inkAccent(colors, "")),
    block(':root[data-theme="dark"]', [...named("color", palette.dark), ...named("shadow", shadows.dark)], ["color-scheme: dark;"]),
    block(':root[data-theme="dark"][data-accent="ink"]', inkAccent(colors, DARK)),
    `@media (prefers-reduced-motion: reduce) {\n${block("  :root", reduced).replace(/^ {2}(--)/gm, "    $1").replace(/^}/m, "  }")}}\n`,
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = generate(readFileSync(DESIGN, "utf8"));
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      current = "";
    }
    if (current !== css) {
      console.error("tokens.css drifts from DESIGN.md: run `npm run tokens` (never edit tokens.css by hand)");
      process.exit(1);
    }
  } else {
    writeFileSync(OUTPUT, css);
    console.log(`wrote ${OUTPUT}`);
  }
}

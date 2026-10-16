# Round 2: the shell, one direction

Round 1 put four worlds on the bench (`ROUND.md`). Orhan's verdict: **the base is the category standard (`canon`),
improved, with the liveliness of `netzgrafik`**; the canvas (nodes, cables) is **another surface**, judged in its own
later session; what he judges now is **the shell**: navigation, menus, panels, search, tooltips, home page. Read
`ROUND.md` § "Orhan's verdict on round 1" in full: it is the brief's spine.

Read, in this order: `PRODUCT.md` (binding), `ROUND.md` (the verdict), this brief, then the `frontend-design` skill
and Impeccable's `reference/craft-floor.md` and `reference/operate.md`
(`/home/otosun/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/reference/`). You **may** read
`canon/index.html` and `netzgrafik/index.html` (the two sources Orhan named) and their `DIRECTION.md`; do not read
`star-atlas/`, `patch-cord/`, nor `engine/src/app/`.

## The direction contract

- **Ground**: light by default: a true white content ground, a second very light neutral for surfaces, deep ink
  (not tinted grey). **Dark theme supported** on the same page (`<html data-theme="dark">`): the standard inversion,
  calibrated for contrast, same geometry.
- **One saturated accent, never red, never violet, never cyan**: red stays the error colour of the product, so the
  accent must live elsewhere. Build **two accent candidates** switchable on the same page
  (`<html data-accent="a">` / `"b"`): name them in `DIRECTION.md` with their hex and their reason. The accent does
  real jobs only: selection, current, primary action, focus, the view-switch rail.
- **The thin coloured rail** for the view switch Diagramme / Contrôle / Journal (as `netzgrafik`), never big buttons.
- **Floating and airy**: the shell is made of floating surfaces over the canvas (top bar, panel, run band, canvas
  controls), each with a real margin from the viewport edge (≥ 16 px) and from each other (≥ 12 px), a soft shadow
  with offset and blur, and a hairline border; **a surface that has nothing to show hides itself** (say which ones
  and when in `DIRECTION.md`); a panel adapts its height to its content. Mark every floating surface with
  `data-float="<name>"`: the measurement checks margins and overlaps.
- **Icons over words** for universal actions (export, edit, search, settings, fit, zoom, close, more); **a word for a
  choice** (the run being compared, the layer, the infrastructure). Every icon-only control has a tooltip.
- **One tooltip grammar for the whole application**: white text on black, 12 px, one radius, one padding, one
  shadow, placed by a consistent rule; **render the tooltips in the DOM** as `[role="tooltip"]` elements (hidden,
  shown on hover; at least one shown in a captured state) and give them all one class: the measurement checks that
  every `[role=tooltip]` shares one computed style.
- **Search**: a discreet control in the top bar (an icon and the shortcut `Ctrl K`), which opens a **command palette**
  centred over a faded page (scrim), with a rich result list grouped by kind (devices, ports, groups, infrastructures,
  actions). Render that state with `<html data-state="search">`.
- **Logo only**, no product name next to it. Draw a small, simple, memorable mark (SVG, two colours at most: ink and
  accent); it must survive at 20 px.
- **Motion**: describe the motion grammar in `DIRECTION.md` (what moves, durations 150–250 ms, easing, what never
  moves) and **implement two transitions** in CSS: the palette opening (scrim fade + panel rise) and the side panel
  sliding in; `prefers-reduced-motion` respected.
- **Hierarchy**: one principal thing per surface, secondary things quiet; nothing glued edge to edge; spacing on an
  8 px grid; a type scale with real steps (ratio 1.125–1.2); a workhorse sans with tabular figures (OFL, self-hosted:
  Public Sans or Archivo worked well in round 1; not Inter, not IBM Plex).

## Two screens, both 1440 × 900 fixed

### A. The diagram with its shell: `shell/index.html`

Same data as round 1 (`../data/demo-dc.json`), **canvas neutralised**: draw the 32 devices as plain neutral cards
(a 1-px bordered rounded rectangle, a small generic type icon, the name) at the given positions scaled, and the 61
cables as thin neutral grey lines, selection and diff shown by the shell only (the selected device gets the accent
outline, nothing more). The canvas is scenery; **Orhan judges the chrome**. Regions:

- Floating top bar: logo mark, infrastructure `demo-dc` (a choice), the run (a choice), the view switch with the
  rail, the layer choice L1 / L2 / L3 (L2 and L3 "en cours"), the diff summary as a compact clickable element, search
  (icon + `Ctrl K`), export (icon), user (avatar or initials; `orhan`).
- Floating panel of `dc01-core-01` (identity, MLAG, degraded port-channels 20 and 21, interfaces table, plain words,
  no check codes), adapting its height, scrolling inside.
- Floating run band (three runs, current and compared marked, "comparer avec…" as a choice).
- Floating canvas controls (zoom, fit, grid, minimap toggle, edit entry: icon only).
- States to render as captures: default; `data-state="search"` (palette open over the scrim); a hovered icon with
  its tooltip visible (choose one control and show its tooltip in the default state, or render a `data-state="tip"`).

### B. The home page: `shell/home.html`

The application opens here. The same top bar (without infrastructure / run / layers, since none is open), then a
**modular widget space**: a grid of widgets of two or three sizes on the 8 px grid, each a floating surface with a
title, a body and at most one action. Widgets, with realistic synthetic content (French UI):

1. **Infrastructures** (the main widget): a list of 4 to 6 infrastructures (`demo-dc`, `site-lyon`, `site-nantes`,
   `wan-core`, `lab-sec`…) with device count, last collection date, collection status, and error / warning counts;
   one row leads to the diagram.
2. **Dernières modifications**: who changed what, where, when (e.g. "orhan a déplacé 3 équipements · demo-dc · il y a
   2 h"), 6 to 8 lines.
3. **Dernières collectes**: the latest runs across infrastructures with their status.
4. **Recherche**: the same discreet control, and a line of shortcuts.
5. One empty slot that says a widget can be added (the space is extensible), quiet, not a dashed placeholder cliché.

## Measurement

From the repository root: `cd backend && uv run python ../bac-a-sable/directions/scripts/measure.py shell`, then
`--theme dark`, `--state search`, `--page home.html`, `--page home.html --theme dark`, `--accent b`. Every bar
regular (as round 1), every floating surface ≥ 16 px from the edges and ≥ 12 px from each other, no overlap, all
tooltips in one style, fonts loaded, no external URL. Fix everything flagged and everything you see in one batch,
measure once more, stop.

## Deliverable

`shell/index.html`, `shell/home.html`, `shell/fonts/`, `shell/DIRECTION.md` (60 lines max, English: the direction
in one sentence; ground, ink and the two accents as hex with roles; type and scale; the floating rules and which
surfaces hide when; the tooltip grammar; the icon-vs-word rule as applied; the motion grammar; how dark was
calibrated; honest risk; what the measurement said), the captures and JSON the script wrote. A tiny bench switcher
(theme / accent / state) may sit in a corner of each page, clearly marked as the bench, not the product.

Build fully, inspect once with all captures together, fix in one batch, confirm once, stop. Report in French,
briefly: the direction in one sentence, the two accents and why, three decisions, the measurement result.

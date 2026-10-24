# shell

**In one sentence**: `canon`'s arrangement as floating islands over a white map, with `netzgrafik`'s white / black /
one-accent palette and its thin rail as the single grammar for "current".
## Ground, ink, accents, states
- `#FFFFFF` paper: canvas, every surface. `#F4F5F6` second neutral: home ground, sunken tracks, hover. Hairline
  `#E3E4E7`, control border `#CDD0D4`. Ink `#141414`, ink-2 `#45484D`, ink-3 `#64686E` (5.3:1), disabled `#A4A7AC`.
- **The accent is a browser preference, like the theme** (Réglages, `data-accent`); **cobalt is the default** that
  DESIGN.md will record. Text in the accent uses its `-ink` step; both pass 4.5:1 on paper, ground and hover:
  - **cobalt** `#2150E8` / ink `#1B43C6` (6.2 / 7.9:1), dark `#7193FF` (5.9:1). Hue 225.
  - **encre** (monochrome Swiss): the ink itself, `#141414` on light (18:1), chalk `#EEEFF1` on dark (14.7:1); the
    chrome carries no colour, links keep an underline. The green accent was withdrawn: green is now a state.
- Accent jobs only: the rail, the selection outline, primary action, links, focus ring, the logo's square.
- **States**: active port **green** `#14783C` light (5.6:1 on paper, 4.9:1 on hover), `#4CC47A` dark (7.6:1), hue 143;
  error / down `#D21F26` (hue 357); warning `#9A5B00` / `#E39A1B` (hue 35); everything else grey. Green marks a
  port (or a bundled member) that is up, nowhere else: a successful collection stays quiet. The shell shows the diff
  with an icon and words, no hue: the canvas session picks diff colours outside 225, 143, 357 and 35.
**Type.** Archivo (OFL, variable), one latin woff2 in `fonts/`, tabular figures. Scale 12 / 13.5 / 15 / 17 / 19 (ratio 1.125).
Sentence case, no uppercase, no mono. Canvas card names 11.5 at width 92 % (canvas only).
## Floating rules
Every island is `data-float`: 16 px from the viewport, 12 px from each other (16 on the home grid), hairline, radius
10, two-layer shadow. Controls: height 32, radius 6, gaps 8 (17 across a separator), 8 px grid. Settings popover and
palette are layers above the islands (`data-popover`, `data-modal`), same grammar. **Hide when empty**: panel (no
selection), "comparée" marks (no compared run), run band (single run), minimap (toggle off).
## The panel, three widths
- **Compact** 440: alerts, identity, interfaces (port, state, speed, neighbour) with a line naming the hidden
  columns and the two icons that show them, MLAG, aggregates. Bottom edge fades (48 px mask), table head sticky.
- **Wide** 864 (`panel-wide`): + mode and VLAN (one line), neighbour, description; identity in two columns.
- **Focus** 1408 (`panel-focus`): takes the canvas area, the map fades to 22 %, canvas controls hide; identity on a
  strip, then port and aggregate, state, speed and duplex, media, mode and VLAN (native on a second line), IP, MAC,
  last change, neighbour, description. Widths 128 / 104 / 104 / 104 / 168 / 112 / 128 / 152 / 144 / 232 = 1376.
- **Voisin** = only the neighbour seen by LLDP or CDP (`sources` of the link), empty otherwise. **Description** = the
  raw text in its own column, ink-3 12 px, full text in its title. The vendor reason stays in the state cell's title.
- **Derived, not in demo-dc.json**: VLANs (trunk to access `10, 20, 100-110` native 999; to firewalls `100-110`;
  peer-link all, native 1; unused access ports VLAN 1), MACs (`00:3a:9c:5e:21:` + port index), IPs (two /31 uplinks,
  mgmt0 `10.0.0.11/24` VRF management), last change (`jamais`, 6 days for the two down ports).
## Edit mode
`data-state="edit"` (the pencil toggles it): tool palette on the left (x 16), the panel and the run band hide, the
grid darkens one step, nothing else moves. **Device bar**: hue (swatch + chevron, volet of 12 hues, no violet),
pin, lock | group, align (chevron, volet: left, centre, right, top, middle, bottom, distribute ×2, grid) | hide,
isolate | more; the align volet is rendered open. `data-state="edit-note"`: a maintenance note selected (outline and
four handles); **note bar**: text size (value + chevron, vertical volet 12-32, rendered open) | bold, italic,
underline | alignment, text colour, title position | below, above (rail on the current layer) | lock, duplicate,
delete. **Placement**: a bar sits 12 px above its element, centred on it; its volet 12 px above the bar, under its
trigger; never over the element. If the bar would come within 12 px of the top islands (top < 76 px), it flips 12 px
below the element and its volets open downward.
## Check view (`control.html`, 2026-10-21)
`#mode=control`: the map goes, the page is the home's ground with the diagram's top row kept (logo, context with the
run choice and the changes, views and layers, tools); no run band, no canvas controls, no panel. A grid from y = 80
to 16 px above the bottom edge, 912 / 480 at 1440, 16 px between widgets. **Verdicts** on the left, the whole height:
the total, three severity toggles with their counts (word and count, the rail says on), a filter field; the register
groups the checks by severity then code, one row per code with its sentence, its `Code` chip (codes are allowed in
this view only) and its rule family, its count, a chevron; a row unfolds the things it names, each a link that opens
the Diagram on the element. On the right, stacked: **Coverage of the collection** (a strip of counts, then a table of
the devices in scope with a mark per topic: filled when collected, hollow when absent, amber when partial, red when
unreachable), **Cables and sources** (one row per combination of sources with the canvas's line style, its status in
words and its count), **Delivery** (exporter, contract, received at, devices, findings, normalizations, unparsed
descriptions, unresolved neighbours). Orhan's remark on the mockup: the verdicts table is too dense; the brick gives
its rows the relaxed density (56 px) and folds the rule column under the sentence. The sizing of the widgets (his
request) is at the bench.
## Tooltip, icons, motion
One `.tip`, `[role=tooltip]`: black, white 12 / 500, padding 6 × 8, radius 5, one shadow, optional shortcut in
`#A9ACB1`, dark adds a `#3A3C40` outline; toward the canvas, 350 ms delay. Icons (Lucide, 1.75, 16 px) for every
action, words for choices (infrastructure, run, views, layers, filters, settings values). Ease `cubic-bezier(.16,1,.3,1)`:
palette 200 / 240 ms, panel width 260 ms, map fade 240 ms, popover 200 ms, edit islands rise 4 px in 220 ms, rail
200 ms, tooltip 150 ms. Never moves: the canvas, the islands. Reduced motion: 1 ms. Dark: canvas `#161719`,
surfaces `#1C1D1F`, hairline `#2F3134`, ink `#EEEFF1`, deeper shadows, no glow.
**Honest risk.** Encre makes the selection equal in weight to text. The compact table starts below the fold. Bars over a dense core
cover cables (not devices). The note colour is a fixed yellow until the hue volet owns it.
## Measured
13 runs (repos, panel-wide, panel-focus, edit, edit-note light and dark, search, settings, dark, encre light and
dark, home light and dark). First pass: 0 flags; seen: the note painted over the panel, two blank icons (Lucide
aliases `align-left`, `trash-2`), a three-line hint. One batch; second pass: 0 flags, 75 and 9 tooltips in one style,
Archivo loaded, no external URL, ≥ 16 px to edges, ≥ 12 px between islands.

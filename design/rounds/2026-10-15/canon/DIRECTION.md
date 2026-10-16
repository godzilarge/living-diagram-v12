# canon

**The standard in one sentence**: the arrangement every user of Linear, Figma or draw.io already expects (top bar,
view bar, map, inspector, time band), light, one working blue, executed so that nothing is off by a pixel.

## Palette (light, native)
- `#FFFFFF` canvas: the map, tables' rows, outlined controls.
- `#F6F7F9` chrome: top bar, run band, panel (the cooler second neutral). `#ECEEF1` sunken: segmented-control tracks.
- `#E2E5EA` hairline, `#CDD2D9` control border. Grid dots `#DADEE4` every 24 px.
- Ink `#15181C`, ink-2 `#464D57` (labels, icons), ink-3 `#616974` (secondary text, 4.8:1 on chrome).
- Accent `#1F5FD1` (primary action, selection, current run, focus), weak `#E9F0FC`, ink `#174BA6`.
- States, only where they carry meaning: ok `#1F7A4D`, error `#C23A2B` (unreachable, down link, degraded
  aggregate, error count), changed `#D08A12` with ink `#8A5400` (diff halo, dot, "référence" run, removed cable).
- Cables: `#9AA2AC` at rest, `#3A424C` for the selected device's cables. Status by dash, speed by weight.

## Type
Public Sans (USWDS, SIL OFL 1.1), one variable file, latin, self-hosted, tabular figures on everywhere.
Scale 11 / 12 / 13 / 15 (ratio ~1.1-1.15): 11 canvas labels and tags, 12 tables and meta, 13 body and controls,
15 panel title. Weights 400 / 500 / 600-650. Sentence case, no uppercase, no mono.

## Density and grid
8 px grid. Bars 48 (top, run band) and 40 (view bar); every control 32 high, 6 px radius; segmented tracks 32
with 28 segments; table rows 32; panel 560 wide, sections of 40 px headers. Devices are 24 px icon tiles with
the name beside, stacks as an offset second tile, HA as a light frame, MLAG as the peer-link arcs plus a tag.

## Signature move
None, by brief. The argument is the finish: one control height, one radius, shared centre lines, labels placed
per node so no two names touch, a diff that reads in one colour family.

## Dark theme
The standard inversion: canvas `#16181B`, chrome `#1D2024`, hairline `#2C3036`, ink `#E8EAED` / `#A9B0B9`,
accent lifted to `#5B8DEF` for 4.5:1, state colours lightened one step, cable rest colour `#5A626C`, selected
cables near-white. Same geometry, no glow.

## Honest risk
Indistinguishable from the competition by design; it wins only if every state stays this clean once real, and it
gives the product no face of its own (PRODUCT.md asks for one). The memorized placement is dense around the cores:
at fit zoom the 16 cables of a core still knot; the reading zoom, not the style, will fix that.

## Measured
`measure.py canon`: 11 bars, all controls 32 (segments 28 in their own bars), centres aligned, gaps regular, one
icon size per row, font loaded, no external URL. First pass flagged one row (14 px logo icon among 16 px icons) and
the screenshot showed wrapping and overflow (view bar, run band) and truncated table cells; fixed in one batch.

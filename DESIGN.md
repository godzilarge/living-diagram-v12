---
name: Living Diagram
description: Floating islands over a white map; one accent, one rail for "current"; colour only where it means something.
colors:
  paper: "#FFFFFF"
  canvas: "#FFFFFF"
  grid: "#DCDEE2"
  ground: "#F4F5F6"
  sunken: "#F1F2F3"
  hover: "#EFF0F2"
  line: "#E3E4E7"
  line-2: "#CDD0D4"
  ink: "#141414"
  ink-2: "#45484D"
  ink-3: "#64686E"
  ink-4: "#A4A7AC"
  accent: "#2150E8"
  accent-ink: "#1B43C6"
  accent-weak: "#EBF0FE"
  on-accent: "#FFFFFF"
  accent-ink-option: "#141414"
  accent-ink-option-weak: "#EDEEF0"
  accent-ink-option-on: "#FFFFFF"
  ok: "#14783C"
  error: "#D21F26"
  error-weak: "#FCEDED"
  warning: "#9A5B00"
  warning-mark: "#E39A1B"
  tip-bg: "#000000"
  tip-ink: "#FFFFFF"
  tip-sub: "#A9ACB1"
  tip-line: "transparent"
  scrim: "rgba(244, 245, 246, 0.74)"
  dark-paper: "#1C1D1F"
  dark-ground: "#131415"
  dark-sunken: "#232427"
  dark-hover: "#2A2B2E"
  dark-line: "#2F3134"
  dark-line-2: "#45484C"
  dark-ink: "#EEEFF1"
  dark-ink-2: "#C3C6CB"
  dark-ink-3: "#9A9EA4"
  dark-ink-4: "#62666C"
  dark-accent: "#7193FF"
  dark-accent-ink: "#93AEFF"
  dark-accent-weak: "#222C47"
  dark-on-accent: "#0B1530"
  dark-accent-ink-option: "#EEEFF1"
  dark-accent-ink-option-weak: "#2E3034"
  dark-accent-ink-option-on: "#141414"
  dark-ok: "#4CC47A"
  dark-error: "#F2545B"
  dark-error-weak: "#3A1E20"
  dark-warning: "#E8A33A"
  dark-warning-mark: "#E8A33A"
  dark-tip-line: "#3A3C40"
  dark-canvas: "#161719"
  dark-grid: "#2C2E31"
  dark-scrim: "rgba(10, 10, 11, 0.62)"
typography:
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  subtitle:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.35
  subtitle-strong:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  body-line:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: "20px"
  body-strong:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: "20px"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  tooltip:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  initial:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 650
    lineHeight: 1
rounded:
  control: "6px"
  surface: "10px"
  tooltip: "5px"
  chip: "4px"
  tile: "8px"
  swatch: "3px"
  avatar: "5px"
  mark: "2px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
shadows:
  island: "0 1px 2px rgba(20, 20, 20, 0.05), 0 8px 24px -10px rgba(20, 20, 20, 0.16)"
  layer: "0 2px 6px rgba(20, 20, 20, 0.06), 0 28px 64px -18px rgba(20, 20, 20, 0.30)"
  tooltip: "0 4px 12px -2px rgba(0, 0, 0, 0.22)"
  hollow-mark: "inset 0 0 0 1.5px #A4A7AC"
  dark-island: "0 1px 2px rgba(0, 0, 0, 0.30), 0 10px 28px -10px rgba(0, 0, 0, 0.55)"
  dark-layer: "0 2px 6px rgba(0, 0, 0, 0.35), 0 28px 64px -18px rgba(0, 0, 0, 0.70)"
  dark-tooltip: "0 4px 12px -2px rgba(0, 0, 0, 0.5)"
  dark-hollow-mark: "inset 0 0 0 1.5px #62666C"
motion:
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
  hover: "120ms"
  tooltip: "150ms"
  tooltip-delay: "350ms"
  rail: "200ms"
  popover: "200ms"
  layer: "240ms"
  panel: "260ms"
  edit: "220ms"
components:
  island:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
    padding: "8px"
  control:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  control-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  control-current:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 14px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  tooltip:
    backgroundColor: "{colors.tip-bg}"
    textColor: "{colors.tip-ink}"
    typography: "{typography.tooltip}"
    rounded: "{rounded.tooltip}"
    padding: "6px 8px"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
    width: "440px"
    padding: "16px"
  icon:
    size: "16px"
    strokeWidth: 1.75
  shortcut:
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    height: "20px"
    padding: "0 5px"
  rail:
    backgroundColor: "{colors.accent}"
    height: "2px"
  focus-ring:
    backgroundColor: "{colors.accent}"
    width: "2px"
    offset: "2px"
  table-row:
    height: "44px"
    height-snug: "40px"
    height-relaxed: "56px"
  table-head:
    height: "28px"
    height-widget: "32px"
  widget:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
    header-height: "56px"
    fade: "32px"
    padding: "0 16px 12px"
    typography: "{typography.subtitle-strong}"
  feed-item:
    padding: "10px 0"
  count-slot:
    width: "40px"
  link:
    textColor: "{colors.accent-ink}"
    fontWeight: 500
    underlineColor: "{colors.line-2}"
    underlineOffset: "3px"
  avatar:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    typography: "{typography.initial}"
    rounded: "{rounded.avatar}"
    size: "22px"
  mark:
    rounded: "{rounded.mark}"
    size: "8px"
  code-chip:
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    height: "20px"
    padding: "0 5px"
  source-line:
    width: "16px"
  register:
    target-height: "28px"
    section-height: "48px"
    section-air: "16px"
  tiles:
    gap: "16px"
    row-height: "32px"
    handle-size: "16px"
    edge-size: "8px"
    corner-mark: "7px"
    corner-stroke: "2px"
    corner-inset: "5px"
    corner-rounded: "3px"
  check-view:
    topic-width: "72px"
  grid:
    step: "24px"
    dot: "1px"
  layer-choice:
    width: "36px"
  zoom-word:
    width: "52px"
  run-band:
    compared-gap: "6px"
    dash: "4px"
    dash-gap: "3px"
  facts:
    label-width: "104px"
    label-width-snug: "88px"
    row-gap: "6px"
    column-gap: "12px"
    strip-gap: "32px"
    strip-padding: "12px 16px"
  alerts:
    gap: "12px"
  panel-row:
    leading: "18px"
  palette:
    width: "752px"
    top: "104px"
    input-height: "56px"
    scope-height: "44px"
    body-height: "372px"
    detail-width: "288px"
    row-height: "36px"
    foot-height: "40px"
    rounded: "12px"
    match-weight: 650
    input-icon: "18px"
    row-detail-max: "200px"
  swatch:
    size: "12px"
  edit-palette:
    top: "216px"
  edit-island:
    rise: "4px"
  context-bar:
    gap: "12px"
  volet-list:
    width: "48px"
  menu:
    min-width: "200px"
    max-width: "320px"
  name-form:
    width: "280px"
  facets:
    head-height: "28px"
  feed:
    when-width: "52px"
  journal:
    column: "1280px"
    fade: "32px"
    raw-height: "240px"
    facets: "288px"
    search: "280px"
    search-min: "200px"
---

# Design System: Living Diagram

## Overview

**Creative North Star: "The Swiss network graphic, floating over the map"**

Living Diagram is a map one explores. The diagram is the page; everything else is an **island** that floats over
it, keeps its distance from the edges and from its neighbours, and disappears when it has nothing to show. The
palette is the one of Swiss information design: white paper, deep black ink, **one accent** that does real jobs and
nothing else. Colour is spent only where it means something: an accent for "this is where you are", green for a port
that is up, red for an error, amber for a warning. Everything that is merely present is quiet.

The shell is dense in function and light to the eye: standard controls, icons for actions and words for choices,
one tooltip grammar for the whole application, one way to say "current" (a thin accent rail). The result must read,
with the name covered, as a product of its category and better finished than it; it must never read as a generic
generated interface.

**Scope.** This document governs the **shell**: navigation, islands, panels, search, settings, home page, edit
palette, contextual bars, tooltips. **The canvas (device cards, cables, groups, annotations) is a separate surface,
decided in its own direction round; until then it keeps the v1 drawing, which the owner judges better than any
round-1 proposal.** The approved mockups of the shell are versioned in `design/comps/shell/`.

**Key Characteristics:**
- Floating islands, 16 px from the viewport, 12 px from each other, hairline and soft shadow; hide when empty.
- One accent (cobalt by default; ink as the monochrome option), one rail for "current", colour only for meaning.
- Light by default, dark fully supported; the accent is a browser preference like the theme.
- Icons for actions with a black tooltip; words for choices.
- Archivo, one family, tabular figures, sentence case everywhere.
- Motion that explains, 150–260 ms, one ease; the canvas and the islands never move on their own.

## Colors

White paper, black ink, one accent, and three state colours that mean exactly one thing each.

### Primary
- **Cobalt** (#2150E8, dark #7193FF): the accent. The rail under the current view, layer or run; the selection
  outline on the canvas; the primary button; links; the focus ring; the square of the logo mark. Nothing decorative.
  Text set in the accent uses **accent-ink** (#1B43C6, dark #93AEFF) to hold 4.5:1 on paper, ground and hover.
- **Accent-weak** (#EBF0FE, dark #222C47): the only tinted fill, for the keyboard position in a list (a choice's
  options, the palette's results).
- **Ink as accent** (#141414, dark #EEEFF1): the second accent option, chosen in Réglages. The chrome then carries no
  colour at all; links keep an underline. The accent is a **browser preference** (`ld-prefs`), never an intent and
  never in the address. Any new accent must pass 4.5:1 in both themes and collide with no state colour.

### Neutral
- **Paper** (#FFFFFF, dark #1C1D1F): the canvas and every island, panel and widget.
- **Grid** (#DCDEE2, dark #2C2E31): the dots of the map's grid, 1 px of radius every 24 px **of screen**, fixed under
  the map whatever the zoom (the approved mockup's texture), one step under the hairline so the grid never competes
  with a cable (Orhan, 2026-10-16: the v1 grid was too present). The plan grid (20 units, the one a drag snaps to)
  belongs to edit mode: lines every 20 units in the grid colour (lines read one step darker than the dots; line-2 competed with the cables).
- **Ground** (#F4F5F6, dark #131415): the home page ground, sunken tracks, the segmented control's track.
- **Hover** (#EFF0F2, dark #2A2B2E): a control under the pointer.
- **Line** (#E3E4E7, dark #2F3134): hairlines, island borders, table rules. **Line-2** (#CDD0D4, dark #45484C): the
  border of a field or a chip that must read as a control.
- **Ink** (#141414, dark #EEEFF1): text. **Ink-2** (#45484D, dark #C3C6CB): controls at rest, secondary text.
  **Ink-3** (#64686E, dark #9A9EA4): labels, captions, raw descriptions (5.3:1 minimum). **Ink-4** (#A4A7AC, dark
  #62666C): disabled and decorative only, never for text that must be read.

### State
- **Ok** (#14783C, dark #4CC47A): a port that is up, an aggregate member that is bundled. Nowhere else: a successful
  collection stays neutral.
- **Error** (#D21F26, dark #F2545B): a port down, a device unreachable, an aggregate without members, a failed
  collection, the error count. **Error-weak** (#FCEDED) tints the row behind it when needed.
- **Warning** (#9A5B00 text, #E39A1B mark; dark #E8A33A): a partial collection, a warning count, a stale run.
- Diff (added, removed, changed) is shown in the shell by an icon and words, with no hue. The canvas session will
  pick diff colours away from hues 225 (cobalt), 143 (ok), 357 (error) and 35 (warning).

### Named Rules
**The One Rail Rule.** "Current", "on" and "selected" are said one way: a 2 px accent rail (under a tab, a layer, a
run; around a selected card). Never a filled button, never a tinted background, never a second convention.
**The Meaning Rule.** A colour appears only when it carries a fact (state, selection, error). Decoration is
monochrome.
**The Red Rule.** Red is the error colour of the product and can never be an accent.

## Typography

**Body Font:** Archivo (variable, OFL, self-hosted; fallback system-ui, sans-serif)
**Label/Mono Font:** none. Identifiers, ports and addresses are set in Archivo with tabular figures. Monospace is
reserved for code blocks on the canvas.

**Character:** a neutral grotesk with a generous x-height, exact rather than expressive. One family, five sizes,
ratio 1.125. Sentence case everywhere; no uppercase labels, no tracked-out eyebrows.

### Hierarchy
- **Title** (600, 19 px, 1.25): a page title on the home.
- **Headline** (600, 17 px, 1.3): the name of the selected element in a panel header, a focus-panel section.
- **Subtitle** (500, 15 px, 1.35): a device name on a card, the label of a choice in the top bar. **Subtitle strong**
  (600, 15 px, 20 px line): a widget title and an infrastructure's name on the home.
- **Body** (400, 13.5 px, 1.45): everything one reads: table cells, lists, facts. Tables run denser than prose.
  **Body line** (400, 13.5 px, 20 px line) and **body strong** (600, the same): a line of a feed and its author, the
  title of the free slot, an infrastructure named in a list one reads.
- **Label** (500, 12 px, 1.3): column headers, captions, the secondary line under a fact, keyboard shortcuts.
  **Caption** (400, 12 px, 16 px line): the line under a feed entry, a widget's foot note, the sentence of the free slot.
- **Initial** (650, 11.5 px, 1): the letter of an avatar, nothing else.
- **Tooltip** (500, 12 px, 16 px line): white on black, 28 px high with its padding.

### Named Rules
**The Tabular Rule.** Every number that can align with another is set with tabular figures.

## Layout

The viewport is a map. Islands float over it: a top row of four islands (logo; context: infrastructure, run, diff
summary; views and layers; tools: search, export, settings, user), a panel on the right, canvas controls bottom
left, the run band bottom right, the edit palette on the left in edit mode. Every island keeps **16 px** from the
viewport edge and **12 px** from any other island (16 px between widgets on the home grid); none overlap. Popovers
(settings, the search palette, contextual-bar volets) are layers above the islands and may cover them, never the
element they belong to.

Inside an island: an **8 px grid** (2 px, `space-2xs`, only between a line and its caption; 10 px only above and
below a feed entry, `feed-item`, the mockup's rhythm of a 20 px line and a 16 px caption); controls are 32 px high with 8 px between them and 17 px across a separator;
island padding 8 px for bars, 16 px for panels and widgets; table rows 44 px with a hairline rule (32 in a compact
panel; on the home widgets, a 32 px head, 56 px rows for a list one opens, 40 px for a list one reads).

The panel has **three widths**: compact (440 px: alerts, identity, essential interface columns, MLAG, aggregates),
wide (864 px: adds mode and VLANs, neighbour, description), focus (1408 px, over a faded canvas, every fact of the
contract with sortable headers, a filter and a column chooser). Its height follows its content; it scrolls inside
with a sticky table head and a 48 px fade at the bottom edge.

**Hide when empty:** the panel without a selection, the "compared" marks without a compared run, the run band with
a single run, the minimap when toggled off, the panel and the run band while editing (the minimap then takes the
band's place, bottom right: the palette holds the left).

**The Log view** (brick 7, direction J1 "the feed and its facets", chosen at the bench): the ground covers the map (the
canvas stays mounted underneath, inert, its viewport kept), the top row stays; the panel, the run band, the canvas
controls and the edit palette do not show. Under the top row (80 px from the top, 16 px from the bottom) two islands
form **one reading column, centred, 1280 px at most** (`journal-column`: the Filters island, 288 px, `journal-facets`,
16 px, the Log island): beyond it the ground shows on both sides (Orhan, 2026-10-20: the bench's full-width feed left
600 px of void between a sentence and its time); under 1312 px of window the column takes the width less 16 px on each
side. Each island scrolls inside, its body fading over its last 32 px (`journal-fade`); the day titles stick. In the
DOM the Log island comes first (Tab reaches its search and its feed before the facets), the facets are drawn on the left. The Log's header holds, on one row, the title over its line
(how many, where, the zone of the clocks: the one line of the shell that joins its facts with middle dots, as the
bench page Orhan chose writes it), the period, the search (280 px, giving way down to 200 before the title's line is
cut with an ellipsis), the export and the help. A group or an annotation the sentence cites
by its name is set in quotes ("modified the table « Core addressing »"); a device or a connector is not.

**The Check view** (brick 7a, then the tiles of 2026-10-24): the ground covers the map (the canvas is unmounted), the
top row stays; under it the space of the tiles scrolls inside (the top row never moves), the one surface of the
shell that scrolls as a page does. See Check view.

Responsive: the shell is built for 1280 to 2560 px wide; below 1200 px the context island collapses to the
infrastructure and the run, and the panel docks to the full height of the right edge. Phone and tablet are not
targeted.

## Elevation & Depth

A hybrid: islands sit on the map with a hairline border and a two-layer soft shadow with offset and blur; popovers
and the search palette rise one step higher; nothing glows, nothing is glass. In dark mode shadows deepen; borders
do the work of separating surfaces.

### Shadow Vocabulary
- **Island** (`box-shadow: 0 1px 2px rgba(20,20,20,.05), 0 8px 24px -10px rgba(20,20,20,.16)`; dark
  `0 1px 2px rgba(0,0,0,.30), 0 10px 28px -10px rgba(0,0,0,.55)`): every floating surface at rest.
- **Layer** (`box-shadow: 0 2px 6px rgba(20,20,20,.06), 0 28px 64px -18px rgba(20,20,20,.30)`; dark
  `0 2px 6px rgba(0,0,0,.35), 0 28px 64px -18px rgba(0,0,0,.70)`): the search palette and the focus panel only.
  Popovers (settings, lists, the volets of a contextual bar) keep the island shadow: they are islands that happen
  to float higher.
- **Tooltip** (`box-shadow: 0 4px 12px -2px rgba(0,0,0,.22)`; dark `.5`).
- **Scrim** (`rgba(244,245,246,.74)`; dark `rgba(10,10,11,.62)`): behind the palette and the focus panel.

### Named Rules
**The No-Glow Rule.** No zero-offset halo, no backdrop blur, no gradient. Depth is an offset shadow or nothing.

## Shapes

Rectangles with small, consistent radii: **6 px** for controls, fields and chips; **10 px** for islands, panels,
widgets and popovers; **5 px** for tooltips. Swatches (`Swatch`, one primitive: the accents in Réglages, the hues of edit mode) are 12 px squares with a 3 px
radius; the type tile of a panel header is 40 px with an 8 px radius; the avatar is
a 22 px square with a 5 px radius; a state mark is an 8 px square with a 2 px radius.
Nothing is pill-shaped; nothing is a circle except a state dot (8 px) and a canvas
handle. Borders are 1 px hairlines; the selection outline is 2 px in the accent.

## Components

### Buttons
- **Shape:** control radius (6 px), 32 px high.
- **Icon button:** 32 × 32, icon 16 px at 1.75 stroke (Lucide), ink-2 at rest, ink on hover with the hover fill;
  always a tooltip; `aria-pressed` when it toggles.
- **Primary:** accent fill, on-accent text, 0 14px padding; one per surface at most (export, "Ouvrir la fiche").
- **Hover / Focus:** hover fill 120 ms; focus ring 2 px accent, offset 2 px, on keyboard focus only.
- **Current / on:** the 2 px accent rail (under the word of a tab, a layer, a run, a scope; left of a vertical tool),
  ink text at 600 for a word (a layer, a scope, a setting); no fill. One definition, in the primitive. **One height
  in a bar:** every rail sits at the foot of a 32 px control, a tab's included (Orhan, 2026-10-20, chosen on a plate
  against the mockup's tab, whose rail sat on the island's hairline, 8 px under the layers' rail).
- **Disabled:** ink-4, no hover, cursor default; a tooltip still says why (L2, L3: "en cours").
- **Danger:** error text on hover, no fill (the error red on the dark hover fill would fall under 4.5:1).
- **Outlined icon button:** the icon button with a line-2 border on paper, for a control alone on an empty surface (the
  free slot's "+").

### Toast
- **Style:** an island at the bottom centre, 12 px above the run band's line, body text with a state mark on the
  left, one action and a close icon on the right; hides itself after 6 s unless hovered; one at a time.

### Chips and counts
- **Count** (e.g. "Contrôle 6"): a label-size number in the state colour next to its word, no pill.
  A column of counts gives each a 40 px slot (`count-slot`), right-aligned, so they align from row to row. A count and
  a state mark's words take the same state colours (one definition).
- **State mark:** an 8 px square (2 px radius) in the state colour (grey when neutral, the warning *mark* colour for
  amber), alone (a toast) or 8 px before its words, which take the state colour ("Failed", "6"); the one way to show a
  state in the shell.
- **Shortcut** (`Ctrl K`, `E`): label size, ink-3, a 1 px line-2 border, 4 px radius, 20 px high.
- **Zero:** a count at zero in a column of counts (a strip's fact, a table's count) is ink-4 and decorative; the value
  is still said to assistive technologies by a hidden copy (`Zero`). A filter's segment at zero stays a choice.
- **Hollow mark** (`Mark` `off`): the 8 px square drawn as a 1.5 px ink-4 outline inside it (an inset shadow,
  `shadows.hollow-mark`: a 1.5 px border rounds to 1 px at a pixel ratio of 1), no fill: "nothing was asked" (a
  topic the collection did not request, Check's coverage). Decorative like every mark; the cell says its word to
  assistive technologies (`said`).
- **Code** (`aggregate_below_min_links`): the identifier of a check, from the approved Check mockup's `.code`: label
  size (12 px) at 500 in ink-3, tabular figures, a 1 px line-2 border, the chip radius (4 px), 20 px high, 0 5 px
  inside; never translated, never cut. **Reserved to the Check view**: the Diagram view, its panel, its search
  palette never show one (the Alerts rule); Check is where an engineer reads the codes next to their sentence.
- **Source line** (`SourceLine`): the canvas's stroke of a cable, as a 16 px marker 8 px before its words, from the
  approved Check mockup's `.src`: **solid** in ink-2 (observed and documented: confirmed), **dotted** in ink-3
  (documented only), **dashed** in ink-3 (observed only). Decorative like a mark; the words say the sources.

### Islands, panels, widgets
- **Corner Style:** 10 px.
- **Background:** paper.
- **Shadow Strategy:** island shadow, popovers included (they are islands that float higher); the layer shadow for the search palette only.
- **Border:** 1 px line.
- **Internal Padding:** 8 px (bars), 16 px (panels, widgets).
- **Column** (the edit palette): a bar stood up, 48 px wide, its controls 4 px apart and 17 px across a horizontal
  hairline (20 px wide, 4 px above and below it: the approved mockup's `.hsep`); 8 px padding, the hairline included.
- **Header:** the element's name at headline size (17 px, 600) with a 12 px subtitle in ink-3; icon buttons on
  the right; a 1 px rule below. Title size (19 px) is for the home page only.
- **Widget header** (the home, from the approved mockup, which wins over the 17 px above): 56 px high, the title at
  15 px / 600 / 20 px, an optional count in ink-3 12 px (always the total, whatever a filter shows), icon buttons on
  the right (measured as a bar: 32 px, centred, 8 px apart); no rule below. A segmented filter may sit right of the
  title, before the actions, each segment with its count (neutral, ink-4 at zero; a segment at zero stays a choice
  and the body then says in ink-3 that nothing matches). A widget with a choice of its own (how many rows) carries a
  settings icon button (`SlidersHorizontal`) last in its header, opening a popover of rail buttons like the settings
  popover, under the header and aligned on the widget's edge; the value is a browser preference (`ld-prefs`). A
  table's headers may sort it (a missing value last); sort and filter are transient. The body is padded 0 16 12 and
  scrolls inside, its table head (32 px) sticking; while more lies below, its last 32 px fade out (the approved Check
  mockup's `.w-body`; the panel's fade, shorter). An optional foot note in caption ink-3 says what the body could
  not show (archive entries unreadable). A widget grows to fill its column of
  the home grid; **the home grid never scrolls** (its height is the window's less 96 px): Infrastructures takes its
  content's height up to 60 % of its column, Latest collections the rest.
- **Widget band** (Check's coverage): a strip of facts (`Facts` `strip`) between the header and the body, under its
  own hairline, which does not scroll with the body.
- **Widget toggles** (Check's verdicts): a row of independent toggles may follow the count, on the left of the header
  (the approved Check mockup's `.seg`): each a word with its count in the state colour (a `Button` `pressed` with
  `count`, 6 px between the word and the number, the view tabs' rhythm), 4 px apart, the rail under each one that is
  on; they show or hide part of the body, they are not a choice among several (never a `Segmented`). Transient.
- **Widget caption** in place of the count: a short date in the same ink-3 12 px (Livraison's day).
- **Widget handle** (Check's tiles): the header is the handle that moves the widget (`handle`): `cursor: grab`
  (grabbing during the move), no text selection; its controls (buttons, fields, toggles) keep their own gesture.
- **Enlarge** (Check): the last icon button of a tile's header is "Agrandir" (`Maximize2`); enlarged, the widget
  covers the whole space of the view (16 px from the sides, 80 px from the top, 16 px from the bottom) over the
  scrim, with the layer shadow, its body scrolling inside; the button becomes "Réduire" (`Minimize2`), Escape
  reduces too; it travels from its place in 240 ms (`motion.layer`). Transient: neither stored nor in the address.
  The grid's gestures are off while a widget is enlarged, and the other tiles are inert (Tab never reaches what the
  enlarged widget covers).
- **Free slot:** not an island; a line-2 frame with the surface radius on the ground, no fill, no shadow, holding the
  outlined "+", a 13.5 px / 600 title and a 12 px ink-3 sentence.

### Register
The verdicts of Check, **grouped by rule** (Orhan, 2026-10-24, chosen at the bench among five structures,
`design/rounds/2026-10-24-grille/`, V3: "the data lacks structure between the elements"; the grouping by severity
scattered one subject, the number was said twice, the second line mixed an identifier and a category): a table on
the widget's paper, its 32 px head sticking (columns **severity mark | verdict | code | chevron**; the mark and the
chevron said, not shown).
- **Section:** one per rule family, in the order of the rules: Cables (R3), Aggregates, MLAG and HA (R4), States
  (R5), Neighbours (R0), Remote ports (R1), Descriptions (R2), Input contract, then Another rule; its heading is a
  section title: the family's words in body strong (13.5 px, 600) in ink, its count of checks 8 px after in label
  size ink-3, on a 48 px row (`register.section-height`: 16 px of air above a 32 px line, `register.section-air`),
  the hairline below; never hovered. A section without a row (every row hidden by the severity toggles or the
  filter) leaves with its heading.
- **Row:** 44 px (`table-row.height`), one line: the state mark of its severity 8 px from the row's start and 12 px
  before the sentence (error, the warning mark, grey for a note); the sentence in body size at 400, **its number
  inside it** (the catalogue's sentence, tabular figures; no count column: the number is said once); then, in its own
  column before the chevron, the `Code` chip, the column **left-aligned** so the chips start on one line (the bench's
  V3; eight ragged left edges were what "nothing aligns" meant); the chevron (`ChevronRight`, ink-3, `fit`) last. Inside
  a section the rows go most severe first, then by count (descending), then code. The whole row opens and closes (a
  click, Enter or Space when it has the focus; `aria-expanded`, `aria-controls`); the hover fill as every clickable
  row.
- **Open:** the chevron turns 90° (the hover motion), the row loses its hairline and its hover fill (the row and its
  detail are one thing), and a detail row without a fixed height follows, its content aligned on the sentence
  (8 + 8 + 12 px in), 12 px of paper below the last target, then the hairline.
- **Targets** (the detail of a verdict): a list of 28 px lines, 2 px apart, each the icon of its kind in ink-3 (a
  device's type, a port, an aggregate, a cable, an HA cluster) 8 px before an inline `Link` to the element in the
  Diagram view ("dc01-core-01 · port-channel101": the middle dot belongs to the datum, a port of a device, never a
  joiner of metadata); a target the run cannot select stays as words in ink-2.
- **Nothing matches:** a sentence in ink-3 in place of the table.
- **Narrow** (a tile under 640 px): the code column gives way to the detail (the chip shows once the row is open),
  the sentence may wrap on two lines, the row growing with it.

### Link
- **Style:** the only `<a>` of the application, a real address (Ctrl+click, middle click and the status bar work).
  **Inline** (the mockup's `lnk`): accent-ink at 500, no underline under the cobalt accent; under the ink accent it
  loses its hue and keeps a line-2 underline 3 px below. **Quiet**: the ink of its context, no underline, for a name
  that opens its row (an infrastructure on the home) and for the logo; the row's hover says it opens.
- **Focus:** the focus ring, 2 px accent, offset 2 px, on keyboard focus only.
- **In a table:** the row stays clickable and follows the same address; Tab reaches the link, never the row.

### Inputs / Fields
- **Style:** paper fill, 1 px line-2 border, 6 px radius, 32 px high, body text, placeholder ink-3.
- **Focus:** border becomes the accent, plus the focus ring.
- **Contrast:** hairline borders are decorative; the fill, the placeholder and the focus ring carry the affordance
  (the line-2 border is 1.55:1 on paper, the chosen segment 1.09:1 on its track: accepted, from the approved
  mockup; text, placeholder and focus ring hold 4.5:1 / 3:1).
- **Fluid:** a field in a row that may lack room (Check's filter in a widget header) is 200 px and gives way down to
  64 px before the row could overflow its surface.
- **Search:** a discreet icon button with the `Ctrl K` shortcut chip in the tools island; it opens the palette.
- **Segmented choice:** a ground track, 6 px radius, the chosen segment on paper with the island shadow (a filter
  over a list, a count after each word when it filters a list); the current segment never uses the accent fill. A
  segment may **open a popover** instead of choosing at once (the Log's range: two dates, then Apply): it is a button
  of the group (`aria-pressed` when its value is the chosen one; `aria-expanded`, which a radio cannot carry), the
  arrows reach it without choosing it, Enter or a click opens it, its popover opens under the island's header,
  aligned on the island's edge; chosen, the segment says its value ("1 Sept – 15 Sept"). The settings (theme, accent, language) are rail
  buttons, as in the approved mockup, with a 12 px swatch before each accent.

### Facets
What narrows a list one reads (the Log's filters), as sections of 32 px rows in an island 288 px wide, padded 0 8 12;
a hairline between sections, 12 px above a section and 8 px under it. A section's title is a label in ink-3 on a 28 px
row (8 px inside), with, on its right, a **clear** word in accent-ink at 500 when something in it is on (a text button,
said "clear the filter Category"). A row is a word in ink-2, 8 px inside, the hover fill under the pointer; an optional
icon (16 px, ink-3) or Avatar before the word; on its right the count in label size, tabular, ink-3, in the
`count-slot` (40 px, right-aligned), **ink-4 at zero** (a zero stays a choice); the count is decorative, the row's
accessible name says it. An optional note after the word in label ink-3 ("open": the infrastructure of the Diagram).
- **Exclusive** (one value: the infrastructure): a `radiogroup`, one tab stop, ↑ ↓ (and ← →, Home, End) move to the
  neighbour and choose it; the chosen row carries a **2 px accent rail on its left edge**, 16 px high, its word in ink
  at 600 (the One Rail, stood up as the edit palette's).
- **Cumulative** (any number: categories, actions, authors): toggles (`aria-pressed`), each with the 16 px slot of the
  Checklist before its icon, the accent check (stroke 2) when on, nothing when off; on, the word in ink at 600. One
  grammar with the Checklist; never a rail (on is not current), never a pill, never an accent fill.
A facet's values never move: the server gives them in a fixed order; a value of the address unknown to the page stays,
at zero, removable.

### Feed
Who did what, when, as a list one reads (the home's Latest modifications, the Log): a row is the Avatar (22 px) | the
sentence on a 20 px line (body; the author at 600) with an optional caption under it (caption, ink-3, 2 px below) |
on the right, the time (caption, ink-3, on the sentence's 20 px line) and an optional second line under it (caption,
ink-3: the revision, an identifier one reads, so never ink-4, which the bench had); 12 px between the columns, **10 px above and below** (`feed-item`), a hairline between two rows.
Tones: **neutral**; **quiet** (the sentence in ink-3, the author in ink-2: positions, most of a log, recede);
**destroy** (the verb, a span the sentence sets, in the error colour: a deletion stands out). Inline after the
sentence, 8 px away: a **tally** (the same gesture repeated: "×8" and its span "from 14:58 to 15:02" in a 20 px chip,
the Shortcut's line-2 border and radius, label size ink-3) or a **note** (caption ink-3: "312 requests since 08:41", a
cited object that is gone). A search's match inside a row is set at 650, as the palette's.
- **Days:** a day title (label, ink-3, 12 px above, 4 px below) sticks at the top of the scrolling body on paper.
- **Inert** (the home): the row is text. **Unfolds** (the Log): the row's head is one button (`aria-expanded`), 8 px
  wider than the text on each side so its hover fill (ground) and the focus ring breathe; the detail opens under the
  sentence's column. The list is one tab stop (the active row), ↑ ↓ Home End move between rows; the row a link
  points at takes the accent-weak fill (the keyboard position in a list).
- A flat list (no day) starts flush with its widget's header (no padding above its first row).

### Checklist
What is shown or kept (the columns of the focus table; later what an export shows): a column of 32 px rows, each a
word with a 16 px slot before it, a check mark in the accent (stroke 2) when the item is on, nothing when it is off,
the word then in ink-3. Never a rail: an item is on or off, not "current" (Orhan, 2026-10-16, chosen at the bench
among four directions); never a pill. Each row is a checkbox the keyboard reaches; the list is a named group, in a
popover under the control that opens it.

### Navigation
- **View switch** (Diagramme / Contrôle / Journal): body-size words (13.5 px) at 500, ink-2; the current one in
  ink at 600 with the 2 px accent rail at the foot of the word, level with the layers' rail; counts next to Contrôle
  in the state colour.
- **Layer choice** (L1 / L2 / L3): the same rail; L2 and L3 disabled with a tooltip, no extra text.
- **Context choices** (infrastructure, run): a word with a chevron, opens a list. A choice may carry fixed words
  instead of its value ("Compare with…") and a busy state while what it lists is read (the run choice while a
  collection opens).
- **Run band:** the runs as words on a line, the current one with the rail, the compared one with a dotted grey
  rail and the word "comparée"; "Comparer avec…" as a choice.
- **Canvas controls:** zoom out, zoom level as a word (52 px, a click goes back to 100 %), zoom in | fit, grid
  (toggle), minimap (toggle) | edit (toggle). The minimap, when shown, is an island above the canvas controls: paper,
  hairline, the island shadow, 16 px from the left edge, 12 px above the controls; in edit mode it moves to the run
  band's place, 16 px from the right edge and the bottom, clear of the palette's foot.
- **Layer choice** words are 36 px wide at 600; the compared run of the band carries its small word 6 px after its
  date, its rail dashed 4 px on, 3 px off, in ink-3.
- **Edit palette** (edit mode): a column island at x = 16, 216 px from the top (the approved mockup's `.edit-tools`),
  twelve icon tools in five groups (select | declare a cable, connector | note, shape, table, image, code block | group
  | hidden devices, undo, redo), each with its key in its tooltip, to the right. The current tool carries the rail under its icon, as every control
  does (the approved mockup; one rail): select when no tool is armed, the connector while it is. The insertion tools
  insert at the centre of the view; shape opens a menu (rectangle, ellipse) hung 12 px to its right; image opens the
  file picker; a tool that cannot act yet is disabled with its reason (declare a cable: in progress; group: a device
  of the run selected). Its foot, past one more hairline: hidden devices (`EyeOff`), undo (`Undo2`, `Ctrl Z`), redo
  (`Redo2`, `Ctrl Y`). Hidden devices opens a menu hung 12 px to its right, as shape does: a heading, one row per
  rule of the view, in the address's order, the isolation last, then a hairline and "show all". A row says the
  gesture that wrote it, its data as written, with the small cross of a hiding lifted on its right (Menu): an exact
  rule (H on a selection) its names (up to three, else the first two "and N others"), an expression (from the search, or by hand) itself and its count in the run ("ADMIN · 50
  devices", "· no device" when it keeps none out), the isolation "Isolated: core · 12 hidden". A row chosen lifts its
  rule as a whole (one gesture, undone in one: fifty devices come back together) and closes the menu. Its tooltip
  carries the count of devices hidden ("Hidden devices (3)", a device two rules keep out counted once), never a
  badge on the icon. A hiding is a view rule (the address), not an intention:
  the contextual bar hides, this menu is the one place of the shell that shows again. When the run has unknown
  neighbours (devices announced by LLDP / CDP, never collected), a second section follows the rules: the heading
  "Unknown neighbours" and one gesture row, without a cross, "Show the N unknown neighbours" while the view leaves
  them out, "Hide the N unknown neighbours" once drawn; they are a view rule too (`stubs=1` in the address), which
  "show all" leaves alone (it lifts the rules only, and is left out with its heading when there is none); read mode,
  without the palette, has the same row as a Ctrl+K action. Each of the three is disabled with its
  reason when it has nothing to act on (nothing hidden nor unknown, nothing to undo, nothing to redo). ↑ ↓ walk the tools (one
  tab stop). It rises 4 px in 220 ms as edit mode opens.
- **User button:** the declared author's initial (the `User` icon without a name) opens the name popover: a caption
  ink-3 sentence saying what the name is for, the field (80 characters) and the primary "Save" on one row (Enter
  saves too), and under them, in caption ink-3, whether changes are written. 280 px wide. Accounts will take its place
  without moving it (PRODUCT.md).

### Tooltip
- **Style:** black fill, white 12 px 500 text, 6 × 8 px padding, 5 px radius, tooltip shadow; a shortcut after the
  words in tip-sub; in dark a 1 px #3A3C40 outline.
- **Placement:** below the control, centred, 8 px away; toward the canvas side when against an edge; 350 ms delay,
  150 ms fade; `[role="tooltip"]`, one class for the whole application, nothing else may render a tooltip.

### Search palette
- **Style:** a layer **752 px** wide (the approved mockup's `.palette`; 720 was a rounding), 104 px from the top of the
  viewport, centred, 12 px radius, the layer shadow, over the scrim, which covers the map **and** the islands (the
  mockup's `.scrim` sits above every island; the focus panel's scrim fades the map alone). Four bands under
  a hairline each: the input row (56 px: the search icon at 18 px in ink-3, a field without border at headline size
  and label weight (17 px, 500) with the accent caret, the `Échap` shortcut chip on the right); the scope row (44 px:
  the tab strip by kind, Tout, Équipements, Ports, Groupes, Notes, Infrastructures, Actions, the first word 20 px from
  the edge, each with its count at the tab's size, 500, in ink-3, quieter than the state counts of the views, the
  rail under the current one); the body (372 px: the list on the left, scrolling inside, the detail column of 288 px on the right
  behind a hairline); the foot (40 px on ground: the shortcuts, each a chip and its word in caption ink-3, the total
  on the right).
- **Rows:** a group heading in label size ink-3 with its count on the right (12 px above, 4 px below); result rows
  36 px high, the option row of a list (one definition with a choice's options: **the keyboard position in a list is
  the accent-weak row, its icon in accent-ink; the pointer gives the hover fill; a choice's chosen value carries the
  check**), an icon in ink-3 for the kind, the name with the matched part at 650, the detail in label size ink-3 on
  the right (200 px at most); the current row's detail replaced by the Enter chip; no rail: the current row is a
  position, not a view. A group shows a window (8 rows in Tout, 100 in its own tab); a cut group ends with a row
  "… and N more" in ink-3, which the arrows reach and Enter opens by a page of 100.
- **Detail column:** the kind tile (40 px) and the name at headline size (17 px, 600) with its kind words in caption
  ink-3; facts at label size on an 88 px label column; one alert in words (Alerts, snug: label size, the sentence in
  ink, the mark in the state colour); a sub-heading at label size 600; the primary button "Ouvrir la fiche" and the
  outlined "Centrer la vue" icon at the bottom. A "more" row has no detail.
- **Keys:** Ctrl+K opens (the tools island's button too, which takes the hover fill while the palette is open; an
  open list or popover closes first), ↑ ↓ walk every group, Enter opens, **Shift+Enter centres the view on the
  result**, Tab and Shift+Tab change the scope, Escape closes (the text stays for the next opening) and gives the
  focus back to the button without its tooltip; the palette takes the keys before the page. The foot says four of
  them, 8 px between a chip and its word; a hidden live region says the total or the message after each keystroke.
- **Motion:** scrim fade 200 ms, panel rises 8 px in 240 ms; closes immediately.

### Contextual bars
- **Device bar:** hue (swatch + chevron, a volet of 12 hues, no violet), pin, lock | group, align (chevron, volet:
  left, centre, right, top, middle, bottom, distribute ×2, grid) | hide, isolate | more.
- **Note bar:** text size (value + chevron, a vertical volet) | bold, italic, underline | alignment, hue, text (a
  menu of three choices: colour in ink or in the hue, font, vertical alignment), label position | below, above (rail
  on the current layer) | lock, duplicate, delete.
- **The same grammar for every element** (from the v1's functions): shape (hue, fill, border, corners | label |
  below, above | lock, duplicate, delete), table, image, code block (hue | language, font, colours, line numbers, fit,
  size | layers | lock, duplicate, delete), connector, group, and a multiple selection; a function not ready yet is
  there, disabled, its reason in its tooltip ("in progress").
- **Buttons:** icon buttons with their tooltip **on the side away from the element** (above the bar when it sits
  above); a choice that opens a volet is an **opener**: its face (a 12 px swatch, a value at 600 such as the text
  size, or an icon) then the chevron, 2 px apart, 8 px before and 4 px after; open, it takes the hover fill (the
  approved mockup's `.opener`; one rule for every opener of the shell, the search button and the shape tool included,
  `[data-opener]`), never the rail, which says "current"; the "more" ellipsis opens its menu without a chevron. Every
  button with a key carries it as `aria-keyshortcuts`. "Current" (bold on, the layer a
  note sits on, a pin) is the rail.
- **Volets:** a popover hung from its trigger, 12 px from the bar, its first control lined up under the trigger, the
  island shadow; it flips with the bar and when it lacks room. Hues: a bar of the canvas's twelve swatches (its own
  palette, violet included: the canvas's decision), the posed one on the rail, then "type default" when the element
  can go back to it. A list of values (text sizes, fill, border, route…): a column of words, 48 px wide at least, 4 px
  apart, the current one on the rail. Align and distribute: a bar of icons (six aligns | two distributes | snap to a
  grid, from three elements). Choices that are words (more, group, the code block's language and font): a Menu. A
  choice closes the volet.
- **Keys and gestures:** the bar is a toolbar (← → walk its buttons, one tab stop; Escape gives the focus back to the
  map and keeps the selection); it hides during a gesture on the canvas (drag, rectangle, resize) and comes back
  120 ms after; it rises 4 px in 220 ms when it comes. No bar for a cable, a cluster, nothing selected, or while a
  tool is armed: those come from the data or belong to the tool.
- **Placement:** 12 px above the element, centred; a volet 12 px above the bar under its trigger; never over the
  element; flips below the element when it would come within 12 px of the top islands. It stays in the zone the
  shell leaves free (right of the palette, under the top row, above the canvas controls, 16 px from the right edge);
  an element outside it has no bar until the view brings it back.

### Menu
- **Style:** a vertical list of word rows (the right click's context menu, a bar's "more" and "group" volets, the
  code block's languages and fonts, the shape tool): each row is the option row of a list, one definition with a
  choice's options and the palette's results: 32 px, body text, 8 px inside; the hover fill under the pointer, the
  keyboard position on accent-weak. A row may carry a shortcut chip on the right, or the check in accent-ink for the
  chosen value of a choice (a `menuitemradio`). A row that deletes turns to the error text on hover and at the
  keyboard position, without a fill (one definition with the danger control). A row that removes what it names (a
  hiding lifted) carries a small cross on its right, ink-3, ink under the pointer and at the keyboard position, never
  red: lifting a hiding is not a deletion. A hairline separates groups (4 px above
  and below it); a heading in label size ink-3 names the rows under it. 200 px wide at least, 320 px at most (a longer
  row ends in an ellipsis, its words whole in its accessible name); 2 px between rows. Rows
  are in sentence case, except a row that names a datum (a hostname): its words as the data writes them.
- **Surface:** in a popover it takes the popover's paper with 4 px around its rows (a choice's list); alone (the
  context menu) the same surface of its own, at the click point, kept 8 px inside the viewport.
- **Context menu:** it opens in reading too (its reading rows: centre, hide, isolate, copy the name, members), the
  editing rows in edit mode only; for a device, a group, an annotation or a connector its first row is **History**
  (the Log on that object), then a hairline.
- **Keys:** ↑ ↓ walk the rows (they wrap), Home and End go to the ends, a letter goes to the next row it starts, Enter
  and Space choose; Escape is its holder's (the popover closes, the context menu closes and gives the focus back to
  the map). The context menu puts the focus on its first row; in a volet the menu takes the focus and the arrows
  start from the top. A press outside, the wheel or a resize close the context menu.

### Facts
A list of labels and values, from the approved mockup (`.facts`, `.strip`): the label in ink-3 on a 104 px column,
the value in body text (a long one breaks on a second line, never cut), 6 px between rows and 12 px between the
columns; the compact panel reads it in one column, the wide panel in two; **snug** (the search palette's detail
column), the facts at label size on an 88 px label column. As a **strip** (the focus panel, under its header): the facts side by side, 32 px apart, a 12 px
label over its value, padded 12 × 16 with a hairline below. A value is text, a Mark with its words, or a Link; a
fact without a value is left out, never shown blank. The only way to lay out facts in the shell.

### Alerts
What is to be checked on the selected element, in words, from the approved mockup (`.alerts`): a list, 12 px between
lines, each starting with the state mark of its severity (error, the warning mark, grey for a note) 12 px before its
sentence; a line with a detail sets its sentence in body strong and the detail under it in label size, ink-3. The
sentences come from the catalogue, one per check code; the detail names the ports, aggregates or devices concerned.
**Snug** (the search palette's detail column): label size, the mark on the first line.
**Never a check code** (the Diagram view's rule); the verdicts with their codes live in Contrôle.

### Panel rows
The interface table of the panel: 32 px rows in compact and wide (the Table's `compact` density, port names at 500);
44 px rows in focus, where a cell may carry a second line in label size, ink-3, on an 18 px leading (duplex under the
speed, the native VLAN under the trunk, the aggregate under the port with its member mark, else the port's type,
parent, context and roles; the vendor reason under the state); the raw description in ink-3 label size, cut with an
ellipsis in compact and wide. In focus the table takes the width its facts need and **slides to the right** inside
the panel: no fact is cut or broken, every row stays 44 px, the port column stays in place while the rest slides and
the head while the rows scroll (Orhan, 2026-10-16: the table is what people consult most). The columns follow the
width: port, state, speed and neighbour in compact; mode and VLANs and the description in wide; everything in focus
(media, addresses, MAC, last change too), with a column chooser. A line above the table says what the hidden
columns are and which icon shows them.

### Check view
The page of `#mode=control`: **a free grid of tiles on the ground** (Orhan, 2026-10-24, chosen at the bench
`design/rounds/2026-10-24-grille/`, direction G3 "free, the page scrolls", after G1 bounded and G2 compacted: "a
grid, or a canvas, on which I can resize the tiles, something personal to each taste"); the map gives way (no canvas,
no canvas controls, no run band, no panel) and the top row stays the diagram's (logo, context with the collection
choice and the changes, views and layers, tools). The four widgets keep their content (the approved mockup
`design/comps/shell/control.html`, direction A): Verdicts, Collection coverage, Cables and sources, Delivery. Read-only.
- **Grid** (`Tiles`): the space under the top row (from y = 80, 16 px from the sides) holds **12 columns** of equal
  width with **16 px gutters** (`tiles.gap`) and **rows of 32 px** (`tiles.row-height`; 48 px with the gutter); it has
  no bottom edge: the space scrolls under the top row when the tiles go below the window (the grid grows while a
  tile is dragged or stretched past its last row, so there is always room to drop; nothing is added under the lowest
  tile at rest). The window's width decides the column; the rows stay in pixels (a 13-inch screen shows the same
  layout and scrolls more).
- **Default layout** (the mockup's): Verdicts columns 0–7, rows 0–16 (800 px); Coverage columns 8–11, rows 0–4;
  Cables and sources rows 5–10; Delivery rows 11–16. Minimum **3 columns × 3 rows** for any tile.
- **Move:** by the widget's header (`handle`); the tile follows the pointer with the layer shadow, nothing else moves,
  nothing animates during the gesture; the **place it would take** is a frame on the ground, 1 px line-2 dashed with
  the surface radius (the placeholder), which turns **solid error red** where the drop would be refused. On release
  the tile travels to its cells in 240 ms (`motion.layer`, the ease; 1 ms under reduced motion), or back to its place
  when refused. **Never an overlap, never a compaction**: a drop on occupied cells snaps back; the other tiles are
  never pushed.
- **Resize:** eight handles shown while the pointer is over the tile (the hover motion), hidden during a drag: the
  four corners, 16 px squares (`tiles.handle-size`) marked by a 7 px L (`tiles.corner-mark`) with straight legs, a
  2 px stroke (`tiles.corner-stroke`), its outer corner rounded 3 px (`tiles.corner-rounded`), set 5 px inside the
  tile's corner (`tiles.corner-inset`), ink-3, ink under the pointer; and the four edges, 8 px strips astride the
  hairline (`tiles.edge-size`) with the resize cursor and no mark. A resize stops at a neighbour or at the sides: its height gives way first, then its width;
  a pull on a side changes one dimension only.
- **Commands** (the search palette's Actions in Check): **"Resserrer les tuiles"** moves every tile up as far as it
  goes, in reading order, without overlap (gaps close once, on demand, never on their own); **"Réinitialiser la
  disposition"** returns to the default layout.
- **Preference:** the layout is a **browser preference** (`ld-prefs.checkTiles`: for each tile its column, row,
  width and height in cells), never an intent, never in the address, never shared; an unreadable or incomplete value
  gives the default for what is missing. Written on every release of a gesture.
- **Width:** a tile adapts to the width of its cells (a container query on the tile, never on the window): under
  640 px the Verdicts header wraps (the toggles on a second line, their words starting where the title starts: the
  button's 10 px of padding compensated, the filter giving way as `fluid` says) and the register's code column gives
  way to the detail; from 641 px the coverage's topic columns take 72 px (`check-view.topic-width`).
- **Enlarge:** every tile's header ends with "Agrandir" (Widget, Enlarge). The three "in progress" buttons of the
  mockup are gone.
- **Verdicts:** the header holds the title, the total of checks (always the total), the three **severity toggles**
  (Errors, Warnings, Notes, each with its count in the state colour, on by default), then on the right a filter field
  with the search icon ("device, port, code…": the sentence, the code and every name its checks carry), `fluid`. The
  body is the `Register`, by rule. Toggles and filter are transient.
- **Two counts, two units** (review 2026-10-21, H1): **a verdict's sentence counts the things it names, each once**
  (the targets its open row lists: the neighbours, the ports, the cables, the aggregates, the bundles, the devices,
  the clusters, the findings, as each code's sentence says them; B1 writes several checks for one thing: one per
  announcement and source in R0, one per protocol for a cable seen from one side, one per member for a cluster
  described differently); **the header's total, the toggles, the section headings, the Check tab's count and the
  panel's alerts count checks** (B1's verdicts as written).
- **Collection coverage:** the header's count is the devices in scope; a band of facts (in scope, answered, partial,
  unreachable, and failed when there is one), then a compact table (32 px rows under a 28 px head): device (cut
  first), collection (a mark and its word), one centred column per topic (interfaces, aggregates, LLDP, CDP, system,
  HA) holding a mark alone: grey for a success, the warning mark for a failure, **hollow** for a topic not asked. The
  topic headers never touch (4 px between two headers at least); device and collection sort.
- **Cables and sources:** the header's count is the run's cables; a compact table, sources (the `SourceLine` of the
  cable's status before the sources in words, never the raw combination), status in words, cables (tabular).
- **Delivery:** the collection's day as the header's caption; facts (exporter, contract, received, devices, findings
  of the input contract, normalizations, unread descriptions, unresolved neighbours), a fact without a value left out.
- **Codes live here:** the only surface of the shell that shows a check code (`Code`), always next to its sentence.
- **Targets open the Diagram:** a target is a real address (`#node=`, `#link=`, `#aggregate=`, `#cluster=`; a port
  selects its device) without `mode`, so a click shows the Diagram view on the element and Ctrl+click opens a tab.
- **The library's geometry:** the tiles are placed by react-grid-layout (its legacy API: no compaction, overlaps left
  to the view's rule), which positions each tile by computed style (`transform`, `width`, `height`, `position`) on the
  DOM: accepted as geometry, the one exception to "no inline style"; it never sets a colour, a size of text, a radius
  or a shadow, which stay in the tokens.

### Avatar
A 22 px square, 5 px radius, sunken fill with a 1 px line-2 inset, the author's initial at 11.5 px / 650 in ink-2;
decorative (the name is said next to it or by its control). The user button shows the declared author's initial, the
`User` icon without a name; a feed line starts with it. In a disabled control it turns ink-4 like the control's
icon. An author left blank shows "?" and is said "unknown", never an empty name.

### Logo mark
A 20 px mark of two squares, ink and accent, alone in its island; never the product name next to it.

## Do's and Don'ts

### Do:
- **Do** build every control from the shared primitives (`app/ui/`); a control that cannot be built from them is a
  design decision for the owner, not an improvisation.
- **Do** keep 16 px from the viewport and 12 px between islands, and hide an island that has nothing to show.
- **Do** use an icon with a tooltip for an action, and a word for a choice.
- **Do** keep both themes and both accents valid for every new surface, with contrast measured (≥ 4.5:1 text,
  ≥ 3:1 outlines).
- **Do** measure the DOM before delivering: heights, centres, gaps, margins, tooltip style (`design/scripts/measure.py`
  and its test in `app/`).
- **Do** expose every fact of the contract about the selected element in the panel, in plain words.

### Don't:
- **Don't** use violet or purple anywhere, nor red as an accent, nor cyan.
- **Don't** draw pill-shaped buttons, gradients, glass, glows, zero-offset halos, or identical rounded cards as a
  page structure.
- **Don't** set labels in uppercase, use monospace outside code, join meta strings with middle dots (the Log's
  header line excepted, see The Log view), or add eyebrow
  labels above headings.
- **Don't** invent a second way to say "current" or "selected": the rail is the only one.
- **Don't** show a check code (`aggregate_below_min_links`) in the Diagram view; verdicts live in Contrôle, where a
  code is always a `Code` chip next to its sentence.
- **Don't** hard-code a colour, size, radius, shadow or font outside the token file, nor a visible string outside the
  catalogues; a layout library may place a tile by computed style (Check view), never a design value.
- **Don't** let anything move on its own: motion answers an action, 150–260 ms, `cubic-bezier(.16, 1, .3, 1)`,
  1 ms under reduced motion.

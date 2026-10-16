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
  dark-island: "0 1px 2px rgba(0, 0, 0, 0.30), 0 10px 28px -10px rgba(0, 0, 0, 0.55)"
  dark-layer: "0 2px 6px rgba(0, 0, 0, 0.35), 0 28px 64px -18px rgba(0, 0, 0, 0.70)"
  dark-tooltip: "0 4px 12px -2px rgba(0, 0, 0, 0.5)"
motion:
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
  hover: "120ms"
  tooltip: "150ms"
  tooltip-delay: "350ms"
  rail: "200ms"
  popover: "200ms"
  layer: "240ms"
  panel: "260ms"
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
    row-gap: "6px"
    column-gap: "12px"
    strip-gap: "32px"
    strip-padding: "12px 16px"
  alerts:
    gap: "12px"
  panel-row:
    leading: "18px"
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
- **Accent-weak** (#EBF0FE, dark #222C47): the only tinted fill, for the current row of a list and the selected
  result of the palette.
- **Ink as accent** (#141414, dark #EEEFF1): the second accent option, chosen in Réglages. The chrome then carries no
  colour at all; links keep an underline. The accent is a **browser preference** (`ld-prefs`), never an intent and
  never in the address. Any new accent must pass 4.5:1 in both themes and collide with no state colour.

### Neutral
- **Paper** (#FFFFFF, dark #1C1D1F): the canvas and every island, panel and widget.
- **Grid** (#DCDEE2, dark #2C2E31): the dots of the map's grid, 1 px of radius every 24 px **of screen**, fixed under
  the map whatever the zoom (the approved mockup's texture), one step under the hairline so the grid never competes
  with a cable (Orhan, 2026-10-16: the v1 grid was too present). The plan grid (20 units, the one a drag snaps to)
  belongs to edit mode, where the grid darkens one step (brick 6).
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
a single run, the minimap when toggled off, the panel and the run band while editing.

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
widgets and popovers; **5 px** for tooltips. Swatches are 12 px squares with a 3 px radius; the type tile of a panel header is 40 px with an 8 px radius; the avatar is
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
- **Current / on:** the 2 px accent rail (bottom of a tab, left of a vertical tool, under a run), ink text at 600 for
  a word (a layer, a scope, a setting); no fill. One definition, in the primitive.
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

### Islands, panels, widgets
- **Corner Style:** 10 px.
- **Background:** paper.
- **Shadow Strategy:** island shadow; layer shadow for popovers.
- **Border:** 1 px line.
- **Internal Padding:** 8 px (bars), 16 px (panels, widgets).
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
  scrolls inside, its table head (32 px) sticking. An optional foot note in caption ink-3 says what the body could
  not show (archive entries unreadable). A widget grows to fill its column of
  the home grid; **the home grid never scrolls** (its height is the window's less 96 px): Infrastructures takes its
  content's height up to 60 % of its column, Latest collections the rest.
- **Free slot:** not an island; a line-2 frame with the surface radius on the ground, no fill, no shadow, holding the
  outlined "+", a 13.5 px / 600 title and a 12 px ink-3 sentence.

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
- **Search:** a discreet icon button with the `Ctrl K` shortcut chip in the tools island; it opens the palette.
- **Segmented choice:** a ground track, 6 px radius, the chosen segment on paper with the island shadow (a filter
  over a list, a count after each word when it filters a list); the current segment never uses the accent fill. The settings (theme, accent, language) are rail
  buttons, as in the approved mockup, with a 12 px swatch before each accent.

### Checklist
What is shown or kept (the columns of the focus table; later what an export shows): a column of 32 px rows, each a
word with a 16 px slot before it, a check mark in the accent (stroke 2) when the item is on, nothing when it is off,
the word then in ink-3. Never a rail: an item is on or off, not "current" (Orhan, 2026-10-16, chosen at the bench
among four directions); never a pill. Each row is a checkbox the keyboard reaches; the list is a named group, in a
popover under the control that opens it.

### Navigation
- **View switch** (Diagramme / Contrôle / Journal): body-size words (13.5 px) at 500, ink-2; the current one in
  ink at 600 with the 2 px accent rail; counts next to Contrôle in the state colour.
- **Layer choice** (L1 / L2 / L3): the same rail; L2 and L3 disabled with a tooltip, no extra text.
- **Context choices** (infrastructure, run): a word with a chevron, opens a list. A choice may carry fixed words
  instead of its value ("Compare with…") and a busy state while what it lists is read (the run choice while a
  collection opens).
- **Run band:** the runs as words on a line, the current one with the rail, the compared one with a dotted grey
  rail and the word "comparée"; "Comparer avec…" as a choice.
- **Canvas controls:** zoom out, zoom level as a word (52 px, a click goes back to 100 %), zoom in | fit, grid
  (toggle), minimap (toggle) | edit (toggle). The minimap, when shown, is an island above the canvas controls: paper,
  hairline, the island shadow, 16 px from the left edge, 12 px above the controls.
- **Layer choice** words are 36 px wide at 600; the compared run of the band carries its small word 6 px after its
  date, its rail dashed 4 px on, 3 px off, in ink-3.
- **Edit palette** (edit mode): a vertical island at x = 16, nine icon tools (select, declare a cable, connector,
  note, shape, table, image, code block, group), the current tool with a left rail, tooltips to the right.

### Tooltip
- **Style:** black fill, white 12 px 500 text, 6 × 8 px padding, 5 px radius, tooltip shadow; a shortcut after the
  words in tip-sub; in dark a 1 px #3A3C40 outline.
- **Placement:** below the control, centred, 8 px away; toward the canvas side when against an edge; 350 ms delay,
  150 ms fade; `[role="tooltip"]`, one class for the whole application, nothing else may render a tooltip.

### Search palette
- **Style:** a layer 720 px wide centred in the upper third over the scrim; a field without border at 15 px; tabs by
  kind (Tout, Équipements, Ports, Groupes, Infrastructures, Actions) with the rail; grouped results, the current one
  on accent-weak with an Enter hint; a detail column for the current result; a footer of shortcuts.
- **Motion:** scrim fade 200 ms, panel rises 8 px in 240 ms; closes immediately.

### Contextual bars
- **Device bar:** hue (swatch + chevron, a volet of 12 hues, no violet), pin, lock | group, align (chevron, volet:
  left, centre, right, top, middle, bottom, distribute ×2, grid) | hide, isolate | more.
- **Note bar:** text size (value + chevron, a vertical volet) | bold, italic, underline | alignment, text colour,
  label position | below, above (rail on the current layer) | lock, duplicate, delete.
- **Placement:** 12 px above the element, centred; a volet 12 px above the bar under its trigger; never over the
  element; flips below the element when it would come within 12 px of the top islands.

### Facts
A list of labels and values, from the approved mockup (`.facts`, `.strip`): the label in ink-3 on a 104 px column,
the value in body text (a long one breaks on a second line, never cut), 6 px between rows and 12 px between the
columns; the compact panel reads it in one column, the wide panel in two. As a **strip** (the focus panel, under its header): the facts side by side, 32 px apart, a 12 px
label over its value, padded 12 × 16 with a hairline below. A value is text, a Mark with its words, or a Link; a
fact without a value is left out, never shown blank. The only way to lay out facts in the shell.

### Alerts
What is to be checked on the selected element, in words, from the approved mockup (`.alerts`): a list, 12 px between
lines, each starting with the state mark of its severity (error, the warning mark, grey for a note) 12 px before its
sentence; a line with a detail sets its sentence in body strong and the detail under it in label size, ink-3. The
sentences come from the catalogue, one per check code; the detail names the ports, aggregates or devices concerned.
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
- **Don't** set labels in uppercase, use monospace outside code, join meta strings with middle dots, or add eyebrow
  labels above headings.
- **Don't** invent a second way to say "current" or "selected": the rail is the only one.
- **Don't** show a check code (`aggregate_below_min_links`) in the Diagram view; verdicts live in Contrôle.
- **Don't** hard-code a colour, size, radius, shadow or font outside the token file, nor a visible string outside the
  catalogues.
- **Don't** let anything move on its own: motion answers an action, 150–260 ms, `cubic-bezier(.16, 1, .3, 1)`,
  1 ms under reduced motion.

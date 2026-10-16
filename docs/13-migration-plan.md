# The v2 migration: the bricks, in order

**In one sentence**: the v2 shell is assembled brick by brick on the `app/` skeleton, each brick a surface built from
the primitives, compared to the approved mockup (`design/comps/shell/`), wired to the logic the v1 already proved.

Read first: `docs/etat.md`, `DESIGN.md`, `docs/12-app-skeleton.md`. Every brick is a session: `/brique-ui <brick>`,
built by the `ui` agent, reviewed by `relecteur-ui`, closed by `/livraison`. **No new function during the migration**,
except what a brick needs to exist (an API route that lists what a widget shows).

## What is reused, what is replaced

- **Reused as is**: `engine/src/canvas/*.ts` (the pure engine), the backend and its API, the contracts, the v1 canvas
  (`engine/src/app/canvas/`, React Flow) mounted inside the new shell until the canvas gets its own direction round.
- **Reused by moving**: `engine/src/app/state/` (reducer, commands, selection, search, history, clipboard, walk,
  journal), `engine/src/app/api/`, the i18n catalogues: they move into `app/src/` brick by brick, with their Node
  tests, and lose every presentational dependency on the way.
- **Replaced**: every component, every stylesheet of `engine/src/app/components`, `ui`, `styles`.

## The bricks

| # | Brick | Scope (mockup state) | Reuses | Needs | Done means |
|---|---|---|---|---|---|
| 1 | **Home** | `home.html`: top islands (logo, tools), widgets Infrastructures, Dernières modifications, Dernières collectes, free slot | journal API (`GET /api/intent/journal`), runs API | a route listing infrastructures with last run, status, counts (`GET /api/infrastructures`), small | the home opens at `/next/`, real data from the archive, one click opens an infrastructure |
| 2 | **Diagram shell** | `index.html` default: top islands (context, views + layers, tools), canvas controls, run band; the v1 canvas inside | `state/` (address, run, prefs), `api/`, v1 `canvas/` | nothing new | an infrastructure opens with its last run, the diff summary counts, the run band navigates, the v1 canvas works unchanged |
| 3 | **Panel** | compact / wide / focus, every fact of the contract, Voisin and Description columns, alerts in words | `state/` selection, `canvas/neighbors.ts`, `format.ts` | nothing new | selecting a device shows the three widths; sortable, filtered; no check code in Diagram |
| 4 | **Search** | `data-state="search"`: Ctrl+K palette over the scrim, grouped results, detail column | `state/search.ts` | nothing new | Ctrl+K, grouped results, Enter opens, Esc closes, keyboard complete |
| 5 | **Settings and language** | `data-state="settings"`: theme, accent, language; the whole fr / en catalogue of the shell | `prefs.ts`, `i18n/` | nothing new | the three preferences persist in `ld-prefs`; strings guard green with both catalogues complete |
| 6 | **Edit mode** | `edit`, `edit-note`: left palette, device bar and volets, note bar and volets; the v1 editing logic behind | `state/` intent commands, undo, clipboard, floating logic | nothing new | every v1 editing function reachable from the palette or a bar; Ctrl+Z works; measured |
| 7 | **Check and Log views** | the Contrôle view (the v1 facts in the new grammar; absorbs what `/view` showed) and the Journal view | v1 `Journal.tsx` logic, checks catalogue | nothing new | both views on the rail, read-only Check, Log with its filters |
| 8 | **Cut-over** | `/` serves the v2, `/next/` disappears, `engine/src/app/` deleted, `/view` kept only for the exporter loop | | | the v1 suites replaced by the v2 suites; `docs/etat.md` says v1 is gone |

After the cut-over, in this order: **export PNG / SVG with anonymization** (crucial, `PRODUCT.md`), the **canvas
direction round** (its own bench, starting from the v1 cards), then the lots parked in `docs/etat.md` (16 bis, 4 bis,
7, 9…) on the new shell.

## Done

- **Brick 1, Home** (2026-10-16): the home at `/next/`, four widgets from `home.html` over the real archive, in both
  themes and both accents; `GET /api/infrastructures` (last run, last good run, devices, answered, checks by
  severity, six recent runs, unreadable entries counted); the journal through `GET /api/intent/journal`, the diffs
  read after the page shows. Four primitives from the approved mockup written into `DESIGN.md` before use: `Widget`,
  `Avatar`, `Mark`, `Link`. Review `docs/revues/2026-10-16-accueil.md` (0 critical, 3 high, 11 medium, 12 low), all
  treated but M5 (the journal wording moves with brick 7). One click opens the infrastructure in the v1 at `/` until
  brick 2. Decisions to judge in use: `docs/a-juger-a-l-usage.md` (late collection after 7 days, deferred diffs, no
  second line under the name, the feed names the count). Retouched the same day after Orhan's first look: every
  column sorts, a segmented status filter in each table header, a per-widget setting for how many rows
  (`?recent=N`, browser preference), diffs read for the rows on screen only. **Rule for every brick: the page never
  caps what the user can see; a default is a default, and a widget setting lets him ask for more.**

- **Brick 2, Diagram shell** (2026-10-16): `/next/?infrastructure=…` opens the diagram (`routeOf` in
  `app/src/state/address.ts`; without an infrastructure, `/next/` stays the home, whose rows now link here). The
  shell of `index.html` at rest: brand, context (infrastructure and collection choices, the diff summary "N changes"
  with the devices and cables touched in its tooltip), views (Diagram; Check with its open errors, else warnings;
  Log) and layers (L1; L2, L3), tools (search, export, settings, user), the canvas controls (zoom out, the zoom as a
  word that goes back to 100 %, zoom in | show everything, grid, overview | edit) and the run band (`RunBand`, the
  one primitive added: words joined by wires, the current run with the rail, the compared one with a dotted rail and
  "compared", "Compare with…" any earlier run or none). **Orhan's decisions**: Check, Log, L2, L3, Edit, Export and
  Search are present but disabled with the "in progress" tooltip until their brick; the v1 canvas is mounted **read
  only** (selection, pan and zoom, hover; a drag moves a card locally as the v1 does without a name; the memorized
  placement is written as in the v1; no intent write, no context menu until brick 6); the map's ground is the
  shell's paper and its grid the quiet dots of the mockup, fixed on the screen (tokens `grid`, `grid.step`,
  `grid.dot` added to `DESIGN.md`; Orhan: the v1 grid was too present; the plan grid and the magnet come with edit
  mode); `grid` and `minimap` join `ld-prefs` under the v1's names (the mockup's defaults: grid on, overview
  off); the address keeps the v1's keys. **Logic moved into `app/src/`** with Node tests: the address (`state/address.ts`),
  the band's rules (`state/runs.ts`), the zoom around the visible centre (`state/zoom.ts`), the diff facts, the
  reducer (`state/diagram.ts`) and its effects (`state/useDiagram.ts`), the API of a run (`api/run.ts`: bodies
  checked at the boundary, a missing part said in a toast), the placement writer (`api/placement.ts`). The canvas
  mount (`app/src/diagram/Canvas.tsx`) wraps the v1 `Flow` in the v1's own i18n instance kept in the page's language;
  the v1 gained one optional prop only (`Flow`: `onView` for the zoom word). Keys: Escape lets
  go, F, G, N, +, −, 0; Left and Right walk the band. Measured in Chromium on a synthetic eight-device series
  (`app/e2e/fixtures/diagram/`, `diagram.spec.ts`): islands, bars, tooltips, contrast, both themes and accents,
  French. Captures `.impeccable/planche-diagramme/`. Review `docs/revues/2026-10-16-diagramme.md` (0 critical, 3 high,
  5 medium, 10 low), all treated the same day: the minimap as an island above the controls, the band that scrolls
  inside when the collections outgrow it, the diff tooltip that accounts for every change, Escape left to an open
  popover, the listing said, one user button for every page. To judge in use: `docs/a-juger-a-l-usage.md` (a run
  named without its compared run, the right click, the placement toast, the canvas bubble's role, the scrolling
  band, the fixed grid).

- **Brick 3, Panel** (2026-10-16): the panel of the selected element on the diagram page, at the three widths of the
  approved mockup: compact (440: To check, Identity, Interfaces with port, state, speed and neighbour, MLAG pair,
  aggregates, HA cluster, stack, changes since the compared collection), wide (864, W: mode and VLANs, description,
  identity in two columns) and focus (1408, Shift+F: a strip of facts under the header, every column of the contract
  with a column chooser, the map faded behind the scrim, the canvas controls hidden; Escape leaves it, Escape closes).
  Compact or wide is a browser preference (`panel` in `ld-prefs`); focus is a mode. **Every fact of the contract on an
  interface is readable**: state (the vendor reason under it in focus), speed and duplex, media, mode and VLANs (the
  native one apart), addresses and VRF, MAC, last change, aggregate and membership, the neighbour **seen by LLDP or
  CDP only** (a quiet link that selects it), the raw description in ink-3 (cut, two lines in focus). The alerts are
  B1's checks on the device **in words**, one sentence per code in both languages (`panel:checks`), grouped by code in
  severity order, naming the ports, aggregates and cables concerned; **never a code** (a code the page does not know
  falls back to the server's own meaning). The interface table is scoped (cabled ports by default, every port one
  click away), filtered (every word typed, short port names included), sorted by any column (a missing value last).
  A cable, an aggregate, a bundle and an HA cluster have a panel in the same grammar; groups, annotations and
  connectors wait for edit mode. Three primitives written into `DESIGN.md` and the primitives page before use: `Facts`
  (label / value list, one or two columns, the focus strip) and `Alerts` (mark, sentence, detail) from the approved
  mockup, `Checklist` (the column chooser, chosen by Orhan at the bench among four directions); `Table` gained
  `data-key` on its cells and `wrap`. After Orhan's first look: the focus table slides to the right at its natural
  width (port column and head fixed, rows at 44 px), the chooser opens under its bar. Logic moved into `app/src/`: `state/panel.ts` (rows,
  neighbours, scope, filter, sort, alerts, aggregates, MLAG, HA, a cable), the keys (W, Shift+F, C), the chrome insets
  that follow the panel (`diagram/chrome.ts`, the canvas frames inside what the panel leaves, "centre the view" on the
  selection). Measured in Chromium (`e2e/panel.spec.ts`: the three widths in light, dark and French, the table, the
  neighbour link, the column chooser, a cable from the address). Captures `.impeccable/planche-panneau/`. "More"
  (history, copy, pin) and "See all in Check" wait for bricks 6 and 7. To judge in use: `docs/a-juger-a-l-usage.md`.

- **Brick 4, Search** (2026-10-16): the Ctrl+K palette of the mockup's `search` state, on the diagram page and on the
  home (the tools island's button opens it too). The layer is 752 px (the mockup's `.palette`; `DESIGN.md` said 720),
  104 px from the top, over a scrim that covers the map and the islands: a field without border, the tab strip by
  kind with its counts (All, Devices, Ports, Groups, **Notes** added to the mockup's six since the v1 finds notes and
  code blocks, Infrastructures, Actions), the results grouped by kind with the matched part at 650, the current row
  on accent-weak with the Enter chip, the detail column (the kind's tile and name, snug facts on an 88 px label
  column, the first alert in words, "Where its N cables lead" by destination with the local ports folded, "Open the
  panel" and the outlined "Centre the view"), the foot with the shortcuts and the total. ↑ ↓ walk every kind, Enter
  opens (selection and panel, the view stays; a removed device or a neighbour never collected is centred), Tab and
  Shift+Tab change the tab, Escape closes and keeps the text, the focus goes back to the button; the palette takes
  its keys before the page and never closes the panel behind. **Logic moved** from the v1 into `app/src/state/search.ts`
  (terms, `field:` prefixes, port abbreviations, ports by name then by description, groups and HA clusters, notes at
  the line that carries the words) and extended with the infrastructures the page knows and the shell's actions
  (show everything, centre the view on the selection, back to 100 %, grid, overview, open or compare with a
  collection), the scopes, the matched segments and the detail as values; the words in `app/src/search/words.ts`,
  catalogues `search` in both languages. One primitive from the approved mockup written into `DESIGN.md` and the
  primitives page before use: `Palette` (`app/src/ui/Palette.tsx`); `Shortcut` gained a drawn key, `Facts` a `snug`
  size (88 px labels), `Scrim` a fade when mounted open; `shellKeyOf` answers Ctrl+K from anywhere; `useDiagram`
  gained `openElement` and `reveal`. The typing never lights the map; Shift+Enter, hide, isolate and the field chips
  of the v1 are parked. Measured in Chromium (`e2e/search.spec.ts`: Ctrl+K, the groups and counts, ↓ ↓ Enter and the
  address, Tab, Escape and the kept text, the panel behind, nothing found, an unreadable expression, an action, the
  home) in light, dark and French; captures `.impeccable/planche-recherche/`. Review
  `docs/revues/2026-10-16-recherche.md` (0 critical, 1 high, 7 medium, 13 low; probes in `-sondes/`), **treated the
  same day**: the list shows a window per group (8 rows in All, 100 in a kind's tab, "… and N more" that the arrows
  reach and Enter opens by a page; a letter at the gauge of 500 devices went from 5 s to 47 ms), the detail's alert
  by `Alerts` (snug), the field and the detail name at the mockup's 17 px, one option row shared by `Select` and
  `Palette` (the keyboard position in a list is the accent-weak row, written into `DESIGN.md`), a port the run lost
  says so, Shift+Enter centres the view (the foot says it), an open list closes before the palette opens, the focus
  returned to the button opens no tooltip, a live region says the total, the tabs name their panel, the counts of
  the other infrastructures on the diagram page; e2e for a neighbour never collected, the centre button, the
  collection actions, the "more" row. To judge in use:
  `docs/a-juger-a-l-usage.md` (Enter without moving the view, the kept text, the map not lit, the fields not
  offered, the home palette, the actions offered).
- **Brick 5, Settings and language** (2026-10-16): the settings popover of the skeleton (theme, accent, language as
  rows of rail buttons, `app/src/shell/PrefsControls.tsx`) compared to the mockup at `data-state="settings"` and
  found identical, measured in Chromium (`e2e/settings.spec.ts`: 72 px under the tools island, 16 px from the edge,
  8 px of padding, three rows of 40 px, labels of 72 px in ink-3 at 12 px, the chosen value at 600 in ink, swatches
  of 12 px) in light, dark, cobalt, ink and French, on the diagram and on the home; the gear says nothing more while
  it is open; a language chosen changes every word at once (islands, panel, the tab's title, `lang`, the dates, the
  v1 canvas), is stored in `ld-prefs` and read again, and the other tabs follow; nothing chosen gives the browser's
  language; the keyboard reaches each choice, Escape gives the focus back without a tooltip. Nothing new in
  `DESIGN.md`. **Catalogue audit**: parity, variables and plurals already guarded; the dead key `shell:map`
  removed; English "100%"; French no-break spaces before `: ; ! ? %` and inside « » (62 texts: the mockup and the
  v1 have a breakable one, a pure typography defect); a no-break space between a number and its unit in both
  languages; counts in the language's figures (`{{count, number}}`, "21 000" / "21,000"). **Three defects of the
  skeleton fixed on the way**: `Popover` opens with the mockup's rise (6 px from a 98 % scale) and gives the focus
  back quietly on Escape; `public/boot.js`, the first script of both pages, puts the stored theme and accent on
  `<html>` before the first paint (a dark theme never shows a white page first); the preferences write only the
  field that changed and listen to the other tabs (`storage`), so a tab never writes a stale choice back nor the
  v2's defaults over the v1's. A popover's trigger carries `aria-expanded` alone, which gives it the rail. Review
  `docs/revues/2026-10-16-reglages.md` (0 critical, 0 high, 5 medium, 10 low; probes in `-sondes/`), treated the
  same day in full, one low parked (the surface's own measures are not tokens). Captures
  `.impeccable/planche-reglages/`. To judge in use: `docs/a-juger-a-l-usage.md` (no way back to the browser's
  language once one is chosen; the theme does not follow the system).

## Rules every brick obeys

- The approved mockup state is the comp; the `relecteur-ui` compares to it, never to a score.
- A primitive missing from `app/src/ui/` is a decision for Orhan, written into `DESIGN.md` and the primitives page
  before use; never drawn inside a brick.
- The measurement (`npm run e2e`) extends to the brick's surface: its bars, floats and tooltips join the audit.
- The brick moves the logic it needs out of `engine/src/app/` with its tests; it never imports a v1 component.
- Captures light and dark at 1440, sent to Orhan; one pass of fixes; `/livraison`.

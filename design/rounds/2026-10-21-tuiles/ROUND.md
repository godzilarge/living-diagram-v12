# Round "tuiles", 2026-10-21: sizing the widgets of the Check view

**Ask** (Orhan, 2026-10-21, on choosing direction A for the Check view): "being able to resize the tiles / widgets,
so that the important information comes to the front, such as Coverage of the collection". A new interaction, so a
bench before any product code (`.claude/skills/brique-ui`, § 3).

**Candidates** (built by the `ui` agent from `comps/shell/control.html`, the gesture working in each page; `README.md`
has the detail, the measurements and the honest risks): **T1 the handles** (drag the gutters), **T2 the sizes** (a
size and a place chosen in each widget's settings popover, the grid recomposes), **T3 the places** (four fixed
slots; drag a widget by its header to swap it, or a "bring to front" button sends it to the large slot).

The pages here load the font from `../../comps/shell/fonts/`; the copies given to Orhan embed it. Rebuild from the
mockup with `python3 build.py` (it reads `comps/shell/control.html` and `src/`), captures with `capture.mjs` from
`app/` (`LD_CHROMIUM=/opt/pw-browsers/chromium node ../design/rounds/2026-10-21-tuiles/capture.mjs`).

**Verdict**: waiting for Orhan. The `ui` agent's own view: T3 by its button alone, without the drag (the result in one
click, no gesture primitive, no conflict with scrolling); and, apart from any tile, sorting the coverage table with
the unreachable and partial devices first may put the important thing forward better. History, not authority.

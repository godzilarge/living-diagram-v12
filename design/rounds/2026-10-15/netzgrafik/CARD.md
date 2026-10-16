# netzgrafik — IMPECCABLE'S PICK

**World**: the Swiss railway network graphic timetable (the SBB *Netzgrafik*) and Swiss information design: nodes as
station boxes, lines between them with the departure and arrival minute set at each end, line weight by category,
white paper, black ink, one red.

**Thesis**: the network drawn the way a timetable draws a network: a port at both ends of every line, nothing else
on the line.

**Palette (commit to it; name the exact values in DIRECTION.md)**
- Ground: white paper (a true white, or a hair warmer), a second very light neutral for bars and panel.
- Ink: a rich black; secondary text tinted from the ink, never flat grey.
- **One red** (the Swiss signal red family), for the current and the selected only: the selected device, the current
  run, the focused tab. Nothing else is red unless it is an error.
- Line classes by weight, not colour: 100G / 40G heavy, 10G medium, 1G hairline; documented-only dashed; down
  half-weight; the cables of an aggregate drawn as a bundle (two lines close together).
- State colours (error, warning, unreachable) on top, only where they mean something.

**Type**: the Swiss grotesk voice, neutral and exact: an OFL grotesk with real tabular figures (e.g. Public Sans,
Archivo, Hanken Grotesk, Figtree, Work Sans; **not** Inter, not IBM Plex, not Space Grotesk, not DM Sans). One family,
scale ratio ~1.15, sentence case everywhere (no uppercase labels), numbers tabular.
- **Raise (from the terminal-wayfinding challenger)**: one message per line, sentence case; the panel shows the
  selected device's *choices ahead* (its neighbours and the port that gets you there) as a clean list.

**Density**: medium, exact: generous margins, tight groups, hairline rules used as information (a rule separates,
it never decorates).

**Signature move, concretely**: **port names at both ends of every cable, set like timetable minutes**: small,
tabular, horizontal, sitting just off the device box on the cable's side, aligned to a consistent offset; the cable
itself carries nothing else. Speed shows as line weight, and as a number only in the panel.

**Hold the world to its four contributions**: no timetable grid, no train symbols, no station pictograms; standard
chrome (top bar, panel, run band); devices as rectangular station-like boxes with a small type icon and the name.

**Scene**: light (print on paper; the projector loves it). Say how the dark theme would go (ink and paper inverted,
the red kept).

**Honest risk**: this is also the quiet direction most careful designers would land on; its distinction is in the
precision of the ends and the weight classes, which must be flawless. If the ends crowd, the move fails.

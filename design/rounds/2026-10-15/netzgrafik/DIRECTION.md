# netzgrafik

**World**: the network drawn the way the Swiss network graphic timetable draws a railway: station boxes on white
paper, black ink, one red, and the port name set at both ends of every line like a departure and arrival minute.
## Palette
- `#FFFFFF` paper: the canvas. `#F6F6F3` second neutral: run band and panel. `#141414` ink: boxes, cables, text. `#474A4F` secondary ink, `#6A6D72` tertiary (labels, muted cells, 5:1 on white).
- `#DEDED9` hairline rule (separates, never decorates); `#BCBCB6` control border.
- `#E10000` the one red (Swiss signal red, 5:1 on white): selected device, current run, current tab; otherwise only
  errors (6 in Contrôle, "injoignable", "hors service", "dégradé").
- `#1D57A3` diff blue: changed cables, the corner notch on changed devices, the removed `ha1` drawn dotted.
## Type
Archivo (OFL, Omnibus-Type), one family, self-hosted variable woff2 (wght 400-700, wdth 62-125), tabular figures
everywhere. Scale ~1.15: 11.5 / 13 / 15 / 17 / 20. Sentence case only. Device names at 11 px, width 80 %
(semi-condensed like station names); port labels at 10 px, width 92 %, with a paper halo.
## Density
Medium and exact: one control height (30 px, 28 in the map bar, 26 in the table filter), radius 3, 8 px between
controls, hairline rules as the only separators. Panel: facts, choices ahead, interfaces (two-line rows: facts, then
the raw description), aggregates below the fold.
## Signature move
**Port names at both ends of every cable, set like timetable minutes**: horizontal, tabular, just off the box on the
right-hand side of the cable as it leaves the station, sliding along their own line only when another label is
there. The cable carries nothing else: speed is weight (100G 3 px, 10G 1.5 px, 1G or unread 0.8 px), documented-only
is dashed, down is half weight. Aggregates are bundles (two parallel lines). An MLAG pair is one station with two
platforms: both cores in one frame, the peer-link as two heavy strokes between them; a bundle to the pair carries the
port once when both cores use the same port number (Eth1/3 on both). HA role sits in a compartment of the box
(`actif` / `passif`); a stack is a doubled box; an unreachable device is hatched.
## Dark theme
Ink and paper inverted (paper `#141414`, ink `#F2F2EF`, rules `#3A3A38`), hatch and halos follow the paper; the red
is kept as is for selection, the diff blue lightened to stay above 4.5:1.
## Honest risk
The quiet direction most careful designers would reach; it lives on the precision of the ends. At this zoom the
dc01 pair already carries 14 labels and a few slide over neighbouring lines (around dc01-acc-05); with 500 devices
the labels must go by level of detail. The cores sit 44 plan units apart in the memorized placement, so each MLAG
pair was aligned on x and spaced by up to 6 px to read as one station; the canvas scales x by 0.745 and y by 0.618
(not uniform) to keep 32 boxes from overlapping.
## Measured
`measure.py netzgrafik`: first pass flagged the search field (input 17.5 px inside a 30 px label) and an external
URL (the SVG namespace in a data-URI chevron); both fixed (the input is the 30 px control, chevrons are inline SVG).
Second and third passes: 10 bars, 0 flags, Archivo loaded, no external URL.

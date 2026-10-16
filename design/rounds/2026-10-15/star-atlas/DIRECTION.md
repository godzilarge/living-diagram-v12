# star-atlas

**World**: the infrastructure as a printed night chart: a navy plate with a real coordinate frame, devices as chalk
stars whose size is their magnitude, cables as faint constellation lines, sites as dotted constellation figures, and
the object under the eye lit by a red-amber night-vision flashlight.

**Palette**
- `#0f2650` plate, owns the canvas; `#142f5d` bars, panel, cards; `#1b3a6e` current segment; `#0b1e42` input well.
- `#f2f0e6` chalk: marks, names, primary ink, cables (at 26 to 78 % by speed). `#bcc6d9` secondary text and `#8f9fc0`
  labels and coordinates, both tinted toward the navy (no flat grey).
- `#ff8a3d` night-vision amber, one job, "look here": the selected device (ring, plate, light pool), the shown run,
  focus rings, what changed since the compared run (dashed plate, amber cable, struck ghost of a removed cable).
- States only where they mean something: `#f4566a` error, `#79cfa0` port up, `#e8c35c` warning (unused here).

**Type**
- Source Sans 3 (OFL), tabular figures everywhere: UI 13, panel title 18/650, names on the ramp 13.5/600, 12.5/500,
  12/400, 11.5/400; labels 11.5; coordinates 10.5.
- Source Serif 4 italic (OFL), held to the figure layer only: site names DC01 / DC02 (25/300, tracked .16em), legend
  headings, the "Runs" band label.

**Density**: medium; the canvas breathes inside its neatline, the panel is compact.

**Signature move**: importance on a fixed magnitude ramp plus a constellation layer. Four magnitudes: cores (16
cables) a 6.5 px disc and semibold name, firewalls a diamond and routers a ringed disc at magnitude 2, access switches
a 3.4 px disc in lighter ink, uncollected PEs a hollow mark on a dashed plate. Each star sits at its exact memorized
position; its card hangs to the free side (cartographic label placement, computed against overlaps). Sites are drawn
as padded hulls with IAU-style dotted boundaries, named in serif italic. Plan units are graduated on a hairline
neatline (ticks every 50, labels every 100); the grid toggle switches the faint 100-unit grid. An unreachable device
is a dimmed star with a broken ring; a down port strikes its cable with a double tick.

**Light theme**: the printed atlas: cream plate `#f3efe2`, navy ink `#13285a` for marks, text and dotted figures; the
flashlight becomes a deep vermilion `#c4441a` (amber fails on cream), error a darker crimson.

**Honest risk**: drop the neatline, the ramp or the serif figures and it is "dark UI with one accent" again. Navy
loses contrast on a washed-out projector: the light plate is the meeting-room theme.

**Measured**: first pass flagged the actions bar (search field 28 px vs 30 px); the capture showed an overflowing top
bar and names running out of their cards. Fixed in one batch (30 px input, trimmed bar, card widths measured in
Chromium); the moved legend then covered two devices and was moved once more. Final: 10 bars all ok, fonts loaded, no
external URL; only the MLAG core pair touches (7 px², a double star by intent).

# patch-cord: the dressed rack

**World**: the patch cords of a well-dressed rack, coloured by media and flagged at both ends; every cable on the map looks like the cord it is and names its port where it plugs in.

**Palette**: ground `#E5E9E8` (canvas, painted cabinet steel); chrome `#F6F7F5` (label stock); cards and flags `#FCFCFA` (label tape).
- Ink `#141718`; secondary `#4B5759`, tertiary `#5F6B6D` (cool, tinted from the ground); rules `#CDD3D2`, `#A3ADAE`.
- Boots and black tape `#000`: selection, current view and primary action are black tape, white text; no accent hue.
- Cords (data, loud on purpose, each with a darker casing): single-mode `#F2C400`/`#7F6600`, OM3/OM4 `#17B0BF`/`#0A6670`,
  OM1/OM2 `#EF7B1A`/`#8F4506`, copper `#2C68D4`/`#163B80`, HA heartbeat and management `#D8262E`/`#7A1117`,
  unknown `#9AA3A4`/`#596264`.
- State only where it means something: error `#B3241B` (unreachable devices, degraded port-channels, Contrôle count).

**Type**: Barlow 400/500/600 for the UI and device names, Barlow Semi Condensed 500/600 for every flag and canvas label
(one family, SIL OFL 1.1, self-hosted woff2). Scale ratio 1.15: 10.5 / 12 / 13.75 / 15.75 / 18 px, tabular figures,
sentence case everywhere, no uppercase labels.

**Density**: high and orderly. Controls 32 px in the chrome, 28 px on the canvas and in the panel; interface rows 23 px;
every canvas label (flags, speeds, notes, frame tags) at the single size of 10.5 px.

**Signature move**: each cable is drawn as a cord in its media colour with a **black boot (6 px, then a 4 px strain
relief) at both ends** and a **horizontal flag label carrying the short port name** (Eth1/41, Te1/1/1, Po10) slid along
the cord until it is free. The cord-colour legend is a full-width chrome strip under the top bar, each colour a
button with its count. The same boot-and-cord chip reappears in the panel's Media column and in the logo.
Status is line form, never hue: solid = confirmed, dotted = observed only, dashed = documented only, thin = port down;
changed = a black heat-shrink sleeve mid-cord (and a black dog-ear on changed devices); removed = kept, faded, struck.

**Dark theme (the black cabinet)**: ground `#1A1D1E`, chrome `#232728`, cards become black tape with label-white text;
boots turn to a light grey `#C9CFCF` so they still read against the cord; cords keep their trade colours (yellow and aqua
slightly darker); flags stay light label stock, which becomes the brightest thing on screen.

**Honest risk**: with 52 OM3/OM4 cords the map is mostly aqua, and aqua sits close to the rejected cyan accent; the red
heartbeat cord and the red error state are neighbours. At fit zoom only 57 of 122 flags find room; the rest fall back
to boots only, and around the cores the flags read as clutter rather than labelling. The flag only earns its place
at reading zoom; it can tip into costume if it multiplies.
**Data honesty**: media is read from interfaces[]; the extract only carries dc01-core-01's, so other cords follow the
same port plan on the same models. To keep cards legible at fit zoom, overlapping cards were nudged vertically by
2 to 18 px (horizontal positions untouched).
**Measured**: first pass flagged the legend (cord samples shrinking to 23 to 30 px) and the brand mark counted as an
icon of a different size; the top bar also overflowed by ~16 px (not caught by the script, seen on capture).
After one batch: 13 bars, 0 flags, fonts loaded, no external URL, user button ends at x = 1424.

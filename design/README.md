# design/

The approved visual direction of Living Diagram v2, as artifacts: what `DESIGN.md` (repository root) describes in
words, this folder shows and measures. Nothing here is product code.

- `comps/shell/` — **the approved mockups of the shell** (2026-10-16): `index.html` (the diagram screen with its
  floating shell; states through `data-theme`, `data-accent`, `data-state` on `<html>`), `home.html` (the home
  page), `DIRECTION.md` (the direction in words), `fonts/`, `build/` (the generator the mockups were made with), and
  the captures of every state. The canvas inside is a neutral placeholder: the canvas is a separate surface.
- `rounds/2026-10-15/` — the direction round that led there: the brief, the roll and verdicts (`ROUND.md`), the
  four candidates with their card, direction and capture. History, not authority.
- `scripts/measure.py` — the DOM measurement: bars (heights, centres, gaps, icon sizes), floating surfaces
  (margins, overlaps), tooltip grammar, fonts, external URLs. `cd backend && uv run python ../design/scripts/measure.py shell [--page home.html] [--theme dark] [--accent c] [--state edit]`.
  It is the model for the permanent test of `app/`.
- `scripts/extract.py`, `data/demo-dc.json` — the synthetic dataset the mockups draw from (extracted from the
  archived `demo-dc` runs with the real diff).

Open a mockup: `cd design/comps/shell && python3 -m http.server 8017 --bind 0.0.0.0`, then `http://<host>:8017/`.

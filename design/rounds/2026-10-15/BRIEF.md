# Direction mockups: the shared brief

Four static mockups of **the same first screen** of Living Diagram v2, each in a different visual world, built by
isolated agents, judged by Orhan in his browser. They are disposable: nothing here enters the project. What survives
is the direction he picks, written into `DESIGN.md` as words and tokens.

Read, in this order: `PRODUCT.md` at the repository root (the product truth; binding), your own `CARD.md` (your
world; binding), this brief, then the `frontend-design` skill and Impeccable's `reference/craft-floor.md`
(`/home/otosun/.claude/plugins/cache/impeccable/impeccable/4.5.2/skills/impeccable/reference/craft-floor.md`).
Do **not** read the other directions' folders, nor `engine/src/app/` (the current look is an anti-reference).

## The screen

**1440 × 900, fixed, overflow hidden.** The **Diagram** view of infrastructure `demo-dc`, run of 2026-01-19 02:00
compared with the run of 2026-01-12, device **dc01-core-01** selected with its panel open. Interface language:
**French** (Orhan's browser language; the product is bilingual).

The product shell is the same for every direction; the world lends only type, palette, density and one signature
move. Every control is a standard web control a user already knows. Regions, all required:

1. **Navigation chrome** (a top bar, a side rail, or both: your call): product identity, infrastructure `demo-dc`,
   the current run, the view switch **Diagramme / Contrôle / Journal** (Diagramme current), the layer choice
   **L1 / L2 / L3** with L2 and L3 marked "en cours" (in progress, not available), search, the diff summary
   (changes since the compared run) as something one can click, the export command, the user's name (`orhan`).
2. **The canvas**: the 32 devices at the given positions (scaled to fit the canvas area, relative positions kept),
   the 61 cables, HA clusters framed (`DC02-EDGE`, actif-passif), HA roles on the firewalls, the MLAG pair of the
   cores, cable statuses and speeds readable, the diff visible (changed devices and cables marked; the two firewalls
   `dc01-fw-01` / `dc01-fw-02` are now **unreachable**: a state worth seeing), the selected device clearly selected.
   Stubs (phones, servers, access points) are hidden; the shell may say how many are hidden.
3. **The panel of `dc01-core-01`**: identity (vendor, model, OS, site), its role in the MLAG pair and the
   peer-link, its aggregates with the two **degraded** port-channels (20 and 21), its interfaces table (55 physical
   ports: show the first dozen or so, with the rest implied by scrolling): name, state, speed, media, description,
   neighbor on the other end. Plain words for the non-technical reader; the check codes stay out of this view
   (Diagramme is the reading view; verdicts live in Contrôle).
4. **The run band**: the three runs, the current one and the compared one marked, a way to compare with another.
5. **Canvas controls**: zoom, fit, grid, minimap (optional), the single entry into edit mode (reading is the default
   state; the editing toolbar is **not** shown).

One state worth seeing is already in the data (firewalls unreachable, degraded aggregates, 6 errors and 21
warnings in the run); draw it where the shell says it, with state colours on top of your palette only where they
carry meaning.

## The data

`../data/demo-dc.json`, synthetic (from `ld-contracts generate`), the same for everyone:

- `nodes[]`: `hostname`, `type` (switch, router, firewall), `vendor`, `model`, `os`, `site`, `collection`
  (`success` / `unreachable`), `stack_members`, `ha` (`role`, `state`, `cluster`), `x`, `y` (plan units, y grows
  downward; `bbox` gives the extent), `cables` (degree), `checks` (error / warning / info counts), `diff`
  (`added` / `changed` / null).
- `links[]`: `a`, `b` (hostname + interface), `status` (`confirmed` = observed and documented, `observed_only`,
  `documented_only`), `oper`, `speed_mbps`, `aggregate_a` / `aggregate_b` (port-channel names), `sources`, `diff`.
- `selected`: `dc01-core-01` with `interfaces[]`, `aggregates[]` (note `port-channel10` is the peer-link,
  20 and 21 are degraded), `checks[]`.
- `ha_clusters[]`, `mlag_domains[]`, `runs[]`, `counts`, `diff_detail` (what changed, in words).

Positions are the memorized placement; keep them (scaled). Cables are straight lines or gentle curves between
device boxes; you may offset parallel cables between the same pair. Port names at cable ends are welcome where they
stay readable.

## Binding constraints (from PRODUCT.md)

- **No violet or purple tints. No pill-shaped or "bubble" buttons. Nothing that reads as "made by an AI"**
  (near-black tinted ground with one neon accent, uppercase mono labels, pills everywhere, glass bars, gradient
  text, identical rounded cards with soft shadows, middle-dot meta strings, eyebrow labels).
- **Rich in functions, light to the eye.** Every region above is present; none shouts.
- **Details are the product.** Controls that sit side by side have the same height, the same baseline, the same
  gap. The measurement script checks it; a flagged bar is a defect to fix before delivery.
- Light or dark comes from your world's scene (PRODUCT.md: laptop, desk screen, projector; all real). Build your
  native theme only, and say in `DIRECTION.md` how the other theme would go.
- **Self-contained**: one `index.html` with inline CSS; fonts self-hosted in `fonts/` (OFL faces downloaded at build
  time are fine; nothing fetched at runtime); icons as inline SVG in one consistent stroke (draw them or take
  Lucide's paths: `engine/node_modules/lucide-react` has them); no JavaScript needed (a few lines for nothing but
  layout are tolerated). Under ~900 lines all told.
- Standard controls only: buttons, tabs, inputs, selects, tables. Never a costume of the world's own instrument.

## Measurement contract

- Every bar, toolbar, band, tab strip and panel header carries `data-bar="<name>"`.
- Every control inside it is a `button`, `a`, `input`, `select`, or carries `data-control`.
- Run, from the repository root, `cd backend && uv run python ../bac-a-sable/directions/scripts/measure.py <your-id>`:
  it screenshots your page to `../captures/<id>-1440.png`, writes `../captures/<id>-measure.json`, and prints every
  bar whose controls differ in height (> 0.5 px), are not vertically centred together (> 1 px), or are spaced
  irregularly (more than two distinct gaps, > 1 px apart). Fix everything it flags, run it once more, stop.

## Deliverable

In your folder `<id>/`:

- `index.html` (+ `fonts/`, `assets/`).
- `DIRECTION.md`, 40 lines at most, in English: the world in one sentence; palette as named hex values and what each
  does; type faces (with license) and the scale; density; **the signature move, named concretely**; how the other
  theme would go; the honest risk; what you measured.
- The captures and the measurement JSON the script wrote.

Build fully, inspect once (screenshot and measurement together), fix in one batch, confirm once, stop. Report in
French, briefly: what the direction is in one sentence, three decisions, what the measurement said.

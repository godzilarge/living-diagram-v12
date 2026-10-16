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

## Rules every brick obeys

- The approved mockup state is the comp; the `relecteur-ui` compares to it, never to a score.
- A primitive missing from `app/src/ui/` is a decision for Orhan, written into `DESIGN.md` and the primitives page
  before use; never drawn inside a brick.
- The measurement (`npm run e2e`) extends to the brick's surface: its bars, floats and tooltips join the audit.
- The brick moves the logic it needs out of `engine/src/app/` with its tests; it never imports a v1 component.
- Captures light and dark at 1440, sent to Orhan; one pass of fixes; `/livraison`.

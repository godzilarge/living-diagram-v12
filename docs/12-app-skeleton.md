# The `app/` skeleton: the v2 shell's foundation

**In one sentence**: a separate package where the React v2 is built on the primitives and tokens of `DESIGN.md`, with
the guards that make the design impossible to drift from, before any surface is migrated.

Decided on 2026-10-15 / 16 (Orhan): monorepo of four packages (`contracts/`, `backend/`, `engine/` pure, `app/`);
nothing of the v1 look survives; the logic of the v1 (`engine/src/app/state`, `api`, the pure `canvas/*.ts`) is
reused; everything the v2 creates is written in English.

## What the skeleton contains

1. **Package** `app/`: Vite, React 19.2.7, TypeScript strict, Vitest, Playwright (`@playwright/test`), pinned
   versions, `package-lock.json` committed, `node_modules` ignored. `npm run dev` proxies `/api` to
   `http://127.0.0.1:8000`; `npm run build` writes `app/dist/`; `npm run check` = typecheck + lint guards + unit
   tests; `npm run e2e` = the Playwright measurement.
2. **Tokens**: `app/src/styles/tokens.css` is **generated** from the frontmatter of `DESIGN.md` by
   `app/scripts/tokens.mjs` (light, dark, accent cobalt and ink as `data-theme` / `data-accent` on `<html>`); a
   check refuses a drift between the two. Archivo variable self-hosted (`@fontsource-variable/archivo`), fonts
   `'self'`.
3. **Primitives** in `app/src/ui/`, the only place that renders a control: `Island`, `IconButton`, `Button`,
   `Tooltip`, `Field`, `Select`, `Segmented`, `Rail` (the tab strip with the accent rail), `Table`, `Panel`,
   `Popover`, `Scrim`, `Count`, `Shortcut`, `Toast`. Each follows `DESIGN.md` § Components, with every state
   (rest, hover, focus, current, disabled, danger, loading). Positioning of popovers and tooltips through
   `@floating-ui/react` (headless, styles through the CSSOM, CSP-safe). No Tailwind, no Radix, no router, no state
   library.
4. **The living primitives page** `app/primitives.html` (second Vite entry): every primitive in every state, both
   themes, both accents, with a theme / accent switcher; every bar `data-bar`, every floating surface `data-float`,
   every tooltip `[role="tooltip"]`. This page is the reference anyone looks at, and what the measurement runs on.
5. **Guards** (tests that fail the suite):
   - `tokens`: no raw colour (`#hex`, `rgb(`, `hsl(`), radius, shadow or `font-family` in `app/src/**` outside
     `styles/tokens.css`;
   - `primitives`: no `<button`, `<input`, `<select`, `<a`, `style=` or `title=` in JSX outside `app/src/ui/`;
   - `strings`: no visible French or English string outside the i18n catalogues (`fr`, `en`, i18next as in v1);
   - `measure` (Playwright, Chromium): on the primitives page, light and dark, cobalt and ink: every bar's
     controls equal in height and centred with regular gaps, every float ≥ 16 px from the viewport and ≥ 12 px
     from each other, every tooltip one computed style, text contrast ≥ 4.5:1 measured on the rendered page;
   - `engine`: `@engine/canvas/model` imports under Vitest without a DOM (the alias `@engine` → `../engine/src`).
6. **A minimal shell** `app/src/main.tsx`: the top islands (logo, tools) rendered from the primitives over an
   empty map, as proof of the pipeline; the real surfaces come as bricks (`/brique-ui`).
7. **Backend**: `GET /next/` and `/next/{asset}` serve `app/dist/` when it exists (`LD_APP_DIST` overrides the
   path), same CSP `'self'` as `/`, files read at request time, 404 as `Problem` when the build is absent; `/` keeps
   serving the v1 until the migration ends. Tests in `backend/tests/test_next.py`.

## What it does not contain

The surfaces (home, diagram shell, panel, search, settings, edit palette, contextual bars): each is a brick, built by
the `ui` agent against `design/comps/shell/`. The canvas: its own direction round. The removal of `engine/src/app/`:
when the last surface has moved.

## Done means

`cd app && npm ci && npm run check && npm run e2e` green; `cd backend && uv run pytest` green; `app/README.md`
(what, run, test, on one screen); `docs/etat.md` and the journal updated by the orchestrator.

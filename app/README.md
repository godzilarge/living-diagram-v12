# `app/`: the Living Diagram v2 shell

**The React v2, built only from the tokens and primitives of `DESIGN.md`, with guards that fail the suite when the
design drifts.** Served by the backend at `/next/` while `/` keeps the v1; the surfaces arrive as bricks (`/brique-ui`)
against `design/comps/shell/`.

## Run

```sh
cd app && npm ci
npm run dev            # http://localhost:5173/ (shell), /primitives.html (the living primitives page); /api → 127.0.0.1:8000
npm run build          # app/dist/, served by the backend at /next/ and /next/primitives.html (LD_APP_DIST overrides the folder)
npm run tokens         # regenerates src/styles/tokens.css after a change to DESIGN.md's frontmatter
```

## Test

```sh
npm run check          # tokens.css matches DESIGN.md, tsc strict, Vitest (guards, primitives, catalogues, @engine)
npm run e2e            # builds, serves under the backend's CSP, measures in Chromium (light / dark, cobalt / ink, fr)
```

| Guard | Refuses |
|---|---|
| `tokens` (`tests/guards/tokens-guard.ts`, `scripts/tokens.mjs --check`) | a raw colour, radius, shadow, font family or size outside `src/styles/tokens.css`; a hand edit of `tokens.css` |
| `primitives` (`tests/guards/primitives-guard.ts`) | `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`, `style=`, `title=` in JSX outside `src/ui/` |
| `strings` (`tests/guards/strings-guard.ts`) | a visible French or English text outside `src/i18n/locales/` |
| `engine` (`tests/engine.test.ts`) | an `@engine/canvas/model` that no longer imports under Node without a DOM |
| `measure` (`e2e/measure.spec.ts`) | bar controls of unequal height (> 0.5 px), off-centre (> 1 px), more than two gaps; an island < 16 px from the edge or < 12 px from another; a popover off its margin or over its trigger; two tooltip styles, a tooltip over its control, a popover or another tooltip; a text under 4.5:1; Archivo not loaded; a CSP refusal |

Captures of the measurement land in `e2e/captures/` (ignored).

## Layout

`src/styles/` tokens (generated), font, base · `src/ui/` the primitives, the only place that renders a control ·
`src/i18n/` i18next, catalogues `en` / `fr` · `src/prefs.ts` theme, accent, language (`ld-prefs`) · `src/shell/` the
minimal shell · `src/primitives/` the living primitives page · `@engine/*` → `../engine/src/*` (pure engine).
Pinned versions; `.npmrc` sets `legacy-peer-deps` (npm 10 crashes on vite 8's optional peer chain), so every peer is
explicit in `package.json`. Vitest 4 because Node 20 runs here (Vitest 5 needs Node 22).

# `app/`: the Living Diagram v2 shell

**The React v2, built only from the tokens and primitives of `DESIGN.md`, with guards that fail the suite when the
design drifts.** Served by the backend at `/next/` while `/` keeps the v1; it opens on the home (brick 1) and, with
`?infrastructure=…` in the address, on the diagram shell (brick 2: the v1 canvas inside); the surfaces arrive as
bricks (`/brique-ui`) against `design/comps/shell/`.

## Run

```sh
cd engine && npm ci    # once: the v1 canvas the diagram mounts reads its fonts from engine/node_modules
cd app && npm ci
npm run dev            # http://localhost:5173/ (home), /?infrastructure=<name> (diagram), /primitives.html (the living primitives page); /api → 127.0.0.1:8000
npm run build          # app/dist/, served by the backend at /next/ and /next/primitives.html (LD_APP_DIST overrides the folder)
npm run tokens         # regenerates src/styles/tokens.css after a change to DESIGN.md's frontmatter
```

## Test

```sh
npm run check          # tokens.css matches DESIGN.md, tsc strict, Vitest (guards, primitives, catalogues, @engine)
npm run e2e            # builds, serves under the backend's CSP, measures in Chromium (light / dark, cobalt / ink, fr);
                       # the home and the diagram read a simulated API (e2e/fixtures/, e2e/fixtures/diagram/: a
                       # synthetic eight-device series of three collections, `ld-contracts generate --seed e2e-shell`)
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
`src/api/` the API (token in `sessionStorage` under the v1's key, calls, bodies validated: the home's routes, a run
and its parts, the placement writer, the images) · `src/state/` pure modules (time, journal line, home rows, the
address, the band's rules, the zoom, the diff facts, the diagram reducer, the shell keys) and the hooks that load
(`useHome`, `useDiagram`) · `src/home/` the home · `src/diagram/` the diagram shell: the islands, the canvas controls,
the run band, and `Canvas.tsx`, the only component that mounts the v1 canvas (`@engine/app/canvas`, React Flow, its
own styles and i18n instance; read only until brick 6) · `src/i18n/` i18next, catalogues `en` / `fr` (`ui`, `shell`,
`home`, `diagram`, `primitives`) · `src/prefs.ts` theme, accent, language, the rows of two home widgets (`homeRuns`
6 · 12 · 25 · 50 · 100, `homeChanges` 10 · 25 · 50 · 100) and the canvas controls `grid` / `minimap` under the v1's
names (`ld-prefs`; a value outside the choices reads as the default; the v1 writing its whole object drops its
own) · `src/shell/` the settings controls, the tools and the token form shared by the surfaces · `src/primitives/`
the living primitives page · `@engine/*` → `../engine/src/*` (the pure engine, the v1 canvas and its i18n; `react`,
`lucide-react`, `@xyflow/react`, `i18next`, `prismjs` resolve to this package's copies, `tsconfig.json` paths and
Vite `dedupe`). The address is the view state (`?infrastructure`, `run_id`, `from`; `#node=`… and the toggles, the
v1's keys): what the page shows is what the address says.
Pinned versions; `.npmrc` sets `legacy-peer-deps` (npm 10 crashes on vite 8's optional peer chain), so every peer is
explicit in `package.json`. Vitest 4 because Node 20 runs here (Vitest 5 needs Node 22).

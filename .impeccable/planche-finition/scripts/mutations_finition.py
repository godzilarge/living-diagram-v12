"""Mutations de la passe de finition : chaque mutation appliquée seule, l'application reconstruite, le test visé lancé ;
le fichier est rendu à l'identique ensuite. Une mutation « attrapée » = le test échoue."""
import subprocess, sys, json
ROOT = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo"
APP = ROOT + "/engine/src/app/"
NODE_APP = ["node", "--test", ROOT + "/backend/tests/js/app.test.js"]
NODE_CODE = ["node", "--test", ROOT + "/backend/tests/js/code.test.js"]
def py(test):
    return ["uv", "run", "pytest", "-x", "-q", test]
M = [
  ("nextGroup sans boucle", APP+"state/floating.ts", "return (at + (back ? count - 1 : 1)) % count;", "return Math.min(count - 1, at + (back ? -1 : 1));", NODE_APP),
  ("startGroup toujours 0", APP+"state/floating.ts", "Math.max(0, units.findIndex((u) => u.grouped))", "0", NODE_APP),
  ("volet raccourci retiré", APP+"state/floating.ts", "const candidates: VoletPlace[] = [near, far, ...short, ...sides];", "const candidates: VoletPlace[] = [near, far, ...sides];", NODE_APP),
  ("flèche du volet ignorée", APP+"state/floating.ts", "const caret = Math.round(clamp(opener.x + opener.w / 2 - x, CARET_MIN, Math.max(CARET_MIN, w - CARET_MIN)));", "const caret = CARET_MIN;", NODE_APP),
  ("croix sur les poignées", APP+"canvas/guides.ts", ".filter((p) => !bare.some((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol));", ";", NODE_APP),
  ("pastille à 2 px", APP+"canvas/guides.ts", "export const PILL_CLEAR = 8;", "export const PILL_CLEAR = 2;", NODE_APP),
  ("fond de cote = teinte", APP+"canvas/guides.ts", '"var(--hue-" + hue + "-ink)" : null);', '"var(--hue-" + hue + ")" : null);', NODE_APP),
  ("encre claire de l'ambre trop pâle", APP+"styles/tokens.css", "--hue-amber-ink: #7e5821;", "--hue-amber-ink: #a8761e;", NODE_CODE),
  ("encre sombre du ciel en cote", APP+"styles/tokens.css", "--hue-sky-ink: #076496;", "--hue-sky-ink: #0284c7;", NODE_APP),
  ("pastille du langage à l'ancienne encre", APP+"styles/code.css", "fill: var(--type-ink, var(--ink-2));", "fill: color-mix(in srgb, var(--type) 70%, var(--ink));", NODE_CODE),
  ("nature à l'avertissement brut", APP+"styles/code.css", "--code-nature: #8a410c;", "--code-nature: #a84a06;", NODE_CODE),
  ("pouce pâle en clair", APP+"styles/code.css", "--code-thumb: #7e848c;", "--code-thumb: #b9bec5;", NODE_CODE),
  ("Ctrl+Maj+V = Ctrl+V", APP+"code/languages.ts", "if (!options.force && !options.secret) return { as: \"note\" };", "if (!options.secret) return { as: \"note\" };", NODE_CODE),
  ("langage non sûr écarté", APP+"code/languages.ts", "return { as: \"code\", language: found.id, sure: found.id !== \"plain\" && found.sure };", "return { as: \"code\", language: found.sure ? found.id : \"plain\", sure: found.sure };", NODE_CODE),
  ("avertissement sans dessous", APP+"code/geometry.ts", "if (block.y + block.h + gap + h <= zone.bottom) return { x: clampX(block.x), y: Math.round(block.y + block.h + gap), side: \"below\" };", "", NODE_CODE),
  ("avertissement à droite quand même", APP+"code/geometry.ts", "return { x: clampX(block.x + block.w - w), y: clampY(block.y), side: \"over\" };", "return { x: Math.round(block.x + block.w + gap), y: clampY(block.y), side: \"over\" };", NODE_CODE),
  ("fenêtre sans marge basse", APP+"code/geometry.ts", "return { from, to, before: from * lh, after: (n - to) * lh };", "return { from, to, before: from * lh, after: 0 };", NODE_CODE),
  ("gouttière sans le point", APP+"code/geometry.ts", "+ (flagged ? FLAG_W : 0));", ");", NODE_CODE),
  ("hash en alarme", APP+"code/secret-tip.ts", 'const toneOf = (f: Secret): Tone => (f.nature === "hash" ? "muted" : "warning");', 'const toneOf = (f: Secret): Tone => "warning";', NODE_CODE),
  ("bouclier sans plafond", APP+"code/secret-tip.ts", "const shown = found.slice(0, SECRET_TIP_ROWS)", "const shown = found.slice(0)", NODE_CODE),
  ("pastille X, Y sans écart aux repères", APP+"canvas/handles.ts", "const [px, py] = spots.find(clear) || spots[0];", "const [px, py] = spots[0];", NODE_APP),
  ("taille du code muette dans la barre", APP+"state/code-bar.ts", 'face: { kind: "value", icon: "textSize", text: String(a.style.text_size) },', 'face: { kind: "icon", icon: "textSize" },', NODE_CODE),
  ("menu sans coller comme code", APP+"state/context.ts", 'item("clip:pasteCode", "pasteCodeHere", { keys: t("shell:context.keys.pasteCode"), aria: "Control+Shift+V" }), ', "", NODE_APP),
]
CHROMIUM = [
  ("le champ reprend le focus", APP+"canvas/code-edit.tsx", "    if (warn) return;\n    const at = offsetOfLine", "    if (warn) { el.focus({ preventScroll: true }); return; }\n    const at = offsetOfLine", py("tests/test_app_code.py")),
  ("Tab écrit sous l'avertissement", APP+"canvas/code-edit.tsx", 'if (event.key === "Tab" && warn) { event.preventDefault(); toWarn(event.shiftKey); return; }', "", py("tests/test_app_code.py")),
  ("avertissement sans confinement", APP+"canvas/code-warn.tsx", 'if (event.key !== "Tab" || !panel.current) return;', "return;", py("tests/test_app_code.py")),
  ("avertissement toujours à droite", APP+"canvas/code-warn.tsx", "const at = placeWarn(", "const at = ((b: { x: number; y: number; w: number }) => ({ x: b.x + b.w + 12, y: b.y, side: \"right\" }))({ x: b.left, y: b.top, w: b.width }) || placeWarn(", py("tests/test_app_code.py")),
  ("Tab ferme le volet", APP+"components/FloatingBar.tsx", 'if (el && el.getAttribute("role") === "dialog") {', "if (el && false) {", py("tests/test_app_guides.py")),
  ("Ctrl+Maj+V ignoré", APP+"components/Shell.tsx", 'if (mod && event.shiftKey && !event.altKey && key === "v" && !dialog && !elsewhere(event.target)) {', "if (false) {", py("tests/test_app_code.py")),
  ("bulle de la valeur absente", APP+"canvas/Flow.tsx", 'if (one) { showTip("secret:"', 'if (one && false) { showTip("secret:"', py("tests/test_app_code.py")),
]
which = sys.argv[1] if len(sys.argv) > 1 else "node"
todo = M if which == "node" else CHROMIUM if which == "chromium" else [m for m in M if m[0] in which.split("|")]
out = []
for name, path, old, new, cmd in todo:
    src = open(path).read()
    assert src.count(old) == 1, (name, src.count(old))
    open(path, "w").write(src.replace(old, new))
    try:
        b = subprocess.run(["npm", "run", "build"], cwd=ROOT + "/engine", capture_output=True, text=True)
        if b.returncode:
            out.append((name, "build cassé (attrapée par tsc)")); print(out[-1], flush=True); continue
        r = subprocess.run(cmd, cwd=ROOT + "/backend", capture_output=True, text=True, timeout=900, env={**__import__('os').environ, "LD_APP": ROOT + "/backend/src/ld_backend/render/assets/app/app.js"})
        out.append((name, "attrapée" if r.returncode else "SURVIVANTE"))
        print(out[-1], flush=True)
    finally:
        open(path, "w").write(src)
subprocess.run(["npm", "run", "build"], cwd=ROOT + "/engine", capture_output=True)
print(json.dumps(out, ensure_ascii=False))

// Le bloc de code (lot 16 de docs/11), sa partie pure, sous Node et sans DOM : le fichier construit (`app.js`) expose
// `LDApp.code` (géométrie et défilement, langages et détection, familles de jetons par Prism 1.30.0, valeurs sensibles)
// et la barre contextuelle (`LDApp.floating`). Les textes sont factices (secrets inventés, jamais réels).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP = process.env.LD_APP || path.resolve(__dirname, "../../src/ld_backend/render/assets/app/app.js");
const CSS = path.resolve(__dirname, "../../../engine/src/app/styles/code.css");
const clone = (value) => JSON.parse(JSON.stringify(value));
function loadApp() {
  const context = vm.createContext({ console, URLSearchParams });
  vm.runInContext(fs.readFileSync(APP, "utf8"), context, { filename: "app.js" });
  return context.LDApp;
}

const CISCO = [
  "hostname dc01-acc-03",
  "!",
  "enable secret 5 $1$Xk2p$9fQe7rV0nWm3ZbH1uYt8s/",
  "username netadmin privilege 15 secret 9 $9$h1aB2cD3eF4gH5$Qm8vL0pZr7TnW2xYk4sJ6uE1oI9",
  "!",
  "interface Vlan10",
  " description password reset by noc",
  " ip address 10.0.10.23 255.255.255.0",
  "!",
  "snmp-server community Dc01-RoCommunity! RO 99",
  "tacacs-server host 10.0.10.40 key 7 0822455D0A16544541",
  "line vty 0 15",
  " password 7 13061E010803557878",
  " transport input ssh",
  "end",
].join("\n");
const FORTIOS = ["config vpn ipsec phase1-interface", '    edit "vers-dc02"', '        set interface "wan1"', "        set psksecret ENC kQ9vX3mZp0Lr7TnW2xYk4sJ6uE1oI9aC3dF5",
  "    next", "end", "config system admin", '    edit "orhan"', "        set password ENC SH2vE9pQ1zR8tY4uI0oP3aS6dF7gH2", "    next", "end"].join("\n");
const PYTHON = ['"""Lit l\'état des optiques."""', "from netmiko import ConnectHandler", "", "SEUIL_DBM = -9.0", "", "def optiques_faibles(hote: str) -> list[str]:",
  "    return [l for l in lignes if \"Rx\" in l]", "", "for hote in COEURS:", "    print(hote)"].join("\n");
const BASH = ["#!/usr/bin/env bash", "set -euo pipefail", 'DEST="/srv/backup/$(date +%F)"', "for hote in dc01-core-01 dc01-core-02; do", '  ssh "svc@${hote}" > "$DEST/${hote}.cfg"', "done"].join("\n");
const YAML = ["# host_vars/dc01-core-02.yml", "hostname: dc01-core-02", "site: dc01", "vpc:", "  domain: 10", "  keepalive: 10.0.254.2", "uplinks:", "  - interface: Ethernet1/49"].join("\n");
const JSON_TEXT = ['{', '  "hostname": "dc01-fw-01",', '  "ha": { "mode": "active_passive", "priority": 200 },', '  "monitored": true', '}'].join("\n");

/** Les mots d'une famille, sur toutes les lignes. */
const family = (lines, fam) => lines.flat().filter((s) => s.c === fam).map((s) => s.t.trim()).filter(Boolean);
const word = (lines, text) => lines.flat().find((s) => s.t.trim() === text);

test("la coloration : Prism range chaque jeton dans une famille ; la variable d'une boucle Bash n'est pas un mot-clé ; un nom d'hôte n'est jamais colorié à moitié", () => {
  const { code } = loadApp();
  const py = code.codeLines(PYTHON, "python", true);
  assert.equal(py.length, 10, "une ligne de segments par ligne de texte");
  assert.ok(family(py, "keyword").includes("def") && family(py, "keyword").includes("from"));
  assert.ok(family(py, "function").includes("optiques_faibles"));
  assert.ok(family(py, "string").some((s) => s.startsWith('"""')));
  assert.ok(family(py, "number").includes("9.0"));
  const sh = code.codeLines(BASH, "bash", true);
  assert.equal(word(sh, "hote").c, "variable", "for hote in : la variable de la boucle (le défaut vu sur le prototype : colorée comme un mot-clé)");
  assert.equal(word(sh, "for").c, "keyword");
  assert.ok(family(sh, "comment").includes("#!/usr/bin/env bash"));
  // `dc01-core-02` : ni le tiret ni « 02 » ne sont colorés à part (Cisco et YAML le faisaient)
  const yaml = code.codeLines(YAML, "yaml", true);
  assert.equal(yaml[1].map((s) => s.t).join(""), "hostname: dc01-core-02");
  assert.ok(!yaml[1].some((s) => s.c === "number" && /^0?2$/.test(s.t)), "un nombre collé à un nom n'est pas un nombre");
  assert.equal(word(yaml, "hostname").c, "property");
  const cisco = code.codeLines(CISCO, "cisco_ios", true);
  assert.ok(!cisco[0].some((s) => s.c === "number"), "hostname dc01-acc-03 : rien n'est un nombre");
  assert.ok(family(cisco, "secret").length >= 3, "la grammaire Cisco marque les valeurs sensibles");
  assert.ok(family(cisco, "number").includes("10.0.10.23"), "une adresse IP");
  const forti = code.codeLines(FORTIOS, "fortios", true);
  assert.ok(family(forti, "keyword").includes("config") && family(forti, "keyword").includes("next"));
  assert.ok(family(forti, "property").includes("psksecret"));
  assert.ok(family(forti, "secret").some((s) => s.startsWith("kQ9")), "la valeur d'un psksecret est un secret");
  assert.ok(family(code.codeLines(JSON_TEXT, "json", true), "property").includes('"hostname"'));
  // sans coloration, ou en texte brut : une seule encre ; le marqueur <removed> se lit toujours comme tel
  const off = code.codeLines("enable secret 9 <removed>\nend", "cisco_ios", false);
  assert.deepEqual(clone(off), [[{ t: "enable secret 9 ", c: null }, { t: "<removed>", c: "masked" }], [{ t: "end", c: null }]]);
  assert.deepEqual(clone(code.codeLines("a\n\nb", "plain", true)), [[{ t: "a", c: null }], [], [{ t: "b", c: null }]]);
  assert.deepEqual(clone(code.FAMILIES), ["comment", "keyword", "string", "number", "function", "builtin", "property", "punct", "variable", "secret", "masked"]);
});

test("une ligne trop longue est coupée au caractère près (chasse fixe), la place du repère réservée", () => {
  const { code } = loadApp();
  const segs = [{ t: "interface ", c: "keyword" }, { t: "TenGigabitEthernet1/1/1", c: "builtin" }];
  assert.deepEqual(clone(code.clipLine(segs, 40)), { segs, clipped: false });
  const cut = code.clipLine(segs, 12);
  assert.equal(cut.clipped, true);
  assert.deepEqual(clone(cut.segs), [{ t: "interface ", c: "keyword" }, { t: "T", c: "builtin" }], "11 caractères + le repère");
  assert.equal(cut.segs.reduce((n, s) => n + s.t.length, 0), 11);
});

test("le collage : CRLF, tabulations à quatre colonnes, contrôles retirés ; un texte de code devient un bloc, une phrase reste une note", () => {
  const { code } = loadApp();
  assert.equal(code.normalizeCode("\r\n\r\nif x:\r\n\treturn 1  \r\nab\tc\u0007d\r\n\r\n"), "if x:\n    return 1\nab  cd");
  assert.equal(code.normalizeCode("x\u007fy"), "xy", "DEL refusé par le contrat");
  const id = (text) => code.detectLanguage(text).id;
  assert.equal(id(CISCO), "cisco_ios");
  assert.equal(id(FORTIOS), "fortios");
  assert.equal(id(PYTHON), "python");
  assert.equal(id(BASH), "bash");
  assert.equal(id(YAML), "yaml");
  assert.equal(id(JSON_TEXT), "json");
  assert.equal(code.detectLanguage(JSON_TEXT).sure, true);
  assert.equal(id("Bonjour à tous,\nla baie 12 est fermée jeudi.\nMerci."), "plain");
  assert.equal(code.pastedAsCode("interface Vlan10\n ip address 10.0.10.1 255.255.255.0"), null, "deux lignes : une note");
  assert.equal(code.pastedAsCode("Réunion jeudi\nsalle B\napporter les badges"), null, "une phrase : une note");
  assert.equal(code.pastedAsCode(CISCO).id, "cisco_ios");
  assert.deepEqual(clone(code.LANGUAGE_IDS), ["plain", "python", "bash", "json", "yaml", "cisco_ios", "fortios"], "l'énumération du contrat (Intent 1.6.0)");
});

test("les valeurs sensibles : repérées quel que soit le langage, la nature dite, retirées par <removed>, jamais revues en clair", () => {
  const { code } = loadApp();
  const found = code.findSecrets(CISCO);
  assert.deepEqual(clone(found.map((f) => [f.line, f.kind, f.nature])), [
    [2, "password", "hash"], [3, "account", "hash"], [9, "snmp", "clear"], [10, "aaaKey", "type7"], [12, "password", "type7"],
  ], "la description qui cite « password » n'est pas une valeur (ancré au début de la ligne)");
  const lines = CISCO.split("\n");
  assert.equal(lines[9].slice(found[2].start, found[2].end), "Dc01-RoCommunity!", "la valeur seule, la commande reste");
  const masked = code.maskSecrets(CISCO, found);
  assert.equal(masked.split("\n")[9], "snmp-server community <removed> RO 99");
  assert.equal(code.findSecrets(masked).length, 0, "un texte retiré ne réveille plus l'alerte");
  assert.equal(code.maskedPreview(lines[2], found[0]), "enable secret 5 ••••••••");
  const forti = code.findSecrets(FORTIOS);
  assert.deepEqual(clone(forti.map((f) => [f.line, f.kind, f.nature])), [[3, "fortios", "encrypted"], [8, "fortios", "encrypted"]]);
  // clé = valeur (YAML, JSON, Python, Bash) : une référence n'est pas une valeur
  const kv = ['db_password: "S3cr3t!"', "api_key = 'abc123'", "token: ${VAULT_TOKEN}", "password: {{ vault_pw }}", 'export SECRET="x9"', "password: null"].join("\n");
  assert.deepEqual(clone(code.findSecrets(kv).map((f) => [f.line, f.kind])), [[0, "generic"], [1, "generic"], [4, "generic"]]);
  assert.equal(code.maskSecrets(kv).split("\n")[0], 'db_password: "<removed>"', "les guillemets gardés");
  const key = ["key: |", "  -----BEGIN RSA PRIVATE KEY-----", "  MIIEowIBAAKCAQEA", "  q9vX3mZp0Lr7", "  -----END RSA PRIVATE KEY-----"].join("\n");
  assert.deepEqual(clone(code.findSecrets(key).map((f) => [f.line, f.kind])), [[2, "privateKey"], [3, "privateKey"]]);
  assert.equal(code.findSecrets("set password ENC <removed>").length, 0);
  // sur la toile et dans la fiche, une valeur gardée est marquée `secret`, même dans une grammaire qui l'ignore
  const yaml = code.withSecrets(code.codeLines('user: a\ndb_password: "S3cr3t!"', "yaml", true), code.findSecrets('user: a\ndb_password: "S3cr3t!"'));
  assert.equal(yaml[1].filter((s) => s.c === "secret").map((s) => s.t).join(""), '"S3cr3t!"');
  assert.equal(yaml[1].map((s) => s.t).join(""), 'db_password: "S3cr3t!"', "rien de perdu au découpage");
});

test("la géométrie : la boîte a la hauteur qu'on lui donne, le code défile par ligne entière, seules les lignes visibles comptent", () => {
  const { code } = loadApp();
  assert.equal(code.lineHeight(13), 20);
  assert.ok(Math.abs(code.charWidth(10, "cascadia_mono") - 5.9) < 1e-9, "la chasse mesurée de Cascadia Mono");
  assert.equal(code.charWidth(10, "ibm_plex_mono"), 6);
  const shape = { w: 640, h: 540, size: 13, font: "jetbrains_mono", numbers: true, total: 120 };
  const l = code.layout(shape, 33);
  assert.deepEqual(clone([l.scrolls, l.visible, l.first, l.maxFirst, l.foot]), [true, 23, 33, 97, 26], "540 de haut : 23 lignes, le pied");
  assert.equal(l.gutter, Math.ceil(3 * 7.8 + 24), "trois chiffres et deux marges");
  assert.equal(code.layout(shape, 500).first, 97, "jamais au-delà de la dernière page");
  assert.equal(code.layout(shape, -4).first, 0);
  const all = code.layout({ ...shape, total: 12 }, 5);
  assert.deepEqual(clone([all.scrolls, all.visible, all.first, all.foot]), [false, 12, 0, 0], "tout tient : ni défilement ni pied");
  assert.deepEqual(clone(code.footer(l)), { from: 34, to: 56, total: 120, below: 64 });
  assert.equal(code.footer(all), null);
  assert.equal(code.fitHeight(12, 13), 300, "34 + 20 + 12 × 20 = 294, arrondi à la grille");
  assert.equal(code.fitHeight(120, 13), 1280, "60 lignes au plus, et le pied : 34 + 20 + 1 200 + 26");
  assert.equal(code.fitHeight(120, 13, 24) <= 560, true, "un collage : 24 lignes au plus");
  // la barre de défilement : la piste pagine, le pouce suit
  const bar = code.scrollbar(l);
  assert.ok(bar.thumbH >= 18 && bar.thumbY > bar.trackY);
  assert.equal(code.trackClick(l, bar.thumbY - 5), 33 - 22, "au-dessus du pouce : une page de moins");
  assert.equal(code.trackClick(l, bar.thumbY + bar.thumbH + 5), 33 + 22);
  assert.equal(code.thumbDrag(l, 33, 0, 1), 33);
  assert.equal(code.thumbDrag(l, 0, 10000, 1), 97, "glissé au bout : la fin");
  assert.deepEqual([code.keyScroll(l, "PageDown"), code.keyScroll(l, "PageUp"), code.keyScroll(l, "Home"), code.keyScroll(l, "End"), code.keyScroll(l, "ArrowDown")], [55, 11, 0, 97, null]);
  // la molette : les pixels s'accumulent en lignes entières, le reste est gardé
  const half = code.wheelLines(0, 10, 0, 20, 1);
  assert.deepEqual(clone(half), { lines: 0, acc: 10 });
  assert.deepEqual(clone(code.wheelLines(half.acc, 10, 0, 20, 1)), { lines: 1, acc: 0 });
  assert.equal(code.wheelLines(0, 100, 0, 20, 0.5).lines, 10, "au zoom 0,5, une ligne vaut 10 pixels d'écran");
  assert.equal(code.wheelLines(0, -3, 1, 20, 1).lines, -3, "en lignes (Firefox)");
  assert.equal(code.offsetOfLine("ab\ncd\nef", 2), 6);
  assert.equal(code.offsetOfLine("ab", 5), 2);
  assert.deepEqual(clone(code.boundedBox(100, 20, 13)), { w: 240, h: 120 }, "jamais sous trois lignes ni sous 240");
  assert.equal(code.pasteWidth("x".repeat(200)), 640);
  assert.equal(code.pasteWidth("ab"), 380);
});

test("la barre contextuelle d'un bloc : teinte | langage, police, coloration, numéros, ajuster, taille | plan, verrou | dupliquer, supprimer ; copier n'y est pas", () => {
  const { floating } = loadApp();
  const style = { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" };
  const content = { kind: "code", text: CISCO, language: "cisco_ios", title: "", highlight: true, line_numbers: true, font: "ibm_plex_mono" };
  const a = { id: "a1-1", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 480, h: 200, z: "front", locked: false, leader: false, content, style, author: "o", at: "" };
  const ids = (entries) => clone(entries.map((e) => e.id));
  const bar = floating.entriesOf({}, { kind: "annotation", a });
  assert.deepEqual(ids(bar), ["hue", "sep", "code_language", "code_font", "code_highlight", "code_numbers", "code_fit", "text_size", "sep", "plane", "lock", "sep", "duplicate", "delete"]);
  const lang = bar.find((e) => e.id === "code_language");
  assert.deepEqual(clone([lang.face, lang.volet.kind]), [{ kind: "text", text: "Cisco IOS / NX-OS", hint: false }, "codeLanguage"]);
  assert.equal(bar.find((e) => e.id === "code_font").face.text, "Plex Mono");
  assert.equal(bar.find((e) => e.id === "code_highlight").pressed, true);
  const plain = floating.entriesOf({}, { kind: "annotation", a: { ...a, h: 400, content: { ...content, language: "plain", text: "a\nb\nc" } } });
  assert.ok(!ids(plain).includes("code_highlight"), "pas de coloration sur un texte brut");
  const fitted = floating.entriesOf({}, { kind: "annotation", a: { ...a, h: 300, content: { ...content, text: "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl" } } });
  assert.ok(!ids(fitted).includes("code_fit"), "« ajuster » absent quand la boîte y est déjà");
  // la détection propose : un YAML déclaré texte brut, le bouton le dit
  const hinted = floating.entriesOf({}, { kind: "annotation", a: { ...a, content: { ...content, language: "plain", text: YAML } } }).find((e) => e.id === "code_language");
  assert.equal(hinted.face.hint, true);
  assert.match(hinted.label, /YAML/);
  assert.equal(floating.barLabel({ kind: "annotation", a }), "actions rapides : bloc de code");
});

test("les couleurs des jetons tiennent 4,5:1 au moins sur le fond du bloc, de l'en-tête et de la gouttière, dans les deux thèmes", () => {
  const css = fs.readFileSync(CSS, "utf8");
  const block = (selector) => { const at = css.indexOf(selector + " {"); return css.slice(at, css.indexOf("}", at)); };
  const vars = (text) => Object.fromEntries(Array.from(text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi), (m) => [m[1], m[2]]));
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const theme of [vars(block(":root")), vars(block(':root[data-theme="light"]'))]) {
    const inks = Object.keys(theme).filter((k) => k.startsWith("tk-")).concat(["code-ink", "code-num"]);
    assert.equal(inks.length, 13, "onze familles, l'encre et les numéros");
    for (const ink of inks) for (const bg of ["code-bg", "code-head", "code-gutter"]) {
      assert.ok(ratio(theme[ink], theme[bg]) >= 4.5, `${ink} sur ${bg} : ${ratio(theme[ink], theme[bg]).toFixed(2)}`);
    }
  }
});

test("le Journal dit un bloc de code en mots : sa sorte, son titre, son langage, ses lignes ; jamais son texte", () => {
  const { journal } = loadApp();
  const content = { kind: "code", text: "enable secret 5 $1$x\nend", language: "cisco_ios", title: "vlans", highlight: true, line_numbers: true, font: "jetbrains_mono" };
  const entry = (ops, subjects) => ({ infrastructure: "lab", revision: 7, at: "2026-10-14T10:00:00Z", author: "orhan", categories: ["annotations"], created: [], subjects, ops });
  const named = entry([{ op: "annotation_create", content }], [{ id: "a7-1", kind: "annotation", label: "vlans", form: "code" }]);
  assert.equal(journal.textOf(journal.headline(named)), "a ajouté un bloc de code vlans");
  const facts = clone(journal.factsOf(named.ops[0]));
  assert.deepEqual(facts.find((f) => f.label === "contenu"), { label: "contenu", value: "bloc de code « vlans » (Cisco IOS / NX-OS, 2 lignes)" });
  assert.ok(!JSON.stringify(facts).includes("secret"), "le texte n'est jamais dit");
  const untitled = entry([{ op: "annotation_delete", id: "a7-1" }], [{ id: "a7-1", kind: "annotation", label: "", form: "code" }]);
  assert.equal(journal.textOf(journal.headline(untitled)), "a supprimé le bloc de code sans titre");
});

test("la recherche lit le texte des blocs de code : « vlan 20 » trouve la configuration, à la ligne qui le porte", () => {
  const { searching } = loadApp();
  const text = ["interface Gi1/0/1", " switchport access vlan 10", "interface Gi1/0/2", " switchport access vlan 20"].join("\n");
  const block = { id: "a2-1", anchor: { kind: "device", ref: "dc01-acc-01" }, content: { kind: "code", text, language: "cisco_ios", title: "running-config", highlight: true, line_numbers: true, font: "jetbrains_mono" } };
  const note = { id: "a2-2", anchor: { kind: "free", ref: null }, content: { kind: "note", text: "baie 12" } };
  const model = { nodes: [], ghostNodes: [], interfaces: [], groupById: new Map(), clusters: [], nodeByHost: new Map(), linksByIface: new Map(), annotationById: new Map([["a2-1", block], ["a2-2", note]]) };
  const found = searching.search(model, "vlan 20");
  assert.deepEqual(clone(found.notes.map((h) => [h.title, h.detail, h.line, h.selection])), [["running-config", "l. 4 · switchport access vlan 20", 3, { kind: "annotation", id: "a2-1" }]]);
  assert.deepEqual(clone(found.hosts), ["dc01-acc-01"], "l'équipement qui porte le bloc s'éclaire");
  assert.equal(searching.search(model, "baie").notes[0].title, "baie 12", "une note aussi");
  assert.equal(searching.search(model, "type:switch").notes.length, 0, "un champ d'équipement ne vise pas le texte");
});

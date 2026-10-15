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

// ——— Revue indépendante du lot 16 (docs/revues/2026-10-15-lot-16-bloc-de-code.md) ———

/** Les 26 cas de la sonde S1 de la revue (H1), puis ceux de S2 (H2) et quelques formes voisines : chaque valeur attendue
 *  est trouvée en entier, et rien n'en survit au retrait. `missed` : manqué assumé, avec sa raison (aucun aujourd'hui). */
const SECRET_CASES = [
  ["radius key sans type", "radius-server host 10.0.0.5 key Radius-S3cret", ["Radius-S3cret"]],
  ["radius-server key nu", "radius-server key Radius-S3cret", ["Radius-S3cret"]],
  ["tacacs key sans type", "tacacs-server key Tac-S3cret", ["Tac-S3cret"]],
  ["tacacs server bloc key nu", "tacacs server ISE\n address ipv4 10.0.0.40\n key Tac-S3cret", ["Tac-S3cret"]],
  ["bgp neighbor password type 7", " neighbor 10.0.0.1 password 7 0822455D0A16", ["0822455D0A16"]],
  ["bgp neighbor password clair", " neighbor 10.0.0.1 password Bgp-S3cret", ["Bgp-S3cret"]],
  ["ospf md5", " ip ospf message-digest-key 1 md5 Ospf-S3cret", ["Ospf-S3cret"]],
  ["ospf auth-key", " ip ospf authentication-key Ospf-S3cret", ["Ospf-S3cret"]],
  ["hsrp key-string", " standby 1 authentication md5 key-string Hsrp-S3cret", ["Hsrp-S3cret"]],
  ["hsrp texte", " standby 1 authentication Hsrp-S3cret", ["Hsrp-S3cret"]],
  ["snmp v3 user", "snmp-server user netops grp v3 auth sha Auth-S3cret priv aes 128 Priv-S3cret", ["Auth-S3cret", "Priv-S3cret"]],
  ["snmp host community", "snmp-server host 10.0.0.9 version 2c Comm-S3cret", ["Comm-S3cret"]],
  ["snmp host traps", "snmp-server host 10.0.0.9 traps version 2c Comm-S3cret udp-port 162", ["Comm-S3cret"]],
  ["nxos snmp user", "snmp-server user admin network-admin auth md5 Auth-S3cret priv Priv-S3cret", ["Auth-S3cret", "Priv-S3cret"]],
  ["nxos snmp user aes-128", "snmp-server user admin network-admin auth sha Auth-S3cret priv aes-128 Priv-S3cret", ["Auth-S3cret", "Priv-S3cret"]],
  ["wpa psk", " wpa-psk ascii 0 Wifi-S3cret", ["Wifi-S3cret"]],
  ["bearer header", 'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def" https://api', ["eyJhbGciOiJIUzI1NiJ9.abc.def"]],
  ["curl -u", "curl -u admin:Curl-S3cret https://api", ["Curl-S3cret"]],
  ["curl -u entre guillemets", "curl -u 'admin:Curl S3cret' https://api", ["Curl S3cret"]],
  ["adresse avec identifiants", "git clone https://orhan:Url-S3cret@git.example/net.git", ["Url-S3cret"]],
  ["mysql -p", "mysql -u root -pMy-S3cret db", ["My-S3cret"]],
  ["sshpass", "sshpass -p 'Ssh-S3cret' ssh admin@sw1", ["Ssh-S3cret"]],
  ["option --password", "netbox-sync --url https://nb --password Opt-S3cret --verbose", ["Opt-S3cret"]],
  ["snmpwalk v3", "snmpwalk -v3 -l authPriv -u netops -a SHA -A Auth-S3cret -x AES -X Priv-S3cret 10.0.0.1", ["Auth-S3cret", "Priv-S3cret"]],
  ["snmpwalk v2c", "snmpwalk -v2c -c Comm-S3cret 10.0.0.1 ifDescr", ["Comm-S3cret"]],
  ["export TOKEN", "export API_TOKEN=tok-S3cret", ["tok-S3cret"]],
  ["ansible_ssh_pass", "ansible_ssh_pass: Ans-S3cret", ["Ans-S3cret"]],
  ["ansible_become_pass", "ansible_become_pass: Ans-S3cret", ["Ans-S3cret"]],
  ["yaml community", "snmp_community: Comm-S3cret", ["Comm-S3cret"]],
  ["json minifié", '{"user":"a","password":"P1-S3cret","api_key":"K2-S3cret"}', ["P1-S3cret", "K2-S3cret"]],
  ["deux clés = sur une ligne", "password=P1-S3cret token=T2-S3cret", ["P1-S3cret", "T2-S3cret"]],
  ["pem", "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----", ["b3BlbnNzaC1rZXktdjEAAAAA"]],
  ["pgp", "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOYBGXk2S3cret\n=AbCd\n-----END PGP PRIVATE KEY BLOCK-----", ["lQOYBGXk2S3cret", "=AbCd"]],
  ["fortios snmp", "config system snmp community\n    edit 1\n        set name \"Comm-S3cret\"\n        config hosts\n            edit 1\n                set ip 10.0.0.9 255.255.255.255\n            next\n        end\n    next\nend", ["Comm-S3cret"]],
  ["fortios set password", "        set password ENC SH2vE9pQ1zR8tY4uI0oP3aS6dF7gH2", ["SH2vE9pQ1zR8tY4uI0oP3aS6dF7gH2"]],
  // S2 : la valeur entière, jamais un morceau
  ["dièse dans un mot de passe", "password=Ab#Cd-S3cret", ["Ab#Cd-S3cret"]],
  ["phrase de passe YAML", "db_password: correct horse battery S3cret", ["correct horse battery S3cret"]],
  ["phrase de passe et commentaire", "db_password: correct horse S3cret  # rotation 2026", ["correct horse S3cret"]],
  ["substitution Bash", "PASSWORD=$(cat /etc/S3cret)", ["$(cat /etc/S3cret)"]],
  ["concaténation Python", "api_key = 'abc' + 'S3cret'", ["'abc' + 'S3cret'"]],
  ["Python avec espaces", 'password = "Py-S3cret"', ['"Py-S3cret"']],
  ["bloc YAML", "vault:\n  password: |\n    Line1-S3cret\n    Line2-S3cret\n  user: admin", ["Line1-S3cret", "Line2-S3cret"]],
  ["hash bcrypt en YAML", "password_hash: $2b$12$S3cretHashValueAbCdEf", ["$2b$12$S3cretHashValueAbCdEf"]],
];

/** Des lignes qui citent un mot sensible sans porter de valeur : rien n'est trouvé. */
const NOT_SECRETS = [
  " description password reset by noc",
  "no password",
  "no enable secret",
  "password encryption aes",
  "key chain HSRP-KEYS",
  " key 1",
  "  key 7",
  " standby 1 authentication md5 key-chain HSRP-KEYS",
  "snmp-server host 10.0.0.9 version 3 priv netops",
  "snmp-server host 10.0.0.9 use-vrf management",
  "snmp-server user netops grp v3",
  " ip ospf authentication message-digest",
  "password: $DB_PASS",
  "PASSWORD=${VAULT_PASSWORD}",
  'token: "{{ vault_token }}"',
  "password: <removed>",
  "password: <votre mot de passe>",
  "secret: ********",
  "password: null",
  "password_required: yes",
  "password:",
  "token: !vault |",
  "community: 65000:100",
  "bypass: true",
  "compass: north",
  "ssh -p 2222 admin@sw1",
  "mysql -u root -p db",
  "sshpass -e ssh admin@sw1",
  "curl -u admin https://api",
  "docker run -u 1000:1000 alpine",
  'logger.info(f"token: {tok}")',
];

/** La valeur d'un constat, sans guillemets de bord. */
const valueOf = (text, f) => text.split("\n")[f.line].slice(f.start, f.end).replace(/^["']|["']$/g, "");

test("H1 : les valeurs sensibles d'une configuration, d'un script, d'un fichier de variables : toutes, chacune en entier", () => {
  const { code } = loadApp();
  for (const [name, text, values] of SECRET_CASES) {
    const found = code.findSecrets(text), got = found.map((f) => valueOf(text, f));
    for (const v of values) assert.ok(got.some((g) => g.includes(v.replace(/^["']|["']$/g, ""))), `${name} : ${v} non trouvé (trouvés : ${JSON.stringify(got)})`);
    assert.equal(found.length, values.length, `${name} : ${JSON.stringify(got)}`);
  }
  for (const line of NOT_SECRETS) assert.deepEqual(clone(code.findSecrets(line).map((f) => valueOf(line, f))), [], line);
  // la sorte et la nature, sur quelques formes
  const kinds = (text) => clone(code.findSecrets(text).map((f) => [f.kind, f.nature]));
  assert.deepEqual(kinds(" neighbor 10.0.0.1 password 7 0822455D0A16"), [["routing", "type7"]]);
  assert.deepEqual(kinds("snmp-server user admin network-admin auth md5 0x1a2b3c priv 0x4d5e6f localizedkey"), [["snmpUser", "hash"], ["snmpUser", "hash"]]);
  assert.deepEqual(kinds("password_hash: $2b$12$S3cretHashValueAbCdEf"), [["generic", "hash"]]);
  assert.deepEqual(kinds("curl -u admin:Curl-S3cret https://api"), [["commandLine", "clear"]]);
  assert.deepEqual(kinds('curl -H "Authorization: Bearer eyJh.abc.def" https://api'), [["token", "clear"]]);
  assert.deepEqual(kinds("git clone https://o:Url-S3cret@git.example/x"), [["url", "clear"]]);
  assert.deepEqual(kinds(" wpa-psk ascii 0 Wifi-S3cret"), [["wifi", "clear"]]);
});

test("H2 : « Retirer » ne laisse aucun morceau de la valeur ; un texte retiré ne réveille plus l'alerte", () => {
  const { code } = loadApp();
  // les morceaux d'une valeur (`Ab`, `Cd`, `S3cret`), hors ceux que le reste de la ligne porte déjà (`Priv` de `authPriv`)
  const pieces = (v, rest) => v.split(/[^A-Za-z0-9]+/).filter((p) => p.length >= 2 && !rest.includes(p));
  for (const [name, text, values] of SECRET_CASES) {
    const masked = code.maskSecrets(text), rest = values.reduce((r, v) => r.split(v).join(" "), text);
    for (const v of values) for (const p of pieces(v, rest)) assert.ok(!masked.includes(p), `${name} : « ${p} » survit dans ${JSON.stringify(masked)}`);
    assert.ok(!masked.includes("S3cret"), `${name} : ${JSON.stringify(masked)}`);
    assert.deepEqual(clone(code.findSecrets(masked)), [], `${name} : ${JSON.stringify(masked)}`);
  }
  assert.equal(code.maskSecrets("password=Ab#Cd-S3cret"), "password=<removed>");
  assert.equal(code.maskSecrets("db_password: correct horse S3cret  # rotation 2026"), "db_password: <removed>  # rotation 2026", "le commentaire reste");
  assert.equal(code.maskSecrets("PASSWORD=$(cat /etc/S3cret)"), "PASSWORD=<removed>");
  assert.equal(code.maskSecrets('{"user":"a","password":"P1","api_key":"K2"}'), '{"user":"a","password":"<removed>","api_key":"<removed>"}');
  assert.equal(code.maskSecrets("vault:\n  password: |\n    Line1-S3cret\n  user: admin"), "vault:\n  password: |\n    <removed>\n  user: admin", "un bloc YAML : ses lignes, pas la suivante");
  assert.equal(code.maskSecrets("password = get_pw()"), "password = <removed>", "jamais « password <removed> » : un `=` n'est pas une valeur");
});

test("M1 : une valeur déjà gardée dans le texte enregistré ne se redemande pas ; une nouvelle, si", () => {
  const { code } = loadApp();
  const saved = "snmp-server community Comm-S3cret RO\nend";
  assert.deepEqual(clone(code.newSecrets(saved + "\n!", saved)), [], "même valeur, gardée telle quelle");
  const edited = "snmp-server community Comm-S3cret RO\nusername a secret 0 New-S3cret\nend";
  assert.deepEqual(clone(code.newSecrets(edited, saved).map((f) => [f.line, f.kind])), [[1, "account"]]);
  assert.equal(code.newSecrets(edited, "").length, 2, "un brouillon : toutes");
});

test("M4 et B4 : un collage ne devient un bloc que si le langage est sûr ; les contrôles bidirectionnels ne passent pas", () => {
  const { code } = loadApp();
  for (const t of ["- vérifier le cœur\n- remplacer l'optique\n- appeler le NOC", "Intervention prévue :\nDébut: 22h\nFin: 23h",
    "NOC Paris\n12 rue des Lilas\nContact: astreinte", "site | baie | U\ndc01 | 4 | 22\ndc02 | 7 | 10", "a && b\nc && d\ne && f"]) {
    assert.equal(code.pastedAsCode(t), null, JSON.stringify(t));
  }
  for (const t of [CISCO, FORTIOS, PYTHON, BASH, YAML, JSON_TEXT, "ip route 0.0.0.0 0.0.0.0 10.0.0.1\nip route 10.1.0.0 255.255.0.0 10.0.0.2\nip route 10.2.0.0 255.255.0.0 10.0.0.3",
    "show version | include uptime\nshow interfaces status | include connected\nshow log | last 20"]) {
    assert.ok(code.pastedAsCode(t) && code.pastedAsCode(t).sure, t.split("\n")[0]);
  }
  assert.equal(code.pastedAsCode("ls -l | grep cfg\ncat a.cfg | wc -l\ndf -h | sort").id, "bash", "des tubes Bash restent un bloc Bash");
  // B4 : Trojan Source et séparateurs Unicode retirés
  const bidi = "access-list 10 permit any‮ ⁦x⁩ y\u0085z‏";
  assert.equal(code.normalizeCode(bidi), "access-list 10 permit any xyz");
  assert.equal(code.cleanTyped("a\tb\r\nc‮d  "), "a   b\nc" + "d  ", "en écrivant : tabulations, CR et contrôles seulement");
});

test("B3 : une ligne démesurée se dessine sans coloration (pire cas quadratique des grammaires), les autres gardent la leur", () => {
  const { code } = loadApp();
  const long = "a-".repeat(10000), text = "for h in a b; do\n" + long + "\ndone";
  const t0 = Date.now(), lines = code.codeLines(text, "bash", true), ms = Date.now() - t0;
  assert.ok(ms < 300, `${ms} ms`);
  assert.equal(lines.length, 3);
  assert.deepEqual(clone(lines[1]), [{ t: long, c: null }]);
  assert.equal(lines[0].find((s) => s.t === "for").c, "keyword", "la ligne courte reste colorée");
  assert.equal(lines.map((l) => l.map((s) => s.t).join("")).join("\n"), text, "rien de perdu");
});

test("J2 (revue de session) : Ctrl+Z après « Retirer ces valeurs » ne réécrit pas la valeur retirée ; une autre modification s'annule", () => {
  const { history } = loadApp();
  const base = { anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 480, h: 300, z: "front", locked: false, leader: false, style: {} };
  const code = (text) => ({ ...base, content: { kind: "code", text, language: "cisco_ios", title: "", highlight: true, line_numbers: true, font: "jetbrains_mono" } });
  const doc = (text) => ({ pins: [], device_colors: [], type_colors: [], groups: [], connectors: [], annotations: [{ id: "a1-1", author: "o", at: "", ...code(text) }] });
  const key = history.keyOf("annotation", "a1-1");
  const kept = "snmp-server community Comm-S3cret RO", removed = "snmp-server community <removed> RO";
  const undoRemove = history.plan(doc(removed), [{ key, before: code(kept), after: code(removed) }], "undo");
  assert.deepEqual([undoRemove.ops.length, undoRemove.withheld.length], [0, 1], "retenu, jamais rejoué");
  const undoEdit = history.plan(doc(kept + "\nend"), [{ key, before: code(kept), after: code(kept + "\nend") }], "undo");
  assert.deepEqual([undoEdit.ops.length, undoEdit.withheld.length], [1, 0], "la valeur est encore là : rien de rétabli, l'annulation passe");
  const undoDelete = history.plan({ ...doc(kept), annotations: [] }, [{ key, before: code(kept), after: null }], "undo");
  assert.equal(undoDelete.ops[0].op, "annotation_create", "un bloc supprimé revient tel qu'il était");
});

test("M3 : une charge du presse-papiers compte les valeurs sensibles de ses blocs de code, et sait les retirer sans toucher l'original", () => {
  const { clipboard } = loadApp();
  const block = { id: "a1-1", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 480, h: 300, z: "front", leader: false, frame: { x: 0, y: 0, w: 480, h: 300 }, style: {},
    content: { kind: "code", text: "snmp-server community Comm-S3cret RO\nusername a secret 0 Adm-S3cret", language: "cisco_ios", title: "", highlight: true, line_numbers: true, font: "jetbrains_mono" } };
  const note = { ...block, id: "a1-2", content: { kind: "note", text: "password: rien à voir ici" } };
  const p = { "living-diagram": 1, infrastructure: "dc01", annotations: [block, note], connectors: [], hosts: [] };
  assert.equal(clipboard.secretsOf(p), 2);
  const clean = clipboard.withoutSecrets(p);
  assert.equal(clean.annotations[0].content.text, "snmp-server community <removed> RO\nusername a secret 0 <removed>");
  assert.equal(clean.annotations[1], note, "une note passe telle quelle");
  assert.ok(p.annotations[0].content.text.includes("Comm-S3cret"), "la charge d'origine n'est pas touchée");
  assert.equal(clipboard.secretsOf(clean), 0);
});

test("B3 : la recherche des valeurs sensibles reste linéaire sur une ligne démesurée", () => {
  const { code } = loadApp();
  for (const text of ["password: x" + " ".repeat(20000) + "y", "snmpwalk" + " -c".repeat(6600), "PASSWORD=$(" + "(".repeat(20000), "a-".repeat(10000)]) {
    const t0 = Date.now(); code.findSecrets(text); const ms = Date.now() - t0;
    assert.ok(ms < 150, `${ms} ms sur ${JSON.stringify(text.slice(0, 20))}…`);
  }
});

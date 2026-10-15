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

test("la géométrie : la boîte a la hauteur qu'on lui donne, le code défile par rangée entière, seules les rangées visibles comptent", () => {
  const { code } = loadApp();
  assert.equal(code.lineHeight(13), 20);
  assert.equal(code.charWidth(2048, "cascadia_mono"), 1200, "l'avance de Cascadia Mono : 1 200 unités sur 2 048 (lue dans Chromium)");
  assert.equal(code.charWidth(10, "ibm_plex_mono"), 6);
  const text = Array.from({ length: 120 }, (_, i) => "ligne " + i).join("\n");
  const shape = { w: 640, h: 540, size: 13, font: "jetbrains_mono", numbers: true, text, wrap: true };
  const l = code.layout(shape, 33);
  assert.deepEqual(clone([l.scrolls, l.visible, l.first, l.maxFirst, l.foot, l.total, l.lines]), [true, 23, 33, 97, 26, 120, 120], "540 de haut : 23 rangées, le pied");
  assert.equal(l.gutter, Math.ceil(3 * 7.8 + 24), "trois chiffres et deux marges");
  assert.equal(l.textX, code.CODE.RAIL + l.gutter);
  assert.equal(l.cols, Math.floor((640 - l.textX - 16 - 12) / 7.8), "la piste de défilement toujours réservée");
  assert.equal(code.layout({ ...shape, numbers: false }, 0).textX, code.CODE.RAIL + code.CODE.LEFT);
  assert.equal(code.layout(shape, 500).first, 97, "jamais au-delà de la dernière page");
  assert.equal(code.layout(shape, -4).first, 0);
  const all = code.layout({ ...shape, text: text.split("\n").slice(0, 12).join("\n") }, 5);
  assert.deepEqual(clone([all.scrolls, all.visible, all.first, all.foot]), [false, 12, 0, 0], "tout tient : ni défilement ni pied");
  assert.equal(code.layout({ ...shape, h: 4000 }, 0).cols, l.cols, "les colonnes ne dépendent pas du défilement");
  assert.deepEqual(clone(code.footer(l)), { from: 34, to: 56, total: 120, below: 64 }, "en lignes du texte");
  assert.equal(code.footer(all), null);
  assert.equal(code.fitHeight(12, 13), 300, "34 + 20 + 12 × 20 = 294, arrondi à la grille");
  assert.equal(code.fitHeight(120, 13), 1280, "60 rangées au plus, et le pied : 34 + 20 + 1 200 + 26");
  assert.equal(code.fitHeight(120, 13, 24) <= 560, true, "un collage : 24 rangées au plus");
  // retour à la ligne : les rangées comptent, le pied parle en lignes
  const long = ["court", "x ".repeat(120).trim(), "fin"].join("\n");
  const wrapped = code.layout({ ...shape, w: 300, h: 140, text: long }, 0), clipped = code.layout({ ...shape, w: 300, h: 140, text: long, wrap: false }, 0);
  assert.equal(wrapped.lines, 3);
  assert.ok(wrapped.total > 3 && clipped.total === 3, "une ligne longue devient plusieurs rangées, sans retour à la ligne une seule");
  assert.equal(code.fitHeightOf({ w: 300, size: 13, font: "jetbrains_mono", numbers: true, text: long, wrap: true }), code.fitHeight(wrapped.total, 13), "ajuster : les rangées à sa largeur");
  const foot = code.footer(wrapped);
  assert.deepEqual(clone([foot.from, foot.total]), [1, 3]);
  // la barre de défilement : la piste pagine, le pouce suit
  const bar = code.scrollbar(l);
  assert.ok(bar.thumbH >= 18 && bar.thumbY > bar.trackY);
  assert.equal(code.trackClick(l, bar.thumbY - 5), 33 - 22, "au-dessus du pouce : une page de moins");
  assert.equal(code.trackClick(l, bar.thumbY + bar.thumbH + 5), 33 + 22);
  assert.equal(code.thumbDrag(l, 33, 0, 1), 33);
  assert.equal(code.thumbDrag(l, 0, 10000, 1), 97, "glissé au bout : la fin");
  assert.deepEqual([code.keyScroll(l, "PageDown"), code.keyScroll(l, "PageUp"), code.keyScroll(l, "Home"), code.keyScroll(l, "End"), code.keyScroll(l, "ArrowDown")], [55, 11, 0, 97, null]);
  // la molette : les pixels s'accumulent en rangées entières, le reste est gardé
  const half = code.wheelLines(0, 10, 0, 20, 1);
  assert.deepEqual(clone(half), { lines: 0, acc: 10 });
  assert.deepEqual(clone(code.wheelLines(half.acc, 10, 0, 20, 1)), { lines: 1, acc: 0 });
  assert.equal(code.wheelLines(0, 100, 0, 20, 0.5).lines, 10, "au zoom 0,5, une rangée vaut 10 pixels d'écran");
  assert.equal(code.wheelLines(0, -3, 1, 20, 1).lines, -3, "en lignes (Firefox)");
  assert.equal(code.offsetOfLine("ab\ncd\nef", 2), 6);
  assert.equal(code.offsetOfLine("ab", 5), 2);
  assert.deepEqual(clone(code.boundedBox(100, 20, 13)), { w: 240, h: 120 }, "jamais sous trois rangées ni sous 240");
  assert.equal(code.pasteWidth("x".repeat(200)), 640);
  assert.equal(code.pasteWidth("ab"), 380);
});

test("16 bis, la règle de coupure (wrap.ts) : les espaces pendent, un mot court passe entier, un mot long se coupe au caractère, les rangées de suite en retrait", () => {
  const W = loadApp().code.wrapping;
  const rows = (text, cols) => clone(W.wrapLine(text, 0, cols, true).map((r) => text.slice(r.from, r.to)));
  assert.deepEqual(rows("abc def ghi", 20), ["abc def ghi"], "tient : une rangée");
  assert.deepEqual(rows("abc def ghi", 7), ["abc def ", "ghi"], "les espaces restent au bout de la rangée qu'ils quittent, même au-delà du bord");
  assert.deepEqual(rows("abc def ghi", 6), ["abc ", "def ", "ghi"]);
  assert.deepEqual(rows("  interface Gi1/0/1 description longue", 16), ["  interface ", "Gi1/0/1 ", "description ", "longue"], "un mot qui ne tient pas passe entier");
  assert.equal(W.hangOf("  interface", 16), 4, "le retrait : l'indentation + 2");
  assert.equal(W.hangOf("x", 6), 2);
  assert.equal(W.hangOf(" ".repeat(50) + "x", 40), 20, "au plus la moitié de la largeur");
  assert.equal(W.hangOf("      ", 40), 2, "une ligne d'espaces n'a pas d'indentation à prolonger");
  const long = "a".repeat(25);
  assert.deepEqual(rows("vlan " + long, 10), ["vlan aaaaa", "aaaaaaaa", "aaaaaaaa", "aaaa"], "un mot plus long qu'une rangée de suite remplit la place puis des rangées entières (8 colonnes de suite)");
  assert.deepEqual(clone(W.wrapLine("abc", 0, 2, false)), [{ line: 0, from: 0, to: 3, cont: false, hang: 0 }], "sans retour à la ligne : une rangée, entière");
  const many = W.wrapText("a\n" + "b ".repeat(30).trim(), 10, true);
  assert.deepEqual(clone(many.map((r) => [r.line, r.cont])).slice(0, 3), [[0, false], [1, false], [1, true]]);
  // les invariants, sur des lignes tirées au hasard : rien ne se perd, une rangée ne déborde jamais que de ses espaces,
  // un mot court n'est jamais coupé
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const words = ["interface", "GigabitEthernet1/0/24", "C1|dc01-core-01|Ethernet1/21|", "10,20,30", "a-b-c", "x", "kQ9vX3mZp0Lr7TnW2xYk4sJ6uE1oI9aC3dF5gH7jK0lM2nB8"];
  for (let n = 0; n < 400; n += 1) {
    const text = " ".repeat(Math.floor(rnd() * 6)) + Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => words[Math.floor(rnd() * words.length)]).join(rnd() < 0.5 ? " " : "  ");
    const cols = 8 + Math.floor(rnd() * 60);
    const got = W.wrapLine(text, 0, cols, true);
    assert.equal(got.map((r) => text.slice(r.from, r.to)).join(""), text, "rien ne se perd");
    got.forEach((r, i) => {
      const width = r.cont ? cols - r.hang : cols, body = text.slice(r.from, r.to).replace(/ +$/, "");
      assert.ok(body.length <= width, JSON.stringify({ text, cols, i }));
      if (i) assert.ok(r.cont && r.from === got[i - 1].to);
    });
    for (const [a, b] of W.wordsOf(text)) {
      if (W.isLong(b - a, cols, W.hangOf(text, cols))) continue;
      assert.ok(!got.some((r) => r.from > a && r.from < b), "un mot court jamais coupé : " + JSON.stringify({ text, cols }));
    }
  }
});

test("16 bis : les rangées se dessinent par morceaux (une couleur à cheval garde sa famille), les valeurs sensibles par rangée, l'ouverture et la reprise de la lecture", () => {
  const { code } = loadApp();
  const segs = [{ t: "interface ", c: "keyword" }, { t: "GigabitEthernet1/0/24", c: null }];
  assert.deepEqual(clone(code.rowSegments(segs, 5, 15)), [{ t: "face ", c: "keyword" }, { t: "Gigab", c: null }]);
  assert.deepEqual(clone(code.rowSegments(segs, 0, 10)), [{ t: "interface ", c: "keyword" }], "un segment entier reste le même objet");
  const text = ["hostname x", "snmp-server community Dc01-RoCommunity-avec-un-tres-long-nom RO", "end"].join("\n");
  const l = code.layout({ w: 300, h: 400, size: 13, font: "jetbrains_mono", numbers: true, text, wrap: true }, 0);
  const secret = { line: 1, start: 22, end: 61 };
  const boxes = code.secretBoxes([secret], l);
  assert.ok(boxes.length >= 2, "une valeur coupée par le retour à la ligne : une zone par rangée");
  assert.equal(boxes.reduce((k, b) => k + b.w, 0), (61 - 22) * l.cw, "toute la valeur, rien de plus");
  assert.ok(boxes.every((b) => b.index === 0));
  const second = l.rows.findIndex((r) => r.line === 1 && r.cont);
  const open = code.openingOf(text, { rows: l.rows, first: second });
  assert.deepEqual(clone([open.line, open.k]), [1, 1], "ouvrir sur une rangée de suite : sa ligne, son rang");
  assert.equal(open.offset, text.indexOf("\n") + 1 + l.rows[second].from);
  assert.equal(code.rowOf(l, { line: 1, k: 1 }), second, "l'inverse : la lecture reprend à la même rangée");
  assert.equal(code.rowOf(l, { line: 1, k: 99 }), l.rows.filter((r) => r.line === 1).length + 0, "un rang trop grand : la dernière rangée de la ligne");
  assert.equal(code.rowOf(l, { line: 9, k: 0 }), l.rows.length - 1, "une ligne disparue : la fin");
  assert.equal(code.rowX(l, l.rows[second]), l.textX + l.rows[second].hang * l.cw, "une rangée de suite est en retrait");
});

test("16 bis : la ligne de base de la lecture, celle d'une ligne HTML (l'écriture) ; la taille libre et son échelle ; le collage qui dépasserait la borne", () => {
  const { code } = loadApp();
  // mesurées dans Chromium (sous Linux, une descendante arrondie par défaut prend un pixel à l'ascendante)
  assert.equal(code.baselineOffset(13, 20, "jetbrains_mono"), 14, "13 px dans 20 : ascendante 13, descendante 4, demi-interligne 1");
  assert.equal(code.baselineOffset(8, 12, "jetbrains_mono"), 8, "8 px : la descendante 2,4 arrondie à 2 prend un pixel à l'ascendante (7 + 3)");
  assert.equal(code.baselineOffset(11, 17, "jetbrains_mono"), 11);
  assert.equal(code.baselineOffset(32, 50, "cascadia_mono"), 36);
  assert.equal(code.baselineOffset(47, 73, "cascadia_mono"), 52);
  assert.equal(code.baselineOffset(8, 12, "jetbrains_mono", false), 9, "sans le pixel prêté (autres plates-formes : la page mesure)");
  assert.equal(code.baseline(2, 20, 14), 34 + 10 + 40 + 14);
  const S = code.sizes;
  assert.deepEqual(clone([S.SIZE_MIN, S.SIZE_MAX]), [8, 64]);
  assert.deepEqual(clone(code.CODE_SIZE), [8, 64], "le bloc de code aussi : libre de 8 à 64");
  assert.deepEqual([S.stepSize(13, 1), S.stepSize(14, 1), S.stepSize(15, 1), S.stepSize(15, -1), S.stepSize(64, 1), S.stepSize(8, -1), S.stepSize(100, -1)], [14, 16, 16, 14, 64, 8, 48]);
  assert.deepEqual([S.clampSize(3), S.clampSize(70), S.clampSize(12.6)], [8, 64, 13]);
  assert.deepEqual(clone(S.wheelSteps(0, -100, 0)), { steps: 1, acc: 0 }, "vers le haut : plus grand");
  assert.deepEqual(clone(S.wheelSteps(0, -50, 0)), { steps: 0, acc: 50 });
  assert.deepEqual(clone(S.wheelSteps(50, -60, 0)), { steps: 1, acc: 10 });
  assert.equal(S.wheelSteps(0, 3, 1).steps, -1, "en lignes (Firefox) : trois lignes, un cran vers le bas");
  const E = code.editor;
  assert.equal(E.pasteTooLong(100, 0, "x".repeat(50), 200), false);
  assert.equal(E.pasteTooLong(100, 0, "x".repeat(150), 200), true);
  assert.equal(E.pasteTooLong(190, 0, "\t\t\tx", 200), true, "une tabulation devient quatre espaces : 190 + 13 > 200");
  assert.equal(E.pasteTooLong(150, 100, "x".repeat(140), 200), false, "la sélection remplacée ne compte pas");
});

test("la barre contextuelle d'un bloc : teinte | langage, coloration, numéros, retour à la ligne, ajuster, taille et police | plan, verrou | dupliquer, supprimer ; puis celle de l'écriture", () => {
  const { floating, codeBar } = loadApp();
  const style = { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" };
  const content = { kind: "code", text: CISCO, language: "cisco_ios", title: "", highlight: true, line_numbers: true, font: "ibm_plex_mono", wrap: true };
  const a = { id: "a1-1", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 480, h: 200, z: "front", locked: false, leader: false, content, style, author: "o", at: "" };
  const ids = (entries) => clone(entries.map((e) => e.id));
  const bar = floating.entriesOf({}, { kind: "annotation", a });
  assert.deepEqual(ids(bar), ["hue", "sep", "code_language", "code_highlight", "code_numbers", "code_wrap", "code_fit", "text_size", "sep", "plane", "lock", "sep", "duplicate", "delete"]);
  const lang = bar.find((e) => e.id === "code_language");
  assert.deepEqual(clone([lang.face, lang.volet.kind]), [{ kind: "text", text: "Cisco IOS / NX-OS", hint: false }, "codeLanguage"]);
  assert.equal(bar.find((e) => e.id === "code_highlight").pressed, true);
  assert.equal(bar.find((e) => e.id === "code_wrap").pressed, true, "le retour à la ligne, une bascule (lot 16 bis)");
  // la taille se lit dans la barre (« AA 13 ») ; son volet porte « − n + » puis les quatre polices (lot 16 bis)
  const size = bar.find((e) => e.id === "text_size");
  assert.deepEqual(clone(size.face), { kind: "value", icon: "textSize", text: "13" });
  assert.deepEqual(clone(size.volet), { kind: "textSize", value: 13, font: "ibm_plex_mono", fonts: "code" });
  const plain = floating.entriesOf({}, { kind: "annotation", a: { ...a, h: 400, content: { ...content, language: "plain", text: "a\nb\nc" } } });
  assert.ok(!ids(plain).includes("code_highlight"), "pas de coloration sur un texte brut");
  const fitted = floating.entriesOf({}, { kind: "annotation", a: { ...a, h: 300, content: { ...content, text: "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl" } } });
  assert.ok(!ids(fitted).includes("code_fit"), "« ajuster » absent quand la boîte y est déjà");
  const hinted = floating.entriesOf({}, { kind: "annotation", a: { ...a, content: { ...content, language: "plain", text: YAML } } }).find((e) => e.id === "code_language");
  assert.equal(hinted.face.hint, true);
  assert.match(hinted.label, /YAML/);
  assert.equal(floating.barLabel({ kind: "annotation", a }), "actions rapides : bloc de code");
  // la barre de l'écriture : chercher, retour à la ligne, taille et police | abandonner (armé : « cliquer encore »), enregistrer
  const writing = { key: "annotation:a1-1", draft: false, size: 16, font: "jetbrains_mono", wrap: false, dirty: true, search: {}, actions: {} };
  const w = codeBar.writingEntries(writing, false);
  assert.deepEqual(ids(w), ["code_search", "code_wrap", "text_size", "sep", "code_abandon", "code_save"]);
  assert.deepEqual(clone(w.map((e) => e.face && e.face.icon).filter(Boolean)), ["search", "wrap", "textSize", "abandon", "save"], "des icônes, le mot en infobulle");
  assert.equal(w.find((e) => e.id === "code_wrap").pressed, false);
  assert.equal(w.find((e) => e.id === "text_size").face.text, "16");
  assert.match(w.find((e) => e.id === "code_abandon").label, /modifications/);
  const armed = codeBar.writingEntries(writing, true).find((e) => e.id === "code_abandon");
  assert.deepEqual([armed.pressed, armed.danger], [true, true]);
  assert.match(armed.label, /cliquer encore/);
  assert.equal(codeBar.writingEntries({ ...writing, dirty: false }, false).find((e) => e.id === "code_abandon").label, "abandonner");
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

// ---------------------------------------------------------------- passe de finition (critique et audit du 2026-10-15)

test("finition : les textes à la couleur d'une teinte tiennent 4,5:1 (pastille du langage, nature d'une valeur), le pouce 3:1, dans les deux thèmes", () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, "../../../engine/src/app/styles/" + file), "utf8");
  const block = (css, selector) => { const at = css.indexOf(selector + " {"); return css.slice(at, css.indexOf("}", at)); };
  const vars = (text) => Object.fromEntries(Array.from(text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi), (m) => [m[1], m[2]]));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, p) => "#" + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
  const lum = (hex) => { const c = rgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tokens = read("tokens.css"), code = read("code.css"), canvas = read("canvas.css");
  // la feuille dit bien que la pastille écrit à l'encre de sa teinte, et chaque teinte la pose
  assert.match(code, /\.code-pill text \{[^}]*fill: var\(--type-ink/);
  const hues = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
  for (const h of hues) assert.ok(canvas.includes(`.hue-${h} { --type: var(--hue-${h}); --type-ink: var(--hue-${h}-ink); }`), h);
  for (const selector of [":root", ':root[data-theme="light"]']) {
    const t = { ...vars(block(tokens, selector)), ...vars(block(code, selector)) };
    for (const h of hues) {
      const pill = mix(t["hue-" + h], t["code-head"], 0.14); // le fond de la pastille (code.css : 14 % de la teinte)
      assert.ok(ratio(t["hue-" + h + "-ink"], pill) >= 4.5, `${selector} pastille ${h} : ${ratio(t["hue-" + h + "-ink"], pill).toFixed(2)}`);
    }
    const chip = mix(t.warning, t["bg-elev-2"], 0.12); // la nature d'une valeur sur sa pastille, dans l'avertissement
    assert.ok(ratio(t["code-nature"], chip) >= 4.5, `${selector} nature : ${ratio(t["code-nature"], chip).toFixed(2)}`);
    for (const bg of ["code-bg", "code-head"]) assert.ok(ratio(t["code-thumb"], t[bg]) >= 3, `${selector} pouce sur ${bg} : ${ratio(t["code-thumb"], t[bg]).toFixed(2)}`);
    assert.ok(ratio(t["code-thumb-hover"], t["code-bg"]) > ratio(t["code-thumb"], t["code-bg"]), "le pouce survolé ressort davantage");
  }
});

test("finition : l'avertissement se pose à droite, à gauche, dessous, dessus, sinon sur le bloc, toujours dans la zone (jamais sous la fiche)", () => {
  const { code } = loadApp();
  const zone = { left: 12, top: 56, right: 900, bottom: 800 }; // la fiche commence à 916
  const at = (block, h = 300) => clone(code.placeWarn(block, 448, h, zone, 12));
  assert.deepEqual(at({ x: 100, y: 200, w: 300, h: 200 }), { x: 412, y: 200, side: "right" });
  assert.deepEqual(at({ x: 500, y: 200, w: 300, h: 200 }), { x: 40, y: 200, side: "left" });
  assert.deepEqual(at({ x: 300, y: 100, w: 400, h: 200 }), { x: 300, y: 312, side: "below" }, "ni à droite ni à gauche : dessous, aligné sur son bord gauche");
  assert.deepEqual(at({ x: 300, y: 450, w: 400, h: 340 }), { x: 300, y: 138, side: "above" });
  assert.deepEqual(at({ x: 300, y: 150, w: 580, h: 600 }), { x: 432, y: 150, side: "over" }, "nulle part : sur le bloc, borné à la zone");
  const low = at({ x: 100, y: 700, w: 300, h: 80 });
  assert.deepEqual([low.side, low.y], ["right", 500], "à côté, remonté pour ne pas passer sous la bande");
  for (const block of [{ x: 600, y: 300, w: 300, h: 300 }, { x: 10, y: 60, w: 880, h: 700 }, { x: 450, y: 60, w: 450, h: 300 }]) {
    const p = code.placeWarn(block, 448, 300, zone, 12);
    assert.ok(p.x >= zone.left && p.x + 448 <= zone.right && p.y >= zone.top && p.y + 300 <= zone.bottom, JSON.stringify([block, p]));
  }
});

test("finition : la fiche d'un long bloc ne rend que sa fenêtre", () => {
  const { code } = loadApp();
  assert.deepEqual(clone(code.lineWindow(2000, 0, 300, 19)), { from: 0, to: 36, before: 0, after: (2000 - 36) * 19 });
  assert.deepEqual(clone(code.lineWindow(2000, 19 * 1000, 300, 19)), { from: 980, to: 1036, before: 980 * 19, after: 964 * 19 });
  assert.deepEqual(clone(code.lineWindow(2000, 19 * 1990, 300, 19)), { from: 1970, to: 2000, before: 1970 * 19, after: 0 }, "en bas : jusqu'à la dernière");
  assert.deepEqual(clone(code.lineWindow(10, 0, 300, 19)), { from: 0, to: 10, before: 0, after: 0 });
  const w = code.lineWindow(2000, 777, 300, 19, 0);
  assert.equal(w.before + (w.to - w.from) * 19 + w.after, 2000 * 19, "les cales et la fenêtre font la hauteur du tout");
  // la gouttière de l'écriture est celle de la lecture (lot 16 bis : aucun saut) ; le point rouge se pose dans sa marge
  assert.equal(code.gutterOf(12, 13, "jetbrains_mono"), Math.ceil(2 * 13 * 0.6 + 2 * code.CODE.GUTTER));
  assert.equal(code.gutterOf(1200, 13, "jetbrains_mono") > code.gutterOf(12, 13, "jetbrains_mono"), true);
});

test("finition : coller comme bloc de code (Ctrl+Maj+V) fait toujours un bloc, au langage détecté même non sûr, sinon texte brut", () => {
  const { code } = loadApp();
  const short = "liste des vlans\n- 10 users\n- 20 voix";
  assert.deepEqual(clone(code.pasteChoice(short, { secret: false, force: false })), { as: "note" }, "Ctrl+V : une note");
  assert.deepEqual(clone(code.pasteChoice(short, { secret: false, force: true })), { as: "code", language: "plain", sure: false }, "comme bloc : texte brut");
  assert.deepEqual(clone(code.pasteChoice(PYTHON, { secret: false, force: false })), { as: "code", language: "python", sure: true });
  assert.deepEqual(clone(code.pasteChoice(PYTHON, { secret: false, force: true })), { as: "code", language: "python", sure: true });
  const guessed = code.pasteChoice("interface Vlan10\n ip address 10.0.0.1 255.255.255.0", { secret: false, force: true });
  assert.deepEqual([guessed.as, guessed.language, guessed.sure], ["code", "cisco_ios", true], "deux lignes : trop court pour Ctrl+V (une note), un bloc Cisco avec Ctrl+Maj+V");
  const unsure = "Notes du jour\nrien à signaler\ncd /tmp\nfin"; // une ligne de Bash sur quatre : proposé, pas sûr
  assert.deepEqual(clone(code.detectLanguage(unsure)), { id: "bash", sure: false, score: 0.28 });
  assert.deepEqual(clone(code.pasteChoice(unsure, { secret: false, force: false })), { as: "note" });
  assert.deepEqual(clone(code.pasteChoice(unsure, { secret: false, force: true })), { as: "code", language: "bash", sure: false }, "le langage détecté, même non sûr");
  assert.deepEqual(clone(code.pasteChoice("interface Vlan10\n ip address 10.0.0.1 255.255.255.0", { secret: false, force: false })), { as: "note" });
  assert.equal(code.pasteChoice("enable secret 0 x", { secret: true, force: false }).as, "code", "une valeur sensible passe toujours par l'avertissement");
  assert.deepEqual(clone(code.pasteChoice("   \n  ", { secret: false, force: true })), { as: "nothing" });
});

test("finition : une valeur gardée et le bouclier disent au survol leur nature et qui les lit, jamais la valeur", () => {
  const { code } = loadApp();
  const found = code.findSecrets(CISCO);
  const text = (blocks) => JSON.stringify(blocks);
  const one = code.secretLines(found[4], "demo-dc");
  assert.deepEqual(clone(one[0]), { kind: "head", title: "Valeur sensible gardée", icon: null, pills: [{ text: "type 7 : réversible", tone: "warning" }], sub: "ligne 13 · mot de passe" });
  assert.match(text(one), /lisible par tous ceux qui ouvrent demo-dc/);
  assert.equal(code.secretLines(found[0], "demo-dc")[0].pills[0].tone, "muted", "un hash ne se lit pas : sans alarme");
  const shield = code.shieldLines(found, "demo-dc");
  assert.equal(shield[0].title, "5 valeurs sensibles gardées");
  assert.deepEqual(clone(shield.filter((b) => b.kind === "row").map((b) => [b.label, b.values[0].text, b.values[1].text])), [
    ["l. 3", "mot de passe", "hash"], ["l. 4", "mot de passe d'un compte", "hash"], ["l. 10", "communauté SNMP", "en clair"], ["l. 11", "clé RADIUS / TACACS", "type 7 : réversible"], ["l. 13", "mot de passe", "type 7 : réversible"]]);
  const many = code.shieldLines(Array.from({ length: 9 }, () => found[2]), "lab");
  assert.equal(many.filter((b) => b.kind === "row").length, code.SECRET_TIP_ROWS);
  assert.match(text(many), /et 3 de plus, dans le code/);
  assert.equal(code.secretTitle(found[2], "demo-dc"), "communauté SNMP, en clair, ligne 10 ; lisible par tous ceux qui ouvrent demo-dc");
  assert.equal(code.shieldTitle(found, "demo-dc"), "5 valeurs sensibles gardées telles quelles, lisibles par tous ceux qui ouvrent demo-dc");
  const lines = CISCO.split("\n");
  for (const f of found) {
    const value = lines[f.line].slice(f.start, f.end);
    for (const said of [text(code.secretLines(f, "demo-dc")), text(shield), code.secretTitle(f, "demo-dc")]) assert.ok(!said.includes(value), "la valeur n'est jamais dite : " + value);
  }
});

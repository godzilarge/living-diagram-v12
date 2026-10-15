// ---------- le bloc de code : la partie pure (le futur engine/src/canvas/code.ts) ----------
// Prism ne sert qu'à découper le texte en jetons (`Prism.tokenize`, un arbre de chaînes et d'objets Token, sans HTML ni
// DOM) ; la page range chaque jeton dans l'une de onze familles et le dessine en <tspan class="tk-…"> (SVG) ou en
// <span class="tk-…"> (fiche), par createElement et textContent. La couleur vient des jetons de la feuille de style,
// jamais d'un style écrit depuis une donnée.

/** Les langages du lot, dans l'ordre de la liste : ceux d'Orhan d'abord, puis la configuration réseau. */
const LANGS = [
  { id: "plain", label: "Texte brut", prism: null, short: "Texte" },
  { id: "python", label: "Python", prism: "python", short: "Python" },
  { id: "bash", label: "Bash", prism: "bash", short: "Bash" },
  { id: "json", label: "JSON", prism: "json", short: "JSON" },
  { id: "yaml", label: "YAML", prism: "yaml", short: "YAML" },
  { id: "cisco_ios", label: "Cisco IOS / NX-OS", prism: "cisco", short: "Cisco", network: true },
  { id: "fortios", label: "FortiOS", prism: "fortios", short: "FortiOS", network: true },
];
const LANG = Object.fromEntries(LANGS.map((l) => [l.id, l]));

/** Les familles de jetons (onze, une couleur chacune) ; le premier nom connu, type puis alias, décide. */
const FAMILY = {
  comment: "comment", prolog: "comment", shebang: "comment", doctype: "comment",
  keyword: "keyword", important: "keyword", rule: "keyword", atrule: "keyword", mode: "keyword", negation: "keyword", directive: "keyword", "for-or-select": "keyword",
  string: "string", char: "string", "attr-value": "string", regex: "string", "triple-quoted-string": "string", "template-string": "string", scalar: "string",
  number: "number", boolean: "number", constant: "number", null: "number", datetime: "number", "ip-address": "number", "ipv6-address": "number", "mac-address": "number", "file-descriptor": "number",
  function: "function", "function-name": "function", decorator: "function",
  builtin: "builtin", "class-name": "builtin", interface: "builtin", protocol: "builtin",
  property: "property", key: "property", "attr-name": "property", tag: "property",
  operator: "punct", punctuation: "punct",
  variable: "variable", parameter: "variable", environment: "variable", "assign-left": "variable",
  secret: "secret",
};
function familyOf(tok, inherited) {
  const names = [tok.type, ...(Array.isArray(tok.alias) ? tok.alias : tok.alias ? [tok.alias] : [])];
  for (const n of names) if (FAMILY[n]) return FAMILY[n];
  return inherited;
}
// le marqueur d'une valeur retirée : `<removed>`, la convention de RANCID (sauvegardes de configurations), neutre vis-à-vis
// de la langue de l'interface (le texte enregistré est partagé, l'interface est bilingue)
const MASK = "<removed>";

/** Le texte en lignes de segments `{ t, c }` (c = famille ou null) ; sans coloration, une seule famille nulle. */
function codeLines(text, lang, highlight) {
  const L = LANG[lang] || LANG.plain;
  const runs = [];
  if (highlight && L.prism && Prism.languages[L.prism]) {
    const walk = (node, fam) => {
      if (typeof node === "string") return runs.push({ t: node, c: fam });
      if (Array.isArray(node)) return node.forEach((n) => walk(n, fam));
      walk(node.content, familyOf(node, fam));
    };
    walk(Prism.tokenize(text, Prism.languages[L.prism]), null);
  } else runs.push({ t: text, c: null });
  // un nombre collé derrière une lettre ou un tiret n'est pas un nombre (`dc01-acc-01`, `core-02`) : la grammaire Cisco
  // et celle de YAML le colorent ; corrigé ici, une fois pour toutes les grammaires
  // (YAML découpe aussi le tiret d'un nom en ponctuation : `dc01-core-02` redevient un seul mot)
  const plain = (c) => (c === "punct" ? null : c);
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1], next = runs[i + 1];
    if (runs[i].t === "-" && runs[i].c === "punct" && /\w$/.test(prev.t) && next && /^\w/.test(next.t)) runs[i] = { t: "-", c: plain(prev.c) };
    else if (runs[i].c === "number" && /[A-Za-z_-]$/.test(prev.t) && /^\d/.test(runs[i].t)) runs[i] = { t: runs[i].t, c: plain(prev.c) };
  }
  // un masque posé par la page se lit comme tel, quelle que soit la grammaire
  const out = [[]];
  for (const r of runs) {
    r.t.split("\n").forEach((part, i) => {
      if (i) out.push([]);
      if (!part) return;
      const pieces = part.split(MASK);
      pieces.forEach((p, k) => { if (k) out[out.length - 1].push({ t: MASK, c: "masked" }); if (p) out[out.length - 1].push({ t: p, c: r.c }); });
    });
  }
  return out;
}

/** Une ligne coupée à `max` caractères (chasse fixe : la largeur se calcule, jamais mesurée) ; `clipped` si coupée. */
function clipLine(segs, max) {
  const len = segs.reduce((k, x) => k + x.t.length, 0);
  if (len <= max) return { segs, clipped: false };
  max -= 1; // la place du repère « › »
  let n = 0; const out = [];
  for (const s of segs) {
    if (n >= max) return { segs: out, clipped: true };
    const room = max - n;
    if (s.t.length <= room) { out.push(s); n += s.t.length; } else { out.push({ t: s.t.slice(0, room), c: s.c }); return { segs: out, clipped: true }; }
  }
  return { segs: out, clipped: false };
}

/** Le collage : retours Windows, tabulations (quatre colonnes) ; le contrat refuse tout autre caractère de contrôle. */
function normalizePaste(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    let col = 0, out = "";
    for (const ch of line) { if (ch === "\t") { const k = 4 - (col % 4); out += " ".repeat(k); col += k; } else if (ch >= " " || ch === " ") { out += ch; col++; } }
    return out.replace(/\s+$/, "");
  }).join("\n").replace(/^\n+|\n+$/g, "");
}

// ---------- la détection du langage : un score par langage, le meilleur s'il se détache ----------
function detectLanguage(text) {
  const lines = text.split("\n").filter((l) => l.trim()), n = Math.max(1, lines.length);
  const ratio = (re) => lines.filter((l) => re.test(l)).length / n;
  const s = { plain: 0.05 };
  const t = text.trim();
  if (/^[{[]/.test(t)) { try { JSON.parse(t); s.json = 1; } catch { s.json = 0.4; } }
  s.fortios = ratio(/^\s*(?:config|edit|set|unset|next|end)\b/) * (/^\s*config\s+\S/m.test(text) ? 1 : 0.5);
  s.cisco_ios = ratio(/^(?:!|interface |hostname |router |ip |ipv6 |vlan |line |snmp-server |username |spanning-tree |aaa |service |logging |ntp |feature |vpc |banner |enable |boot |version |crypto |access-list |\s+(?:switchport|ip address|description|shutdown|no |channel-group|spanning-tree|vpc|standby|ip helper))/) * 1.1;
  s.python = ratio(/^\s*(?:def |class |import |from \S+ import |return\b|if .*:$|for .*:$|elif |else:|try:|except|with .*:$|print\(|@\w)/) * 1.3 + (/\bself\.|__name__/.test(text) ? 0.2 : 0);
  s.bash = ratio(/^\s*(?:#!.*sh|export |if \[|fi$|then$|do$|done$|for \w+ in|while |case |esac|echo |set -|local |\w+=\S|.*\$\{?\w|.*\|\s*\w|.*&&)/) * 1.1 + (/^#!.*\b(?:ba|z|)sh\b/.test(t) ? 0.5 : 0);
  s.yaml = ratio(/^\s*(?:- |[\w.-]+:(?:\s|$)|---$)/) * (/^\s*[\w.-]+:\s/m.test(text) ? 1 : 0.3);
  const ranked = Object.entries(s).sort((a, b) => b[1] - a[1]);
  const [best, top] = ranked[0], second = ranked[1] ? ranked[1][1] : 0;
  return { id: top < 0.2 ? "plain" : best, sure: top >= 0.45 && top - second >= 0.15, score: Math.round(top * 100) / 100 };
}

// ---------- les valeurs sensibles : repérées avant d'enregistrer, quel que soit le langage choisi ----------
// Chaque motif nomme la valeur (groupe `v`) ; seule la valeur est masquée, la commande reste lisible. Motifs Cisco
// repris de la grammaire obsidian-cisco-syntax (SECRET_PATTERNS, MIT), complétés pour FortiOS, Junos et les fichiers
// clé = valeur (YAML, JSON, Python, Bash). Ancrés au début de la ligne pour les configurations : le même mot dans une
// `description` ou un `remark` n'est pas une valeur sensible.
const SECRET_RULES = [
  { label: "mot de passe d'un compte", re: /^[ \t]*username[ \t]+\S+[ \t]+(?:.*?[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/id },
  { label: "mot de passe", re: /^[ \t]*(?:enable[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/id },
  { label: "communauté SNMP", re: /^[ \t]*snmp-server[ \t]+community[ \t]+(?<v>\S+)/id },
  { label: "clé IKE", re: /^[ \t]*crypto[ \t]+isakmp[ \t]+key[ \t]+(?:\d[ \t]+)?(?<v>\S+)/id },
  { label: "clé partagée", re: /^[ \t]*pre-shared-key[ \t]+(?:local[ \t]+|remote[ \t]+)?(?:\d[ \t]+)?(?<v>\S+)/id },
  { label: "clé d'authentification", re: /^[ \t]*key-string[ \t]+(?:\d{1,2}[ \t]+)?(?<v>\S+)/id },
  { label: "clé RADIUS / TACACS", re: /^[ \t]*(?:(?:tacacs-server|radius-server)[ \t]+(?:host[ \t]+\S+[ \t]+)?)?key[ \t]+(?:0|6|7)[ \t]+(?<v>\S+)/id },
  { label: "clé NTP", re: /^[ \t]*ntp[ \t]+authentication-key[ \t]+\d+[ \t]+\w+[ \t]+(?<v>\S+)/id },
  { label: "secret FortiOS", re: /^[ \t]*set[ \t]+(?:password|passwd|password2|passwd1|passwd2|psksecret|secret|key|auth-pwd|auth-password|priv-pwd|priv-password|passphrase|private-key|sso-password|psk|ppk-secret|tunnel-key|wpa-psk)[ \t]+(?:ENC[ \t]+)?(?<v>"(?:[^"\\]|\\.)*"|\S+)/id },
  { label: "secret Junos", re: /(?:encrypted-password|secret|authentication-key|ascii-text)[ \t]+(?<v>"\$(?:9|1|5|6)\$[^"]*")/id },
  { label: "valeur sensible", generic: true, re: /(?:^|[\s,{"'])["']?[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key)[\w.-]*["']?[ \t]*[:=][ \t]*(?<v>"[^"\n]+"|'[^'\n]+'|[^\s,#}]+)/id },
];
// une référence (`$VAR`, `${VAR}`, `{{ vault_… }}`), un booléen, un vide : pas une valeur, pour la règle générique
const NOT_A_SECRET = /^["']?(?:\$\{?\w|\{\{|null\b|none\b|true\b|false\b|\*+["']?$|["']?$)/i;

/** Les valeurs sensibles d'un texte : `{ line, start, end, label, length }` (indices dans la ligne, valeur seule). */
function findSecrets(text) {
  const found = [];
  const lines = text.split("\n");
  let inKey = false;
  lines.forEach((line, i) => {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) { inKey = true; return; }
    if (inKey) {
      if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line)) inKey = false;
      else if (line.trim() && line.trim() !== MASK) found.push({ line: i, start: line.search(/\S/), end: line.length, label: "clé privée", length: line.trim().length });
      return;
    }
    const taken = [];
    for (const rule of SECRET_RULES) {
      const m = rule.re.exec(line);
      if (!m || !m.indices.groups || !m.indices.groups.v) continue;
      const [start, end] = m.indices.groups.v, value = m.groups.v;
      if (value.includes(MASK) || /^["']?["']?$/.test(value) || (rule.generic && NOT_A_SECRET.test(value))) continue;
      if (taken.some(([a, b]) => start < b && a < end)) continue;
      taken.push([start, end]);
      found.push({ line: i, start, end, label: rule.label, length: value.replace(/^["']|["']$/g, "").length, nature: natureOf(line.slice(0, start), value, rule) });
    }
  });
  return found;
}
/** Ce qu'est la valeur, pour décider : un type 7 Cisco se déchiffre en une seconde, un hash de type 5, 8 ou 9 non. */
function natureOf(before, value, rule) {
  if (/\bENC[ \t]+$/.test(before)) return "chiffrée (réversible)";
  const type = (before.match(/\b(\d{1,2})[ \t]+$/) || [])[1];
  if (type === "7") return "type 7 : réversible";
  if (["5", "8", "9"].includes(type) || /^"?\$(?:1|5|6|8|9)\$/.test(value)) return "hash";
  if (rule.label === "clé privée") return "en clair";
  return "en clair";
}
/** Le texte, chaque valeur sensible remplacée par `<removed>` (les guillemets gardés). */
function maskSecrets(text, found) {
  const lines = text.split("\n");
  const byLine = new Map();
  for (const f of found) byLine.set(f.line, [...(byLine.get(f.line) || []), f]);
  for (const [i, fs] of byLine) {
    let line = lines[i];
    for (const f of [...fs].sort((a, b) => b.start - a.start)) {
      const value = line.slice(f.start, f.end), q = /^["']/.test(value) ? value[0] : "";
      line = line.slice(0, f.start) + q + MASK + q + line.slice(f.end);
    }
    lines[i] = line;
  }
  return lines.join("\n");
}
/** La ligne montrée dans l'avertissement : la valeur remplacée par des points (jamais affichée deux fois). */
function maskedPreview(line, f) { return (line.slice(0, f.start) + "•".repeat(Math.min(8, Math.max(4, f.length))) + line.slice(f.end)).trim(); }

// ---------- la géométrie du bloc (chasse fixe : tout se calcule, rien ne se mesure) ----------
const CODE = { HEAD: 34, PAD: 10, FOOT: 26, GUTTER: 12, RAIL: 4, LEFT: 16, SCROLL: 12, GRID: 20, FIT_MAX: 60 };
// Les polices d'un bloc : chasse fixe seulement (une police proportionnelle casse l'alignement d'une configuration).
// `em` = l'avance d'un caractère, mesurée dans Chromium (scripts/chasse.py) ; `kb` = latin + latin étendu, regular 400.
const CODE_FONTS = [
  { id: "jetbrains", label: "JetBrains Mono", short: "JetBrains", em: 0.6, kb: 55.6, note: "déjà dans l'application" },
  { id: "plex", label: "IBM Plex Mono", short: "Plex Mono", em: 0.6, kb: 28.1 },
  { id: "source", label: "Source Code Pro", short: "Source Code", em: 0.6, kb: 29.4 },
  { id: "cascadia", label: "Cascadia Mono", short: "Cascadia", em: 0.59, kb: 37.3 },
];
const CODE_FONT = Object.fromEntries(CODE_FONTS.map((f) => [f.id, f]));
const FONT_SAMPLE = "interface Gi1/0/1  0O 1lI {}";
const codeCharW = (size, font = "jetbrains") => size * (CODE_FONT[font] || CODE_FONT.jetbrains).em; // sans interlettrage
const codeLineH = (size) => Math.round(size * 1.55);
/** Ce qu'un bloc montre (réponse d'Orhan à la question 5 : hauteur libre, le code défile dedans). La boîte a la hauteur
 *  qu'on lui a donnée ; les lignes qui n'y tiennent pas défilent, par ligne entière (`it.scroll` = la première montrée,
 *  état de vue, jamais enregistré). Le pied « lignes 34-58 sur 120 » n'existe que si tout ne tient pas. */
function codeBox(it) {
  const total = it.text.split("\n").length, size = it.t.size, lh = codeLineH(size);
  const room = (foot) => Math.max(1, Math.floor((it.h - CODE.HEAD - 2 * CODE.PAD - foot) / lh));
  const scrolls = room(0) < total, foot = scrolls ? CODE.FOOT : 0;
  const visible = Math.min(total, room(foot)), maxFirst = Math.max(0, total - visible);
  const first = Math.min(Math.max(0, Math.round(it.scroll || 0)), maxFirst);
  const cw = codeCharW(size, it.cfont);
  const gutter = it.numbers ? Math.ceil(String(total).length * cw + 2 * CODE.GUTTER) : 0;
  const textX = CODE.RAIL + (it.numbers ? gutter : CODE.LEFT - CODE.RAIL + 4);
  const cols = Math.max(4, Math.floor((it.w - textX - CODE.LEFT - (scrolls ? CODE.SCROLL : 0)) / cw));
  return { total, visible, first, maxFirst, scrolls, foot, gutter, textX, cols, lh, h: it.h };
}
/** La hauteur qui montre tout le code (au plus FIT_MAX lignes), arrondie à la grille : « ajuster au contenu ». */
function fitHeight(it, max = CODE.FIT_MAX) {
  const total = it.text.split("\n").length, lines = Math.min(total, max);
  const h = CODE.HEAD + 2 * CODE.PAD + lines * codeLineH(it.t.size) + (total > max ? CODE.FOOT : 0);
  return Math.ceil(h / CODE.GRID) * CODE.GRID;
}

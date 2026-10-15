// Les motifs des valeurs sensibles d'un bloc de code (lot 16 de docs/11, revue du 2026-10-15, H1 et H2), la table
// seule : la lecture ligne à ligne est dans secrets.ts. Chaque motif nomme sa ou ses valeurs (`v`, `v2`, `v3` : toutes
// les valeurs d'une ligne, SNMPv3 `auth` et `priv` par exemple) et se cherche sur toute la ligne (drapeau `g`). Les
// commandes d'une configuration sont ancrées au début de la ligne (le même mot dans une `description` n'est pas une
// valeur) ; une valeur Cisco n'est jamais un `:` ni un `=` (`password = "x"` en Python n'est pas une commande Cisco).
// Motifs Cisco repris de la grammaire obsidian-cisco-syntax (MIT) et complétés (RADIUS / TACACS sans type, BGP, OSPF,
// HSRP / VRRP, IS-IS, SNMPv3, hôtes SNMP, Wi-Fi) ; FortiOS, Junos ; clés privées (secrets.ts) ; lignes de commande
// (en-tête Authorization, `curl -u`, `mysql -p…`, `sshpass -p`, options `--password`, `snmpwalk -c / -A / -X`, adresses
// `scheme://user:pass@`) ; fichiers clé = valeur (YAML, JSON, Python, Bash, INI), la règle générique, en dernier.
import { FORTIOS_SECRET_ATTRS } from "./fortios";

/** La sorte d'une valeur (clé du catalogue `panel:code.secretKind`). */
export type SecretKind = "account" | "password" | "snmp" | "snmpUser" | "ike" | "psk" | "keyString" | "aaaKey" | "ntpKey" | "routing" | "wifi"
  | "fortios" | "junos" | "token" | "commandLine" | "url" | "privateKey" | "generic";

/** Un motif : la sorte, l'expression (valeurs nommées `v…`), et `shell` quand une référence (`$VAR`, `{{ x }}`) n'est
 *  pas une valeur (un fichier de variables, une ligne de commande ; jamais une configuration, où `$1$…` est un hash). */
export interface Rule { kind: SecretKind; re: RegExp; shell?: boolean; generic?: boolean }

/** Le motif avec ses indices (`d` : où commence et finit chaque valeur) et toutes ses occurrences (`g`), posés à
 *  l'exécution (la cible ES2020 de la construction n'écrit pas ces drapeaux dans un littéral). */
const rx = (re: RegExp | string, flags = "i"): RegExp => new RegExp(typeof re === "string" ? re : re.source, (typeof re === "string" ? flags : re.flags) + "dg");

/** Un mot de configuration Cisco, jamais un séparateur. */
const WORD = String.raw`(?![:=])\S+`;

// La règle générique, clé = valeur. La clé : un nom qui dit un secret (`db_password`, `api_key`, `ansible_ssh_pass`,
// `snmp_community`), éventuellement entre guillemets (JSON). La valeur, selon le séparateur :
// - collée au séparateur (`KEY=value`, `"k":"v"`) : une chaîne citée, une substitution `$(…)` entière, sinon le mot
//   jusqu'au prochain blanc (un `#` ou une virgule en font partie : `password=Ab#Cd` est un seul mot pour le shell) ;
// - après un blanc (`key: value`, `key = value`) : une chaîne citée (et ses concaténations `'a' + 'b'`), une
//   substitution, sinon le reste de la ligne jusqu'à un commentaire ` #`, la clé suivante d'un objet sur une ligne, ou
//   le guillemet qui ferme la chaîne où la clé est écrite (`echo "password: x"`). Elle finit sur un caractère visible :
//   la fin de ligne n'est cherchée qu'après un mot, jamais à chaque blanc (sans quoi une ligne de blancs est quadratique).
const KEY = String.raw`[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|passphrase|credentials?)[\w.-]*`
  + String.raw`|(?:[\w.-]*[_.-])?pass|(?:[\w.-]*(?:snmp|ro|rw|read|write)[_.-]?)?community(?:[_.-]?(?:string|name))?`;
const QUOTED = String.raw`"(?:[^"\\\n]|\\.)*"|'[^'\n]*'`;
const JOINED = String.raw`(?:${QUOTED})(?:[ \t]*\+[ \t]*(?:${QUOTED}))*`;
const SUBST = String.raw`\$\((?:[^()\n]|\([^()\n]*\))*\)\S*`;
const REST = String.raw`\S(?:[^\n]*?\S)?(?=[ \t]+#|["'][)\]};,]*[ \t]*$|[ \t]*$|[ \t]*,[ \t]*["']?[\w.-]+["']?[ \t]*:)`;
const GENERIC = String.raw`(?:^|[\s,{(;"'])["']?(?:${KEY})["']?[ \t]*(?:[:=](?<v>${JOINED}|${SUBST}|\S+)|[:=][ \t]+(?<v2>${JOINED}|${SUBST}|${REST}))`;

export const RULES: readonly Rule[] = [
  // comptes et mots de passe (IOS, IOS-XE, NX-OS)
  { kind: "account", re: rx(String.raw`^\s*username\s+\S+\s+(?:.*?\s)?(?:password|secret)\s+(?:\d{1,2}\s+)?(?<v>${WORD})`) },
  { kind: "password", re: rx(String.raw`^\s*(?:enable\s+)?(?:password|secret)\s+(?!encryption\b|strength-check\b|secure-mode\b)(?:level\s+\d+\s+)?(?:\d{1,2}\s+)?(?<v>${WORD})`) },
  { kind: "password", re: rx(String.raw`^\s*(?:ppp\s+(?:chap|pap)\s+(?:sent-username\s+\S+\s+)?|ip\s+ftp\s+)password\s+(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "password", re: rx(String.raw`^\s*key\s+config-key\s+password-encrypt\s+(?<v>${WORD})`) },
  // SNMP : communautés, hôtes (l'algorithme `D[E]S` s'écrit ainsi pour que le contrôle des chaînes françaises n'y lise
  // pas le mot « des ») (v1 / v2c : le dernier mot est la communauté ; en v3 c'est un nom d'utilisateur), SNMPv3
  { kind: "snmp", re: rx(String.raw`^\s*snmp-server\s+community\s+(?<v>${WORD})`) },
  { kind: "snmp", re: rx(String.raw`^\s*snmp-server\s+host\s+\S+\s+(?:(?:vrf|use-vrf)\s+\S+\s+)?(?:(?:informs|traps)\s+)?(?:version\s+(?:1|2c)\s+)?(?!version\b|use-vrf\b|vrf\b|filter-vrf\b|source-interface\b|informs\b|traps\b)(?<v>${WORD})`) },
  { kind: "snmpUser", re: rx(String.raw`^\s*snmp-server\s+user\s+\S+\s.*?\bauth\s+(?:md5|sha\S*)\s+(?:\d\s+)?(?<v>${WORD})(?:.*?\spriv\s+(?:(?:3?D[E]S\S*|AES(?:-?\d+)?)(?:\s+\d{3})?\s+)?(?<v2>${WORD}))?`) },
  // IKE, clés partagées, clés d'authentification
  { kind: "ike", re: rx(String.raw`^\s*crypto\s+isakmp\s+key\s+(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "psk", re: rx(String.raw`^\s*pre-shared-key\s+(?:local\s+|remote\s+)?(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "keyString", re: rx(String.raw`^\s*key-string\s+(?:\d{1,2}\s+)?(?<v>${WORD})`) },
  // RADIUS / TACACS : le type est facultatif ; un `key` seul (bloc `tacacs server` / `radius server`) n'est jamais
  // `key chain`, ni le numéro d'une clé de trousseau (` key 1`)
  { kind: "aaaKey", re: rx(String.raw`^\s*(?:tacacs-server|radius-server)\s+(?:host\s+\S+\s+(?:(?:auth-port|acct-port|port|timeout|single-connection)\s+(?:\d+\s+)?)*)?key\s+(?:[067]\s+)?(?<v>${WORD})`) },
  { kind: "aaaKey", re: rx(String.raw`^\s*key\s+(?:[067]\s+)?(?!chain\b|config-key\b|\d+$)(?<v>${WORD})`) },
  { kind: "ntpKey", re: rx(String.raw`^\s*ntp\s+authentication-key\s+\d+\s+\w+\s+(?<v>${WORD})`) },
  // protocoles de routage et de redondance
  { kind: "routing", re: rx(String.raw`^\s*neighbor\s+\S+\s+password\s+(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "routing", re: rx(String.raw`^\s*ip\s+ospf\s+message-digest-key\s+\d+\s+md5\s+(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "routing", re: rx(String.raw`^\s*ip\s+ospf\s+authentication-key\s+(?:\d\s+)?(?<v>${WORD})`) },
  { kind: "routing", re: rx(String.raw`^\s*(?:standby|vrrp)\s+(?:\d+\s+)?authentication\s+(?:md5\s+key-string\s+(?:\d\s+)?|text\s+|(?!md5\b|text\b))(?<v>${WORD})`) },
  { kind: "routing", re: rx(String.raw`^\s*(?:isis\s+password|area-password|domain-password)\s+(?<v>${WORD})`) },
  { kind: "wifi", re: rx(String.raw`^\s*wpa-psk\s+(?:ascii|hex)\s+(?:\d\s+)?(?<v>${WORD})`) },
  // FortiOS (la communauté SNMP, nommée par `set name`, est lue dans son contexte : secrets.ts) ; Junos
  { kind: "fortios", re: rx(`^[ \\t]*set[ \\t]+(?:${FORTIOS_SECRET_ATTRS})[ \\t]+(?:ENC[ \\t]+)?(?<v>"(?:[^"\\\\]|\\\\.)*"|\\S+)`) },
  { kind: "junos", re: rx(/(?:encrypted-password|secret|authentication-key|ascii-text)[ \t]+(?<v>"\$(?:9|1|5|6)\$[^"]*")/i) },
  { kind: "snmp", re: rx(String.raw`^\s*set\s+snmp\s+community\s+(?<v>${WORD})`) },
  // lignes de commande et en-têtes HTTP
  { kind: "token", shell: true, re: rx(String.raw`(?:\bAuthorization["']?\s*[:=]\s*["']?(?:Bearer|Basic|Token)\s+|\bBearer\s+)(?<v>[A-Za-z0-9._~+/=-]+)`) },
  { kind: "url", shell: true, re: rx(String.raw`\b[a-z][\w+.-]*://[^\s/:@]+:(?<v>[^\s/@]+)@`) },
  { kind: "commandLine", shell: true, re: rx(String.raw`(?:^|\s)(?:-u|--user)(?:\s+|=)(?:"[^":\n]*:(?<v>[^"\n]+)"|'[^':\n]*:(?<v2>[^'\n]+)'|[^\s:'"]+:(?<v3>(?!\d+(?:\s|$))\S+))`, "") },
  { kind: "commandLine", shell: true, re: rx(String.raw`\bmysql(?:dump|admin|import|show|check)?\b.*?\s-p(?<v>[^\s'"]\S*|"[^"\n]*"|'[^'\n]*')`, "") },
  { kind: "commandLine", shell: true, re: rx(String.raw`\bsshpass\s+(?:-[a-oq-zA-Z]\S*\s+)*-p\s*(?<v>"[^"\n]*"|'[^'\n]*'|\S+)`, "") },
  { kind: "commandLine", shell: true, re: rx(String.raw`(?:^|\s)--(?:[\w-]*-)?(?:password|passwd|token|secret|api-key|apikey)\s+(?<v>"[^"\n]*"|'[^'\n]*'|(?!-)\S+)`) },
  { kind: "snmp", shell: true, re: rx(String.raw`\s-(?:c|A|X)(?<=\bsnmp\w*\b.{0,400})\s*(?<v>"[^"\n]*"|'[^'\n]*'|\S+)`, "") },
  // (le regard en arrière vient après `-c` et se borne à 400 caractères : posé en tête ou sans borne, il se rejouait
  // à chaque caractère, quadratique)
  // clé = valeur, en dernier (une commande connue a déjà pris sa valeur)
  { kind: "generic", shell: true, generic: true, re: rx(GENERIC) },
];

/** Un mot qu'une ligne porte forcément pour qu'un motif la prenne : une ligne qui n'en a aucun n'est pas lue par la
 *  table (mesuré : une configuration de 20 000 caractères passe de ~25 ms à quelques ms). À tenir avec la table. */
export const TRIGGER = /pass|secret|key|communit|token|auth|pwd|psk|snmp|bearer|:\/\/|-[up]|credential|ascii-text/i;
/** Une référence, pas une valeur (règles `shell` seulement) : `$VAR`, `${VAR}`, `{{ jinja }}`, `!vault`, `%s`. */
export const REFERENCE = /^["']?(?:\$\{?[A-Za-z_]|\{\{|!vault\b|%\(?\w*\)?s\b)/;
/** Une valeur qui n'en est pas une, entière : vide, nulle, booléenne, des étoiles, un gabarit `<…>` ou `{nom}`, une
 *  communauté BGP `65000:100`. */
export const PLACEHOLDER = /^["']?(?:|null|none|nil|~|true|false|yes|no|on|off|\*+|<[^<>\n]*>|\{[\w.]+\}|\d+:\d+)["']?$/i;
/** Un bloc YAML (`password: |`) : la valeur est sur les lignes suivantes, plus indentées. */
export const BLOCK_SCALAR = /^[|>][+-]?\d?$/;
/** Une clé privée (PEM, OpenSSH, PGP) : chaque ligne entre les deux bornes. */
export const KEY_BEGIN = /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/, KEY_END = /-----END (?:[A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/;
/** La communauté SNMP de FortiOS : `config system snmp community`, puis `set name "…"` dans chaque entrée. */
export const FORTI_COMMUNITY = /^\s*config\s+system\s+snmp\s+community\b/i;
export const FORTI_NAME = new RegExp(String.raw`^\s*set\s+name\s+(?<v>"(?:[^"\\]|\\.)*"|\S+)`, "id");

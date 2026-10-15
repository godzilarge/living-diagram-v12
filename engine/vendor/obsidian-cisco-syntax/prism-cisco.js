// Grammaire Prism « Cisco IOS / IOS-XE / IOS-XR / NX-OS », recopiée telle quelle (types TypeScript retirés) depuis
// blakebratcher/obsidian-cisco-syntax 0.2.0 (commit 14aa5b5c4f8506c7f4f2b9311fb089604ad818bb), fichiers
// src/cisco-tokens.ts et src/cisco-grammar.ts. Licence MIT, Copyright (c) 2026 Blake Bratcher : LICENSE, dans ce dossier.
// Seul ajout : l'enregistrement dans Prism.languages (alias « cisco », « ios », « nxos ») ; le Prism global est posé par
// engine/src/app/code/prism.ts avant ce fichier (prismjs 1.30.0, `manual: true`).
(function () {
/*
 * Shared token building blocks for Cisco IOS / IOS-XE / IOS-XR / NX-OS.
 *
 * These regexes and keyword arrays are the single source of truth. They are
 * assembled into a Prism grammar in `cisco-grammar.ts`, which is used for BOTH
 * Reading mode (Obsidian's bundled Prism) and Live Preview (a CodeMirror 6
 * ViewPlugin that calls Prism.tokenize with the same grammar).
 *
 * Ordering matters when these feed the grammar: literals (comment, string, MAC,
 * IP, interface) must be matched before bare words (keyword, number). See
 * `cisco-grammar.ts` for the exact precedence.
 */

// ---- Comments -------------------------------------------------------------
// IOS / IOS-XE / IOS-XR / NX-OS use `!` at the start of a line.
const RE_COMMENT = /^[ \t]*!.*$/m;

// ---- Strings (double or single quoted) ------------------------------------
const RE_STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;

// ---- MAC addresses (Cisco dotted-triple + colon / hyphen forms) -----------
const RE_MAC =
	/\b(?:[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}|(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2})\b/;

// ---- IPv4 (octet-validated) with optional CIDR / mask ---------------------
const RE_IPV4 =
	/\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\/(?:3[0-2]|[12]?\d))?\b/;

// ---- IPv6 (full / compressed / embedded-v4 / zone-id) with optional CIDR --
// Alternatives are ordered longest-match-first (most specific forms, then
// trailing-group forms, then the bare "::" forms) so that unanchored
// tokenization returns the full address, e.g. all of `2001:db8::1/64` rather
// than stopping at `2001:db8::`. This differs from the canonical validation
// regex, which relies on ^...$ backtracking that is unavailable here.
const RE_IPV6 =
	/(?:(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,4}:(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)|::(?:[Ff]{4}(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)|[Ff][Ee]80:(?::[A-Fa-f0-9]{0,4}){0,4}%[0-9A-Za-z]+|(?:[A-Fa-f0-9]{1,4}:){1,6}:[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,5}(?::[A-Fa-f0-9]{1,4}){1,2}|(?:[A-Fa-f0-9]{1,4}:){1,4}(?::[A-Fa-f0-9]{1,4}){1,3}|(?:[A-Fa-f0-9]{1,4}:){1,3}(?::[A-Fa-f0-9]{1,4}){1,4}|(?:[A-Fa-f0-9]{1,4}:){1,2}(?::[A-Fa-f0-9]{1,4}){1,5}|[A-Fa-f0-9]{1,4}:(?::[A-Fa-f0-9]{1,4}){1,6}|(?:[A-Fa-f0-9]{1,4}:){1,7}:|:(?:(?::[A-Fa-f0-9]{1,4}){1,7}|:))(?:\/(?:12[0-8]|1[01]\d|\d?\d))?/;

// ---- Interface names (full names + common abbreviations) ------------------
// Trailing \d+ is mandatory so short abbreviations (Se, Et, Po, Vl...) cannot
// match English words. Case-SENSITIVE on purpose. [ \t]* (never \s*) so a name
// can never span a newline when tokenizing a whole block body at once.
const RE_INTERFACE =
	/\b(?:TwentyFiveGigE|TwoGigabitEthernet|FiveGigabitEthernet|FortyGigabitEthernet|HundredGigE|TenGigabitEthernet|GigabitEthernet|FastEthernet|Bundle-Ether|Virtual-Template|Virtual-Access|Port-channel|Group-Async|Multilink|Management|Cellular|Loopback|Ethernet|Serial|Dialer|Tunnel|Async|TenGigE|FortyGigE|GigE|Vlan|mgmt|nve|BVI|ATM|POS|Gig|Twe|Hu|Fo|Fi|Gi|Fa|Te|Ser|Se|Lo|Tun|Tu|Vl|Ma|Eth|Et)[ \t]*\d+(?:\/\d+)*(?:[.:]\d+)?\b/;

// ---- Numbers (hex, decimal, dotted decimal for asdot AS numbers) ----------
const RE_NUMBER = /\b(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?)\b/;

// ---- Negation / default (line-leading standalone word) --------------------
// Group 1 is used as a Prism lookbehind (see grammar) so only `no`/`default`
// is tokenized. The (?=[ \t]|$) guard keeps `default-information` from matching.
const RE_NEGATION = /(^[ \t]*)(?:no|default)(?=[ \t]|$)/m;

// ---- Secrets --------------------------------------------------------------
// Cisco commands that carry a sensitive value (passwords, keys, community
// strings). Group 1 of each pattern is the command prefix; the grammar feeds it
// to Prism as a lookbehind so only the value itself becomes a `secret` token
// while the command keywords keep their normal highlighting. Separators are
// [ \t] (never \s) and the value is \S+, so a secret can never span a line, and
// every pattern is line-anchored (^[ \t]*) so the same words inside a free-text
// `description` or `remark` are left alone.
const SECRET_PATTERNS = [
	// enable / line / user password & secret, optional encryption-type digit:
	//   password 7 08..    secret 5 $1$..    enable secret 9 $9$..
	/(^[ \t]*(?:enable[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?)\S+/im,
	// username <name> [options ...] password|secret [type] <value>
	/(^[ \t]*username[ \t]+\S+[ \t]+(?:[^\n]*?[ \t]+)?(?:password|secret)[ \t]+(?:\d{1,2}[ \t]+)?)\S+/im,
	// SNMP community string
	/(^[ \t]*snmp-server[ \t]+community[ \t]+)\S+/im,
	// IKE / ISAKMP pre-shared key
	/(^[ \t]*crypto[ \t]+isakmp[ \t]+key[ \t]+)\S+/im,
	// IKEv2 / keyring pre-shared key
	/(^[ \t]*pre-shared-key[ \t]+(?:local[ \t]+|remote[ \t]+)?)\S+/im,
	// Key-chain / routing-protocol key material
	/(^[ \t]*key-string[ \t]+(?:\d{1,2}[ \t]+)?)\S+/im,
	// RADIUS / TACACS shared key: key 7 <hash> / key 0 <clear>
	/(^[ \t]*key[ \t]+(?:0|7)[ \t]+)\S+/im,
	// NTP authentication key: ntp authentication-key <id> <algo> <key>
	/(^[ \t]*ntp[ \t]+authentication-key[ \t]+\d+[ \t]+\w+[ \t]+)\S+/im,
];

// ---------------------------------------------------------------------------
// Keyword groups. Kept grouped for readability; unioned into KEYWORDS below.
// ---------------------------------------------------------------------------

// Navigation / mode control words.
const MODE = [
	"configure", "terminal", "conf", "end", "exit", "enable", "disable",
	"login", "logout", "do",
];

// Routing / signalling / L2 / transport / management protocol names.
const PROTOCOLS = [
	"ospfv3", "ospf", "eigrp", "bgp", "ripng", "rip", "isis", "is-is", "mpls",
	"ldp", "rsvp", "l2vpn", "vpls", "evpn", "vxlan", "otv", "fabricpath", "pim",
	"igmp", "msdp", "bfd", "hsrp", "vrrp", "glbp", "rapid-pvst", "pvst", "mstp",
	"mst", "rstp", "stp", "cdp", "lldp", "vtp", "dtp", "lacp", "pagp", "udld",
	"dot1q", "isl", "gre", "ipsec", "ikev1", "ikev2", "isakmp", "esp", "ah",
	"l2tp", "pptp", "ppp", "hdlc", "frame-relay", "atm", "pos", "dhcpv6",
	"dhcp", "dns", "ntp", "sntp", "snmp", "syslog", "tftp", "ftp", "sftp",
	"scp", "https", "http", "ssh", "telnet", "tcp", "udp", "icmpv6", "icmp",
	"arp", "ndp", "tacacs+", "tacacs", "radsec", "radius", "ldap", "kerberos",
	"netflow", "sflow", "ipfix", "macsec", "dot1x", "eap", "connected",
	"static",
];

const KW_GLOBAL = [
	"hostname", "boot", "service", "write", "copy", "reload", "clock",
	"calendar", "version", "license", "platform", "system", "feature", "vdc",
	"install", "archive", "event", "manager", "applet", "track", "alias", "ip",
	"ipv6", "arp", "mtu", "vrf", "definition", "address-family", "key", "chain",
	"object-group", "time-range", "parameter-map", "domain", "domain-name",
	"domain-lookup", "name-server", "host", "cdp", "lldp", "vtp", "udld",
	"errdisable", "spanning-tree", "vlan", "mac-address-table", "port-channel",
	"interface", "controller", "redundancy", "stackwise", "scheduler",
	"class-map", "policy-map", "service-policy", "route-map", "prefix-list",
	"access-list", "flow", "monitor", "netconf-yang", "restconf", "telemetry",
	"name", "default-gateway", "context", "overload", "pool",
];

const KW_INTERFACE = [
	"description", "shutdown", "speed", "duplex", "bandwidth", "delay",
	"negotiation", "flowcontrol", "media-type", "keepalive", "carrier-delay",
	"hold-queue", "address", "secondary", "unnumbered", "encapsulation",
	"dot1q", "isl", "native", "switchport", "mode", "access", "trunk",
	"allowed", "voice", "nonegotiate", "protected", "port-security", "sticky",
	"maximum", "violation", "aging", "channel-group", "channel-protocol",
	"lacp", "pagp", "portfast", "bpduguard", "bpdufilter", "guard",
	"storm-control", "power", "inline", "priority-queue", "standby", "vrrp",
	"glbp", "preempt", "timers", "authentication", "helper-address",
	"proxy-arp", "access-group", "traffic-filter", "nat", "inside", "outside",
	"forwarding", "service", "instance", "bridge-domain", "xconnect", "nve",
	"member", "vni", "load-interval",
];

const KW_ROUTING = [
	"router", "network", "area", "redistribute", "passive-interface",
	"default-information", "originate", "router-id", "maximum-paths",
	"distance", "metric", "auto-summary", "summary-address",
	"aggregate-address", "neighbor", "remote-as", "update-source",
	"next-hop-self", "route-reflector-client", "ebgp-multihop", "peer-group",
	"fall-over", "ttl-security", "activate", "send-community",
	"advertisement-interval", "soft-reconfiguration", "filter-list",
	"distribute-list", "offset-list", "variance", "stub", "nssa", "totally",
	"virtual-link", "sham-link", "route", "discard-route", "label-range",
	"tag-switching", "multicast-routing", "rp-address", "graceful-restart",
	"throttle", "log-adjacency-changes", "capability", "match", "set",
	"on-match", "continue", "sequence", "route-target", "maximum-prefix",
];

const KW_SECURITY = [
	"permit", "deny", "remark", "evaluate", "reflect", "dynamic", "host", "any",
	"eq", "neq", "gt", "lt", "range", "established", "log", "log-input", "dscp",
	"tos", "precedence", "ttl", "fragments", "option", "group-object",
	"port-object", "network-object", "access-class", "aaa", "new-model",
	"authorization", "accounting", "exec", "dot1x", "mab", "local", "none",
	"method", "tacacs-server", "radius-server", "server-private", "crypto",
	"ikev1", "ikev2", "policy", "encryption", "hash", "group", "lifetime",
	"pre-shared-key", "keyring", "proposal", "transform-set", "profile",
	"tunnel", "transport", "crypto-map", "peer", "reverse-route", "pki",
	"trustpoint", "enrollment", "rsakeypair", "revocation-check", "zone",
	"zone-pair", "inspect", "pass", "drop", "firewall", "snooping",
	"inspection", "verify", "password-encryption",
];

const KW_MGMT = [
	"snmp-server", "community", "location", "contact", "user", "view",
	"engineid", "traps", "chassis-id", "logging", "buffered", "console",
	"source-interface", "facility", "discriminator", "rate-limit", "server",
	"peer", "authenticate", "authentication-key", "trusted-key", "master",
	"timezone", "summer-time", "sntp", "run", "line", "vty", "aux",
	"exec-timeout", "absolute-timeout", "session-timeout", "input", "output",
	"preferred", "synchronous", "privilege", "secret", "length", "width",
	"history", "username", "nopassword", "algorithm-type", "secure-server",
	"path", "max-connections", "generate", "rsa", "zeroize", "timestamps",
	"datetime", "uptime", "banner", "motd", "password",
];

const KW_NXOS = [
	"vpc", "peer-link", "peer-keepalive", "peer-gateway", "auto-recovery",
	"fex", "nv", "overlay", "ingress-replication", "jumbomtu", "qos",
	"hardware", "copp", "port-profile", "anycast-gateway-mac", "role", "nxos",
];

// QoS / MQC (class-map, policy-map, service-policy).
const KW_QOS = [
	"class", "police", "shape", "random-detect", "priority-level",
	"queue-limit", "match-all", "match-any",
];

const KEYWORDS = [
	...new Set([
		...KW_GLOBAL,
		...KW_INTERFACE,
		...KW_ROUTING,
		...KW_SECURITY,
		...KW_MGMT,
		...KW_NXOS,
		...KW_QOS,
	]),
];

/**
 * Build a word-boundaried alternation from a word list. Words are sorted
 * longest-first so a shorter prefix cannot shadow a longer token.
 */
function buildAlternation(
	words,
	opts = {}
) {
	const esc = (w) => w.replace(/[+.*?^${}()|[\]\\]/g, "\\$&");
	const body = [...words]
		.sort((a, b) => b.length - a.length)
		.map(esc)
		.join("|");
	return new RegExp(`\\b(?:${body})\\b`, opts.i ? "i" : "");
}

/*
 * The Cisco Prism grammar. This one object drives highlighting in both views:
 *   - Reading mode: registered into Obsidian's bundled Prism (Prism.languages).
 *   - Live Preview: passed to Prism.tokenize() by the CodeMirror ViewPlugin.
 *
 * Property order defines match precedence (Prism tries tokens top to bottom):
 *   comment -> string -> secret -> mac -> ipv6 -> ipv4 -> interface
 *   -> negation -> mode -> protocol -> keyword -> number -> operator
 *   -> punctuation
 *
 * The `alias` values give each custom token a sensible default color from
 * Obsidian's built-in Prism theme even before styles.css loads, and let the
 * shared stylesheet target both views with one rule set.
 */


const ciscoGrammar = {
	comment: { pattern: RE_COMMENT, greedy: true },
	string: { pattern: RE_STRING, greedy: true },

	// Sensitive values (passwords, keys, community strings). Matched before the
	// literals and keywords so the whole secret becomes one token; group 1 of
	// each pattern is a lookbehind, leaving the command keywords to highlight
	// normally. styles.css gives `.token.secret` its own color.
	secret: SECRET_PATTERNS.map((pattern) => ({
		pattern,
		lookbehind: true,
		greedy: true,
	})),

	// Literals first, most-specific to least. MAC before IP so a dotted-triple
	// MAC is never split into numbers; IPv6 before IPv4.
	"mac-address": { pattern: RE_MAC, alias: "number" },
	"ipv6-address": { pattern: RE_IPV6, alias: "number" },
	"ip-address": { pattern: RE_IPV4, alias: "number" },
	interface: { pattern: RE_INTERFACE, alias: "class-name" },

	// Leading `no` / `default`. lookbehind drops the leading whitespace group;
	// greedy so the ^ (multiline) anchor is evaluated against the whole block.
	negation: {
		pattern: RE_NEGATION,
		lookbehind: true,
		greedy: true,
		alias: "important",
	},

	mode: { pattern: buildAlternation(MODE), alias: "keyword" },
	protocol: { pattern: buildAlternation(PROTOCOLS, { i: true }), alias: "builtin" },
	keyword: buildAlternation(KEYWORDS, { i: true }),

	number: RE_NUMBER,
	operator: /[=<>]/,
	punctuation: /[,]/,
};

Prism.languages.cisco = ciscoGrammar;
Prism.languages.ios = ciscoGrammar;
Prism.languages.nxos = ciscoGrammar;
})();

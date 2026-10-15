// Grammaire Prism « FortiOS » (configuration FortiGate, `show full-configuration`), écrite pour le prototype : aucune
// grammaire Prism n'existe ; les deux grammaires TextMate publiées (GSGBen/fortigate-fortios-syntax, MIT, 1,2 Ko ;
// testpilot031/fortios-config-studio, MIT, 3,9 Ko) se résument à ces mêmes règles. Une table de règles, pas un moteur :
// l'ordre est la priorité (Prism essaie de haut en bas, comme la grammaire Cisco).
(function () {
  const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\/(?:3[0-2]|[12]?\d))?\b/;
  const SECRET_ATTRS = "password|passwd|password2|passwd1|passwd2|psksecret|secret|key|auth-pwd|auth-password|priv-pwd|priv-password|passphrase|private-key|sso-password|psk|ppk-secret|tunnel-key|wpa-psk";
  Prism.languages.fortios = {
    comment: { pattern: /^[ \t]*#.*$/m, greedy: true },
    // une valeur sensible après `set <attribut>` (chiffrée `ENC …` ou en clair, entre guillemets ou non) : un seul jeton
    secret: { pattern: new RegExp(`(^[ \\t]*set[ \\t]+(?:${SECRET_ATTRS})[ \\t]+(?:ENC[ \\t]+)?)(?:"(?:[^"\\\\\\n]|\\\\.)*"|\\S+)`, "im"), lookbehind: true, greedy: true },
    string: { pattern: /"(?:[^"\\\n]|\\.)*"/, greedy: true },
    // le chemin d'une section : `config firewall policy`
    "class-name": { pattern: /(^[ \t]*config[ \t]+)[\w-]+(?:[ \t]+[\w-]+)*/m, lookbehind: true },
    // les mots de structure : une section s'ouvre, une entrée s'ouvre, se ferme
    keyword: { pattern: /(^[ \t]*)(?:config|end|edit|next)(?=[ \t]|$)/m, lookbehind: true },
    // l'attribut réglé : `set <attribut>` (avant le verbe : Prism découpe dans l'ordre, la ligne doit être entière)
    property: { pattern: /(^[ \t]*(?:set|unset|append|select|unselect)[ \t]+)[\w-]+/m, lookbehind: true },
    // les verbes d'une ligne de réglage : du bruit à la lecture, dessinés discrets (famille « ponctuation »)
    verb: { alias: "operator", pattern: /(^[ \t]*)(?:set|unset|append|select|unselect|purge|rename|delete|clone|move)(?=[ \t]|$)/m, lookbehind: true },
    "ip-address": { pattern: IPV4, alias: "number" },
    boolean: /\b(?:enable|disable|accept|deny|all|any|none)\b/,
    number: /\b\d+\b/,
  };
  Prism.languages.fortigate = Prism.languages.fortios;
})();

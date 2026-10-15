// ---------- les textes factices (aucune donnée réelle : noms, adresses et secrets inventés) ----------
const SAMPLE_PYTHON = `"""Lit l'état des optiques des cœurs, alerte sous -9 dBm."""
from netmiko import ConnectHandler

SEUIL_DBM = -9.0
COEURS = ["dc01-core-01", "dc01-core-02"]


def optiques_faibles(hote: str) -> list[str]:
    with ConnectHandler(host=hote, device_type="cisco_nxos") as nx:
        lignes = nx.send_command("show interface transceiver details")
    return [l for l in lignes.splitlines() if "Rx Power" in l and float(l.split()[-2]) < SEUIL_DBM]


for hote in COEURS:
    print(hote, optiques_faibles(hote))`;

const SAMPLE_BASH = `#!/usr/bin/env bash
# Sauvegarde quotidienne des configurations, 02:00, conservées 30 jours
set -euo pipefail
DEST="/srv/backup/configs/$(date +%F)"
mkdir -p "$DEST"
for hote in dc01-core-01 dc01-core-02 dc01-fw-01; do
  ssh -o BatchMode=yes "svc-backup@\${hote}" 'show running-config' > "$DEST/\${hote}.cfg" \\
    || echo "échec : \${hote}" >&2
done
find /srv/backup/configs -maxdepth 1 -mtime +30 -exec rm -rf {} +`;

const SAMPLE_YAML = `# host_vars/dc01-core-02.yml
hostname: dc01-core-02
site: dc01
role: core
vpc:
  domain: 10
  peer_link: port-channel10
  keepalive: 10.0.254.2
uplinks:
  - interface: Ethernet1/49
    peer: dc01-rt-01
    speed: 100G
  - interface: Ethernet1/50
    peer: dc01-rt-01
    speed: 100G`;

const SAMPLE_JSON = `{
  "hostname": "dc01-fw-01",
  "ha": {
    "mode": "active_passive",
    "role": "primary",
    "priority": 200,
    "heartbeat": ["ha1", "ha2"]
  },
  "uplinks": [
    { "port": "x1", "aggregate": "agg-core", "speed_mbps": 10000 },
    { "port": "x2", "aggregate": "agg-core", "speed_mbps": 10000 }
  ],
  "monitored": true
}`;

/** Une configuration de switch d'accès Catalyst de 120 lignes, déjà masquée (ce qu'Orhan aurait enregistré). */
function sampleCisco() {
  const head = [
    "! dc01-acc-01 · Catalyst 9300-48P · IOS-XE 17.9.4",
    "version 17.9",
    "service timestamps log datetime msec localtime",
    "service password-encryption",
    "hostname dc01-acc-01",
    "!",
    "enable secret 9 <removed>",
    "username netadmin privilege 15 secret 9 <removed>",
    "aaa new-model",
    "aaa authentication login default group tacacs+ local",
    "!",
    "ip domain name dc01.example.net",
    "ip name-server 10.0.10.53 10.0.11.53",
    "!",
    "vlan 10",
    " name GESTION",
    "vlan 20",
    " name SERVEURS",
    "vlan 30",
    " name VOIX",
    "!",
    "spanning-tree mode rapid-pvst",
    "spanning-tree extend system-id",
    "!",
    "interface Port-channel1",
    " description C1|dc01-core-01|port-channel21|",
    " switchport mode trunk",
    " switchport trunk allowed vlan 10,20,30",
    "!",
    "interface TenGigabitEthernet1/1/1",
    " description C1|dc01-core-01|Ethernet1/21|",
    " switchport mode trunk",
    " channel-group 1 mode active",
    "!",
    "interface TenGigabitEthernet1/1/2",
    " description C1|dc01-core-02|Ethernet1/21|",
    " switchport mode trunk",
    " channel-group 1 mode active",
    "!",
  ];
  const tail = [
    "interface Vlan10",
    " ip address 10.0.10.21 255.255.255.0",
    "!",
    "ip default-gateway 10.0.10.1",
    "snmp-server community <removed> RO 99",
    "snmp-server location DC01 salle B rangée 4",
    "tacacs-server host 10.0.10.40 key 7 <removed>",
    "ntp server 10.0.10.123 prefer",
    "logging host 10.0.10.51",
    "!",
    "line vty 0 15",
    " transport input ssh",
    " exec-timeout 10 0",
    "end",
  ];
  const ports = [];
  for (let p = 1; head.length + ports.length + tail.length < 120; p++) {
    const block = [`interface GigabitEthernet1/0/${p}`, ` description C3|access|poste-${String(p).padStart(2, "0")}|`, ` switchport access vlan ${p % 3 === 0 ? 30 : 20}`, " switchport mode access", " spanning-tree portfast", "!"];
    if (head.length + ports.length + block.length + tail.length > 120) {
      ports.push(...block.slice(0, 120 - head.length - ports.length - tail.length));
      break;
    }
    ports.push(...block);
  }
  return [...head, ...ports, ...tail].join("\n");
}
const SAMPLE_CISCO = sampleCisco();

const SAMPLE_FORTIOS = `config system ha
    set group-name "DC01-EDGE"
    set mode a-p
    set hbdev "ha1" 50 "ha2" 50
    set priority 200
    set password ENC <removed>
end
config system interface
    edit "agg-core"
        set vdom "root"
        set type aggregate
        set member "x1" "x2"
        set ip 10.0.20.1 255.255.255.0
        set allowaccess ping https ssh
    next
end`;

// ---------- ce qu'on colle pour essayer l'avertissement (secrets inventés, jamais réels) ----------
const PASTE_CISCO = `hostname dc01-acc-03
!
enable secret 5 $1$Xk2p$9fQe7rV0nWm3ZbH1uYt8s/
username netadmin privilege 15 secret 9 $9$h1aB2cD3eF4gH5$Qm8vL0pZr7TnW2xYk4sJ6uE1oI9aC3dF5gH7jK0lM2n
!
interface Vlan10
 ip address 10.0.10.23 255.255.255.0
!
snmp-server community Dc01-RoCommunity! RO 99
tacacs-server host 10.0.10.40 key 7 0822455D0A16544541
line vty 0 15
 password 7 13061E010803557878
 transport input ssh
end`;

const PASTE_FORTIOS = `config vpn ipsec phase1-interface
    edit "vers-dc02"
        set interface "wan1"
        set peertype any
        set proposal aes256-sha256
        set remote-gw 203.0.113.20
        set psksecret ENC kQ9vX3mZp0Lr7TnW2xYk4sJ6uE1oI9aC3dF5gH7jK0lM2nB8vC4xZ1qA
    next
end
config system admin
    edit "orhan"
        set accprofile "super_admin"
        set password ENC SH2vE9pQ1zR8tY4uI0oP3aS6dF7gH2jK5lZ9xC1vB4nM8qW0eR
    next
end`;

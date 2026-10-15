"""Lot 16 (docs/11) : la scène des captures du bloc de code, sur demo-dc. Des textes factices (noms, adresses et secrets
inventés, jamais réels), repris du prototype validé (`bac-a-sable/lot-16/src/samples.js`), posés par l'API
comme le ferait la page (Python attaché au routeur, Bash libre, la configuration Cisco de 120 lignes attachée à un
switch d'accès, déjà masquée). Les aides de pilotage (clavier, souris, molette) servent aussi à l'exploration."""
from __future__ import annotations

import json
import threading

import httpx

READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"
wait = lambda s: threading.Event().wait(s)  # noqa: E731

PYTHON = '''"""Lit l'état des optiques des cœurs, alerte sous -9 dBm."""
from netmiko import ConnectHandler

SEUIL_DBM = -9.0
COEURS = ["dc01-core-01", "dc01-core-02"]


def optiques_faibles(hote: str) -> list[str]:
    with ConnectHandler(host=hote, device_type="cisco_nxos") as nx:
        lignes = nx.send_command("show interface transceiver details")
    return [l for l in lignes.splitlines() if "Rx Power" in l and float(l.split()[-2]) < SEUIL_DBM]


for hote in COEURS:
    print(hote, optiques_faibles(hote))'''

BASH = '''#!/usr/bin/env bash
# Sauvegarde quotidienne des configurations, 02:00, conservées 30 jours
set -euo pipefail
DEST="/srv/backup/configs/$(date +%F)"
mkdir -p "$DEST"
for hote in dc01-core-01 dc01-core-02 dc01-fw-01; do
  ssh -o BatchMode=yes "svc-backup@${hote}" 'show running-config' > "$DEST/${hote}.cfg" \\
    || echo "échec : ${hote}" >&2
done
find /srv/backup/configs -maxdepth 1 -mtime +30 -exec rm -rf {} +'''

FORTIOS = '''config system ha
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
end'''

PASTE_CISCO = '''hostname dc01-acc-03
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
end'''


def cisco_120() -> str:
    """Une configuration de switch d'accès Catalyst de 120 lignes, déjà masquée."""
    head = ["! dc01-acc-01 · Catalyst 9300-48P · IOS-XE 17.9.4", "version 17.9", "service timestamps log datetime msec localtime",
            "service password-encryption", "hostname dc01-acc-01", "!", "enable secret 9 <removed>",
            "username netadmin privilege 15 secret 9 <removed>", "aaa new-model", "aaa authentication login default group tacacs+ local", "!",
            "ip domain name dc01.example.net", "ip name-server 10.0.10.53 10.0.11.53", "!", "vlan 10", " name GESTION", "vlan 20",
            " name SERVEURS", "vlan 30", " name VOIX", "!", "spanning-tree mode rapid-pvst", "spanning-tree extend system-id", "!",
            "interface Port-channel1", " description C1|dc01-core-01|port-channel21|", " switchport mode trunk",
            " switchport trunk allowed vlan 10,20,30", "!", "interface TenGigabitEthernet1/1/1", " description C1|dc01-core-01|Ethernet1/21|",
            " switchport mode trunk", " channel-group 1 mode active", "!", "interface TenGigabitEthernet1/1/2",
            " description C1|dc01-core-02|Ethernet1/21|", " switchport mode trunk", " channel-group 1 mode active", "!"]
    tail = ["interface Vlan10", " ip address 10.0.10.21 255.255.255.0", "!", "ip default-gateway 10.0.10.1", "snmp-server community <removed> RO 99",
            "snmp-server location DC01 salle B rangée 4", "tacacs-server host 10.0.10.40 key 7 <removed>", "ntp server 10.0.10.123 prefer",
            "logging host 10.0.10.51", "!", "line vty 0 15", " transport input ssh", " exec-timeout 10 0", "end"]
    ports: list[str] = []
    p = 1
    while len(head) + len(ports) + len(tail) < 120:
        block = [f"interface GigabitEthernet1/0/{p}", f" description C3|access|poste-{p:02d}|", f" switchport access vlan {30 if p % 3 == 0 else 20}",
                 " switchport mode access", " spanning-tree portfast", "!"]
        ports.extend(block[: 120 - len(head) - len(ports) - len(tail)])
        p += 1
    return "\n".join(head + ports + tail)


def code(text: str, language: str, title: str, **extra) -> dict:
    return {"kind": "code", "text": text, "language": language, "title": title, "highlight": True, "line_numbers": True, "font": "jetbrains_mono", **extra}


def seed(base: str, auth: dict, tab, infrastructure: str = "demo-dc") -> dict:
    """Trois blocs : Python attaché au routeur (à droite), Bash libre, la configuration Cisco attachée à l'accès 01."""
    pos = tab.js("Object.fromEntries(['dc01-rt-01', 'dc01-acc-01', 'dc01-core-01', 'dc01-core-02'].map((h) => [h, LDApp.debug.handle().toile.state.positions.get(h)]))")
    rt = pos["dc01-rt-01"]
    ops = [
        {"op": "annotation_create", "content": code(PYTHON, "python", "optiques_faibles.py"), "anchor": {"kind": "device", "ref": "dc01-rt-01"},
         "x": 220, "y": -60, "w": 520, "h": 320, "leader": True},
        {"op": "annotation_create", "content": code(BASH, "bash", "sauvegarde-configs.sh"), "x": round(rt["x"]) + 220, "y": round(rt["y"]) + 300, "w": 560, "h": 260},
        {"op": "annotation_create", "content": code(cisco_120(), "cisco_ios", "running-config"), "anchor": {"kind": "device", "ref": "dc01-acc-01"},
         "x": -280, "y": 120, "w": 560, "h": 580, "leader": True},
        {"op": "annotation_create", "content": code(FORTIOS, "fortios", "ha et agg-core"), "x": round(rt["x"]) - 760, "y": round(rt["y"]) - 40, "w": 440, "h": 380},
    ]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infrastructure}, headers=auth, json={"author": "orhan", "ops": ops}, timeout=30)
    r.raise_for_status()
    ids = [a["id"] for a in r.json()["annotations"]][-4:]
    return {"python": ids[0], "bash": ids[1], "cisco": ids[2], "fortios": ids[3]}


def key(tab, k: str, code_: str, vk: int, modifiers: int = 0, text: str | None = None) -> None:
    event = {"key": k, "code": code_, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    if text is not None:
        tab.call("Input.dispatchKeyEvent", {"type": "char", "text": text, **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def click(tab, x: float, y: float, count: int = 1) -> None:
    tab.mouse_move(x, y)
    for n in range(1, count + 1):
        for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
            tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": n})


def wheel(tab, x: float, y: float, dy: float, modifiers: int = 0) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": dy, "modifiers": modifiers})


def rect(tab, selector: str) -> dict:
    return tab.js(f"(() => {{ const el = document.querySelector({json.dumps(selector)}); return el ? JSON.parse(JSON.stringify(el.getBoundingClientRect())) : null; }})()")


def block(ident: str) -> str:
    return f".react-flow__node[data-id='annotation:{ident}'] svg.annotation"


def paste_text(tab, text: str) -> None:
    """Un collage réel (événement `paste` du navigateur, avec son presse-papiers) : ce que Ctrl+V déclenche."""
    tab.js("document.querySelector('.app').focus()")
    tab.js(f"(() => {{ const d = new DataTransfer(); d.setData('text/plain', {json.dumps(text)}); window.dispatchEvent(new ClipboardEvent('paste', {{ clipboardData: d, bubbles: true }})); }})()")

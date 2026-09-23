"""Pseudonymisation déterministe d'un RunBundle.

Objectif : partager la *forme* d'un cas réel sans son contenu.

- Hostnames, serials, sites, VRF (sauf le nom réservé `default`, table globale), contextes virtuels,
  noms de cluster et de campagne : pseudonymes dérivés par HMAC d'une graine. Même graine ⇒ mêmes
  pseudonymes d'un bundle à l'autre, donc des runs anonymisées restent diffables.
- Adresses IP : bijection **préservant les préfixes** (construction Crypto-PAn, avec HMAC
  comme fonction pseudo-aléatoire, comme netconan) : deux adresses partageant k bits de
  préfixe partagent k bits après pseudonymisation, et aucun bit d'hôte n'est conservé.
- MAC : pseudonyme dans l'espace localement administré ``02:…``.
- Sécurité par défaut : ``extras`` vidés et champs optionnels des descriptions supprimés
  (contenu libre). Puis **toutes** les feuilles texte du bundle sont nettoyées des
  hostnames et serials connus, des MAC (trois formats) et des IPv4 / IPv6, quel que soit
  le champ : la liste des champs à nettoyer n'existe pas, donc ne peut pas être oubliée.
"""

import hashlib
import hmac
import ipaddress
import re
from collections.abc import Callable, Iterable
from typing import Any

from pydantic import ValidationError

from ld_contracts.bundle import RunBundle
from ld_contracts.common import MAC_ANY_RE, MAC_SHAPE, VRF_GLOBAL
from ld_contracts.defaults import without_absent_keys

IPV4_SHAPE = r"(?:\d{1,3}\.){3}\d{1,3}"
IPV6_SHAPE = r"(?:[0-9a-f]{0,4}:){2,7}(?:" + IPV4_SHAPE + r"|[0-9a-f]{0,4})"
IPV4_ANY_RE = re.compile(IPV4_SHAPE)
# Un seul balayage : IPv6 d'abord (peut contenir un quad IPv4), puis MAC, puis IPv4. Les frontières
# n'excluent pas « : » ni le point final : formats « clé:valeur » et fin de phrase compris.
ADDRESS_RE = re.compile(
    r"(?<![\w.-])(?:" + IPV6_SHAPE + r"(?![:\w])|(?:" + MAC_SHAPE + r")(?![\w:-])|" + IPV4_SHAPE + r"(?!\.?\d))",
    re.IGNORECASE,
)
IP_PLACEHOLDER = "x.x.x.x"
TOKEN_LENGTH = 10
MIN_LITERAL_LENGTH_IN_TEXT = 4
# Champs à vocabulaire fermé ou horodatés : jamais de remplacement de littéraux (aucune fuite possible,
# et un hostname homonyme d'une valeur d'énumération ne doit pas corrompre le champ).
TYPED_KEYS = frozenset(
    {
        "last_change_age_seconds",
        "type",
        "admin_status",
        "oper_status",
        "duplex",
        "status",
        "role",
        "state",
        "mode",
        "family",
        "protocol",
        "lacp_mode",
        "switchport_mode",
        "neighbor_capabilities",
        "contract_version",
        "produced_at",
        "start_datetime",
        "end_datetime",
        "started_at",
        "ended_at",
    }
)
TYPE_PREFIX = {
    "switch": "sw",
    "router": "rt",
    "firewall": "fw",
    "load_balancer": "lb",
    "wireless_controller": "wlc",
    "server": "srv",
    "other": "dev",
}

Scrubber = Callable[[str], str]


class PseudonymCollisionError(ValueError):
    """Deux identifiants distincts ont reçu le même pseudonyme : sortie non fiable, on s'arrête."""


class AnonymizationError(ValueError):
    """La sortie pseudonymisée ne respecte plus le contrat : rien n'est écrit."""


class Pseudonymizer:
    """Fonctions pures de pseudonymisation, paramétrées par la graine et les types de devices."""

    def __init__(self, seed: str, device_types: dict[str, str]) -> None:
        self._key = seed.encode("utf-8")
        self._types = {h.casefold(): t for h, t in device_types.items()}

    def _digest(self, category: str, value: str) -> bytes:
        return hmac.new(self._key, f"{category}\0{value}".encode(), hashlib.sha256).digest()

    def token(self, category: str, value: str, length: int = TOKEN_LENGTH) -> str:
        return self._digest(category, value).hex()[:length]

    def hostname(self, name: str) -> str:
        folded = name.casefold()
        prefix = TYPE_PREFIX.get(self._types.get(folded, ""), "ext")
        return f"{prefix}-{self.token('host', folded)}"

    def label(self, category: str, value: str | None) -> str | None:
        return None if value is None else f"{category}-{self.token(category, value.casefold())}"

    def serial(self, value: str | None) -> str | None:
        return None if value is None else f"SN{self.token('serial', value.casefold()).upper()}"

    def mac(self, value: str) -> str:
        raw = re.sub(r"[^0-9a-f]", "", value.casefold())
        return "02:" + ":".join(f"{b:02x}" for b in self._digest("mac", raw)[:5])

    def ip(self, address: str) -> str:
        """Bijection préservant les préfixes : bit i = bit i ⊕ PRF(bits 0..i-1)."""
        addr = ipaddress.ip_address(address)
        bits, value, out = addr.max_prefixlen, int(addr), 0
        for i in range(bits):
            prefix = value >> (bits - i)
            flip = self._digest(f"pp{addr.version}", f"{i}:{prefix}")[0] & 1
            out = (out << 1) | (((value >> (bits - 1 - i)) & 1) ^ flip)
        return str(addr.__class__(out))


# ---------------------------------------------------------------- inventory of identifiers


def _description_neighbor(text: str | None) -> str | None:
    parts = (text or "").split("|")
    return parts[1] if len(parts) >= 3 and parts[1] else None


def _looks_like_address(value: str) -> bool:
    if MAC_ANY_RE.fullmatch(value):
        return True
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def _explicit_names(dump: dict) -> set[str]:
    """Hostnames portés par un champ dédié ; les noms en forme d'IP ou de MAC relèvent du motif d'adresses."""
    names = {d["hostname"] for d in dump["devices"]}
    names |= {n["neighbor"] for n in dump["lldp"]} | {n["neighbor"] for n in dump["cdp"]}
    names |= {m["name"] for h in dump["ha"] for m in h["members"]}
    names |= {s["reported_hostname"] for s in dump["system"] if s["reported_hostname"]}
    return {n for n in names if not _looks_like_address(n)}


def _known_names(dump: dict) -> set[str]:
    """Noms explicites, plus ceux cités dans les descriptions s'ils sont assez longs pour ne pas être des mots."""
    cited = [_description_neighbor(i["description"]) for i in dump["interfaces"]]
    long_cited = {c for c in cited if c and len(c) >= MIN_LITERAL_LENGTH_IN_TEXT and not _looks_like_address(c)}
    return _explicit_names(dump) | long_cited


def _known_serials(dump: dict) -> set[str]:
    serials = {d["serial_number"] for d in dump["devices"]} | {s["serial_number"] for s in dump["system"]}
    serials |= {m["serial"] for s in dump["system"] for m in s["chassis_members"]}
    serials |= {m["serial"] for h in dump["ha"] for m in h["members"]}
    return {s for s in serials if s}


def _known_labels(dump: dict) -> list[tuple[str, str]]:
    run = dump["run"]
    labels: list[tuple[str, str | None]] = [("infra", dump["infrastructure"]), ("run", run["collector_run_id"])]
    labels += [("collection", run["collection_name"])]
    labels += [("site", d["site"]) for d in dump["devices"]] + [("infra", d["infrastructure"]) for d in dump["devices"]]
    labels += [("vrf", i["vrf"]) for i in dump["interfaces"] if i["vrf"] != VRF_GLOBAL] + [
        ("vc", i["virtual_context"]) for i in dump["interfaces"]
    ]
    labels += [("vc", v) for s in dump["system"] for v in s["virtual_contexts"]]
    labels += [("cluster", h["cluster_name"]) for h in dump["ha"]]
    return [(category, value) for category, value in labels if value]


def _literal_map(pz: Pseudonymizer, dump: dict, names: set[str], serials: set[str]) -> dict[str, str]:
    """Littéraux à remplacer dans les textes libres → pseudonyme (clés en casse repliée).

    Priorité croissante : libellés, serials, puis hostnames, qui gagnent toujours (clé de jointure).
    Les littéraux courts ne sont gardés que pour les hostnames explicites.
    """
    explicit = {n.casefold() for n in _explicit_names(dump)}
    literals = {v.casefold(): pz.label(c, v) or "" for c, v in _known_labels(dump)}
    literals |= {s.casefold(): pz.serial(s) or "" for s in serials}
    literals |= {n.casefold(): pz.hostname(n) for n in names}
    return {k: v for k, v in literals.items() if len(k) >= MIN_LITERAL_LENGTH_IN_TEXT or k in explicit}


def _assert_injective(mapping: Iterable[tuple[str, str]], kind: str) -> None:
    seen: dict[str, str] = {}
    for original, pseudonym in mapping:
        if seen.setdefault(pseudonym, original) != original:
            raise PseudonymCollisionError(
                f"collision de pseudonymes sur {kind} : allongez TOKEN_LENGTH ou changez la graine"
            )


# ---------------------------------------------------------------- free-text scrubbing


def _boundary_regex(values: Iterable[str]) -> re.Pattern | None:
    ordered = sorted({v for v in values if v}, key=len, reverse=True)
    if not ordered:
        return None
    return re.compile(r"(?<![\w-])(?:" + "|".join(re.escape(v) for v in ordered) + r")(?![\w-])", re.IGNORECASE)


def _make_scrubber(pz: Pseudonymizer, literals: dict[str, str]) -> Scrubber:
    literal_re = _boundary_regex(literals)

    def resolve(match: re.Match) -> str:
        text = match.group(0)
        if MAC_ANY_RE.fullmatch(text):
            return pz.mac(text)
        try:
            return pz.ip(text)
        except ValueError:
            return IP_PLACEHOLDER if IPV4_ANY_RE.fullmatch(text) else text

    def scrub_literals(text: str) -> str:
        return literal_re.sub(lambda m: literals[m.group(0).casefold()], text) if literal_re else text

    def scrub(text: str) -> str:
        """Les adresses sont des atomes : un hostname `10` ou `aa` n'est jamais remplacé dans une IP ou une MAC.
        Une feuille égale à un littéral connu est remplacée entière, avant le découpage : un nom annoncé qui
        contient une adresse (`AP3c:ec:…`) ne fuit pas."""
        whole = literals.get(text.casefold())
        if whole is not None:
            return whole
        pieces, last = [], 0
        for match in ADDRESS_RE.finditer(text):
            pieces += [scrub_literals(text[last : match.start()]), resolve(match)]
            last = match.end()
        pieces.append(scrub_literals(text[last:]))
        return "".join(pieces)

    return scrub


def _scrub_tree(node: Any, scrub: Scrubber, *, in_extras: bool = False) -> Any:
    """Nettoie toutes les feuilles texte ; les clés aussi sous ``extras`` ; jamais les champs typés."""
    if isinstance(node, dict):
        return {(scrub(k) if in_extras else k): _scrub_child(k, v, scrub, in_extras) for k, v in node.items()}
    if isinstance(node, list):
        return [_scrub_tree(v, scrub, in_extras=in_extras) for v in node]
    return scrub(node) if isinstance(node, str) else node


def _scrub_child(key: str, value: Any, scrub: Scrubber, in_extras: bool) -> Any:
    if key in TYPED_KEYS and not in_extras:
        return value
    if key == "vrf" and value == VRF_GLOBAL and not in_extras:
        return value  # nom réservé du contrat (table globale), même si un autre libellé s'écrit `default`
    return _scrub_tree(value, scrub, in_extras=in_extras or key == "extras")


# ---------------------------------------------------------------- structured replacements (new dicts)


def _extras(extras: dict, keep: bool) -> dict:
    return dict(extras) if keep else {}


def _description(text: str | None, keep_options: bool, pz: Pseudonymizer) -> str | None:
    """Champ 1 (device voisin) pseudonymisé structurellement ; options supprimées sauf demande."""
    if text is None:
        return None
    parts = text.split("|")
    if len(parts) < 3:
        return text
    neighbor = parts[1] if not parts[1] or _looks_like_address(parts[1]) else pz.hostname(parts[1])
    tail = parts[3:] if keep_options else ([""] if len(parts) > 3 else [])
    return "|".join([parts[0], neighbor, parts[2], *tail])


def _map_device(d: dict, pz: Pseudonymizer, keep: bool) -> dict:
    return {
        **d,
        "infrastructure": pz.label("infra", d["infrastructure"]),
        "site": pz.label("site", d["site"]),
        "serial_number": pz.serial(d["serial_number"]),
        "extras": _extras(d["extras"], keep),
    }


def _map_scoped(doc: dict, keep: bool) -> dict:
    return {**doc, "extras": _extras(doc["extras"], keep)}


def _map_interface(i: dict, pz: Pseudonymizer, keep: bool, keep_options: bool) -> dict:
    return {
        **_map_scoped(i, keep),
        "description": _description(i["description"], keep_options, pz),
        "vrf": i["vrf"] if i["vrf"] == VRF_GLOBAL else pz.label("vrf", i["vrf"]),
        "virtual_context": pz.label("vc", i["virtual_context"]),
    }


def _map_system(s: dict, pz: Pseudonymizer, keep: bool) -> dict:
    return {
        **_map_scoped(s, keep),
        "serial_number": pz.serial(s["serial_number"]),
        "chassis_members": [{**m, "serial": pz.serial(m["serial"])} for m in s["chassis_members"]],
        "virtual_contexts": [pz.label("vc", v) for v in s["virtual_contexts"]],
    }


def _map_ha(h: dict, pz: Pseudonymizer, keep: bool) -> dict:
    return {
        **_map_scoped(h, keep),
        "cluster_name": pz.label("cluster", h["cluster_name"]),
        "members": [{**m, "serial": pz.serial(m["serial"])} for m in h["members"]],
    }


def _map_structured(dump: dict, pz: Pseudonymizer, keep: bool, keep_options: bool) -> dict:
    run = dump["run"]
    return {
        **dump,
        "infrastructure": pz.label("infra", dump["infrastructure"]),
        "run": {
            **run,
            "collector_run_id": pz.label("run", run["collector_run_id"]),
            "collection_name": pz.label("collection", run["collection_name"]),
        },
        "devices": [_map_device(d, pz, keep) for d in dump["devices"]],
        "tasks": list(dump["tasks"]),
        "interfaces": [_map_interface(i, pz, keep, keep_options) for i in dump["interfaces"]],
        "aggregates": [_map_scoped(a, keep) for a in dump["aggregates"]],
        "lldp": [_map_scoped(n, keep) for n in dump["lldp"]],
        "cdp": [_map_scoped(n, keep) for n in dump["cdp"]],
        "system": [_map_system(s, pz, keep) for s in dump["system"]],
        "ha": [_map_ha(h, pz, keep) for h in dump["ha"]],
    }


# ---------------------------------------------------------------- entry point


def anonymize_bundle(
    data: dict, seed: str, *, keep_extras: bool = False, keep_description_options: bool = False
) -> dict:
    """Retourne un nouveau bundle pseudonymisé ; l'entrée n'est jamais modifiée."""
    bundle = RunBundle.model_validate(data)
    dump = bundle.model_dump(mode="json")
    pz = Pseudonymizer(seed, {d.hostname: d.type.value for d in bundle.devices})
    names, serials = _known_names(dump), _known_serials(dump)
    _assert_injective(((n.casefold(), pz.hostname(n)) for n in names), "hostnames")
    _assert_injective(((s.casefold(), pz.serial(s) or "") for s in serials), "serials")
    structured = _map_structured(dump, pz, keep_extras, keep_description_options)
    scrubbed = _scrub_tree(structured, _make_scrubber(pz, _literal_map(pz, dump, names, serials)))
    out = _keep_absences(bundle, scrubbed)
    _revalidate(out)
    return out


def _keep_absences(bundle: RunBundle, scrubbed: dict) -> dict:
    """Les clés nullables absentes de l'entrée restent absentes : un driver incomplet se diagnostique aussi sur
    l'anonymisé, seul à sortir de l'infra (constat `nullable_key_absent`)."""
    try:
        return without_absent_keys(bundle, scrubbed)
    except (ValueError, KeyError) as exc:
        raise AnonymizationError("sortie pseudonymisée de forme différente de l'entrée, rien n'est écrit") from exc


def _revalidate(out: dict) -> None:
    try:
        RunBundle.model_validate(out)
    except ValidationError as exc:
        paths = [".".join(str(p) for p in e["loc"]) for e in exc.errors()][:5]
        raise AnonymizationError(f"sortie pseudonymisée invalide, rien n'est écrit ; champs : {paths}") from exc

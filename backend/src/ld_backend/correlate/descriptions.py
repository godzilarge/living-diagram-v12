"""R2 : grammaire des descriptions, forme V1 `criticité|voisin|port|options` (décision 2 du 2026-09-20) et forme HA
positionnelle `criticité|device₁|port₁|…|deviceₙ|portₙ` (2026-10-02, revue appliquée le même jour).

La configuration d'un cluster FortiGate est partagée : les membres portent la même description, et la forme V1
donnait au second membre un faux câble vers le port du premier. En forme HA, une paire par membre, dans l'ordre des
priorités HA décroissantes (`ha[].members[].priority`, fait de configuration propre à chaque unité) ; le rôle courant
est écarté, il change à la bascule, pas les câbles.

La forme HA n'est lue que sur un **membre de cluster** (`ha_places`) : ailleurs, toute description est V1 (revue, H1).
Sur un membre, une description d'au moins cinq champs dont les champs 2 et 4 sont de forme nom est une forme HA, qui
doit alors compter exactement 1 + 2n champs (revue, H3 : un membre disparu de `members` décalerait les rangs en
silence) ; ce qui ne se résout pas ne dessine rien et porte sa raison (`Unresolved`). Piège assumé, à trancher avec
Orhan : sur un membre, une V1 dont l'option contiendrait un `|` a la forme d'une HA (revue, H2 / M3).

Isolée ici pour changer avec l'échantillon réel (question 6 de docs/05) sans toucher au reste de B1.
"""

import re
from collections import defaultdict
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass

from ld_contracts.models_ha import HaStatus
from ld_contracts.snapshot.interfaces import ParsedDescription

# Un nom de voisin : hostname, FQDN, MAC ou IP ; jamais d'espace. Un libellé (`WAN PROVIDER`) est refusé,
# un libellé sans espace (`WAN-PROVIDER`) passe et finira en stub visible, filtrable.
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
SEPARATOR = "|"
MAX_FIELDS = 4  # forme V1 : le champ 4 garde ses `|`
MIN_HA_FIELDS = 5  # forme HA : criticité + deux paires au moins

FIELD_COUNT_MISMATCH = "field_count_mismatch"
DEVICE_NOT_A_NAME = "device_not_a_name"
PRIORITY_UNDECIDED = "priority_undecided"
CLUSTER_AMBIGUOUS = "cluster_ambiguous"

Members = tuple[str, ...]
Priorities = tuple[tuple[str, int | None], ...]


@dataclass(frozen=True, slots=True)
class HaPlace:
    """La place d'un device parmi les membres de son cluster : `rank` dans l'ordre des priorités décroissantes."""

    members: Members
    rank: int


@dataclass(frozen=True, slots=True)
class Unresolved:
    """Une forme HA que B1 ne peut pas lire pour ce device : la raison et ce qui la motive, pour le contrôle."""

    reason: str
    members: Members = ()
    fields: int | None = None
    expected_fields: int | None = None
    field: int | None = None
    priorities: Priorities = ()
    disputed: tuple[tuple[str, tuple[int, ...]], ...] = ()
    clusters: tuple[Members, ...] = ()

    def details(self) -> dict[str, object]:
        """Les `details` du contrôle ; jamais de clé `interface` (réservée au repli de `interface_check`)."""
        out: dict[str, object] = {"reason": self.reason}
        if self.members:
            out["members"] = list(self.members)
        if self.fields is not None:
            out.update(fields=self.fields, expected_fields=self.expected_fields)
        if self.field is not None:
            out["field"] = self.field
        if self.priorities:
            out["priorities"] = [{"hostname": host, "priority": priority} for host, priority in self.priorities]
        if self.disputed:
            out["disputed"] = [{"hostname": host, "values": list(values)} for host, values in self.disputed]
        if self.clusters:
            out["clusters"] = [list(cluster) for cluster in self.clusters]
        return out


Place = HaPlace | Unresolved


def _is_name(field: str) -> bool:
    return NAME_RE.fullmatch(field) is not None


def _looks_ha(fields: Sequence[str]) -> bool:
    """Au moins cinq champs, champs 2 et 4 de forme nom. Seulement consulté sur un membre de cluster."""
    return len(fields) >= MIN_HA_FIELDS and _is_name(fields[1]) and _is_name(fields[3])


def _parse_v1(text: str) -> ParsedDescription | None:
    """Champs 1 et 2 obligatoires (1 peut être vide), 3 et 4 optionnels ; le champ 4 garde ses `|`."""
    parts = [part.strip() for part in text.split(SEPARATOR, MAX_FIELDS - 1)]
    neighbor = parts[1] if len(parts) > 1 else ""
    if not _is_name(neighbor):
        return None
    port = parts[2] if len(parts) > 2 else ""
    options = parts[3] if len(parts) > 3 else ""
    return ParsedDescription(
        criticality=parts[0] or None, neighbor=neighbor, port=port or None, options=options or None
    )


def _parse_ha(fields: Sequence[str], place: HaPlace) -> ParsedDescription | Unresolved:
    """Exactement une paire par membre, aucune option ; le membre de rang k prend la paire k."""
    expected = 1 + 2 * len(place.members)
    if len(fields) != expected:
        return Unresolved(FIELD_COUNT_MISMATCH, place.members, fields=len(fields), expected_fields=expected)
    malformed = next((index for index in range(1, expected, 2) if not _is_name(fields[index])), None)
    if malformed is not None:
        return Unresolved(DEVICE_NOT_A_NAME, place.members, field=malformed + 1)
    device, port = fields[1 + 2 * place.rank], fields[2 + 2 * place.rank]
    return ParsedDescription(criticality=fields[0] or None, neighbor=device, port=port or None, options=None)


def parse_description(text: str | None, place: Place | None = None) -> ParsedDescription | Unresolved | None:
    """La description lue pour ce device : V1 partout, forme HA sur un membre de cluster (sa paire, ou la raison
    pour laquelle elle ne se lit pas) ; None si le texte ne suit aucune grammaire."""
    if text is None or SEPARATOR not in text:
        return None
    fields = [field.strip() for field in text.split(SEPARATOR)]
    if place is None or not _looks_ha(fields):
        return _parse_v1(text)
    if isinstance(place, Unresolved):
        return place
    return _parse_ha(fields, place)


def _priority(hostname: str, reporters: Sequence[HaStatus]) -> tuple[int | None, tuple[int, ...]]:
    """La vue d'un membre sur lui-même prime ; sinon la seule valeur lue. Deux valeurs lues différentes sans vue
    propre : indécis, les valeurs sont rendues (revue, M1 : R4 signale ce désaccord, R2 ne le tranche pas)."""
    views = [(doc.hostname, seen.priority) for doc in reporters for seen in doc.members if seen.name == hostname]
    own = next((priority for reporter, priority in views if reporter == hostname), None)
    if own is not None:
        return own, ()
    read = tuple(sorted({priority for _, priority in views if priority is not None}))
    return (read[0], ()) if len(read) == 1 else (None, read)


def _ranking(members: Members, priorities: Sequence[int | None]) -> Members | None:
    """Les membres par priorité décroissante ; None si une priorité manque ou si deux sont égales."""
    if any(priority is None for priority in priorities) or len(set(priorities)) != len(priorities):
        return None
    return tuple(host for _, host in sorted(zip(priorities, members, strict=True), key=lambda pair: -pair[0]))


def _places_of(key: Members, reporters: Sequence[HaStatus]) -> dict[str, Place]:
    resolved = [_priority(hostname, reporters) for hostname in key]
    priorities = [priority for priority, _ in resolved]
    ranking = _ranking(key, priorities)
    if ranking is None:
        disputed = tuple((host, read) for host, (_, read) in zip(key, resolved, strict=True) if read)
        undecided = Unresolved(
            PRIORITY_UNDECIDED, key, priorities=tuple(zip(key, priorities, strict=True)), disputed=disputed
        )
        return dict.fromkeys(key, undecided)
    return {hostname: HaPlace(members=key, rank=ranking.index(hostname)) for hostname in key}


def ha_places(docs: Iterable[HaStatus], known: Collection[str]) -> Mapping[str, Place]:
    """Par device membre d'un cluster à deux membres ou plus, sa place. Les membres sont ceux que les documents
    listent **et** que `devices` connaît, la clé de cluster de R4 (revue, M2) : un membre inconnu ne compte pas, et la
    description écrite pour le cluster physique a alors trop de champs. Un device listé dans deux clusters aux membres
    différents n'a aucune place (`cluster_ambiguous`)."""
    groups: dict[Members, list[HaStatus]] = defaultdict(list)
    for doc in sorted(docs, key=lambda d: d.hostname):
        key = tuple(sorted(seen.name for seen in doc.members if seen.name in known))
        if len(key) >= 2:
            groups[key].append(doc)
    clusters_of: dict[str, list[Members]] = defaultdict(list)
    for key in sorted(groups):
        for hostname in key:
            clusters_of[hostname].append(key)
    out: dict[str, Place] = {}
    for key in sorted(groups):
        for hostname, place in _places_of(key, groups[key]).items():
            if len(clusters_of[hostname]) > 1:
                out[hostname] = Unresolved(CLUSTER_AMBIGUOUS, clusters=tuple(clusters_of[hostname]))
            else:
                out[hostname] = place
    return out

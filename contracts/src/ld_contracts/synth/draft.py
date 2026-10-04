"""Le brouillon : le monde en cours de construction, étendu par copie, puis figé en `World`.

Les constructeurs de sites et d'accès travaillent dessus ; les mutations qui créent (un accès, un stub) le
rouvrent depuis un monde par `draft_of` et le referment par `world_of`.
"""

import random
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace

from ld_contracts.synth import naming
from ld_contracts.synth.world import Aggregate, Cable, Device, HaCluster, Port, PortRef, Stub, World

EXTERNAL_INFRASTRUCTURE = "infra-wan"
UPTIME_DAYS_RANGE = (30, 400)


@dataclass(frozen=True, slots=True)
class Draft:
    seed: str
    infrastructure: str
    devices: tuple[Device, ...] = ()
    ports: tuple[Port, ...] = ()
    cables: tuple[Cable, ...] = ()
    aggregates: tuple[Aggregate, ...] = ()
    clusters: tuple[HaCluster, ...] = ()
    stubs: tuple[Stub, ...] = ()
    next_index: int = 0
    next_stub: int = 0

    def add(self, **more: Iterable) -> Draft:
        return replace(self, **{k: (*getattr(self, k), *v) for k, v in more.items()})

    def replace_ports(self, updates: Mapping[PortRef, Port]) -> Draft:
        """Un seul passage sur les ports : à appeler une fois par device construit, pas par port."""
        kept = [p for p in self.ports if (p.device, p.name) not in updates]
        return replace(self, ports=(*kept, *updates.values()))

    def device(self, hostname: str) -> Device:
        return next(d for d in self.devices if d.hostname == hostname)

    def ports_of(self, hostname: str) -> tuple[Port, ...]:
        return tuple(p for p in self.ports if p.device == hostname)


def new_device(draft: Draft, site: str, role: str, number: int, **extra: object) -> tuple[Draft, Device]:
    """Crée un device au prochain rang, le range dans le brouillon, et rend les deux."""
    model, platform, os_version, _, serial_prefix = naming.MODELS[role]
    infrastructure = EXTERNAL_INFRASTRUCTURE if role == "external" else draft.infrastructure
    device = Device(
        hostname=naming.hostname(site, role, number),
        infrastructure=infrastructure,
        site=site,
        type=naming.DEVICE_TYPE[role],
        platform=platform,
        model=model,
        os_name=naming.OS_NAME[platform],
        os_version=os_version,
        serial=naming.serial(serial_prefix, draft.seed, draft.next_index),
        role=role,
        index=draft.next_index,
        **extra,
    )
    return replace(draft, next_index=draft.next_index + 1).add(devices=[device]), device


def description(peer: str, port: str, criticality: str = "C1") -> str:
    """Forme V1 des descriptions : `criticité|voisin|port|options`, option vide."""
    return f"{criticality}|{peer}|{port}|"


def uptime_days(rng: random.Random) -> int:
    return rng.randint(*UPTIME_DAYS_RANGE)


def core_hostnames(site: str) -> tuple[str, str]:
    return naming.hostname(site, "core", 1), naming.hostname(site, "core", 2)


def draft_of(world: World) -> Draft:
    """Le monde rouvert en brouillon, pour réutiliser les constructeurs (accès ajouté, stub ajouté)."""
    return Draft(
        seed=world.seed,
        infrastructure=world.infrastructure,
        devices=world.devices,
        ports=world.ports,
        cables=world.cables,
        aggregates=world.aggregates,
        clusters=world.clusters,
        stubs=world.stubs,
        next_index=world.next_index,
        next_stub=world.next_stub,
    )


def world_of(draft: Draft, previous: World) -> World:
    """Le brouillon refermé : mêmes sites, mêmes pannes transitoires, listes retriées."""
    return replace(
        previous,
        devices=tuple(sorted(draft.devices, key=lambda d: d.hostname)),
        ports=tuple(sorted(draft.ports, key=lambda p: (p.device, p.name))),
        cables=tuple(sorted(draft.cables, key=lambda c: (c.a, c.b))),
        aggregates=tuple(sorted(draft.aggregates, key=lambda a: (a.device, a.name))),
        clusters=tuple(sorted(draft.clusters, key=lambda c: c.name)),
        stubs=tuple(sorted(draft.stubs, key=lambda s: s.name)),
        next_index=draft.next_index,
        next_stub=draft.next_stub,
    )

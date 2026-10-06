"""Le catalogue fermé des mutations : noms et une ligne de sens chacun. Les fonctions vivent dans `mutations.py`.

Séparé pour que la spécification puisse valider un plan sans importer la mécanique.
"""

MUTATION_CATALOGUE: dict[str, str] = {
    "device_added": "un switch d'accès de plus, double-attaché aux cœurs en vPC, avec ses stubs",
    "device_removed": "un switch d'accès décommissionné ; les descriptions des ports cœur restent (périmées)",
    "device_unreachable": "un device injoignable pendant la run : tâche vide, aucun document (transitoire)",
    "topic_failed": "un topic en échec sur un device : tâche partielle, aucun document de ce topic (transitoire)",
    "cable_moved": "un uplink d'accès déplacé sur un autre port du cœur ; l'ancienne description reste",
    "cable_down": "un câble tombé : les deux bouts down, plus rien d'observé, descriptions intactes",
    "description_changed": "la description d'un port observé réécrite vers un autre port du voisin : désaccord",
    "ha_failover": "bascule d'un cluster : rôles échangés, priorités inchangées",
    "ha_member_down": "un membre HA mort pendant la run : injoignable, câbles tombés, vu down (transitoire)",
    "aggregate_member_suspended": "un membre d'agrégat suspendu par LACP, toujours observé",
    "speed_degraded": "un uplink négocié à 1 Gb/s d'un seul côté",
    "stub_added": "un serveur de plus sur un port d'accès libre",
    "stub_removed": "un stub débranché ; la description du port reste",
    "reboot": "un device redémarré : l'uptime repart de cette run et recompte ensuite",
}

MUTATION_KINDS: tuple[str, ...] = tuple(MUTATION_CATALOGUE)
TRANSIENT_KINDS: frozenset[str] = frozenset({"device_unreachable", "topic_failed", "ha_member_down"})

# Formes de raccordement du cluster FortiGate aux cœurs : la première est le défaut. Le détail des pattes vit dans
# `build_firewall.py`.
FIREWALL_UPLINKS_CATALOGUE: dict[str, str] = {
    "vpc": "agg-core = x1 → cœur 01, x2 → cœur 02 : un vPC par membre",
    "dual-vpc": "agg-1 = x1 → cœur 01, x2 → cœur 02 ; agg-2 = x3 → cœur 01, x4 → cœur 02 : deux vPC par membre",
    "per-core": "agg-1 = x1, x2 → cœur 01 ; agg-2 = x3, x4 → cœur 02 : un port-channel par cœur, sans vPC",
    "single-core": "agg-1 = x1, x2 → cœur 01 ; agg-2 = x3, x4 → cœur 01 : deux port-channels vers le cœur 01 seul",
}

FIREWALL_UPLINKS: tuple[str, ...] = tuple(FIREWALL_UPLINKS_CATALOGUE)

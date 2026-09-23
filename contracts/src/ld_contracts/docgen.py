"""Génération de la référence `CONTRAT.md` depuis les modèles : une seule source, aucune dérive possible.

Partie A (RunBundle) ici ; partie B (Snapshot) dans `docgen_snapshot` ; rendu commun dans `docgen_render`.
"""

from pathlib import Path

from ld_contracts.bundle import CONTRACT_VERSION
from ld_contracts.checks import FINDING_CODES
from ld_contracts.docgen_render import reference_names, render_reference
from ld_contracts.docgen_snapshot import snapshot_part
from ld_contracts.schema import generate_schema

DOC_PATH = Path(__file__).resolve().parents[2] / "CONTRAT.md"
SKELETON_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "bundle-skeleton.json"

ERROR_TYPES = {
    "duplicate_identity": "deux documents portent la même identité dans une section (hostnames comparés sans la casse)",
    "hostname_not_in_devices": "un document de topic cite un hostname absent de `devices`",
    "hostname_outside_infrastructure": "le device visé par un document de topic est d'une autre infrastructure",
    "contract_major_unsupported": "la version majeure de `contract_version` n'est pas celle du validateur",
    "datetime_numeric": "une date est donnée en nombre (epoch) au lieu d'ISO 8601 avec fuseau",
    "ip_invalid": "une adresse IP n'est pas analysable",
    "ip_family_mismatch": "`family` ne correspond pas à la version de l'adresse",
    "ip_prefix_out_of_range": "`prefix` hors plage pour la version de l'adresse",
    "mac_not_normalized": "un nom ou un port de voisin en forme de MAC n'est pas au format `aa:bb:cc:dd:ee:ff`",
    "ha_local_not_in_members": "un document `ha` ne liste pas son propre device dans `members`",
    "ha_member_duplicate": "un document `ha` liste un même membre plusieurs fois",
    "member_in_several_aggregates": "un port est membre de plusieurs agrégats du même device "
    "(`aggregates[].members` ou `interfaces[].members`)",
    "chassis_member_slot_duplicate": "deux `chassis_members` d'un document `system` portent le même `slot`",
    "ha_standalone_not_alone": "un document `ha` en mode `standalone` ne liste pas exactement lui-même, rôle `member`",
    "access_vlan_outside_access_mode": (
        "une interface porte un `access_vlan` alors que `switchport_mode` n'est pas `access`"
    ),
    "vlan_range_inverted": "un intervalle d'`allowed_vlans` a `first` supérieur à `last`",
    "vlan_ranges_overlap": "deux intervalles d'`allowed_vlans` se recouvrent ou sont en double",
    "trunk_vlans_outside_trunk_mode": (
        "une interface porte `native_vlan` ou `allowed_vlans` alors que `switchport_mode` n'est pas `trunk`"
    ),
    "extra_forbidden": "un champ inconnu est présent au premier niveau d'un document (utiliser `extras`)",
}


RESERVED_VALUES = [
    "#### `null` et valeurs réservées",
    "",
    "`null` n'affirme jamais un fait : il veut dire « pas de valeur » (non lu, sans objet, non fourni). Quand "
    "l'absence",
    "de quelque chose est elle-même un fait, le contrat lui donne une valeur. B1 ne tire aucune conclusion d'un "
    "`null`.",
    "",
    "| Champ | Valeur | Ce qu'elle affirme | Ce que `null` veut dire |",
    "|---|---|---|---|",
    '| `interfaces[].vrf` | `"default"` | l\'interface est dans la table de routage globale | non lu, ou sans objet '
    "(port commuté) |",
    '| `interfaces[].last_change_age_seconds` | `"never"` | aucun changement d\'état depuis le dernier démarrage | '
    "non lu |",
    "| `interfaces[].switchport_mode` | `none` | mode lu, aucun de `access` / `trunk` / `routed` ne s'applique | "
    "non lu |",
    "| `interfaces[].allowed_vlans` | `[]` | aucun VLAN autorisé | non lu |",
    '| `interfaces[].allowed_vlans` | `[{"first": 1, "last": 4094}]` | tous les VLAN (`all`) | non lu |',
    "",
    '**`vrf` : ce que le producteur écrit, par plateforme.** La traduction vers `"default"` est une normalisation de',
    "valeur : elle se fait dans la librairie de collecte, pas dans B0.",
    "",
    "| Plateforme | La table globale sur l'équipement | Valeur dans le bundle |",
    "|---|---|---|",
    '| NX-OS, EOS, IOS-XR | VRF `default`, nom natif et réservé | `"default"` |',
    '| IOS, IOS-XE | pas de nom : interface L3 sans `vrf forwarding` | `"default"` |',
    '| Junos | instance de routage `master` | `"default"` |',
    '| FortiOS | vrf `0` | `"default"` ; les autres identifiants en texte (`"10"`) |',
    '| Checkpoint Gaia | une seule table (le VSX relève de `virtual_context`) | `"default"` |',
    "| toutes | VRF nommée (`PROD`, `management`, `Mgmt-vrf`) | le nom tel que configuré, casse conservée |",
    "| toutes | port commuté `access` / `trunk` : aucune table de routage | `null` |",
    "| toutes | instance non lue | `null` |",
    "",
    '**Quand écrire `"default"`.** Quand la table globale est un fait établi, de l\'une de ces deux façons : la '
    "commande",
    "est bornée à la table globale par construction (`show ip route` sans `vrf`) ; ou l'appartenance aux VRF a été "
    "lue et",
    "l'interface L3 n'est dans aucune VRF nommée (NX-OS : `show vrf interface` répond `default` ; IOS-XE : `show vrf` "
    "lu,",
    "interface absente de toutes les VRF). Une commande muette sur la VRF (`show interfaces`, `show ip interface "
    "brief`)",
    "ne prouve rien : `null`. Sinon l'interface de management (`management` sur NX-OS, `Mgmt-vrf` sur IOS-XE) serait",
    "déclarée dans la table globale : un fait faux, pire qu'un `null`. Si l'appartenance aux VRF n'a pas été "
    "collectée,",
    "`null` partout.",
    "",
    "Le nom réservé s'écrit en minuscules exactes. `Default`, `DEFAULT` ou ` default` sont acceptés tels quels "
    "(les noms",
    "de VRF sont sensibles à la casse : sur NX-OS, `Default` est une VRF utilisateur distincte), jamais normalisés, et",
    "signalés par le constat `vrf_default_case`. Une chaîne vide est refusée. L'anonymiseur conserve `default` et",
    "pseudonymise les autres noms. **Collision assumée** : une plateforme qui autoriserait une VRF utilisateur nommée",
    "exactement `default`, distincte de la table globale, ne peut pas l'exprimer ; à signaler si le cas se présente.",
    "",
]


def bundle_part() -> list[str]:
    schema = generate_schema("bundle")
    return [
        f"## Partie A — Entrée : RunBundle v{CONTRACT_VERSION}",
        "",
        "Le RunBundle est ce que l'exportateur B0 produit et ce que Living Diagram ingère : une run, une",
        "infrastructure, un document JSON validé. C'est la référence sur laquelle l'exportateur s'appuie pour fournir,",
        "adapter ou challenger les données ; les documents `docs/01`, `02` et `04` sont l'historique du raisonnement.",
        "",
        *render_reference(schema, level=3),
        "### Règles transverses",
        "",
        "Vérifiées par le validateur, au-delà des types de chaque champ :",
        "",
        "- `null` n'affirme jamais un fait : il veut dire « pas de valeur » (non lu, sans objet, non fourni). Un fait",
        '  s\'écrit avec une valeur (`"never"`, `"default"`, `[]`, `none` : voir « `null` et valeurs réservées ») ;',
        "- un champ nullable absent est lu comme `null` et **compté** (constat `nullable_key_absent`, un par champ) ;",
        "  le défaut n'est jamais une valeur. Tout autre champ est requis. La forme canonique, celle qui est archivée,",
        "  écrit toutes les clés : clé absente et `null` explicite donnent le même bundle ;",
        "- un champ inconnu au premier niveau est refusé (une faute de frappe ne devient donc jamais un `null`), "
        "`extras`",
        "  est le seul endroit libre ;",
        "- types stricts : un entier en chaîne, une MAC non normalisée, une date sans fuseau ou en nombre sont "
        "refusés ;",
        "- `hostname` identique octet pour octet à `devices[].hostname` dans toutes les sections ; deux hostnames ne",
        "  différant que par la casse sont un doublon ;",
        "- identités uniques : `(hostname, name)` pour `interfaces` et `aggregates`, `(hostname, local_interface,",
        "  neighbor, neighbor_interface)` pour `lldp` et `cdp`, un document par hostname pour `tasks`, `system`, "
        "`ha` ;",
        "- le périmètre est un fait du bundle, écrit une fois : aucun document de topic ne porte `infrastructure` ;",
        "  chacun vise un device qui, selon `devices` (lue au moment de l'export), appartient à l'infrastructure du",
        "  bundle. Seule `devices` couvre d'autres infrastructures. `infrastructure` se compare octet pour octet,",
        "  comme `hostname` ;",
        "- un document `ha` liste son propre device dans `members`, octet pour octet et une seule fois : le rôle et",
        "  l'état du device local s'y lisent, il n'y a pas de champ à part. `standalone` : exactement un membre,",
        "  le device lui-même, rôle `member`.",
        "",
        *RESERVED_VALUES,
        "#### Erreurs de contrat (bloquantes)",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in ERROR_TYPES.items()],
        "",
        "Les messages ne contiennent jamais de valeur ; les valeurs sont dans le détail, affiché avec `--show-values`.",
        "",
        "#### Constats (non bloquants, remontés à B1)",
        "",
        "| Code | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in FINDING_CODES.items()],
        "",
        "### Exemple : le plus petit bundle valide",
        "",
        "`fixtures/bundle-skeleton.json`, à copier comme point de départ :",
        "",
        "```json",
        SKELETON_PATH.read_text(encoding="utf-8").rstrip(),
        "```",
        "",
        "Le bundle de référence complet (deux Nexus en vPC, cluster Fortinet, voisin externe, stub, désaccord",
        "description / LLDP) est `fixtures/bundle-minimal.json`. Le JSON Schema équivalent est",
        "`src/ld_contracts/schema/runbundle-v1.schema.json`.",
        "",
    ]


def generate_markdown() -> str:
    out = [
        "# Contrats Living Diagram — référence",
        "",
        "> **Document généré** depuis les modèles du paquet `ld-contracts` par `ld-contracts docs --out`.",
        "> Ne pas l'éditer à la main : modifier les modèles (descriptions comprises), régénérer, un test vérifie",
        "> qu'il n'a pas dérivé. Deux contrats : la **partie A** décrit ce qui entre (le RunBundle produit par",
        "> l'exportateur B0), la **partie B** ce qui sort (le Snapshot produit par la corrélation B1).",
        "",
        *bundle_part(),
        *snapshot_part(reference_names(generate_schema("bundle")), ERROR_TYPES),
    ]
    return "\n".join(out)


def write_markdown(path: Path = DOC_PATH) -> Path:
    path.write_text(generate_markdown(), encoding="utf-8")
    return path


def load_committed_markdown() -> str:
    return DOC_PATH.read_text(encoding="utf-8")


__all__ = [
    "DOC_PATH",
    "ERROR_TYPES",
    "FINDING_CODES",
    "generate_markdown",
    "load_committed_markdown",
    "write_markdown",
]

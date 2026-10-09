"""Partie D de `CONTRAT.md` : la couche d'intention, Intent v1."""

from pathlib import Path

from ld_contracts.docgen_render import render_reference
from ld_contracts.intent import INTENT_VERSION
from ld_contracts.intent.codes import INTENT_ERROR_TYPES
from ld_contracts.schema import generate_schema

INTENT_SKELETON_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "intent-skeleton.json"

INTENT_RULES = [
    "### Règles transverses",
    "",
    "Vérifiées à la validation d'une intention, au-delà des types de chaque champ. Un document qui les viole est",
    "**refusé** (`docs/08`).",
    "",
    "- **Un document par infrastructure, jamais par run** : l'intention est longue, les runs passent. Il ne porte",
    "  aucun `collector_run_id`.",
    "- **Les patchs sont keyés par identité stable, jamais par coordonnée ni par run** : une épingle ou une",
    "  couleur d'équipement vise le `hostname` d'un nœud, à l'octet ; une couleur de type vise un `type` du contrat",
    "  d'entrée ; un groupe porte un `id` attribué par le serveur (`g<revision>-<n>`). Un nœud absent de la run",
    "  affichée rend son patch **orphelin** : listé, jamais effacé en silence (règles I3, C2, G4).",
    "- **Un groupe = des membres + un style, jamais une forme à coordonnées** (docs/10 §5) : son cadre se calcule",
    "  depuis les cartes de ses membres ; toutes les clés du style sont écrites, le serveur complète avec les défauts.",
    "- **Une annotation dit ce que la donnée ignore** (docs/10 §6) : une note, une forme, un tableau ou une image,",
    "  avec une boîte (`x`, `y`, `w`, `h`) et un ancrage, libre dans le plan ou attachée à un équipement (relative au",
    "  centre de sa carte) ou à un groupe (relative au coin haut gauche de son cadre) ; `ref` est null si et seulement",
    "  si l'ancrage est `free` ; une ligne de rappel suppose une ancre ; les lignes d'un tableau ont la même",
    "  longueur, ses largeurs et hauteurs relatives comptent autant d'entrées que de colonnes et de lignes, ses",
    "  fusions restent dans le tableau sans se chevaucher ;",
    "  une image est une empreinte SHA-256 d'un fichier du magasin de l'infrastructure (PNG, JPEG, WebP ; jamais SVG).",
    "  Identité `a<revision>-<n>` attribuée par le serveur ; ancre absente de la run ⇒ annotation orpheline, listée.",
    "- **Un connecteur relie deux bouts** (docs/10 §6, 1.4.0) : une ligne ou une flèche, chaque bout libre (un point",
    "  du plan) ou attaché à un équipement, un groupe ou une annotation, par une ancre (`side`, 1.5.0 : le milieu d'un",
    "  côté, ou `auto` = le contour vers l'autre bout) ; jamais deux fois le même élément ; pointes, tracé droit /",
    "  coudé / courbe et courbure, étiquette. Identité `c<revision>-<n>` ;",
    "  un bout attaché à un élément absent ⇒ connecteur orphelin, listé. Ce n'est pas un câble : une intention.",
    "- **Une couleur est une teinte nommée** (`hue`, douze valeurs), jamais une valeur libre : le moteur donne à",
    "  chaque teinte sa valeur sombre et sa valeur claire ; les défauts par type vivent dans le moteur, pas ici",
    "  (docs/10).",
    "- **Toutes les clés sont écrites** ; aucun défaut, pas d'`extras` ; entiers stricts, dates ISO 8601 avec fuseau.",
    "- **Ordre canonique vérifié par le type** : `pins` et `device_colors` triées par `hostname`, `type_colors` par",
    "  `type`, `groups`, `annotations` et `connectors` par `id`, les `members` d'un groupe par `hostname` ; uniques.",
    "- **`revision` compte les requêtes d'écriture acceptées** ; `updated_at` est null si et seulement si `revision`",
    "  vaut 0. Le document ne s'écrit que par opérations (`pin`, `unpin`, `color`, `uncolor`, `color_type`,",
    "  `uncolor_type`, `group_create`, `group_update`, `group_add`, `group_remove`, `group_delete`,",
    "  `annotation_create`, `annotation_update`, `annotation_delete`, `connector_create`, `connector_update`,",
    "  `connector_delete`) : dernier écrivain gagne par clé, chaque requête est journalisée côté serveur (qui, quand,",
    "  quoi).",
    "- **Un document d'une mineure antérieure se relit dans la mineure courante** avec les listes qu'il ignore vides",
    "  (`upgraded`), par le store ; la validation d'un fichier reste stricte. Un 1.3.x y voit ses lignes et ses",
    "  flèches devenir des connecteurs, ses tableaux recevoir des colonnes et des lignes égales.",
    "- **Ni B1 ni B3 ne lisent ce document** : `rendu = f(snapshot ⊕ intent, vue)`, `diff = snapshot ↔ snapshot`.",
    "- **Sérialisation canonique** : `ld_contracts.intent.serialize.canonical_json`, même forme que le snapshot.",
    "",
]


def intent_part(shared: frozenset[str]) -> list[str]:
    """Partie D ; `shared` = noms déjà définis dans les parties précédentes (aucun type n'est partagé en V1)."""
    schema = generate_schema("intent")
    return [
        f"## Partie D — Intention : Intent v{INTENT_VERSION}",
        "",
        "L'intention est ce que l'humain veut en plus de ce que la collecte montre : des patchs keyés par identité",
        "stable, qui survivent aux runs. Six sortes de patch : l'épingle (la place voulue d'un équipement sur le",
        "dessin, 1.0.0), la couleur d'un type et la couleur d'un équipement (1.1.0), le groupe (des membres et un",
        "style, 1.2.0 ; docs/10 §5), l'annotation (une note, une forme, un tableau ou une image, libre ou attachée,",
        "1.3.0 ; docs/10 §6), le connecteur (une ligne ou une flèche à deux bouts, 1.4.0 ; ancres 1.5.0). D'autres",
        "sortes viendront comme des listes à côté, sans rien changer à celles-ci.",
        "Ce document est écrit par l'API de Living Diagram (`POST /api/intent/patches`) et lu par la toile ; il ne",
        "concerne pas l'exportateur. Sa version suit son propre semver.",
        "",
        *render_reference(schema, level=3, shared=shared),
        *INTENT_RULES,
        "### Erreurs de contrat (bloquantes)",
        "",
        "| Type | Signification |",
        "|---|---|",
        *[f"| `{k}` | {v} |" for k, v in INTENT_ERROR_TYPES.items()],
        "",
        "### Exemple : deux épingles, deux couleurs, un groupe, une annotation, un connecteur",
        "",
        "`fixtures/intent-skeleton.json`, en forme canonique :",
        "",
        "```json",
        INTENT_SKELETON_PATH.read_text(encoding="utf-8").rstrip(),
        "```",
        "",
        "Le JSON Schema équivalent est `src/ld_contracts/schema/intent-v1.schema.json`.",
        "",
    ]

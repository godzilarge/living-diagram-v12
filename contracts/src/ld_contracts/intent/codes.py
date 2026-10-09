"""Les refus propres au contrat Intent, catalogués pour la partie D de `CONTRAT.md`."""

INTENT_ERROR_TYPES = {
    "not_canonical_order": (
        "une liste n'est pas triée par sa clé (`pins` et `device_colors` par `hostname`, `type_colors` par `type`, "
        "`groups`, `annotations` et `connectors` par `id`, `members` d'un groupe par `hostname`, `merges` d'un tableau "
        "par (`row`, `col`))"
    ),
    "duplicate_identity": "deux patchs d'une même liste visent la même clé (`hostname`, `type` ou `id`)",
    "anchor_ref_mismatch": (
        "l'ancrage d'une annotation est incohérent : `ref` est null si et seulement si `kind` est `free`, et l'ancre "
        "d'un groupe est un `id` de groupe (`g<revision>-<n>`)"
    ),
    "leader_without_anchor": "une annotation libre porte une ligne de rappel : il n'y a rien à relier",
    "table_ragged": "les lignes d'un tableau n'ont pas toutes le même nombre de cellules",
    "table_dims_mismatch": "un tableau n'a pas autant de largeurs que de colonnes, ou de hauteurs que de lignes",
    "table_merge_outside": "une fusion de cellules sort du tableau",
    "table_merge_overlap": "deux fusions de cellules se chevauchent",
    "table_merge_trivial": "une fusion ne couvre qu'une cellule",
    "end_ref_mismatch": (
        "un bout de connecteur attaché à un groupe ou à une annotation n'en porte pas l'`id` (`g<revision>-<n>`, "
        "`a<revision>-<n>`)"
    ),
    "connector_same_ends": "les deux bouts d'un connecteur visent le même élément",
    "revision_update_mismatch": (
        "`revision` et `updated_at` ne vont pas ensemble (`updated_at` est null si et seulement si `revision` vaut 0)"
    ),
    "patch_after_update": (
        "un patch (épingle, couleur) est daté après `updated_at` : le document ne peut pas être plus ancien que ce "
        "qu'il porte"
    ),
    "too_long": (
        "trop d'épingles, de couleurs ou de membres (10 000 au plus), trop de groupes (1 000), trop d'annotations "
        "ou de connecteurs (2 000), un tableau de plus de 30 lignes ou 8 colonnes, ou un texte trop long (`hostname` "
        "253, `author` et `label` 80, `description` 500, note 2 000, cellule et `alt` 120)"
    ),
    "too_short": (
        "un groupe sans membre (retirer le dernier membre, c'est supprimer le groupe), un tableau sans ligne ou sans "
        "colonne"
    ),
    "string_too_short": "une note vide, ou un nom vide (`author`, `label`)",
    "greater_than_equal": "une valeur de style, une taille ou une courbure sous sa borne basse (docs/10 §5.2, §6.2)",
    "less_than_equal": (
        "une valeur de style, une taille ou une courbure au-dessus de sa borne haute (docs/10 §5.2, §6.2)"
    ),
    "enum": (
        "une valeur hors de son énumération (`hue` : douze teintes nommées ; `type` : les types du contrat d'entrée ; "
        "les énumérations du style d'un groupe, d'une annotation ou d'un connecteur, l'ancrage, le plan, la sorte "
        "d'une forme, le tracé et les pointes d'un connecteur)"
    ),
    "union_tag_invalid": (
        "le contenu d'une annotation porte une sorte inconnue (`note`, `shape`, `table`, `image`), ou un bout de "
        "connecteur une sorte inconnue (`free`, `device`, `group`, `annotation`)"
    ),
    "union_tag_not_found": "le contenu d'une annotation ou un bout de connecteur ne dit pas sa sorte (`kind`)",
    "string_pattern_mismatch": (
        "un texte (`hostname`, `author`, `label`, `description`, note, cellule, `alt`) contient un caractère de "
        "contrôle, un `id` de groupe, d'annotation ou de connecteur n'a pas la forme `g<revision>-<n>` / "
        "`a<revision>-<n>` / `c<revision>-<n>`, ou l'empreinte d'une image n'est pas un SHA-256 hexadécimal"
    ),
    "intent_major_unsupported": "la version majeure d'`intent_version` n'est pas celle du validateur",
    "datetime_numeric": "une date est donnée en nombre (epoch) au lieu d'ISO 8601 avec fuseau",
    "extra_forbidden": "un champ inconnu est présent (aucun `extras` dans ce contrat)",
    "missing": "un champ est absent : toutes les clés de l'intention sont requises, `null` compris",
}

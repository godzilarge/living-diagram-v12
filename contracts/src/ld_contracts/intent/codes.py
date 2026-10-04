"""Les refus propres au contrat Intent, catalogués pour la partie D de `CONTRAT.md`."""

INTENT_ERROR_TYPES = {
    "not_canonical_order": "les épingles ne sont pas triées par `hostname`",
    "duplicate_identity": "deux épingles visent le même `hostname`",
    "revision_update_mismatch": (
        "`revision` et `updated_at` ne vont pas ensemble (`updated_at` est null si et seulement si `revision` vaut 0)"
    ),
    "pin_after_update": (
        "une épingle est datée après `updated_at` : le document ne peut pas être plus ancien que ce qu'il porte"
    ),
    "too_long": "trop d'épingles (10 000 au plus), ou un texte trop long (`hostname` 253, `author` 80)",
    "string_pattern_mismatch": "un texte (`hostname`, `author`) contient un caractère de contrôle",
    "intent_major_unsupported": "la version majeure d'`intent_version` n'est pas celle du validateur",
    "datetime_numeric": "une date est donnée en nombre (epoch) au lieu d'ISO 8601 avec fuseau",
    "extra_forbidden": "un champ inconnu est présent (aucun `extras` dans ce contrat)",
    "missing": "un champ est absent : toutes les clés de l'intention sont requises, `null` compris",
}

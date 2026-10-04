"""Catalogue des refus du contrat Diff, pour la partie C de `CONTRAT.md` (un test vérifie qu'aucun type levé dans
`diff/` n'y manque)."""

DIFF_ERROR_TYPES = {
    "diff_major_unsupported": "la version majeure de `diff_version` n'est pas celle du validateur",
    "elapsed_mismatch": "`elapsed_seconds` n'est pas `after.start_datetime − before.start_datetime`",
    "counts_mismatch": "un compte de `summary` diffère de la taille de la liste correspondante",
    "identity_in_several_parts": (
        "une même identité apparaît dans deux parts d'une section (`added` / `removed` / `changed`, ou `appeared` / "
        "`resolved`)"
    ),
    "change_ref_kind_mismatch": "la référence d'un `changed` n'est pas de la sorte de sa section",
    "field_change_volatile": (
        "un `FieldChange` porte un champ volatil déclaré (`uptime_seconds`, `last_change_age_seconds`) : il "
        "appartient à `summary.volatile_changes`"
    ),
    "field_change_equal": "un `FieldChange` a la même valeur avant et après",
    "events_without_elapsed": "des événements alors que `elapsed_seconds` ≤ 0 : à rebours, les volatils ne disent rien",
    "event_ref_kind_mismatch": (
        "la référence d'un événement n'est pas de la sorte attendue (`rebooted` → nœud, `flapped` → interface)"
    ),
    "event_details_mismatch": (
        "les détails d'un événement ne sont pas ceux de sa sorte (`RebootedDetails`, `FlappedDetails`)"
    ),
    "event_not_in_window": "l'uptime ou l'âge lu n'est pas plus court que la fenêtre : ce n'est pas un événement",
    "event_elapsed_mismatch": "la fenêtre recopiée dans les détails d'un événement n'est pas `elapsed_seconds`",
    "too_short": (
        "une liste est trop courte : `fields` d'un changement vide (une entité sans différence n'est pas listée), ou "
        "moins de deux membres dans une référence de domaine MLAG"
    ),
    "string_pattern_mismatch": (
        "une chaîne n'a pas la forme attendue : `path` d'un changement (identifiants séparés par des points, jamais un "
        "indice de liste), empreinte, version"
    ),
    "extra_forbidden": "un champ inconnu est présent (le diff n'a pas d'`extras`)",
    "missing": "un champ est absent : toutes les clés du diff sont requises, `null` compris",
}

# Types levés par les types partagés avec le Snapshot : ordre canonique des listes, bouts d'un lien, membres d'un
# domaine MLAG, majeure du snapshot. Les entités ajoutées ou retirées sont validées par leurs propres types (partie B),
# dont tous les refus s'appliquent.
DIFF_SHARED_ERROR_TYPES = (
    "duplicate_identity",
    "not_canonical_order",
    "link_endpoints_equal",
    "link_endpoints_unordered",
    "mlag_domain_same_device",
    "snapshot_major_unsupported",
)

"""Énumérations fermées du contrat Diff v1 (celles du Snapshot et du RunBundle sont réutilisées telles quelles)."""

from enum import StrEnum


class EventKind(StrEnum):
    """Un fait lu dans les champs volatils : il ne se voit dans aucun `changed`."""

    REBOOTED = "rebooted"
    FLAPPED = "flapped"

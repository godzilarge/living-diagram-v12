"""B3 : le diff typé de deux snapshots d'une même infrastructure (`docs/07`), fonction pure et déterministe."""

from ld_backend.diff.engine import DiffError, diff

__all__ = ["DiffError", "diff"]

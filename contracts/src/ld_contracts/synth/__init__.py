"""Générateur de topologies synthétiques : un monde à graine, projeté en RunBundles valides, run après run.

Point d'entrée : `generate_series(GenerationSpec(...))`, ou `ld-contracts generate` en ligne de commande.
"""

from ld_contracts.synth.build import build_world
from ld_contracts.synth.catalogue import MUTATION_CATALOGUE, MUTATION_KINDS, TRANSIENT_KINDS
from ld_contracts.synth.emit import emit_bundle
from ld_contracts.synth.mutations import Mutation, NotApplicableError, apply_mutation
from ld_contracts.synth.series import (
    GenerationError,
    Series,
    check_series,
    generate_series,
    pick_applicable,
    write_series,
)
from ld_contracts.synth.spec import GenerationSpec, SpecError
from ld_contracts.synth.world import World, check_world

__all__ = [
    "MUTATION_CATALOGUE",
    "MUTATION_KINDS",
    "TRANSIENT_KINDS",
    "GenerationError",
    "GenerationSpec",
    "Mutation",
    "NotApplicableError",
    "Series",
    "SpecError",
    "World",
    "apply_mutation",
    "build_world",
    "check_series",
    "check_world",
    "emit_bundle",
    "generate_series",
    "pick_applicable",
    "write_series",
]

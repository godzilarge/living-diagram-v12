"""Une série de runs : le monde initial, puis à chaque run les transitoires effacés et le plan de mutations appliqué.

Le manifeste est l'oracle : pour chaque run, ses mutations (sorte, sujet, détails) et ses comptes. Après chaque
run, les invariants du monde sont vérifiés : un monde incohérent est un bug du générateur, jamais une donnée.
"""

import json
import random
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from ld_contracts import __version__
from ld_contracts.bundle import CONTRACT_VERSION
from ld_contracts.synth.build import build_world
from ld_contracts.synth.catalogue import MUTATION_KINDS
from ld_contracts.synth.emit import emit_bundle
from ld_contracts.synth.mutations import Mutation, NotApplicableError, apply_mutation
from ld_contracts.synth.spec import GenerationSpec
from ld_contracts.synth.world import World, check_world, clear_transients
from ld_contracts.validate import validate_dict

MANIFEST_NAME = "manifest.json"


class GenerationError(RuntimeError):
    """La série ne peut pas être produite telle que demandée (scénario inapplicable, monde ou bundle refusé)."""


@dataclass(frozen=True)
class Series:
    spec: GenerationSpec
    bundles: tuple[dict, ...]
    manifest: dict


def run_file(run_index: int) -> str:
    return f"run-{run_index + 1:02d}.json"


def pick_applicable(
    world: World, rng: random.Random, run_index: int, kinds: Sequence[str] = MUTATION_KINDS
) -> tuple[World, Mutation]:
    """Une mutation tirée parmi celles qui ont un sujet : les sortes sont mélangées puis essayées dans l'ordre."""
    order = list(kinds)
    rng.shuffle(order)
    for kind in order:
        try:
            return apply_mutation(kind, world, rng, run_index)
        except NotApplicableError:
            continue
    raise GenerationError(f"run {run_index + 1} : aucune mutation du catalogue n'est applicable")


def _mutate(world: World, rng: random.Random, run_index: int, spec: GenerationSpec) -> tuple[World, list[Mutation]]:
    records: list[Mutation] = []
    if spec.scenario:
        for kind in spec.scenario:
            try:
                world, record = apply_mutation(kind, world, rng, run_index)
            except NotApplicableError as exc:
                raise GenerationError(f"run {run_index + 1} : {exc}") from exc
            records.append(record)
        return world, records
    for _ in range(spec.mutations_per_run):
        world, record = pick_applicable(world, rng, run_index)
        records.append(record)
    return world, records


def _checked(world: World, run_index: int) -> World:
    problems = check_world(world)
    if problems:
        raise GenerationError(f"run {run_index + 1} : monde incohérent ({len(problems)}) : {problems[0]}")
    return world


def _counts(world: World, bundle: dict) -> dict:
    return {
        "devices": len(world.in_scope()),
        "sites": len(world.sites),
        "cables": len(world.cables),
        "stubs": len(world.stubs),
        "stubs_by_kind": dict(sorted(Counter(s.kind for s in world.stubs).items())),
        "interfaces": len(bundle["interfaces"]),
        "lldp": len(bundle["lldp"]),
        "cdp": len(bundle["cdp"]),
        "aggregates": len(bundle["aggregates"]),
        "ha": len(bundle["ha"]),
        "unreachable": len(world.unreachable),
    }


def generate_series(spec: GenerationSpec) -> Series:
    rng = random.Random(f"{spec.seed}:mutations")
    world = _checked(build_world(spec), 0)
    bundles: list[dict] = []
    runs: list[dict] = []
    for run_index in range(spec.runs):
        records: list[Mutation] = []
        if run_index > 0:
            world, records = _mutate(clear_transients(world), rng, run_index, spec)
            world = _checked(world, run_index)
        bundle = emit_bundle(world, spec, run_index)
        bundles.append(bundle)
        runs.append(
            {
                "index": run_index,
                "file": run_file(run_index),
                "collector_run_id": bundle["run"]["collector_run_id"],
                "start_datetime": bundle["run"]["start_datetime"],
                "mutations": [{"kind": m.kind, "subject": m.subject, "details": dict(m.details)} for m in records],
                "counts": _counts(world, bundle),
            }
        )
    manifest = {
        "generator": {"name": "ld-contracts synth", "version": __version__, "contract_version": CONTRACT_VERSION},
        "spec": spec.as_dict(),
        "runs": runs,
    }
    return Series(spec, tuple(bundles), manifest)


def check_series(series: Series) -> None:
    """Garantie du générateur : chaque bundle passe le contrat sans erreur ni constat. Sinon, c'est un bug ici."""
    for run, bundle in zip(series.manifest["runs"], series.bundles, strict=True):
        report = validate_dict(bundle)
        if not report.ok:
            first = report.errors[0]
            raise GenerationError(f"{run['file']} : bundle refusé par le contrat ({first.path}: {first.message})")
        if report.findings:
            codes = sorted({f.code for f in report.findings})
            raise GenerationError(f"{run['file']} : constats sur un bundle généré {codes}")


def _dump(obj: object) -> bytes:
    return (json.dumps(obj, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def write_series(series: Series, out_dir: str | Path) -> tuple[Path, ...]:
    """Écrit `run-NN.json` et `manifest.json` ; renvoie les chemins triés. Octets identiques à graine identique."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = [out / MANIFEST_NAME]
    (out / MANIFEST_NAME).write_bytes(_dump(series.manifest))
    for run, bundle in zip(series.manifest["runs"], series.bundles, strict=True):
        path = out / run["file"]
        path.write_bytes(_dump(bundle))
        paths.append(path)
    return tuple(sorted(paths))

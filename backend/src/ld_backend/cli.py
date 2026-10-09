"""CLI : `ld ingest`, `ld runs`, `ld correlate`, `ld diff`, `ld render`, `ld intent`, `ld placement`, `ld serve` — même
code que l'API."""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from ld_contracts.diff.serialize import canonical_json as diff_json
from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.serialize import canonical_json

from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.assets import AssetStore
from ld_backend.config import DEFAULT_ARCHIVE_DIR, ConfigError, Settings
from ld_backend.diff import DiffError, diff
from ld_backend.diffs import SnapshotUnavailableError, archived_pair, snapshot_from_data, summary_lines
from ld_backend.ingest import error_payload, ingest_bundle, result_payload
from ld_backend.intent import IntentCorruptError, IntentStore
from ld_backend.placement import PlacementCorruptError, PlacementStore
from ld_backend.render import PageOutcome, page_from_archive, page_from_bundle
from ld_backend.schemas import CorrelationSummary, utc_z
from ld_backend.snapshots import correlate_data, recorrelate, summarize

EXIT_OK, EXIT_INVALID, EXIT_USAGE = 0, 1, 2


def _read_json(path: str) -> tuple[object, str | None]:
    """(données, None) ou (None, problème) : UTF-16 (redirection `>` de PowerShell), JSON invalide, fichier absent."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")), None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return None, f"fichier illisible, pas en UTF-8, ou JSON invalide : {exc}"


def _file_mode_problem(args: argparse.Namespace) -> str | None:
    """Ce qui rend un appel en mode fichier ambigu ou destructeur : options de l'archive mélangées, ou `--out` qui
    désigne le fichier d'entrée (il serait écrasé par la sortie, revue R5 M3). Rien n'est écrit dans ces cas."""
    if args.infrastructure or args.run_id:
        return "un fichier bundle ne se combine pas avec --infrastructure / --run-id : choisir l'un ou l'autre"
    if args.out and Path(args.out).resolve() == Path(args.file).resolve():
        return "--out désigne le fichier d'entrée : rien n'est écrit"
    previous = getattr(args, "from_ref", None)
    if previous and args.out and Path(args.out).resolve() == Path(previous).resolve():
        return "--out désigne le fichier --from : rien n'est écrit"
    return None


def _cmd_ingest(args: argparse.Namespace) -> int:
    data, problem = _read_json(args.file)
    if problem is not None:
        print(problem)
        return EXIT_INVALID
    result = ingest_bundle(data, BundleArchive(Path(args.archive)))
    print(json.dumps(result_payload(result), ensure_ascii=False, indent=2))
    return EXIT_OK if result.status in {"created", "already_present"} else EXIT_INVALID


def _cmd_runs(args: argparse.Namespace) -> int:
    runs = BundleArchive(Path(args.archive)).list_runs(args.infrastructure)
    for r in runs:
        print(f"{r.run_id}\t{r.run_start}\t{r.run_status}\t{r.produced_at}\t{r.stored_at}\t{r.sha256[:12]}")
    if not runs:
        print("aucune run archivée pour cette infrastructure")
    return EXIT_OK


def _cmd_intent(args: argparse.Namespace) -> int:
    """Lit la couche d'intention d'une infrastructure (B4, docs/10) : ses épingles et ses couleurs, qui, quand ;
    lecture seule."""
    try:
        intent = IntentStore(Path(args.archive)).load(args.infrastructure)
    except IntentCorruptError, OSError:
        print("document d'intention corrompu ou illisible : intervention nécessaire")
        return EXIT_INVALID
    colors = len(intent.type_colors) + len(intent.device_colors)
    print(
        f"révision {intent.revision} · {len(intent.pins)} épingle(s) · {colors} couleur(s) · "
        f"{len(intent.groups)} groupe(s) · {len(intent.annotations)} annotation(s) · "
        f"{len(intent.connectors)} connecteur(s)" + (f" · {utc_z(intent.updated_at)}" if intent.updated_at else "")
    )
    for pin in intent.pins:
        print(f"{pin.hostname}\t{pin.x}\t{pin.y}\t{pin.author}\t{utc_z(pin.at)}")
    if not intent.pins:
        print("aucune épingle pour cette infrastructure")
    for color in intent.type_colors:
        print(f"type {color.type}\t{color.hue}\t{color.author}\t{utc_z(color.at)}")
    for color in intent.device_colors:
        print(f"{color.hostname}\t{color.hue}\t{color.author}\t{utc_z(color.at)}")
    if not colors:
        print("aucune couleur pour cette infrastructure")
    for group in intent.groups:
        members = ", ".join(group.members)
        style = f"{group.style.shape} {group.style.hue}"
        print(f"groupe {group.id}\t{group.label}\t{style}\t{members}\t{group.author}\t{utc_z(group.at)}")
    if not intent.groups:
        print("aucun groupe pour cette infrastructure")
    for a in intent.annotations:
        anchor = a.anchor.kind if a.anchor.ref is None else f"{a.anchor.kind} {a.anchor.ref}"
        box = f"{a.x},{a.y} {a.w}x{a.h}"
        print(f"annotation {a.id}\t{a.content.kind}\t{anchor}\t{box}\t{a.author}\t{utc_z(a.at)}")
    if not intent.annotations:
        print("aucune annotation pour cette infrastructure")
    for c in intent.connectors:
        ends = " → ".join(
            f"{e.x},{e.y}" if e.kind == "free" else f"{e.kind} {e.ref} ({e.side})" for e in (c.start, c.end)
        )
        shape = f"{c.route} {c.heads.start}/{c.heads.end}"
        print(f"connecteur {c.id}\t{ends}\t{shape}\t{c.label}\t{c.author}\t{utc_z(c.at)}")
    if not intent.connectors:
        print("aucun connecteur pour cette infrastructure")
    cited = {a.content.asset for a in intent.annotations if a.content.kind == "image"}
    for asset in AssetStore(Path(args.archive)).list(args.infrastructure):
        state = "citée" if asset.asset in cited else "citée par aucune annotation"
        size = f"{asset.width}x{asset.height}\t{asset.bytes} octets"
        print(f"image {asset.asset[:12]}…\t{asset.media_type}\t{size}\t{state}")
    return EXIT_OK


def _cmd_placement(args: argparse.Namespace) -> int:
    """Lit le placement mémorisé d'une infrastructure (docs/09), ou l'oublie (`--forget`) : il se recalcule alors au
    prochain dessin ; c'est aussi la sortie quand le document est corrompu."""
    store = PlacementStore(Path(args.archive))
    if args.forget:
        print(
            "placement oublié : il se recalcule au prochain dessin"
            if store.forget(args.infrastructure)
            else "rien à oublier"
        )
        return EXIT_OK
    try:
        doc = store.load(args.infrastructure)
    except PlacementCorruptError, OSError:
        print(
            "document de placement corrompu ou illisible : `ld placement --forget` le retire, le placement se recalcule"
        )
        return EXIT_INVALID
    print(
        f"révision {doc.revision} · {len(doc.places)} équipement(s) placé(s)"
        + (f" · {doc.updated_at}" if doc.updated_at else "")
    )
    for place in doc.places:
        print(f"{place.hostname}\t{place.x}\t{place.y}")
    if not doc.places:
        print("aucun équipement placé pour cette infrastructure")
    return EXIT_OK


def _correlation_line(run_id: str, summary: CorrelationSummary) -> str:
    if summary.checks is None:
        return f"{run_id}\t{summary.status}\tvoir le journal : la trace de l'échec y est écrite"
    checks = " ".join(f"{name}={count}" for name, count in summary.checks.items())
    return f"{run_id}\t{summary.status}\t{summary.nodes} nœuds\t{summary.links} câbles\t{checks}"


def _recorrelate_line(archive: BundleArchive, infrastructure: str, run_id: str) -> tuple[str, bool]:
    """Une run illisible est isolée : elle a sa ligne, les suivantes sont quand même recalculées."""
    try:
        summary = recorrelate(archive, infrastructure, run_id)
    except ArchiveCorruptError, OSError:
        return f"{run_id}\tarchive corrompue ou illisible : intervention nécessaire, snapshot inchangé", False
    if summary is None:
        return f"{run_id}\trun inconnue pour cette infrastructure", False
    return _correlation_line(run_id, summary), summary.status != "failed"


def _correlate_file(args: argparse.Namespace) -> int:
    """Écrit le snapshot canonique d'un bundle fichier, sans archive : boucle de mise au point, et régénération du
    snapshot de référence (`ld correlate ../contracts/fixtures/bundle-minimal.json --out …/snapshot-minimal.json`)."""
    if not args.out:
        print("--out est requis avec un fichier bundle")
        return EXIT_USAGE
    if (problem := _file_mode_problem(args)) is not None:
        print(problem)
        return EXIT_USAGE
    data, problem = _read_json(args.file)
    if problem is not None:
        print(problem)
        return EXIT_INVALID
    result = correlate_data(data)
    if result.snapshot is None:
        print("bundle hors contrat")
        print(json.dumps(error_payload(result.errors), ensure_ascii=False, indent=2))
        return EXIT_INVALID
    raw = canonical_json(result.snapshot).encode("utf-8")
    try:
        Path(args.out).write_bytes(raw)
    except OSError as exc:
        print(f"snapshot non écrit : {exc}")
        return EXIT_INVALID
    summary = summarize(result.snapshot)
    checks = " ".join(f"{name}={count}" for name, count in (summary.checks or {}).items())
    print(
        f"snapshot écrit : {args.out} ({summary.nodes} nœuds, {summary.links} câbles, {checks}, {len(raw) // 1024} Ko)"
    )
    return EXIT_OK


def _cmd_correlate(args: argparse.Namespace) -> int:
    """Recalcule et remplace le snapshot depuis le bundle archivé : après une correction de B1, sans ré-ingérer.
    Avec un fichier : écrit le snapshot dans `--out`, sans toucher l'archive."""
    if args.file:
        return _correlate_file(args)
    if not args.infrastructure:
        print("indiquer un fichier bundle avec --out, ou une infrastructure archivée par --infrastructure")
        return EXIT_USAGE
    if args.out:
        print("--out ne vaut qu'avec un fichier bundle : une run archivée range son snapshot dans l'archive")
        return EXIT_USAGE
    _show_backend_log()  # la trace d'un échec de B1 sort sur stderr
    archive = BundleArchive(Path(args.archive))
    run_ids = [args.run_id] if args.run_id else [r.run_id for r in archive.list_runs(args.infrastructure)]
    if not run_ids:
        print("aucune run archivée pour cette infrastructure")
        return EXIT_INVALID
    failed = False
    for run_id in run_ids:
        line, ok = _recorrelate_line(archive, args.infrastructure, run_id)
        print(line)
        failed = failed or not ok
    return EXIT_INVALID if failed else EXIT_OK


def _diff_files_problem(args: argparse.Namespace) -> str | None:
    if args.infrastructure or args.from_run or args.to_run:  # avant le compte : le mélange des modes est la vraie faute
        return "des fichiers ne se combinent pas avec --infrastructure / --from / --to : choisir l'un ou l'autre"
    if len(args.files) != 2:
        return "deux fichiers sont attendus, celui d'avant puis celui d'après : chacun un bundle ou un snapshot"
    if args.out and any(Path(args.out).resolve() == Path(f).resolve() for f in args.files):
        return "--out désigne un fichier d'entrée : rien n'est écrit"
    return None


def _snapshot_from_file(path: str) -> Snapshot | None:
    """Bundle (validé puis corrélé) ou snapshot (reconnu à `snapshot_version`) ; None après avoir dit pourquoi."""
    data, problem = _read_json(path)
    if problem is not None:
        print(problem)
        return None
    snapshot, errors = snapshot_from_data(data)
    if snapshot is None:
        print(f"fichier hors contrat : {path}")
        print(json.dumps(error_payload(errors), ensure_ascii=False, indent=2))
    return snapshot


SAME_RUN_WARNING = "attention : les deux runs sont la même, le diff est vide par définition"


def _emit_diff(before: Snapshot, after: Snapshot, out: str | None) -> int:
    try:
        result = diff(before, after)
    except DiffError as exc:
        print(str(exc))
        return EXIT_INVALID
    if result.before == result.after:  # `--from` seul désigne la dernière run, ou deux fichiers identiques (revue, B5)
        print(SAME_RUN_WARNING)
    if out:
        raw = diff_json(result).encode("utf-8")
        try:
            Path(out).write_bytes(raw)
        except OSError as exc:
            print(f"diff non écrit : {exc}")
            return EXIT_INVALID
        print(f"diff écrit : {out} ({len(raw) // 1024} Ko)")
    for line in summary_lines(result):
        print(line)
    return EXIT_OK


def _cmd_diff(args: argparse.Namespace) -> int:
    """Compare deux runs (B3) : deux fichiers sans archive, ou deux runs archivées (par défaut les deux dernières).
    Le diff n'est jamais stocké ; `--out` l'écrit en forme canonique."""
    if args.files:
        if (problem := _diff_files_problem(args)) is not None:
            print(problem)
            return EXIT_USAGE
        before, after = _snapshot_from_file(args.files[0]), _snapshot_from_file(args.files[1])
        if before is None or after is None:
            return EXIT_INVALID
        return _emit_diff(before, after, args.out)
    if not args.infrastructure:
        print(
            "indiquer deux fichiers, chacun un bundle ou un snapshot (reconnu à snapshot_version), "
            "ou une infrastructure archivée par --infrastructure"
        )
        return EXIT_USAGE
    try:
        before, after = archived_pair(
            BundleArchive(Path(args.archive)), args.infrastructure, args.from_run, args.to_run
        )
    except SnapshotUnavailableError as exc:
        print(str(exc))
        return EXIT_INVALID
    except ArchiveCorruptError, OSError:
        print("archive corrompue ou illisible : intervention nécessaire")
        return EXIT_INVALID
    return _emit_diff(before, after, args.out)


def _render_outcome(args: argparse.Namespace) -> PageOutcome | None:
    """None : ni fichier ni run désignée. Le chemin fichier ne touche ni archive ni serveur. `--from` : un fichier
    d'avant (bundle ou snapshot) en mode fichier, une run d'avant en mode archive ; la page embarque alors le diff."""
    if args.file:
        data, problem = _read_json(args.file)
        if problem is not None:
            return PageOutcome(page=None, problem=problem)
        previous = None
        if args.from_ref:
            previous, problem = _read_json(args.from_ref)
            if problem is not None:
                return PageOutcome(page=None, problem=f"--from : {problem}")
        return page_from_bundle(data, origin=Path(args.file).name, previous=previous)
    if args.infrastructure and args.run_id:
        archive = BundleArchive(Path(args.archive))
        intents = IntentStore(Path(args.archive))
        placements = PlacementStore(Path(args.archive))
        return page_from_archive(
            archive, args.infrastructure, args.run_id, from_run=args.from_ref, intents=intents, placements=placements
        )
    return None


def _same_run_as_from(args: argparse.Namespace) -> bool:
    """`--from` désigne la run dessinée elle-même : la page embarquerait un diff vide (revue, B5)."""
    if not args.from_ref:
        return False
    if args.file:
        return Path(args.from_ref).resolve() == Path(args.file).resolve()
    return args.from_ref == args.run_id


def _cmd_render(args: argparse.Namespace) -> int:
    """Écrit la page HTML autonome d'une run : graphe, sources de chaque câble, contrôles, qualité des données."""
    if args.file and (problem := _file_mode_problem(args)) is not None:
        print(problem)
        return EXIT_USAGE
    if _same_run_as_from(args):
        print(SAME_RUN_WARNING)
    outcome = _render_outcome(args)
    if outcome is None:
        print("indiquer un fichier bundle, ou une run archivée par --infrastructure et --run-id")
        return EXIT_USAGE
    if outcome.page is None:
        print(outcome.problem)
        if outcome.errors:
            print(json.dumps(list(outcome.errors), ensure_ascii=False, indent=2))
        return EXIT_INVALID
    raw = outcome.page.encode("utf-8")
    try:
        Path(args.out).write_bytes(raw)
    except OSError as exc:
        print(f"page non écrite : {exc}")
        return EXIT_INVALID
    nodes, links, checks = outcome.counts
    print(f"page écrite : {args.out} ({nodes} nœuds, {links} câbles, {checks} contrôles, {len(raw) // 1024} Ko)")
    return EXIT_OK


def _show_backend_log() -> None:
    """Une ligne par ingestion (`ld_backend.ingest`) : uvicorn ne configure que ses propres journaux."""
    logger = logging.getLogger("ld_backend")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def _cmd_serve(args: argparse.Namespace) -> int:
    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(f"configuration invalide : {exc}", file=sys.stderr)
        return EXIT_USAGE
    import uvicorn  # noqa: PLC0415 — dépendance d'exécution seulement

    from ld_backend.api import create_app

    _show_backend_log()
    uvicorn.run(create_app(settings), host=args.host, port=args.port)
    return EXIT_OK


def _add_ingest_and_runs(sub, archive_default: str) -> None:
    p_ingest = sub.add_parser("ingest", help="valide et archive un bundle, même chemin de code que l'API")
    p_ingest.add_argument("file")
    p_ingest.add_argument("--archive", default=archive_default, help="racine de l'archive (défaut : LD_ARCHIVE_DIR)")
    p_ingest.set_defaults(func=_cmd_ingest)

    p_runs = sub.add_parser("runs", help="liste les runs archivées d'une infrastructure")
    p_runs.add_argument("--infrastructure", required=True)
    p_runs.add_argument("--archive", default=archive_default)
    p_runs.set_defaults(func=_cmd_runs)
    p_intent = sub.add_parser("intent", help="liste les épingles (couche d'intention, B4) d'une infrastructure")
    p_intent.add_argument("--infrastructure", required=True)
    p_intent.add_argument("--archive", default=archive_default)
    p_intent.set_defaults(func=_cmd_intent)
    p_placement = sub.add_parser(
        "placement", help="lit le placement mémorisé d'une infrastructure (docs/09), ou l'oublie"
    )
    p_placement.add_argument("--infrastructure", required=True)
    p_placement.add_argument("--forget", action="store_true", help="retire le document : le placement se recalcule")
    p_placement.add_argument("--archive", default=archive_default)
    p_placement.set_defaults(func=_cmd_placement)


def _add_correlate(sub, archive_default: str) -> None:
    p_correlate = sub.add_parser(
        "correlate", help="recalcule le snapshot (B1) d'une run archivée et le remplace, ou l'écrit depuis un fichier"
    )
    p_correlate.add_argument(
        "file", nargs="?", help="fichier bundle : valide, corrèle et écrit le snapshot dans --out, sans archive"
    )
    p_correlate.add_argument("--out", default=None, help="avec un fichier : le snapshot JSON canonique à écrire")
    p_correlate.add_argument(
        "--infrastructure", default=None, help="sans fichier : l'infrastructure archivée dont on recalcule les runs"
    )
    p_correlate.add_argument(
        "--run-id", default=None, help="une seule run (défaut : toutes celles de l'infrastructure)"
    )
    p_correlate.add_argument("--archive", default=archive_default)
    p_correlate.set_defaults(func=_cmd_correlate)


def _add_diff(sub, archive_default: str) -> None:
    p_diff = sub.add_parser(
        "diff", help="compare deux runs (B3) : deux fichiers, bundles ou snapshots, ou deux runs archivées"
    )
    p_diff.add_argument(
        "files",
        nargs="*",
        metavar="fichier.json",
        help="deux fichiers, celui d'avant puis celui d'après ; chacun est un bundle (validé puis corrélé) "
        "ou un snapshot (reconnu à sa clé snapshot_version)",
    )
    p_diff.add_argument(
        "--out", default=None, help="fichier JSON du diff, forme canonique ; sans --out, le résumé seul"
    )
    p_diff.add_argument("--infrastructure", default=None, help="sans fichiers : l'infrastructure archivée")
    p_diff.add_argument("--from", dest="from_run", default=None, help="run de départ (défaut : celle qui précède --to)")
    p_diff.add_argument("--to", dest="to_run", default=None, help="run d'arrivée (défaut : la dernière archivée)")
    p_diff.add_argument("--archive", default=archive_default)
    p_diff.set_defaults(func=_cmd_diff)


def _add_render(sub, archive_default: str) -> None:
    p_render = sub.add_parser("render", help="écrit la page HTML autonome d'une run (hors ligne, aucun serveur requis)")
    p_render.add_argument("file", nargs="?", help="fichier bundle : valide, corrèle et dessine sans toucher l'archive")
    p_render.add_argument("--out", required=True, help="fichier HTML à écrire")
    p_render.add_argument(
        "--infrastructure", default=None, help="avec --run-id : une run archivée, à la place du fichier"
    )
    p_render.add_argument("--run-id", default=None)
    p_render.add_argument(
        "--from",
        dest="from_ref",
        default=None,
        help="embarque le diff depuis la run d'avant : avec un fichier, le fichier d'avant (bundle ou snapshot, "
        "reconnu à sa clé snapshot_version) ; avec --infrastructure / --run-id, le run_id d'avant",
    )
    p_render.add_argument("--archive", default=archive_default)
    p_render.set_defaults(func=_cmd_render)


def _add_serve(sub, archive_default: str) -> None:
    p_serve = sub.add_parser("serve", help="démarre l'API (LD_API_TOKEN, LD_ARCHIVE_DIR, LD_MAX_BUNDLE_BYTES)")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=_cmd_serve)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ld", description="Living Diagram — backend")
    sub = parser.add_subparsers(dest="command", required=True)
    archive_default = os.environ.get("LD_ARCHIVE_DIR", DEFAULT_ARCHIVE_DIR)
    for add in (_add_ingest_and_runs, _add_correlate, _add_diff, _add_render, _add_serve):
        add(sub, archive_default)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

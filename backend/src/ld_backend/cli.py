"""CLI : `ld ingest`, `ld runs`, `ld correlate`, `ld render`, `ld serve` — même code que l'API."""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.config import DEFAULT_ARCHIVE_DIR, ConfigError, Settings
from ld_backend.ingest import ingest_bundle, result_payload
from ld_backend.render import PageOutcome, page_from_archive, page_from_bundle
from ld_backend.schemas import CorrelationSummary
from ld_backend.snapshots import recorrelate

EXIT_OK, EXIT_INVALID, EXIT_USAGE = 0, 1, 2


def _cmd_ingest(args: argparse.Namespace) -> int:
    try:
        data = json.loads(Path(args.file).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(f"fichier illisible, pas en UTF-8, ou JSON invalide : {exc}")
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


def _cmd_correlate(args: argparse.Namespace) -> int:
    """Recalcule et remplace le snapshot depuis le bundle archivé : après une correction de B1, sans ré-ingérer."""
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


def _render_outcome(args: argparse.Namespace) -> PageOutcome | None:
    """None : ni fichier ni run désignée. Le chemin fichier ne touche ni archive ni serveur."""
    if args.file:
        try:
            data = json.loads(Path(args.file).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:  # UTF-16 : redirection `>` de PowerShell
            return PageOutcome(page=None, problem=f"fichier illisible, pas en UTF-8, ou JSON invalide : {exc}")
        return page_from_bundle(data, origin=Path(args.file).name)
    if args.infrastructure and args.run_id:
        return page_from_archive(BundleArchive(Path(args.archive)), args.infrastructure, args.run_id)
    return None


def _cmd_render(args: argparse.Namespace) -> int:
    """Écrit la page HTML autonome d'une run : graphe, sources de chaque câble, contrôles, qualité des données."""
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ld", description="Living Diagram — backend")
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="valide et archive un bundle, même chemin de code que l'API")
    p_ingest.add_argument("file")
    archive_default = os.environ.get("LD_ARCHIVE_DIR", DEFAULT_ARCHIVE_DIR)
    p_ingest.add_argument("--archive", default=archive_default, help="racine de l'archive (défaut : LD_ARCHIVE_DIR)")
    p_ingest.set_defaults(func=_cmd_ingest)

    p_runs = sub.add_parser("runs", help="liste les runs archivées d'une infrastructure")
    p_runs.add_argument("--infrastructure", required=True)
    p_runs.add_argument("--archive", default=archive_default)
    p_runs.set_defaults(func=_cmd_runs)

    p_correlate = sub.add_parser("correlate", help="recalcule le snapshot (B1) depuis le bundle archivé et le remplace")
    p_correlate.add_argument("--infrastructure", required=True)
    p_correlate.add_argument(
        "--run-id", default=None, help="une seule run (défaut : toutes celles de l'infrastructure)"
    )
    p_correlate.add_argument("--archive", default=archive_default)
    p_correlate.set_defaults(func=_cmd_correlate)

    p_render = sub.add_parser("render", help="écrit la page HTML autonome d'une run (hors ligne, aucun serveur requis)")
    p_render.add_argument("file", nargs="?", help="fichier bundle : valide, corrèle et dessine sans toucher l'archive")
    p_render.add_argument("--out", required=True, help="fichier HTML à écrire")
    p_render.add_argument(
        "--infrastructure", default=None, help="avec --run-id : une run archivée, à la place du fichier"
    )
    p_render.add_argument("--run-id", default=None)
    p_render.add_argument("--archive", default=archive_default)
    p_render.set_defaults(func=_cmd_render)

    p_serve = sub.add_parser("serve", help="démarre l'API (LD_API_TOKEN, LD_ARCHIVE_DIR, LD_MAX_BUNDLE_BYTES)")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=_cmd_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

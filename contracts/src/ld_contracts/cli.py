"""CLI : ``ld-contracts validate | schema | docs | anonymize``."""

import argparse
import json
import os
import sys
from pathlib import Path

from ld_contracts.anonymize import PseudonymCollisionError, anonymize_bundle
from ld_contracts.docgen import DOC_PATH, generate_markdown, write_markdown
from ld_contracts.schema import CONTRACTS, generate_schema, write_schema
from ld_contracts.validate import ValidationReport, validate_file, validate_snapshot_file

EXIT_OK, EXIT_INVALID, EXIT_USAGE = 0, 1, 2
SEED_ENV = "LD_CONTRACTS_SEED"


def _print_summary(report: ValidationReport, show_values: bool) -> None:
    b = report.bundle
    assert b is not None
    ident = f" · infrastructure {b.infrastructure} · run {b.run.collector_run_id}" if show_values else ""
    print(f"valid: contract {b.contract_version}{ident}")
    print(
        f"  devices {len(b.devices)} (in scope {len(b.devices_in_scope())}) · tasks {len(b.tasks)}"
        f" · interfaces {len(b.interfaces)} · aggregates {len(b.aggregates)} · lldp {len(b.lldp)}"
        f" · cdp {len(b.cdp)} · system {len(b.system)} · ha {len(b.ha)}"
    )
    for f in report.findings:
        values = [v for v in (f.hostname, f.ref) if v is not None]
        where = f" [{' · '.join(values)}]" if show_values and values else ""
        print(f"  finding {f.code}: {f.message}{where}")


def _print_snapshot_summary(report: ValidationReport) -> None:
    s = report.snapshot
    assert s is not None
    print(f"valid: snapshot {s.snapshot_version}")
    print(
        f"  nodes {len(s.nodes)} · interfaces {len(s.interfaces)} · links {len(s.links)}"
        f" · aggregates {len(s.aggregates)} · mlag_domains {len(s.mlag_domains)}"
        f" · ha_clusters {len(s.ha_clusters)} · checks {len(s.checks)}"
    )


def _cmd_validate(args: argparse.Namespace) -> int:
    is_snapshot = args.contract == "snapshot"
    report = validate_snapshot_file(Path(args.file)) if is_snapshot else validate_file(Path(args.file))
    if not report.ok:
        print(f"invalid: {len(report.errors)} error(s)")
        for issue in report.errors:
            detail = f" {json.dumps(issue.detail, ensure_ascii=False)}" if args.show_values and issue.detail else ""
            print(f"  {issue.path}: {issue.message}{detail}")
        return EXIT_INVALID
    if is_snapshot:
        _print_snapshot_summary(report)
        return EXIT_OK
    _print_summary(report, args.show_values)
    return EXIT_INVALID if report.findings and args.strict_findings else EXIT_OK


def _cmd_schema(args: argparse.Namespace) -> int:
    if args.out is None:
        print(json.dumps(generate_schema(args.contract), indent=2, ensure_ascii=False))
        return EXIT_OK
    try:
        print(write_schema(Path(args.out) if args.out else None, args.contract))
    except OSError as exc:
        print(f"cannot write schema: {exc}", file=sys.stderr)
        return EXIT_INVALID
    return EXIT_OK


def _cmd_docs(args: argparse.Namespace) -> int:
    if args.out is None:
        print(generate_markdown())
        return EXIT_OK
    try:
        print(write_markdown(Path(args.out)))
    except OSError as exc:
        print(f"cannot write docs: {exc}", file=sys.stderr)
        return EXIT_INVALID
    return EXIT_OK


def _read_seed(args: argparse.Namespace) -> str | None:
    if args.seed_file:
        try:
            return Path(args.seed_file).read_text(encoding="utf-8").strip()
        except OSError as exc:
            print(f"cannot read seed file: {exc}", file=sys.stderr)
            return None
    return os.environ.get(SEED_ENV) or None


def _cmd_anonymize(args: argparse.Namespace) -> int:
    seed = _read_seed(args)
    if not seed:
        print(f"a seed is required: set {SEED_ENV} or pass --seed-file (never on the command line)", file=sys.stderr)
        return EXIT_USAGE
    report = validate_file(Path(args.input))
    if not report.ok or report.bundle is None:
        print("input bundle is invalid; run `ld-contracts validate` first", file=sys.stderr)
        return EXIT_INVALID
    try:
        out = anonymize_bundle(
            report.bundle.model_dump(mode="json", exclude_unset=True),  # garde les clés absentes absentes
            seed,
            keep_extras=args.keep_extras,
            keep_description_options=args.keep_description_options,
        )
        Path(args.output).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except PseudonymCollisionError as exc:
        print(f"anonymization aborted: {exc}", file=sys.stderr)
        return EXIT_INVALID
    except OSError as exc:
        print(f"cannot write output: {exc}", file=sys.stderr)
        return EXIT_INVALID
    print(f"anonymized bundle written to {args.output}")
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ld-contracts", description="Living Diagram — contrats RunBundle (entrée) et Snapshot (sortie)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="valide un bundle JSON (constats référentiels) ou un snapshot JSON")
    p_val.add_argument("file")
    p_val.add_argument(
        "--contract", choices=sorted(CONTRACTS), default="bundle", help="bundle (entrée, défaut) ou snapshot (sortie)"
    )
    p_val.add_argument("--strict-findings", action="store_true", help="échoue aussi sur les constats")
    p_val.add_argument("--show-values", action="store_true", help="affiche hostnames et valeurs dans le rapport")
    p_val.set_defaults(func=_cmd_validate)

    p_schema = sub.add_parser("schema", help="affiche ou écrit le JSON Schema d'un contrat")
    p_schema.add_argument(
        "--contract", choices=sorted(CONTRACTS), default="bundle", help="bundle (entrée, défaut) ou snapshot (sortie)"
    )
    p_schema.add_argument(
        "--out",
        nargs="?",
        const="",
        default=None,
        help="chemin de sortie (sans valeur : emplacement versionné du contrat dans le paquet)",
    )
    p_schema.set_defaults(func=_cmd_schema)

    p_docs = sub.add_parser("docs", help="affiche ou écrit la référence CONTRAT.md générée depuis les modèles")
    p_docs.add_argument(
        "--out",
        nargs="?",
        const=str(DOC_PATH),
        default=None,
        help="chemin de sortie (sans valeur : contracts/CONTRAT.md)",
    )
    p_docs.set_defaults(func=_cmd_docs)

    p_anon = sub.add_parser("anonymize", help="pseudonymise un bundle pour le partager sans fuite")
    p_anon.add_argument("input")
    p_anon.add_argument("output")
    p_anon.add_argument("--seed-file", help=f"fichier contenant la graine ; sinon variable {SEED_ENV}")
    p_anon.add_argument("--keep-extras", action="store_true")
    p_anon.add_argument("--keep-description-options", action="store_true")
    p_anon.set_defaults(func=_cmd_anonymize)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

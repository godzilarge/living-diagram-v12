import json
import os
import subprocess
import sys


def run(*args, env=None):
    merged = {**os.environ, **(env or {})}
    return subprocess.run([sys.executable, "-m", "ld_contracts.cli", *args], capture_output=True, text=True, env=merged)


def test_validate_ok_exits_zero(minimal_path):
    res = run("validate", str(minimal_path))
    assert res.returncode == 0, res.stderr
    assert "valid" in res.stdout


def test_validate_invalid_exits_one_and_hides_values_by_default(tmp_path, minimal_dict):
    bad = dict(minimal_dict)
    bad["interfaces"] = [dict(bad["interfaces"][0], duplex="full-duplex", hostname="ghost-01")]
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(bad), encoding="utf-8")
    res = run("validate", str(p))
    assert res.returncode == 1
    assert "duplex" in res.stdout and "ghost-01" not in res.stdout
    shown = run("validate", str(p), "--show-values")
    assert "ghost-01" not in shown.stdout  # field-level error: pydantic input is never echoed


def test_schema_prints_json():
    res = run("schema")
    assert res.returncode == 0
    assert json.loads(res.stdout)["title"] == "RunBundle"


def test_anonymize_uses_seed_from_environment(tmp_path, minimal_path):
    out = tmp_path / "anon.json"
    res = run("anonymize", str(minimal_path), str(out), env={"LD_CONTRACTS_SEED": "x"})
    assert res.returncode == 0, res.stderr
    assert run("validate", str(out)).returncode == 0


def test_anonymize_without_seed_fails_with_usage_error(tmp_path, minimal_path):
    env = {k: v for k, v in os.environ.items() if k != "LD_CONTRACTS_SEED"}
    res = subprocess.run(
        [sys.executable, "-m", "ld_contracts.cli", "anonymize", str(minimal_path), str(tmp_path / "o.json")],
        capture_output=True,
        text=True,
        env=env,
    )
    assert res.returncode == 2
    assert "LD_CONTRACTS_SEED" in res.stderr

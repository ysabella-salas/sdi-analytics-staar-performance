"""Tests for validate_tokens.py — the DTCG conformance gate for the token file.

This script is import-safe (nothing runs at import), but we still drive it via
subprocess for true end-to-end exit-code behavior, consistent with the rest of
the suite.

  * On the real assets/hisd.tokens.json it exits 0 (conformant).
  * On a planted malformed token file it exits 1 and reports violations — proving
    the validator has teeth. The bad fixture lives in a tmp dir; the real token
    file is never touched.
"""
import json
import os

import pytest

from conftest import ASSETS, VALIDATE_TOKENS

pytestmark = pytest.mark.skipif(
    not os.path.exists(VALIDATE_TOKENS),
    reason="validate_tokens.py not present in this checkout",
)


def test_validate_real_tokens_passes(runner):
    proc = runner([VALIDATE_TOKENS])
    assert proc.returncode == 0, (
        f"validate_tokens flagged the real token file (exit {proc.returncode}):\n"
        + proc.stdout
    )
    assert "ok" in proc.stdout.lower()


def test_validate_real_tokens_explicit_path(runner):
    """Passing the real file path explicitly behaves the same as the default."""
    proc = runner([VALIDATE_TOKENS, os.path.join(ASSETS, "hisd.tokens.json")])
    assert proc.returncode == 0, proc.stdout


def test_validate_rejects_malformed_tokens(tmp_path, runner):
    """A planted token file with a non-hex color leaf must fail (exit 1)."""
    bad = {
        # A color leaf carrying a value that is not a valid hex string, plus a
        # leaf missing its $type — both are DTCG violations.
        "color": {"teal": {"50": {"$value": "tomato", "$type": "color"}}},
        "brand": {"teal": {"$value": "#00A3AF"}},  # $value but no $type
    }
    p = tmp_path / "bad.tokens.json"
    p.write_text(json.dumps(bad), encoding="utf-8")

    proc = runner([VALIDATE_TOKENS, str(p)])
    assert proc.returncode == 1, (
        f"validator did NOT reject a malformed token file (exit "
        f"{proc.returncode}):\n{proc.stdout}"
    )
    assert "VIOLATION" in proc.stdout.upper()


def test_validate_missing_file_is_usage_error(tmp_path, runner):
    """A nonexistent path is a usage/IO error -> exit 2, not 1."""
    proc = runner([VALIDATE_TOKENS, str(tmp_path / "nope.json")])
    assert proc.returncode == 2, proc.stdout
